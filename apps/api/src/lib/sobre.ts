// Puerto a TypeScript de la implementación de referencia en JavaScript del
// formato "el sobre" — un JSON que se puede verificar contra un tercero SIN
// confiar en quien lo emitió y SIN conexión a su servidor.
//
// Origen: `~/Developer/sobre/sobre.mjs` (repo `sobre`, commit `ca011e2`,
// licencia CC0 1.0 — copiar sin atribución es intencional, ver
// `sobreVectores/ORIGEN.md`). Puerto literal: misma spec (`SPEC.md` §3-§5),
// mismos vectores (`sobreVectores/`, vendorizados tal cual), mismo algoritmo.
// Lo único que cambia es el lenguaje — cero dependencias acá tampoco, solo
// `node:crypto`.
//
// POR QUÉ VENDORIZAR EN VEZ DE IMPORTAR: `sobre.mjs` no se publica en npm
// (spec §8: "se puede type-checkear con tsc --checkJs --noEmit sobre.mjs" sin
// instalar nada) — la única vía es copiar el archivo, igual que hace
// `testigo` con `vendor/sobre/sobre.rb`.
//
// LAS DOS TRAMPAS DE JAVASCRIPT QUE ESTE ARCHIVO EXISTE PARA NO PISAR
// (spec §7, "el vector que sí prueba lo difícil"):
//
//   1. Las claves tipo entero ("0", "1") se reordenan solas al frente de un
//      objeto. Por eso se SERIALIZA A MANO acá abajo, nunca reconstruyendo
//      un objeto JS y dejando que `JSON.stringify` decida el orden.
//   2. `.sort()` desnudo ordena por unidades UTF-16, y la spec exige bytes
//      UTF-8. Divergen a partir de U+10000 (planos suplementarios). Por eso
//      hay un comparador propio (`compararUtf8`).
//
// DELTA DELIBERADO CONTRA `sobre.mjs`: acá `firmar` RECHAZA (throw) un
// documento con una clave `signature` anidada fuera de la raíz, o con algún
// `null` en cualquier profundidad — `sobre.mjs` los tolera y los deja
// caer silenciosamente durante la canonicalización. La razón es que ESTA
// ruta cobra antes de servir: un `null` de negocio real (`valorCalculado:
// null`, `delta: null` en `ResultadoVerificacion` — ausencia de base legal,
// no cero) que desaparece sin aviso durante la firma es una pérdida de dato
// silenciosa, y una `signature` anidada que `serializarOrdenado` SÍ sirve
// pero `bytesCanonicos` SÍ descarta (a cualquier profundidad, no solo la
// raíz) es contenido servido que la firma no cubre — exactamente lo que
// `testigo` rechaza como residuo sin firmar
// (`sobre_inside.rb:165-166`, ver informe `testigo` §(4)). El llamador limpia
// antes con `sinNulos` (exportada acá): así lo servido y lo firmado son
// siempre el mismo documento, nunca uno con menos campos que el otro.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

const enc = new TextEncoder();

// ── §3 Forma canónica ──────────────────────────────────────────────────────

/** Compara dos claves por sus bytes UTF-8, no por unidades UTF-16 (§3.1). */
function compararUtf8(a: string, b: string): number {
  const A = enc.encode(a);
  const B = enc.encode(b);
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    if (A[i] !== B[i]) return A[i]! - B[i]!;
  }
  return A.length - B.length;
}

/**
 * Un documento que no se puede canonicalizar de forma interoperable, o que no
 * se puede firmar de forma segura (signature anidada, null de negocio sin
 * limpiar). Mismo criterio que la referencia: se lanza al firmar.
 */
export class ErrorDeCanonicalizacion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeCanonicalizacion";
  }
}

// Techo de los enteros: 2^53 - 1. Arriba de eso JavaScript ya no puede leer el
// número sin redondearlo —`JSON.parse("9007199254740993")` devuelve ...992—
// así que la firma dejaría de coincidir con la de Ruby SIN QUE NADA AVISE.
const ENTERO_MAXIMO = Number.MAX_SAFE_INTEGER;

