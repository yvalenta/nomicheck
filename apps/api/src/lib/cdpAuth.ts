// Autenticación contra el facilitador de Coinbase CDP.
//
// CDP exige un JWT por petición, firmado con la Secret API Key. Sin él los tres
// endpoints (`/supported`, `/verify`, `/settle`) responden 401 — medido el
// 2026-08-03; lo único público es el catálogo `/discovery/resources`.
//
// **Sin dependencias nuevas.** El JWT se arma con `node:crypto`, que hace Ed25519
// desde Node 12. Traer una librería de JWT para cinco líneas de base64url sería
// una superficie de suministro nueva a cambio de nada.
//
// La clave NUNCA se registra ni se devuelve: entra por `process.env` y sale
// convertida en un `KeyObject`.
import crypto from "node:crypto";

/** Host del facilitador de CDP. El `aud` y el `uris` del JWT lo nombran. */
export const CDP_HOST = "api.cdp.coinbase.com";

/**
 * El secreto llega en base64: 64 bytes = semilla(32) + pública(32). Node quiere
 * PKCS8 DER, así que se envuelve la semilla con el prefijo fijo de Ed25519.
 *
 * Si alguien pega una clave ECDSA (la opción "legacy" del portal) esto revienta
 * acá y no en la primera venta. Es a propósito: un 401 en `/settle` se ve igual
 * que "nadie compró".
 */
function llaveDesdeSecreto(secreto: string): crypto.KeyObject {
  const crudo = Buffer.from(secreto, "base64");
  if (crudo.length < 32) {
    throw new Error(
      "CDP_API_KEY_SECRET no parece una clave Ed25519 en base64. " +
        "Si creaste la API key con ECDSA (opción legacy), creá una nueva con Ed25519.",
    );
  }
  const der = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    crudo.subarray(0, 32),
  ]);
  return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

const b64url = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString("base64url");

export interface CredencialesCdp {
  keyId: string;
  secret: string;
}

/** Lee las credenciales del entorno. `null` si no están las dos. */
export function credencialesCdp(): CredencialesCdp | null {
  const keyId = process.env.CDP_API_KEY_ID;
  const secret = process.env.CDP_API_KEY_SECRET;
  return keyId && secret ? { keyId, secret } : null;
}

/**
 * JWT para UNA petición concreta. El claim `uris` ata el token al método y a la
 * ruta exactos: un token robado no sirve para otro endpoint. Por eso se firma
 * uno por llamada en vez de cachear.
 *
 * `exp` a 120 s — el mínimo cómodo. CDP rechaza tokens largos.
 */
export function jwtCdp(cred: CredencialesCdp, metodo: string, ruta: string): string {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64url({
    alg: "EdDSA",
    kid: cred.keyId,
    typ: "JWT",
    // El nonce evita que dos peticiones en el mismo segundo produzcan el mismo
    // token; CDP los rechaza como repetidos.
    nonce: crypto.randomBytes(16).toString("hex"),
  });
  const cuerpo = b64url({
    sub: cred.keyId,
    iss: "cdp",
    aud: ["cdp_service"],
    nbf: ahora,
    exp: ahora + 120,
    uris: [`${metodo} ${CDP_HOST}${ruta}`],
  });
  const firma = crypto
    .sign(null, Buffer.from(`${cabecera}.${cuerpo}`), llaveDesdeSecreto(cred.secret))
    .toString("base64url");
  return `${cabecera}.${cuerpo}.${firma}`;
}
