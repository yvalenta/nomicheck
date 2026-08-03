// Montaje del muro de pago x402.
//
// Vive acá y no en el router de `/api/batch` por una razón que se descubrió
// probando contra el facilitador real (ver docs 16 del repo de ops): el
// middleware de faremeter calcula el recurso que anuncia como
//
//     `${req.protocol}://${req.headers.host}${req.path}`
//
// y NO usa el `resource` que uno le configura en `accepts` — lo pisa. Dentro
// de un `router.use("/verificar", muro)` Express ya le sacó el prefijo a
// `req.url`, así que `req.path` vale `/` y el 402 anuncia
// `http://host/` para TODOS los endpoints: mismo recurso, ruta equivocada,
// esquema equivocado. Un cliente x402 compara ese campo contra lo que pidió,
// así que ninguno pagaría.
//
// Montado a nivel de app, antes de `app.use("/api", router)`, `req.path` es la
// ruta pública completa y cada endpoint anuncia la suya.
//
// APAGADO POR DEFECTO. Sin `X402_ACTIVO=true` esto no monta nada.
import type { Express, RequestHandler } from "express";
import {
  leerConfigX402,
  problemasDeConfig,
  requisitosDePago,
  extensionBazaar,
  RUTAS_CON_MURO,
  perfilFacilitador,
  type ConfigX402,
  type PerfilFacilitador,
  type RedX402,
} from "./x402Config.js";
import { credencialesCdp, jwtCdp } from "./cdpAuth.js";

/** Prefijo público de los wrappers, el mismo que arma `requisitosDePago`. */
const PREFIJO = "/api/batch";

/**
 * Rutas con muro, en ruta pública completa. El `/csv` entrega el mismo cálculo
 * en otro formato y cuesta igual: sin él, pedir el CSV sería la forma gratis de
 * saltarse el muro. `/comprobante` no tiene variante CSV.
 */
export function rutasPublicasConMuro(): { publica: string; precio: string }[] {
  const salida: { publica: string; precio: string }[] = [];
  for (const ruta of RUTAS_CON_MURO) {
    salida.push({ publica: `${PREFIJO}${ruta}`, precio: ruta });
    if (ruta !== "/comprobante") {
      salida.push({ publica: `${PREFIJO}${ruta}/csv`, precio: ruta });
    }
  }
  return salida;
}

/**
 * Traduce a v1 el cuerpo que faremeter manda a `/settle` y `/verify`.
 *
 * El facilitador de Ultravioleta **habla dos versiones distintas según el
 * endpoint**, y eso no está documentado en ningún lado: `/accepts` contesta v2
 * y acepta CAIP-2, pero `/settle` y `/verify` solo saben deserializar v1.
 * Medido el 2026-08-03 contra el facilitador real, endpoint por endpoint:
 *
 *   network `eip155:8453` -> `unknown variant, expected one of ... base ...`
 *   `amount`              -> `missing field maxAmountRequired`
 *   sin `x402Version`     -> `missing field x402Version`
 *
 * Con las tres corregidas la petición pasa el deserializador y llega a validar
 * la firma on-chain. faremeter 0.22.0 —la última publicada— manda v2 siempre y
 * lo dice en su propio código ("always sends v2 format requests"), así que sin
 * esta traducción NINGÚN pago puede liquidarse jamás por este facilitador: el
 * comprador firma bien, y el 500 aparece de nuestro lado.
 *
 * Lo que se anuncia al comprador NO se toca: el 402 público sigue siendo v2 con
 * CAIP-2, que es lo que pide el Bazaar. El remiendo vive acá abajo, en el
 * transporte, y se quita entero el día que el facilitador se ponga de acuerdo
 * consigo mismo.
 */
export function aFormatoV1(cuerpo: Record<string, unknown>, red: RedX402): unknown {
  const req = (cuerpo.paymentRequirements ?? {}) as Record<string, unknown>;
  const pp = (cuerpo.paymentPayload ?? {}) as Record<string, unknown>;
  const recurso = (pp.resource ?? {}) as Record<string, unknown>;

  return {
    x402Version: 1,
    paymentRequirements: {
      scheme: req.scheme,
      // `nombre` es el mismo campo que ya existía en `RedX402`; no se inventa
      // un nombre de red acá, que sería otro sitio donde desincronizarse.
      network: red.nombre,
      maxAmountRequired: req.amount,
      resource: recurso.url,
      description: recurso.description ?? "",
      mimeType: "application/json",
      payTo: req.payTo,
      maxTimeoutSeconds: req.maxTimeoutSeconds,
      asset: req.asset,
      extra: req.extra,
    },
    paymentPayload: {
      x402Version: 1,
      scheme: req.scheme,
      network: red.nombre,
      // `payload` ya trae `{signature, authorization}`, que es idéntico en las
      // dos versiones. La firma cubre el `transferWithAuthorization`, no estos
      // sobres, así que traducir el envoltorio no la invalida.
      payload: pp.payload,
    },
  };
}