// Los decimales SÍ se admiten (spec §3.2: la primera versión de esta regla
// los rechazaba a todos y rompió producción el mismo día — un `baseGravableUvt:
// 105.4` real pasó a `INVALIDO`). Queda rechazada una sola banda,
// `0 < |x| < 1e-6`: ahí JS pasa a notación exponencial (`1e-7`) y Ruby sigue
// imprimiendo plano (`0.0000001`).
const DECIMAL_MINIMO = 1e-6;

function numeroSeguro(n: number): number {
  if (!Number.isFinite(n)) {
    throw new ErrorDeCanonicalizacion(`${n} no es representable en JSON.`);
  }
  if (!Number.isInteger(n) && Math.abs(n) < DECIMAL_MINIMO) {
    throw new ErrorDeCanonicalizacion(
      `decimal demasiado chico para canonicalizar de forma interoperable (${n}). ` +
        "Abajo de 1e-6 JavaScript cambia a notación exponencial y Ruby no. " +
        "Codificalo como string o en una unidad mayor."
    );
  }
  if (Math.abs(n) > ENTERO_MAXIMO) {
    throw new ErrorDeCanonicalizacion(
      `entero fuera del rango seguro (|n| > 2^53-1): ${n}. JavaScript no puede ` +
        "leerlo sin redondear, así que la firma no sería interoperable."
    );
  }
  return n;
}

/**
 * `true` si cada high surrogate (`\uD800`-`\uDBFF`) del string está seguido
 * de un low surrogate (`\uDC00`-`\uDFFF`) — y viceversa. Equivalente a
 * `String.prototype.isWellFormed()` (ES2024/Node 20.10+), escrito a mano
 * porque el `lib` de TypeScript de este repo es ES2022 y ese método no
 * tiene tipos ahí — el runtime (Node 22, ver `engines`) sí lo soporta, pero
 * tocar el `lib` compartido de `tsconfig.base.json` para un solo archivo es
 * más superficie que un scan de 32 bits.
 */
function esUtf16BienFormado(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const siguiente = s.charCodeAt(i + 1);
      if (Number.isNaN(siguiente) || siguiente < 0xdc00 || siguiente > 0xdfff) return false;
      i++; // el low surrogate que acaba de validarse no se revisa dos veces
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false; // low surrogate sin un high surrogate que lo preceda
    }
  }
  return true;
}

/**
 * Rechaza un string con un surrogate UTF-16 suelto (un high surrogate sin
 * su par, o viceversa). JavaScript los representa sin quejarse —son
 * válidos como UNIDADES UTF-16— pero no son texto Unicode bien formado, y
 * la spec exige "UTF-8 sin escapar" (§3): un surrogate suelto no tiene
 * codificación UTF-8, así que `JSON.stringify` termina emitiendo el escape
 * `\udXXX` crudo en el texto. Ruby (`json/common.rb`, el parser de la
 * implementación de referencia) rechaza eso con `JSON::ParserError:
 * incomplete surrogate pair` — mientras que la propia referencia JS
 * (`sobre.mjs`) lo deja pasar y firma igual, la asimetría exacta que el
 * sobre existe para no tener (repro cruzada: reparación DX402 punto 2,
 * hallazgo del refutador `identidad`). Cubre tanto VALORES como CLAVES: un
 * surrogate suelto en una clave rompe el mismo parseo del otro lado.
 */
function stringBienFormada(s: string): string {
  if (!esUtf16BienFormado(s)) {
    throw new ErrorDeCanonicalizacion(
      `hay un surrogate UTF-16 suelto en ${JSON.stringify(s)}. Ruby no puede parsear un ` +
        "\\udXXX sin su par (JSON::ParserError: incomplete surrogate pair), así que la firma " +
        "no sería interoperable. Saneá o quitá el carácter antes de firmar."
    );
  }
  return s;
}

