// CORS abierto para los GET que sirven para verificar, y solo para esos.
//
// POR QUE EXISTE. Todo el producto se apoya en una promesa: "verificá la
// salida por tu cuenta, sin confiar en mi servidor". Esa promesa se cumple con
// la firma Ed25519 y la llave pública de `/api/batch/publickey`.
//
// Con un `CORS_ORIGIN` único, esa llave era ilegible desde cualquier otro
// origen: el navegador bloquea el fetch. O sea que **ningún verificador de
// terceros escrito en el navegador podía funcionar** — ni el nuestro servido
// desde otro dominio, ni el de un comprador que quisiera comprobarnos. La
// contradicción no estaba en el argumento, estaba en la infraestructura.
//
// QUE SE ABRE Y QUE NO. Solo lectura pública: llave, esquemas, ejemplos y
// parámetros legales. Son datos que ya se sirven a cualquiera que haga `curl`,
// sin credenciales y sin cookies — `*` no revela nada que no estuviera
// público, solo deja que un navegador lo lea.
//
// Lo que NO se abre: los POST de cómputo y todo lo que va tras `requiereAuth`.
// Por eso la lista es una ALLOWLIST EXPLICITA y no un patrón: con un
// `startsWith("/api/batch")` cualquier ruta nueva —incluida una privada—
// heredaría `*` sin que nadie lo decidiera. Agregar una ruta acá tiene que ser
// un acto deliberado.

import type { CorsOptions, CorsRequest } from "cors";

/**
 * `CorsRequest` solo declara `method` y `headers`, pero el delegado recibe el
 * `Request` de Express, que sí trae `url`. Se declara opcional para que un
 * `CorsRequest` pelado siga siendo asignable y no haga falta ningún cast: sin
 * la ruta no se puede decidir nada, y el `?? ""` la trata como desconocida.
 */
export type PeticionCors = CorsRequest & { url?: string };

/** El origen del panel web cuando no se configura nada. */
export const ORIGEN_POR_DEFECTO = "http://localhost:5173";

/**
 * Rutas GET de lectura pública, con el prefijo `/api` incluido porque el
 * middleware se monta a nivel de app y ve la ruta completa.
 *
 * Criterio para entrar: (1) no lleva credenciales, (2) no muta nada, (3) sirve
 * para integrar o para VERIFICAR sin haber pagado. Si una ruta no cumple las
 * tres, no entra.
 */
export const RUTAS_PUBLICAS = new Set([
  // La llave con la que se comprueba cualquier firma nuestra. La más
  // importante de la lista: sin ella no hay verificación de terceros posible.
  "/api/batch/publickey",

  // Contratos: permiten integrar antes de pagar.
  "/api/batch/schema/v1.json",
  "/api/batch/retencion/schema/v1.json",
  "/api/batch/verificar/schema/v1.json",
  "/api/batch/pago-onchain/schema/v1.json",

  // Ejemplos firmados: son la evidencia con la que alguien comprueba que la
  // firma verifica ANTES de comprar nada.
  "/api/batch/ejemplo",
  "/api/batch/retencion/ejemplo",
  "/api/batch/verificar/ejemplo",

  // Parámetros legales y utilidades de comprobación.
  "/api/batch/parametros",
  "/api/reglas/parametros",
  "/api/reglas/verificadas-al",
  "/api/festivos",
  "/api/tasa/verify",

  // Salud: que un tercero pueda sondearnos es parte de estar en un directorio.
  "/api/health",
  "/api/batch/health",
]);

/** Métodos que se permiten cross-origin. Nada que escriba. */
const METODOS_PUBLICOS = ["GET", "HEAD", "OPTIONS"];

/**
 * `true` si la petición es una lectura pública verificable.
 *
 * El preflight (`OPTIONS`) llega con el método real en
 * `access-control-request-method`, no en `req.method`: mirarlo es lo que evita
 * que un `POST` cross-origin se cuele por su propio preflight.
 */
export function esLecturaPublica(req: PeticionCors): boolean {
  const ruta = (req.url ?? "").split("?")[0].replace(/\/+$/, "") || "/";
  if (!RUTAS_PUBLICAS.has(ruta)) return false;

  const metodo = (req.method ?? "").toUpperCase();
  if (metodo === "OPTIONS") {
    const pedido = String(
      req.headers["access-control-request-method"] ?? "GET",
    ).toUpperCase();
    return METODOS_PUBLICOS.includes(pedido);
  }
  return METODOS_PUBLICOS.includes(metodo);
}

/**
 * Opciones de CORS para una petición concreta.
 *
 * Nunca se activa `credentials`: con `origin: "*"` el navegador rechaza la
 * respuesta si además viaja `Access-Control-Allow-Credentials`, y estos
 * endpoints no tienen sesión que mandar.
 */
export function opcionesPara(req: PeticionCors): CorsOptions {
  if (esLecturaPublica(req)) {
    return { origin: "*", methods: METODOS_PUBLICOS, credentials: false };
  }
  return {
    origin: process.env.CORS_ORIGIN ?? ORIGEN_POR_DEFECTO,
    credentials: true,
  };
}

/** Delegado listo para `app.use(cors(delegadoCors))`. */
export function delegadoCors(
  req: PeticionCors,
  cb: (err: Error | null, opciones?: CorsOptions) => void,
): void {
  cb(null, opcionesPara(req));
}