/**
 * El facilitador de Ultravioleta responde `/accepts` sin el objeto `resource`
 * de nivel superior, y el validador v2 de faremeter lo exige: sin este parche
 * cada petición con muro muere en 500 en vez de contestar 402.
 *
 * Es un remiendo de interoperabilidad, no un diseño. Se quita el día que el
 * facilitador devuelva `resource`; la prueba de que hace falta es pedirle
 * `/accepts` y mirar si el campo está.
 */
function fetchDelFacilitador(
  red: RedX402,
  perfil: PerfilFacilitador,
  recursoDe: () => string,
  bazaar?: Record<string, unknown>,
): typeof fetch {
  // `extensions` va en el PaymentRequired (hermano de `accepts`) y se copia al
  // PaymentPayload que llega al facilitador. Lo inyectamos NOSOTROS en los dos
  // en vez de esperar que el comprador lo devuelva: es nuestra declaración, y
  // hacerla depender de que un cliente ajeno la reboté bien es regalar el
  // catálogo a la implementación del otro.
  const extensiones = bazaar ? { bazaar } : undefined;
  return async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const ruta = new URL(url).pathname;

    // ── /accepts ────────────────────────────────────────────────────────────
    // CDP no tiene este endpoint (404 medido), y faremeter lo pide siempre: sin
    // esto cada 402 muere antes de salir. Se responde con lo mismo que se iba a
    // preguntar — `/accepts` es un paso de ENRIQUECIMIENTO, y nuestros
    // requisitos ya están completos. No enriquecer es una respuesta válida;
    // inventar campos, no.
    if (perfil.sintetizaAccepts && ruta.endsWith("/accepts")) {
      const pedido = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          x402Version: 2,
          resource: pedido.resource ?? { url: recursoDe() },
          accepts: pedido.accepts ?? [],
          ...(extensiones ? { extensions: extensiones } : {}),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    // ── /settle y /verify ───────────────────────────────────────────────────
    if ((ruta.endsWith("/settle") || ruta.endsWith("/verify")) && typeof init?.body === "string") {
      const original = JSON.parse(init.body) as Record<string, unknown>;
      // Los DOS facilitadores exigen `x402Version` en el nivel superior y
      // faremeter no lo manda en ninguno de los dos casos — cambia el número,
      // no el hueco.
      const pp = original.paymentPayload as Record<string, unknown> | undefined;
      const cuerpo = perfil.traduceAV1
        ? aFormatoV1(original, red)
        : {
            x402Version: perfil.versionEnCuerpo,
            ...original,
            ...(extensiones && pp
              ? { paymentPayload: { ...pp, extensions: extensiones } }
              : {}),
          };

      const cabeceras = new Headers(init.headers);
      if (perfil.autenticaCdp) {
        const cred = credencialesCdp();
        if (!cred) throw new Error("facilitador CDP sin CDP_API_KEY_ID / CDP_API_KEY_SECRET");
        cabeceras.set("authorization", `Bearer ${jwtCdp(cred, "POST", ruta)}`);
      }
      const res = await fetch(input, { ...init, headers: cabeceras, body: JSON.stringify(cuerpo) });

      // `EXTENSION-RESPONSES` es el ÚNICO canal por el que se sabe si el
      // Bazaar aceptó la declaración: no hay endpoint de registro ni de
      // consulta, y el catálogo tarda en reflejarlo. Sin registrarlo, una
      // extensión rechazada se ve exactamente igual que una aceptada — el pago
      // liquida en los dos casos y nadie se entera de que no entramos.
      if (extensiones) {
        // eslint-disable-next-line no-console
        console.log(
          `[x402] ${ruta} → ${res.status} · EXTENSION-RESPONSES: ` +
            (res.headers.get("extension-responses") ?? "(el facilitador no mandó ninguno)"),
        );
      }
      return res;
    }

    // ── Todo lo demás ───────────────────────────────────────────────────────
    const res = await fetch(input, init);
    if (!ruta.endsWith("/accepts") || !res.ok) {
      return res;
    }
    const cuerpo = (await res.json()) as Record<string, unknown>;
    cuerpo.resource ??= { url: recursoDe() };
    cuerpo.x402Version = 2;
    return new Response(JSON.stringify(cuerpo), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  };
}

/** Middleware real para una ruta, resuelto una sola vez y cacheado. */
function muroDe(cfg: ConfigX402, precio: string, publica: string): Promise<RequestHandler> {
  const accepts = [requisitosDePago(cfg, precio)];
  return Promise.all([import("@faremeter/middleware"), import("@faremeter/middleware/express")])
    .then(([{ createHTTPFacilitatorHandler, common }, { createMiddleware }]) => {
      const handler = createHTTPFacilitatorHandler(cfg.facilitatorURL, {
        capabilities: common.deriveCapabilities(accepts),
        schemes: common.deriveSchemes(accepts),
        // `acceptsToPricing` no arrastra `extra` ni `mimeType`; el override
        // manda al facilitador lo que realmente configuramos.
        acceptsOverride: accepts.map(common.relaxedRequirementsToV2),
        fetch: fetchDelFacilitador(
          cfg.red,
          perfilFacilitador(cfg.facilitatorURL),
          () => `${cfg.origenPublico}${publica}`,
          extensionBazaar(precio),
        ),
      });
      return createMiddleware({
        x402Handlers: [handler],
        pricing: common.acceptsToPricing(accepts),
        // v2 es lo que anuncia el Bazaar; v1 queda encendido porque hay
        // clientes que solo hablan esa.
        supportedVersions: { x402v1: true, x402v2: true },
      });
    }) as Promise<RequestHandler>;
}

export function montarMuroX402(app: Express): void {
  const cfg = leerConfigX402();
  if (!cfg.activo) return;

  const problemas = problemasDeConfig(cfg);
  if (problemas.length > 0) {
    // Reventar al arrancar y no en la primera petición: un muro mal
    // configurado que falla recién cuando llega un comprador es peor que uno
    // que no deja levantar el servicio.
    throw new Error(`x402 activo pero mal configurado: ${problemas.join("; ")}`);
  }

  // El `resource` anunciado sale del request. Detrás del proxy inverso
  // `req.protocol` es "http" salvo que se confíe en `X-Forwarded-Proto`, y
  // anunciar `http://` en un endpoint que solo existe en https hace que el
  // cliente no reconozca el recurso que está pagando.
  app.set("trust proxy", true);

  const publico = new URL(cfg.origenPublico);
  const cache = new Map<string, Promise<RequestHandler>>();
  const porRuta = new Map(rutasPublicasConMuro().map((r) => [r.publica, r.precio]));

  // Un solo `use` SIN prefijo, filtrando por `req.path` adentro. Montarlo como
  // `app.use("/api/batch/verificar", ...)` volvería a romper lo mismo que este
  // archivo existe para arreglar: Express le saca el prefijo a `req.url`, y el
  // middleware terminaría anunciando `/` otra vez.
  app.use((req, res, next) => {
    // Solo POST: los GET (`/publickey`, `/parametros`, `/schema/v1.json`,
    // `/ejemplo`) quedan gratis a propósito — son los que permiten integrar
    // antes de pagar y verificar la firma después.
    const precio = req.method === "POST" ? porRuta.get(req.path) : undefined;
    if (precio === undefined) return next();

    // El origen se normaliza al público configurado en vez de confiar en los
    // headers: así el 402 anuncia siempre la URL por la que se compra, venga
    // el request por donde venga. Nada aguas abajo lee host/protocolo.
    req.headers.host = publico.host;
    req.headers["x-forwarded-proto"] = publico.protocol.replace(":", "");

    let m = cache.get(req.path);
    if (!m) {
      m = muroDe(cfg, precio, req.path);
      cache.set(req.path, m);
    }
    m.then((muro) => muro(req, res, next)).catch((err: unknown) => {
      // Cuando la liquidación revienta, faremeter lanza y sin esto Express
      // contesta su HTML genérico de 500. El comprador recibía
      // `<pre>Internal Server Error</pre>` y no podía distinguir "no pagaste"
      // de "pagaste y algo falló" — que es exactamente la diferencia que
      // decide si reintentar. Paybox lo reportó como `payment: unknown`.
      //
      // NO se contesta 402: un 402 significa "pagá", y si la autorización
      // llegó a liquidarse antes del fallo, reintentar cobra DOS VECES sin
      // forma de deshacerlo. Tampoco se entrega el recurso.
      //
      // 424 y no 502, y el motivo NO es semántico: **Cloudflare se come el
      // cuerpo de los 502/503/504**. Medido el 2026-08-03 con el muro ya
      // desplegado — el origen servía 236 bytes de JSON y por el dominio
      // público llegaban 16 de `text/plain` diciendo `error code: 502`. Un
      // código que el proxy reemplaza deja al comprador igual de ciego que el
      // 500 que esto vino a arreglar, y el cuerpo legible ES el arreglo. Los
      // 4xx pasan intactos. `424 Failed Dependency` además dice lo que pasó:
      // la petición dependía de una liquidación ajena, y esa falló.
      if (res.headersSent) return next(err);
      // eslint-disable-next-line no-console
      console.error("[x402] fallo liquidando:", err);
      res.status(424).json({
        error: "facilitator_error",
        mensaje:
          "El facilitador no confirmó el pago. NO se entregó el recurso. " +
          "El estado del pago es desconocido: comprobá on-chain antes de reintentar.",
        facilitador: cfg.facilitatorURL,
      });
    });
  });

  // eslint-disable-next-line no-console
  console.log(
    `[x402] muro activo en ${cfg.red.nombre} · facilitador ${cfg.facilitatorURL} · ` +
      `cobra a ${cfg.payTo} · ${rutasPublicasConMuro().length} rutas`,
  );
}
