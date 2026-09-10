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
  declaracionDurableEvidence,
  facilitadorDe,
  rutasActivas,
  perfilFacilitador,
  type ConfigX402,
  type PerfilFacilitador,
  type RedX402,
} from "./x402Config.js";
import { credencialesCdp, jwtCdp } from "./cdpAuth.js";
import { registro } from "./registro.js";
import { problemaDeEntrada, rutasPagasSinEsquema } from "./validacionPrevia.js";
import { muroDurableDe } from "./x402MuroDurable.js";
// Único punto donde `lib/` importa de `services/` en todo el repo (Parte 1
// dejó `problemasDeConfig` sin este import a propósito, ver x402Config.ts).
// Acá SÍ hace falta: `montarMuroX402` es quien conoce a la vez si
// `/verificar/durable` está montada (`rutasActivas`, DX402_ACTIVO) y el resultado de
// `sobreConfigurado()`, y es el único lugar donde juntar los dos no infla la
// superficie de `x402Config.ts` con un chequeo que le es ajeno.
import { llaveDelSobreDeclarada, sobreConfigurado } from "../services/sobreSignatureService.js";

/** Prefijo público de los wrappers, el mismo que arma `requisitosDePago`. */
const PREFIJO = "/api/batch";

/**
 * Rutas con muro, en ruta pública completa. El `/csv` entrega el mismo cálculo
 * en otro formato y cuesta igual: sin él, pedir el CSV sería la forma gratis de
 * saltarse el muro. `/comprobante` no tiene variante CSV, y tampoco
 * `/verificar/durable`: lo que esa ruta vende es un SOBRE firmado (spec
 * `sobre/SPEC.md`) sellado y anclado — un CSV no es un sobre, y no hay forma
 * de servir esa garantía en ese formato.
 *
 * Recibe la config porque la lista depende de ella: con `DX402_ACTIVO=false`
 * `/verificar/durable` no existe (`rutasActivas`, x402Config.ts).
 */
export function rutasPublicasConMuro(
  cfg: Pick<ConfigX402, "dx402Activo">,
): { publica: string; precio: string }[] {
  const salida: { publica: string; precio: string }[] = [];
  for (const ruta of rutasActivas(cfg)) {
    salida.push({ publica: `${PREFIJO}${ruta}`, precio: ruta });
    if (ruta !== "/comprobante" && ruta !== "/verificar/durable") {
      salida.push({ publica: `${PREFIJO}${ruta}/csv`, precio: ruta });
    }
  }
  return salida;
}

/**
 * El 402 con el que un `GET` a una ruta paga se presenta.
 *
 * Existe porque el descubrimiento no usa el verbo del comprador. El facilitador
 * de Ultravioleta —y cualquier crawler de catálogo— sondea con `GET`, y estas
 * rutas solo tenían `.post()`: la sonda anotaba `httpStatus: 404` en las cinco
 * mientras el muro cobraba perfecto. Medido el 2026-08-15 sobre 1.000 recursos
 * del catálogo, el 97% contesta 402 a ese GET; éramos del ~3% que daba 404.
 *
 * Es la ley `guardas-miden-lo-servido` dada vuelta: nuestra guarda mide el
 * camino que el comprador recorre y da verde con razón, la del catálogo mide el
 * suyo y daba 404 con razón, y el comprador igual no nos veía.
 *
 * `accepts` sale de `requisitosDePago`, la MISMA función que arma el 402 del
 * POST. No es una copia amable para catálogos: si divergieran, el catálogo
 * anunciaría un precio que el muro no cobra, y el error saldría del lado del
 * comprador.
 *
 * `x402Version: 1` no es un default: es lo que el muro contesta de verdad.
 * Medido el 2026-08-15 pidiéndole v2 por tres cabeceras distintas — faremeter
 * anuncia v1 en el desafío igual. Anunciar 2 acá haría que el desafío de
 * descubrimiento y el que enfrenta el comprador no coincidan.
 *
 * `extensions` de nivel superior SOLO aparece para `/verificar/durable`
 * (`declaracionDurableEvidence()`, informe `declaracion` §1: hermana de
 * `accepts`, no una clave más adentro de cada entrada). Las demás rutas no
 * prometen evidencia durable, así que agregarles la clave sería publicar una
 * promesa que nadie cumple — se omite entera, no se manda vacía.
 */