/**
 * El serializador único: sortea claves por bytes UTF-8, escribe a mano (nunca
 * `JSON.stringify` de un objeto reconstruido — la trampa #1 de arriba), y
 * conserva el orden de los arrays (es información, spec regla 4).
 *
 * `descartarSignature` es la ÚNICA diferencia entre `bytesCanonicos` (lo que
 * se firma) y `serializarOrdenado` (lo que se sirve): compartir el resto del
 * algoritmo en un solo lugar es lo que impide que las dos formas de
 * serializar diverjan sin que nadie lo note — la spec lo nombra en su propio
 * §8 sobre `probe.rb`: "dos copias de la regla que decide qué bytes se firman
 * es la clase de deriva que nadie nota hasta que un comprador audita".
 */
function serializar(v: unknown, descartarSignature: boolean): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return JSON.stringify(numeroSeguro(v));
  if (typeof v === "string") return JSON.stringify(stringBienFormada(v));
  if (Array.isArray(v)) return "[" + v.map((x) => serializar(x, descartarSignature)).join(",") + "]";
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const claves = Object.keys(obj)
      .filter(
        (k) => (!descartarSignature || k !== "signature") && obj[k] !== null && obj[k] !== undefined
      )
      .sort(compararUtf8);
    return (
      "{" +
      claves
        .map((k) => JSON.stringify(stringBienFormada(k)) + ":" + serializar(obj[k], descartarSignature))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(v);
}

/** Los bytes canónicos del §3: sin `signature` (a cualquier profundidad), sin nulos, claves ordenadas. */
export function bytesCanonicos(v: unknown): string {
  return serializar(v, true);
}

/**
 * Igual que `bytesCanonicos`, pero SIN descartar `signature`: son los bytes
 * que se SIRVEN — el documento canónico con la firma en su lugar (ordenada
 * entre las demás claves, no apéndice). Sigue descartando `null`/`undefined`,
 * porque esa regla es la misma para firmar y para servir (§3.2 y el
 * comentario largo de arriba sobre `sinNulos`).
 */
export function serializarOrdenado(v: unknown): string {
  return serializar(v, false);
}

// ── §4 Llave y firma ───────────────────────────────────────────────────────

/** §4: base64 en líneas de 64, sin espacios sueltos. El id sale de ESTE texto. */
function normalizarPem(pem: string): string {
  const cuerpo = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const lineas = cuerpo.match(/.{1,64}/g) ?? [];
  return "-----BEGIN PUBLIC KEY-----\n" + lineas.join("\n") + "\n-----END PUBLIC KEY-----\n";
}

export function idDeLlave(pem: string): string {
  return createHash("sha256").update(normalizarPem(pem), "utf8").digest("hex").slice(0, 32);
}

export interface FirmaSobre {
  algo: "ed25519";
  valor: string;
  publicKeyId: string;
}

export type DocFirmado<T extends Record<string, unknown> = Record<string, unknown>> = T & {
  signature: FirmaSobre;
};

/** `true` si la clave `"signature"` aparece en CUALQUIER nivel del árbol. */
function contieneClaveSignature(v: unknown): boolean {
  if (v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return v.some(contieneClaveSignature);
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (k === "signature") return true;
    if (contieneClaveSignature(val)) return true;
  }
  return false;
}

/** `true` si hay un `null` en CUALQUIER nivel del árbol (objeto o array). */
function contieneNulo(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v !== "object") return false;
  if (Array.isArray(v)) return v.some(contieneNulo);
  return Object.values(v as Record<string, unknown>).some(contieneNulo);
}

/**
 * Quita recursivamente las claves cuyo valor sea `null`/`undefined` de
 * OBJETOS (nunca borra elementos de un array: reordenar o achicar un array
 * cambia su significado, y la spec dice que el orden de un array "es
 * información" — regla 4). Es el paso que un llamador corre ANTES de
 * `firmar`, para que un `null` de negocio legítimo (`valorCalculado: null`
 * cuando no hay base legal para calcular la línea) se vuelva la MISMA cosa
 * que un campo ausente — que es exactamente lo que la canonicalización ya
 * hace (spec §3.1: "un campo ausente y un campo en null deben producir los
 * mismos bytes") — en vez de sobrevivir en el objeto y disparar el rechazo de
 * `firmar`.
 */
