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
  RUTAS_CON_MURO,
  type ConfigX402,
} from "./x402Config.js";

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
 * El facilitador de Ultravioleta responde `/accepts` sin el objeto `resource`
 * de nivel superior, y el validador v2 de faremeter lo exige: sin este parche
 * cada petición con muro muere en 500 en vez de contestar 402.
 *
 * Es un remiendo de interoperabilidad, no un diseño. Se quita el día que el
 * facilitador devuelva `resource`; la prueba de que hace falta es pedirle
 * `/accepts` y mirar si el campo está.
 */
function fetchQueRemiendaAccepts(recursoDe: () => string): typeof fetch {
  return async (input, init) => {
    const res = await fetch(input, init);
    if (!String(input instanceof Request ? input.url : input).endsWith("/accepts") || !res.ok) {
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
        fetch: fetchQueRemiendaAccepts(() => `${cfg.origenPublico}${publica}`),
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
    m.then((muro) => muro(req, res, next)).catch(next);
  });

  // eslint-disable-next-line no-console
  console.log(
    `[x402] muro activo en ${cfg.red.nombre} · facilitador ${cfg.facilitatorURL} · ` +
      `cobra a ${cfg.payTo} · ${rutasPublicasConMuro().length} rutas`,
  );
}