export function desafioDeDescubrimiento(
  cfg: ConfigX402,
  precio: string,
  publica: string,
): {
  x402Version: number;
  accepts: ReturnType<typeof requisitosDePago>;
  error: string;
  extensions?: Record<string, unknown>;
} {
  const desafio: {
    x402Version: number;
    accepts: ReturnType<typeof requisitosDePago>;
    error: string;
    extensions?: Record<string, unknown>;
  } = {
    x402Version: 1,
    accepts: requisitosDePago(cfg, precio),
    // El campo `error` ya existe en el 402 del muro (vacío cuando no hay). Se
    // usa como el canal para decir el verbo porque es el que los clientes x402
    // muestran; un campo propio de nivel superior lo ignoraría cualquiera.
    error:
      `Este recurso se compra con POST ${publica}, no con GET. ` +
      "Esta respuesta es el desafío de pago para descubrimiento: anuncia el " +
      "precio real, y no liquida nada.",
  };
  // `desafio.accepts.length > 0` en vez de `[0]` fijo: hoy `requisitosDePago`
  // siempre devuelve exactamente una entrada para esta ruta (Avalanche es su
  // única red permitida, y `problemasDeConfig` revienta el arranque si no
  // está configurada), pero la declaración señala los índices que ESTA
  // respuesta publica de verdad, no un valor fijo que quedaría mintiendo el
  // día que `accepts` viniera vacío (reparación DX402 punto 2 ronda 2,
  // hallazgo del refutador — ver `declaracionDurableEvidence`).
  if (precio === "/verificar/durable" && desafio.accepts.length > 0) {
    desafio.extensions = declaracionDurableEvidence(desafio.accepts.map((_, i) => i));
  }
  return desafio;
}

/**
 * Un accept de `requisitosDePago` (forma v1: `maxAmountRequired`) pasado a
 * forma v2 (`amount`) — mismo renombre de campos que
 * `common.relaxedRequirementsToV2` de `@faremeter/middleware` (`common.js`),
 * reescrito acá SIN el import: `desafioDeDescubrimiento`/el GET de
 * descubrimiento son deliberadamente sync y livianos (miden igual que
 * cualquier otra ruta gratis — comentario grande de `desafioDeDescubrimiento`
 * sobre el 97% de crawlers que sondea con GET), y traer el módulo async
 * entero de faremeter para esto sería más costoso que replicar cuatro
 * renombres de campo que no cambian (son los que exige el propio protocolo
 * x402 v2).
 */
function aAcceptV2(a: ReturnType<typeof requisitosDePago>[number]): Record<string, unknown> {
  return {
    scheme: a.scheme,
    network: a.network,
    amount: a.maxAmountRequired,
    asset: a.asset,
    payTo: a.payTo,
    maxTimeoutSeconds: a.maxTimeoutSeconds,
    extra: a.extra,
  };
}

/**
 * El header `PAYMENT-REQUIRED` (v2) para el desafío de un GET/HEAD de
 * descubrimiento — `undefined` cuando el desafío no tiene nada que declarar
 * (todas las rutas salvo `/verificar/durable`, que siguen sin este header,
 * igual que hoy).
 *
 * POR QUÉ HACE FALTA, si el CUERPO del GET ya trae `extensions` (v1 +
 * `extensions` agregado a mano en `desafioDeDescubrimiento`): la forma
 * CANÓNICA de la declaración vive en `extensions` del 402 **v2**, hermana de
 * `accepts` (x402-rs `src/dx402/types.rs:283-289`) — el tipo v1 no tiene ese
 * campo (`adaptPaymentRequiredResponseV2ToV1` nunca mapea `extensions`,
 * informe `faremeter` §6), así que un cliente que parsee el cuerpo como v1
 * ESTRICTO lo descarta. Y el GET existe justamente para el facilitador y los
 * crawlers de catálogo (comentario de `desafioDeDescubrimiento`), que son
 * quienes leerían el header — sin él, lo único que sobrevive es la forma
 * v0.2 por accept (`extra.extensions["durable-evidence"]`, sin
 * `acceptIndexes` ni `schema`) (reparación DX402 punto 2 ronda 2, hallazgo
 * del refutador).
 */