export function sinNulos<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => sinNulos(x)) as unknown as T;
  const limpio: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val === null || val === undefined) continue;
    limpio[k] = sinNulos(val);
  }
  return limpio as T;
}

/**
 * Firma un documento. El `publicKeyId` se DERIVA de la llave privada en vez
 * de aceptarse como parámetro: así el emisor no puede declarar un id que no
 * corresponde a la llave con la que firmó (el ataque que la comprobación de
 * procedencia caza del otro lado, §4). Sin `cubreCampos`/`canonical` en la
 * firma de salida a propósito — `testigo` los tolera si faltan
 * (`vendor/sobre/sobre.rb`, informe `testigo` §(4): "∉{nil,...}") pero no
 * aportan nada que `algo`+`valor`+`publicKeyId` no digan ya: menos
 * superficie.
 *
 * RECHAZA (throw `ErrorDeCanonicalizacion`) si, fuera de la raíz, el
 * documento trae una clave `signature` anidada o cualquier valor `null` — ver
 * el comentario grande al inicio del archivo para el por qué exacto. El
 * llamador limpia antes con `sinNulos`.
 */
export function firmar<T extends Record<string, unknown>>(
  doc: T,
  privadaPem: string
): Omit<T, "signature"> & { signature: FirmaSobre } {
  const { signature: _firmaVieja, ...resto } = doc as Record<string, unknown>;
  if (contieneClaveSignature(resto)) {
    throw new ErrorDeCanonicalizacion(
      'el documento trae una clave "signature" anidada fuera de la raíz. ' +
        "bytesCanonicos la descarta a cualquier profundidad pero serializarOrdenado " +
        "no — lo firmado y lo servido divergirían, y testigo lo rechaza como residuo " +
        "sin firmar (sobre_inside.rb:165). Renombrá el campo antes de firmar."
    );
  }
  if (contieneNulo(resto)) {
    throw new ErrorDeCanonicalizacion(
      "el documento trae un valor null. La canonicalización los descarta (SPEC.md §3.2) " +
        "y testigo rechaza cualquier null en el sobre como contenido sin firmar " +
        "(sobre_inside.rb:166). Limpiá con sinNulos(doc) antes de firmar — un campo " +
        "ausente y uno en null producen los mismos bytes a propósito (SPEC.md §3.1)."
    );
  }
  const sk = createPrivateKey(privadaPem);
  const pub = createPublicKey(sk).export({ type: "spki", format: "pem" }).toString();
  const bytes = bytesCanonicos(doc);
  const signature: FirmaSobre = {
    algo: "ed25519",
    // Ed25519 puro (RFC 8032): sin pre-hash, `sign(null, ...)` firma los
    // bytes canónicos tal cual — determinístico, así que la misma
    // (doc, llave) siempre produce la misma firma.
    valor: sign(null, Buffer.from(bytes, "utf8"), sk).toString("base64"),
    publicKeyId: idDeLlave(pub),
  };
  return { ...resto, signature } as Omit<T, "signature"> & { signature: FirmaSobre };
}

/**
 * `true` si `doc.signature.valor` verifica Ed25519 contra `publicaPem` sobre
 * los bytes canónicos de `doc` (que ya excluyen `signature`, a cualquier
 * profundidad). Degrada a `false` ante cualquier forma rota — base64
 * inválido, firma vacía, llave que no parsea — nunca lanza: es la superficie
 * que recibe el input de un tercero.
 */
export function verificar(doc: Record<string, unknown>, publicaPem: string): boolean {
  const firma = doc.signature as { valor?: unknown } | undefined;
  const valor = firma?.valor;
  if (typeof valor !== "string" || valor.length === 0) return false;
  try {
    return verify(
      null,
      Buffer.from(bytesCanonicos(doc), "utf8"),
      createPublicKey(publicaPem),
      Buffer.from(valor, "base64")
    );
  } catch {
    return false;
  }
}
