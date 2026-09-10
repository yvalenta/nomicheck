// Llave del SOBRE de `/verificar/durable` (DX402 punto 2) — decisión de
// Yonatan del 2026-09-09: el cuerpo vendido en esa ruta es un sobre firmado
// con una llave Ed25519 NUEVA y DISTINTA de `NOMICHECK_BATCH_SIGNING_KEY_PEM`
// (la que firma `/liquidar`, `/verificar`, etc. vía `batchSignatureService.ts`).
// Una sola `signature` en la raíz del sobre — la del sobre — nunca la del
// batch.
//
// POR QUÉ NO HAY KEYPAIR EFÍMERO ACÁ, a diferencia de `batchSignatureService.ts`.
// Esa ruta cobra ANTES de servir (`authorize` → calcular+sobre → `capture` →
// anchor → responder — brief DX402 punto 2, decisión 4): si la llave del
// sobre no está configurada, el pipeline entero tiene que fallar ANTES de
// cobrar, no firmar con una llave de sesión que muere en el próximo redeploy.
// Un batch normal puede degradar a efímera porque es gratis reintentar; acá
// degradar en silencio sería cobrar por una evidencia que nadie más puede
// verificar mañana. Por eso `cargarKeypairSobre` LANZA si la env falta o no
// es Ed25519 — mismo patrón de nombrar la variable rota que
// `batchSignatureService.ts`, sin la salida efímera.
import { createPrivateKey, createPublicKey } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { firmar, idDeLlave, type DocFirmado } from "../lib/sobre.js";
import { obtenerPublicKeyId as obtenerPublicKeyIdDelBatch } from "./batchSignatureService.js";

const ENV_LLAVE_SOBRE = "NOMICHECK_SOBRE_SIGNING_KEY_PEM";
// Literal y no importado de `batchSignatureService.ts` a propósito: ese
// archivo no exporta el nombre de su variable como constante, y leerla acá
// solo para chequear PRESENCIA (nunca su valor) no vale la pena acoplar los
// dos módulos por un string.
const ENV_LLAVE_BATCH = "NOMICHECK_BATCH_SIGNING_KEY_PEM";

interface KeypairSobre {
  /**
   * El PEM crudo: es la CLAVE de la caché. `obtenerKeypairSobre` recarga si
   * la env ya no trae exactamente este valor (o no trae nada). En producción
   * la env no cambia nunca, así que cuesta una comparación de strings por
   * firma; en tests evita que el primer archivo que carga una llave fije la
   * de todos los que vienen después (hallazgo del refutador, 2026-09-10).
   */
  pem: string;
  publicKeyPem: string;
  publicKeyId: string;
}

let singleton: KeypairSobre | null = null;

function cargarKeypairSobre(): KeypairSobre {
  const pem = process.env[ENV_LLAVE_SOBRE];
  if (!pem) {
    throw new Error(
      `${ENV_LLAVE_SOBRE} no está configurada. /verificar/durable firma su cuerpo con una llave ` +
        "Ed25519 PROPIA (decisión de Yonatan, 2026-09-09) — sin esto el pipeline no puede producir " +
        "evidencia y, por la ley cobrar-antes-de-servir, tampoco puede cobrar. Generá una llave nueva " +
        '(`openssl genpkey -algorithm ed25519`), NUNCA la de NOMICHECK_BATCH_SIGNING_KEY_PEM.'
    );
  }
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({ key: pem, format: "pem" });
  } catch (e) {
    // El error crudo de OpenSSL no dice QUÉ variable está rota — se le pone
    // nombre acá, mismo criterio que `batchSignatureService.ts`.
    throw new Error(
      `${ENV_LLAVE_SOBRE} está configurada pero no es un PEM de llave privada válido: ${(e as Error).message}`
    );
  }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error(
      `${ENV_LLAVE_SOBRE} no es una llave Ed25519 (es "${privateKey.asymmetricKeyType}") — el sobre ` +
        'declara algo:"ed25519" y firmar con otro tipo produce una firma que ningún verificador Ed25519 puede leer'
    );
  }
  const publicKeyPem = createPublicKey(privateKey).export({ format: "pem", type: "spki" }).toString();
  return { pem, publicKeyPem, publicKeyId: idDeLlave(publicKeyPem) };
}