function paymentRequiredHeaderDeDesafio(
  desafio: ReturnType<typeof desafioDeDescubrimiento>,
  cfg: ConfigX402,
  rutaPublica: string
): string | undefined {
  if (!desafio.extensions) return undefined;
  const primero = desafio.accepts[0] as { resource?: string; description?: string; mimeType?: string } | undefined;
  const v2 = {
    x402Version: 2,
    resource: {
      url: primero?.resource ?? `${cfg.origenPublico}${rutaPublica}`,
      ...(primero?.description ? { description: primero.description } : {}),
      ...(primero?.mimeType ? { mimeType: primero.mimeType } : {}),
    },
    accepts: desafio.accepts.map(aAcceptV2),
    extensions: desafio.extensions,
  };
  return btoa(JSON.stringify(v2));
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
 * Qué red declara el cuerpo que va a `/settle` o `/verify`.
 *
 * Es el punto donde el multired se puede romper en silencio. La traducción a v1
 * cambia el CAIP-2 por el nombre que entiende el facilitador, y ese nombre tiene
 * que salir de lo que el COMPRADOR pagó. Con una sola red daba igual de dónde
 * saliera; con dos, tomar la primera significa decirle al facilitador "esto se
 * pagó en Base" sobre un pago hecho en Avalanche — y el facilitador entonces
 * busca la transacción en la cadena equivocada.
 *
 * Con una sola red configurada se devuelve esa, sin mirar el cuerpo: es
 * exactamente el comportamiento anterior, y evita que un facilitador que no
 * eche el `network` rompa un despliegue que hoy funciona.
 */
export function redDelPago(redes: RedX402[], cuerpo: Record<string, unknown>): RedX402 {
  if (redes.length === 1) return redes[0];

  const req = (cuerpo.paymentRequirements ?? {}) as Record<string, unknown>;
  const pp = (cuerpo.paymentPayload ?? {}) as Record<string, unknown>;
  const declarada = req.network ?? pp.network;

  const red = redes.find((r) => r.caip2 === declarada || r.nombre === declarada);
  if (red) return red;

  // No se cae a la primera red a propósito. Liquidar contra la red equivocada
  // es peor que no liquidar: el comprador ya firmó, y el error aparecería como
  // "transacción no encontrada" en una cadena donde nunca estuvo.
  throw new Error(
    `x402: el pago declara la red ${JSON.stringify(declarada)}, que no está entre las ` +
      `anunciadas (${redes.map((r) => r.caip2).join(", ")}). No se traduce a v1 a ciegas.`,
  );
}

/**
 * El facilitador de Ultravioleta responde `/accepts` sin el objeto `resource`
 * de nivel superior, y el validador v2 de faremeter lo exige: sin este parche
 * cada petición con muro muere en 500 en vez de contestar 402.
 *
 * Es un remiendo de interoperabilidad, no un diseño. Se quita el día que el
 * facilitador devuelva `resource`; la prueba de que hace falta es pedirle
 * `/accepts` y mirar si el campo está.
 *
 * Exportada porque `x402MuroDurable.ts#muroDurableDe` construye sus
 * `x402Handlers` EXACTAMENTE como acá abajo (brief DX402 punto 2, Parte 3) —
 * duplicar este remiendo en dos archivos es el lugar exacto donde diverge
 * sin que nadie lo note.
 */
export function fetchDelFacilitador(
  redes: RedX402[],
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
        ? aFormatoV1(original, redDelPago(redes, original))
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
        // Dispara por liquidación, no al arrancar, así que va por `registro`
        // con el sha: es la única señal de si el Bazaar aceptó la extensión, y
        // el comentario de arriba dice por qué importa que sea greppable.
        registro.info("x402", "liquidación con extensión declarada", {
          ruta,
          estado: res.status,
          extensionResponses: res.headers.get("extension-responses") ?? null,
        });
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

/**
 * Las redes agrupadas por el facilitador que las liquida, en el orden de
 * `cfg.redes`. Exportada para poder afirmarla en tests sin levantar faremeter.
 */
export function gruposPorFacilitador(cfg: ConfigX402): { url: string; redes: RedX402[] }[] {
  const grupos: { url: string; redes: RedX402[] }[] = [];
  for (const red of cfg.redes) {
    const url = facilitadorDe(cfg, red);
    const grupo = grupos.find((g) => g.url === url);
    if (grupo) grupo.redes.push(red);
    else grupos.push({ url, redes: [red] });
  }
  return grupos;
}

/**
 * `gruposPorFacilitador` filtrado a los grupos que tienen algo que settlear.
 *
 * Un grupo sin accepts para su red (`propios.length === 0`) no tiene nada que
 * settlear: construirle igual un handler con `deriveCapabilities([])`/
 * `acceptsOverride: []` sería anunciar un facilitador que nunca puede
 * matchear nada. Hoy esto NUNCA filtra nada para una ruta que pase por
 * `muroDe`: todas cobran en todas las redes de `cfg.redes`, así que cada
 * grupo siempre tiene al menos un accept propio (ver el describe
 * "gruposConPropios" en `x402Muro.test.ts`, que lo prueba directo en vez de
 * depender de que algún día deje de ser cierto). SÍ filtra para
 * `/verificar/durable` (`muroDurableDe`, `x402MuroDurable.ts`): esa ruta
 * restringe `accepts` a Avalanche vía `REDES_POR_RUTA`, así que el grupo de
 * cualquier otro facilitador (Base vía CDP, por ejemplo) llega acá con
 * `propios: []` y se descarta. Compartir la función es lo que evita que
 * `muroDe` y `muroDurableDe` diverjan en este filtro sin que nadie lo note.
 */
export function gruposConPropios(
  cfg: ConfigX402,
  accepts: ReturnType<typeof requisitosDePago>,
): { url: string; redes: RedX402[]; propios: ReturnType<typeof requisitosDePago> }[] {
  return gruposPorFacilitador(cfg)
    .map(({ url, redes }) => {
      const caip2 = new Set(redes.map((r) => r.caip2));
      return { url, redes, propios: accepts.filter((a) => caip2.has(a.network)) };
    })
    .filter((g) => g.propios.length > 0);
}

/**
 * Middleware real para una ruta, resuelto una sola vez y cacheado.
 *
 * UN handler por facilitador, no uno global: producción cobra Base por CDP
 * —ahí vive el catálogo del Bazaar— y CDP no liquida Avalanche, que va por
 * Ultravioleta. faremeter elige handler por capacidades (red + asset), así que
 * cada handler declara SOLO las redes de su facilitador; el `pricing` sí lleva
 * todas, porque es lo que el 402 anuncia.
 */
function muroDe(cfg: ConfigX402, precio: string, publica: string): Promise<RequestHandler> {
  return Promise.all([import("@faremeter/middleware"), import("@faremeter/middleware/express")])
    .then(([{ createHTTPFacilitatorHandler, common }, { createMiddleware }]) => {
      // Una entrada por red. `requisitosDePago` ya devuelve el array: envolverlo
      // acá era decidir "cuántas redes hay" en el sitio equivocado.
      const accepts = requisitosDePago(cfg, precio);

      const handlers = gruposConPropios(cfg, accepts)
        .map(({ url, redes, propios }) =>
          createHTTPFacilitatorHandler(url, {
            capabilities: common.deriveCapabilities(propios),
            schemes: common.deriveSchemes(propios),
            // `acceptsToPricing` no arrastra `extra` ni `mimeType`; el override
            // manda al facilitador lo que realmente configuramos.
            acceptsOverride: propios.map(common.relaxedRequirementsToV2),
            // La extensión del Bazaar va SOLO al perfil que la entiende: mandarla
            // a Ultravioleta no rompe nada, pero registrar la liquidación como
            // "con extensión declarada" cuando ningún catálogo la va a leer
            // ensucia la única señal que existe de si el Bazaar nos aceptó.
            fetch: fetchDelFacilitador(
              redes,
              perfilFacilitador(url),
              () => `${cfg.origenPublico}${publica}`,
              perfilFacilitador(url).autenticaCdp ? extensionBazaar(precio) : undefined,
            ),
          })
        );

      return createMiddleware({
        x402Handlers: handlers,
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

  // `sobreConfigurado()` corre si la llave IMPORTA: con `DX402_ACTIVO=true`
  // (la ruta se monta y firma con ella: rota, revienta el arranque como
  // cualquier config rota), o con la llave declarada en el entorno aunque la
  // flag esté apagada. En ese segundo caso NO es fatal: la llave solo sirve
  // la verificación de los sobres ya vendidos, y tumbar la API entera —las
  // cinco rutas que facturan incluidas— por una llave que no es precondición
  // de nada que se venda es desproporcionado; además la sonda post-deploy que
  // la vigila nunca correría, porque la API no llegaría sana (tercer
  // refutador, 2026-09-10). Se avisa acá, `GET …/sobre-publickey` contesta
  // 503 con el motivo, y `deploy.sh` grita al sondearla. Apagada y sin
  // llave: no se exige nada — es lo que deja desplegar `main` con el muro
  // encendido y sin la llave del sobre.
  const problemaSobre = cfg.dx402Activo || llaveDelSobreDeclarada() ? sobreConfigurado() : null;
  const problemas = problemasDeConfig(cfg, cfg.dx402Activo ? problemaSobre : null);
  if (!cfg.dx402Activo && problemaSobre) {
    registro.warn(
      "x402",
      "la llave del sobre está declarada pero no sirve: GET /api/batch/verificar/durable/sobre-publickey " +
        "contesta 503 hasta arreglarla, y los sobres ya vendidos no verifican mientras tanto. " +
        `DX402 está apagada, así que el muro arranca igual. Motivo: ${problemaSobre}`,
    );
  }
  // Una ruta que cobra sin esquema de validacion previa vuelve a abrir el
  // agujero del "typo pagado". Se revienta al arrancar, no con el primer
  // comprador.
  const sinEsquema = rutasPagasSinEsquema(rutasActivas(cfg));
  if (sinEsquema.length > 0) {
    problemas.push(
      `estas rutas cobran sin validacion previa: ${sinEsquema.join(", ")} ` +
        "(agregales su esquema en lib/validacionPrevia.ts)"
    );
  }
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
  const porRuta = new Map(rutasPublicasConMuro(cfg).map((r) => [r.publica, r.precio]));

  // Un solo `use` SIN prefijo, filtrando por `req.path` adentro. Montarlo como
  // `app.use("/api/batch/verificar", ...)` volvería a romper lo mismo que este
  // archivo existe para arreglar: Express le saca el prefijo a `req.url`, y el
  // middleware terminaría anunciando `/` otra vez.
  app.use((req, res, next) => {
    // Los GET de integración (`/publickey`, `/parametros`, `/schema/v1.json`,
    // `/ejemplo`, `/prechequeo`) NO están en este mapa y siguen gratis: son los
    // que permiten integrar antes de pagar y verificar la firma después.
    const precio = porRuta.get(req.path);
    if (precio === undefined) return next();

    // ── GET/HEAD: desafío de descubrimiento, nunca una venta ────────────────
    if (req.method === "GET" || req.method === "HEAD") {
      // Un GET con `X-PAYMENT` (v1) o `PAYMENT-SIGNATURE` (v2) NO se liquida.
      // Es la ley `cobrar-antes-de-servir` en su forma más cruda: por GET no
      // hay cuerpo que procesar, así que aceptar el pago sería cobrar por
      // algo que no podemos entregar, y el pago x402 es inmediato y final —
      // no habría cómo devolverlo. La guarda miraba solo v1: un pago v2 por
      // GET (el comprador previsto usa `@x402/fetch` v2) recibía otro 402 y
      // el cliente reintentaba firmando, nunca el 405 que explica qué pasó
      // (hallazgo del refutador `protocolo`, ronda 3).
      if (req.headers["x-payment"] || req.headers["payment-signature"]) {
        return res.status(405).set("Allow", "POST").json({
          error: "wrong_method",
          mensaje:
            `Llegó un pago por GET y NO se liquidó. Este recurso se sirve con ` +
            `POST ${req.path}: por GET no hay cuerpo que procesar, y cobrar por ` +
            "algo que no se puede entregar no tiene vuelta atrás en x402. " +
            "Reintentá el POST con la misma autorización.",
        });
      }
      const desafio = desafioDeDescubrimiento(cfg, precio, req.path);
      res.status(402).set("Allow", "POST");
      const paymentRequired = paymentRequiredHeaderDeDesafio(desafio, cfg, req.path);
      if (paymentRequired) res.set("PAYMENT-REQUIRED", paymentRequired);
      return res.json(desafio);
    }

    if (req.method !== "POST") return next();

    // El origen se normaliza al público configurado en vez de confiar en los
    // headers: así el 402 anuncia siempre la URL por la que se compra, venga
    // el request por donde venga. Nada aguas abajo lee host/protocolo.
    req.headers.host = publico.host;
    req.headers["x-forwarded-proto"] = publico.protocol.replace(":", "");

    // VALIDAR ANTES DE COBRAR. En x402 el pago es inmediato y final: un cuerpo
    // mal formado que llegue al muro se liquida igual, y el comprador termina
    // pagando por su propio typo y recibiendo un 400. Validar no es servir —
    // no revela resultado, no corre el motor, no toca la base— asi que va
    // antes del cobro sin tocar la ley de "cobrar antes de servir".
    const malFormado = problemaDeEntrada(precio, req.body);
    if (malFormado) {
      registro.info("x402", `rechazado sin cobrar: ${req.path} con cuerpo invalido`);
      return res.status(400).json(malFormado);
    }

    let m = cache.get(req.path);
    if (!m) {
      // `/verificar/durable` no es un wrapper más: vende un SOBRE sellado y
      // anclado, con su propio orden de fases (decisión 4 del brief DX402
      // punto 2) — `muroDurableDe` es el único que lo sabe hacer.
      // `problemasDeConfig` ya reventó el arranque si esta ruta está
      // montada sin `NOMICHECK_SOBRE_SIGNING_KEY_PEM`, así que acá siempre
      // hay llave con la que sellar.
      m = precio === "/verificar/durable" ? muroDurableDe(cfg, req.path) : muroDe(cfg, precio, req.path);
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
      // Un fallo de liquidación es lo más caro que puede pasar en este muro: el
      // comprador está pagando. Va por `registro` y no `console` para que lleve
      // el sha desplegado y se pueda encontrar con el mismo grep que el resto —
      // ver lib/registro.ts y la ley cobrar-antes-de-servir.
      registro.error("x402", "fallo liquidando: el facilitador no confirmó el pago", err, {
        facilitadores: gruposPorFacilitador(cfg).map((g) => g.url),
      });
      res.status(424).json({
        error: "facilitator_error",
        mensaje:
          "El facilitador no confirmó el pago. NO se entregó el recurso. " +
          "El estado del pago es desconocido: comprobá on-chain antes de reintentar.",
        facilitadores: gruposPorFacilitador(cfg).map((g) => g.url),
      });
    });
  });

  // eslint-disable-next-line no-console
  console.log(
    `[x402] muro activo en ${gruposPorFacilitador(cfg)
      .map((g) => `${g.redes.map((r) => r.nombre).join(",")}→${new URL(g.url).host}`)
      .join(" · ")} · cobra a ${cfg.payTo} · ${rutasPublicasConMuro(cfg).length} rutas` +
      (cfg.dx402Activo ? " · DX402 activo" : " · DX402 apagado"),
  );
}
