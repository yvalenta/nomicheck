// Firma criptográfica del output del wrapper stateless (RUMBO §M —
// respuesta al hoyo "el buyer no puede probar que el JSON salió del
// servidor real"). Se usa **Ed25519** en vez de HMAC porque el buyer
// del marketplace necesita verificar **offline** (a menudo desde IPFS,
// donde el output vive sin el servidor); con HMAC tendría que pedirle
// el secreto al servidor y confiar en su respuesta.
//
// La llave privada vive en `NOMICHECK_BATCH_SIGNING_KEY_PEM` (env, PEM).
// Si no existe, se genera un keypair efímero al arranque con warning
// visible — sirve para dev, PROD debe congelar la llave para que un
// output firmado ayer siga siendo verificable mañana.
//
// La firma cubre el JSON canónico del output SIN el campo `signature`
// (evita recursión); reordenar claves o reindentar el JSON no cambia la
// firma. Ver `verificarFirma` para el mismo canonical al lado del buyer.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";

interface Keypair {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyPem: string;
  publicKeyId: string;
  esEfimero: boolean;
}

let keypairSingleton: Keypair | null = null;

function calcularPublicKeyId(publicKeyPem: string): string {
  return createHash("sha256").update(publicKeyPem).digest("hex").slice(0, 32);
}

function keypairDesdeEnv(): Keypair | null {
  const pem = process.env.NOMICHECK_BATCH_SIGNING_KEY_PEM;
  if (!pem) return null;
  const privateKey = createPrivateKey({ key: pem, format: "pem" });
  const publicKey = createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  return {
    privateKey,
    publicKey,
    publicKeyPem,
    publicKeyId: calcularPublicKeyId(publicKeyPem),
    esEfimero: false,
  };
}

function keypairEfimero(): Keypair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  // eslint-disable-next-line no-console
  console.warn(
    "[batchSignature] NOMICHECK_BATCH_SIGNING_KEY_PEM no configurado: usando keypair Ed25519 efímero de esta sesión.\n" +
      "  publicKeyId=" +
      calcularPublicKeyId(publicKeyPem) +
      "\n" +
      "  PROD debe congelar la llave para verificabilidad histórica del output pinneado.\n"
  );
  return {
    privateKey,
    publicKey,
    publicKeyPem,
    publicKeyId: calcularPublicKeyId(publicKeyPem),
    esEfimero: true,
  };
}

export function obtenerKeypair(): Keypair {
  if (keypairSingleton) return keypairSingleton;
  keypairSingleton = keypairDesdeEnv() ?? keypairEfimero();
  return keypairSingleton;
}

// Canonicaliza recursivamente: ordena claves y filtra `undefined`. El
// campo `signature` se remueve del objeto antes de firmar/verificar.
function canonicalizar(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canonicalizar);
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([k, val]) => k !== "signature" && val !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const [k, val] of entries) out[k] = canonicalizar(val);
  return out;
}

export function canonicalJson(payload: unknown): string {
  return JSON.stringify(canonicalizar(payload));
}

export interface FirmaBatch {
  algo: "ed25519";
  valor: string;
  publicKeyId: string;
  cubreCampos: "todos_menos_signature";
  canonical: "sorted_keys_utf8_json";
}

export function firmarPayload(payload: unknown): FirmaBatch {
  const kp = obtenerKeypair();
  const canonical = canonicalJson(payload);
  const firma = sign(null, Buffer.from(canonical, "utf8"), kp.privateKey);
  return {
    algo: "ed25519",
    valor: firma.toString("base64"),
    publicKeyId: kp.publicKeyId,
    cubreCampos: "todos_menos_signature",
    canonical: "sorted_keys_utf8_json",
  };
}

export function verificarFirma(payload: unknown, firma: FirmaBatch, publicKeyPem?: string): boolean {
  const kp = obtenerKeypair();
  const pk = publicKeyPem ? createPublicKey({ key: publicKeyPem, format: "pem" }) : kp.publicKey;
  const canonical = canonicalJson(payload);
  try {
    return verify(null, Buffer.from(canonical, "utf8"), pk, Buffer.from(firma.valor, "base64"));
  } catch {
    return false;
  }
}

export function obtenerPublicKeyPem(): string {
  return obtenerKeypair().publicKeyPem;
}

export function obtenerPublicKeyId(): string {
  return obtenerKeypair().publicKeyId;
}