function obtenerKeypairSobre(): KeypairSobre {
  if (singleton && singleton.pem === process.env[ENV_LLAVE_SOBRE]) return singleton;
  singleton = cargarKeypairSobre();
  return singleton;
}

/**
 * `true` si `NOMICHECK_SOBRE_SIGNING_KEY_PEM` está en el entorno, valga lo que
 * valga. Es la señal de "el operador quiere que la llave del sobre exista":
 * con `DX402_ACTIVO` apagada la llave no se exige, pero si está declarada
 * tiene que ser válida — sirve la verificación de los sobres ya vendidos, y
 * una llave rota ahí es una revocación silenciosa de esos 90 días. Quien la
 * declara y está rota se entera al arrancar (`montarMuroX402`) y en
 * `GET /verificar/durable/sobre-publickey` (503, no 404).
 */
export function llaveDelSobreDeclarada(): boolean {
  return Boolean(process.env[ENV_LLAVE_SOBRE]);
}

/**
 * Firma un documento SIN firma con la llave del sobre. Delega el algoritmo
 * entero (canonicalización, rechazo de `null`/`signature` anidada) en
 * `sobre.ts#firmar` — este módulo solo administra LA LLAVE, no reimplementa
 * la firma.
 */
export function firmarSobre<T extends Record<string, unknown>>(docSinFirma: T): DocFirmado<Omit<T, "signature">> {
  const kp = obtenerKeypairSobre();
  return firmar(docSinFirma, kp.pem) as DocFirmado<Omit<T, "signature">>;
}

export function obtenerSobrePublicKeyPem(): string {
  return obtenerKeypairSobre().publicKeyPem;
}

export function obtenerSobrePublicKeyId(): string {
  return obtenerKeypairSobre().publicKeyId;
}

/**
 * `null` si la llave del sobre está lista para firmar; si no, el motivo
 * exacto — para que `problemasDeConfig`/`montarMuroX402` revienten al
 * arrancar (igual que `sinEsquema`) en vez de fallar recién con el primer
 * comprador. A diferencia de `obtenerKeypairSobre`, esta función NUNCA
 * lanza: es la que corre un chequeo de arranque, no un firmador.
 *
 * Incluye el chequeo "la llave del sobre no puede ser la misma que la del
 * batch" — comparando `publicKeyId` contra `obtenerPublicKeyId()` del batch,
 * pero SOLO cuando esa esté configurada: `obtenerPublicKeyId()` del batch
 * genera un keypair EFÍMERO (con su propio warning) si su env falta, y
 * disparar esa generación como efecto secundario de un chequeo de la llave
 * del sobre sería un acoplamiento que nadie pidió. Se mira la presencia de
 * `NOMICHECK_BATCH_SIGNING_KEY_PEM` en el entorno, no su valor.
 */
export function sobreConfigurado(): string | null {
  let kp: KeypairSobre;
  try {
    kp = obtenerKeypairSobre();
  } catch (e) {
    return e instanceof Error ? e.message : `${ENV_LLAVE_SOBRE} inválida`;
  }
  if (!process.env[ENV_LLAVE_BATCH]) return null;
  let idBatch: string;
  try {
    idBatch = obtenerPublicKeyIdDelBatch();
  } catch {
    // La llave del batch está rota — eso lo acusa el chequeo del batch, no
    // este. No bloquear el arranque del sobre por un problema ajeno.
    return null;
  }
  if (idBatch === kp.publicKeyId) {
    return (
      `${ENV_LLAVE_SOBRE} es la MISMA llave que ${ENV_LLAVE_BATCH} (publicKeyId ${kp.publicKeyId}). ` +
      "El sobre exige una llave Ed25519 propia y distinta (decisión de Yonatan, 2026-09-09): " +
      "comprometer una no debe comprometer la otra."
    );
  }
  return null;
}
