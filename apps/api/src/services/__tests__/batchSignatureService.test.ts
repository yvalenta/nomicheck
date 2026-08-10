// Suite DIRECTA de la firma Ed25519 del output (RUMBO §M). Seis suites ya la
// ejercitan INDIRECTAMENTE (batchPublico, comprobante, parametrosSnapshot,
// batchPagoOnchain, batchRetencion, batchVerificacion, batchLiquidacionFinal):
// cubren el camino feliz — firmar un output real, verificarlo con la llave
// propia y con el PEM público, y que adulterar un campo del output invalide.
// Acá van los bordes que esas suites NO tocan:
//
//   - La canonicalización a fondo: null vs ausente, unicode, arrays, y que
//     `signature` nunca se cubra a sí misma (a NINGUNA profundidad — fijado).
//   - El ciclo de vida del keypair: efímero con warning cuando falta la env,
//     estable entre procesos cuando la env está, y fallo CON NOMBRE cuando la
//     env está rota o trae una llave que no es Ed25519 — la ley del repo es
//     que una guarda que no encuentra el dato y sigue de largo es peor que
//     ninguna.
//   - Vectores de manipulación sobre la FIRMA misma (byte alterado, otra
//     llave, firma de otro payload), no solo sobre el payload.
//
// El keypair es un singleton de módulo y lee process.env al primer uso, así
// que cada test que dependa del keypair carga el módulo FRESCO con
// vi.resetModules() + import dinámico — sin eso, el primer test fijaría la
// llave para todos los demás.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync } from "node:crypto";
import type { LineaDeRegistro } from "../../lib/registro.js";

type Servicio = typeof import("../batchSignatureService.js");

// El aviso de llave efímera dejó de salir por `console.warn` y ahora va por
// `registro` (con el sha, greppable). Se captura desde el MISMO grafo que carga
// el servicio: `cargarServicio` hace `vi.resetModules()`, así que un `registro`
// importado antes sería otra instancia y no vería el aviso.
let lineasCapturadas: LineaDeRegistro[] = [];

const ENV_LLAVE = "NOMICHECK_BATCH_SIGNING_KEY_PEM";
const envOriginal = process.env[ENV_LLAVE];

function pemEd25519(): { privado: string; publico: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privado: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publico: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

/** Módulo fresco (singleton virgen) con la env controlada. `pem: undefined`
 * significa variable AUSENTE, no vacía — la distinción importa: el servicio
 * decide con `if (!pem)`. */
async function cargarServicio(pem?: string): Promise<Servicio> {
  vi.resetModules();
  if (pem === undefined) delete process.env[ENV_LLAVE];
  else process.env[ENV_LLAVE] = pem;
  const svc = await import("../batchSignatureService.js");
  // Mismo grafo, después del reset: captura las líneas y de paso silencia el
  // sink de consola en todas las pruebas de este archivo.
  const { usarEmisor } = await import("../../lib/registro.js");
  lineasCapturadas = [];
  usarEmisor((l) => lineasCapturadas.push(l));
  return svc;
}

afterEach(() => {
  if (envOriginal === undefined) delete process.env[ENV_LLAVE];
  else process.env[ENV_LLAVE] = envOriginal;
  vi.restoreAllMocks();
});

describe("canonicalJson", () => {
  it("ordena claves a toda profundidad y no depende del orden de entrada", async () => {
    const { canonicalJson } = await cargarServicio();
    // El orden lo fija la canonicalización, no quien armó el objeto — es lo
    // que permite al buyer recomputar el mismo byte string.
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 4, y: 5 }] } })).toBe(
      '{"a":{"c":[3,{"y":5,"z":4}],"d":2},"b":1}'
    );
  });

  it("con claves unicode y mayúsculas el orden de entrada tampoco importa", async () => {
    const { canonicalJson } = await cargarServicio();
    // No se fija CUÁL orden produce localeCompare con ñ/é/mayúsculas (depende
    // del ICU del runtime — ver hallazgo en el reporte); se fija lo esencial:
    // dos escrituras del mismo objeto canonicalizan idéntico.
    const a = canonicalJson({ z: 1, "ñandú": 2, B: 3, "año": 4 });
    const b = canonicalJson({ "año": 4, B: 3, "ñandú": 2, z: 1 });
    expect(a).toBe(b);
    // Los VALORES unicode viajan intactos, sin escapes: el hash/firma cubre
    // los bytes UTF-8 reales.
    expect(canonicalJson({ nombre: "Ñoño Pérez ✓" })).toBe('{"nombre":"Ñoño Pérez ✓"}');
  });

  it("null se firma, undefined se filtra: no son el mismo payload", async () => {
    const { canonicalJson } = await cargarServicio();
    // `vigenteHasta: null` (regla abierta) es información; que desapareciera
    // del canónico permitiría confundirla con una regla sin el campo.
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
    // undefined en cambio NO es serializable a JSON: se filtra, y por eso
    // {a: undefined} y {} son el MISMO payload firmado — fijado.
    expect(canonicalJson({ a: undefined, b: 1 })).toBe(canonicalJson({ b: 1 }));
    // En arrays JSON.stringify convierte undefined a null (posición no se
    // puede filtrar sin corromper índices) — fijado también.
    expect(canonicalJson([undefined, 1])).toBe("[null,1]");
  });

  it("los arrays conservan su orden: reordenar recibos SÍ cambia el canónico", async () => {
    const { canonicalJson } = await cargarServicio();
    // Solo las CLAVES se ordenan. El orden de un array es contenido (el
    // recibo 0 es de alguien) y debe estar cubierto por la firma.
    expect(canonicalJson({ recibos: [1, 2] })).not.toBe(canonicalJson({ recibos: [2, 1] }));
  });

  it("la firma nunca se cubre a sí misma — y el strip aplica a TODA profundidad", async () => {
    const { canonicalJson } = await cargarServicio();
    // Raíz: es lo que permite adjuntar la firma al mismo objeto firmado sin
    // recursión (el flujo real de todos los outputs).
    expect(canonicalJson({ a: 1, signature: { valor: "x" } })).toBe(canonicalJson({ a: 1 }));
    // Anidado: el filtro actual excluye la clave "signature" en CUALQUIER
    // nivel, no solo la raíz. Se fija el comportamiento vigente; implica que
    // un campo de negocio llamado "signature" dentro de un sub-objeto NO
    // queda cubierto por la firma (hallazgo reportado — cambiarlo rompería
    // toda firma histórica, así que la prueba lo documenta en vez de exigir
    // lo contrario).
    expect(canonicalJson({ a: { signature: "adulterable", b: 1 } })).toBe(canonicalJson({ a: { b: 1 } }));
  });
});

describe("keypair efímero (sin NOMICHECK_BATCH_SIGNING_KEY_PEM)", () => {
  it("AVISA por el registro con el publicKeyId, y la firma verifica consigo misma", async () => {
    const svc = await cargarServicio(undefined);
    const kp = svc.obtenerKeypair();
    expect(kp.esEfimero).toBe(true);
    // El aviso es el contrato de dev: sin él, PROD podría correr meses con una
    // llave que muere en cada deploy sin que nadie lo note.
    const avisos = lineasCapturadas.filter((l) => l.origen === "batchSignature");
    expect(avisos).toHaveLength(1);
    expect(avisos[0].nivel).toBe("warn");
    expect(avisos[0].mensaje).toContain("efímero");
    // El publicKeyId efímero viaja como campo, no en el mensaje: así se puede
    // correlacionar sin parsear texto.
    expect(avisos[0].publicKeyIdEfimero).toBe(kp.publicKeyId);
    // Aun efímera, la firma es una firma de verdad: cierra el ciclo completo.
    const payload = { neto: 1_234_567, empleado: "EMP-1" };
    const firma = svc.firmarPayload(payload);
    expect(firma.algo).toBe("ed25519");
    expect(svc.verificarFirma(payload, firma)).toBe(true);
    expect(svc.verificarFirma(payload, firma, svc.obtenerPublicKeyPem())).toBe(true);
  });

  it("es singleton: una sola generación y un solo aviso por proceso", async () => {
    const svc = await cargarServicio(undefined);
    const a = svc.obtenerKeypair();
    const b = svc.obtenerKeypair();
    svc.firmarPayload({ x: 1 });
    // Si cada llamada regenerara el par, una firma emitida hace un segundo ya
    // no verificaría con obtenerPublicKeyPem() — el singleton es el invariante.
    expect(a).toBe(b);
    expect(lineasCapturadas.filter((l) => l.origen === "batchSignature")).toHaveLength(1);
  });
});

describe("keypair desde la env", () => {
  it("con un PEM Ed25519 válido no avisa, no es efímero, y el publicKeyId es recomputable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { privado } = pemEd25519();
    const svc = await cargarServicio(privado);
    const kp = svc.obtenerKeypair();
    expect(kp.esEfimero).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    // El id publicado es sha256(PEM público)[0:32] — un buyer con el PEM
    // puede recomputarlo para saber contra qué llave está verificando.
    expect(kp.publicKeyId).toBe(createHash("sha256").update(kp.publicKeyPem).digest("hex").slice(0, 32));
  });

  it("la llave congelada da verificabilidad histórica: otro proceso verifica lo firmado por este", async () => {
    const { privado } = pemEd25519();
    const proceso1 = await cargarServicio(privado);
    const payload = { periodo: "2026-07", neto: 2_000_000 };
    const firma = proceso1.firmarPayload(payload);
    // Simula el deploy de mañana: módulo fresco, misma env. El output
    // pinneado ayer en IPFS tiene que seguir verificando — es el motivo por
    // el que PROD congela la llave.
    const proceso2 = await cargarServicio(privado);
    expect(proceso2.verificarFirma(payload, firma)).toBe(true);
    expect(proceso2.obtenerPublicKeyId()).toBe(firma.publicKeyId);
  });

  it("un PEM corrupto falla CON NOMBRE de la variable, nunca de largo", async () => {
    const svc = await cargarServicio("-----BEGIN PRIVATE KEY-----\nbasura==\n-----END PRIVATE KEY-----\n");
    // El error de OpenSSL crudo ("DECODER routines::unsupported") no dice qué
    // configurar; la guarda tiene que señalar la variable. Y jamás caer en
    // silencio al keypair efímero: eso firmaría PROD con una llave de sesión.
    expect(() => svc.obtenerKeypair()).toThrow(/NOMICHECK_BATCH_SIGNING_KEY_PEM/);
    expect(() => svc.firmarPayload({ x: 1 })).toThrow(/PEM/);
  });

  it("una llave que NO es Ed25519 se rechaza al arranque, no firma basura", async () => {
    // sign(null, …) con RSA/EC NO lanza: firmaría con ese algoritmo mientras
    // el output declara algo:"ed25519", y el servidor hasta se autoverifica —
    // solo el buyer offline descubriría que nada verifica. Verificado
    // empíricamente contra node:crypto antes de escribir la guarda.
    for (const generar of [
      () => generateKeyPairSync("rsa", { modulusLength: 2048 }),
      () => generateKeyPairSync("ec", { namedCurve: "P-256" }),
    ]) {
      const pem = generar().privateKey.export({ format: "pem", type: "pkcs8" }).toString();
      const svc = await cargarServicio(pem);
      expect(() => svc.obtenerKeypair()).toThrow(/Ed25519/);
      expect(() => svc.obtenerKeypair()).toThrow(/NOMICHECK_BATCH_SIGNING_KEY_PEM/);
    }
  });
});

describe("vectores de manipulación", () => {
  // Payload con forma de output real: montos, anidamiento y array.
  const payloadBase = () => ({
    version: "1",
    empresa: { nombre: "Acme", nit: "900123456-7" },
    recibos: [{ externalId: "EMP-1", neto: 2_407_119, lineas: [{ concepto: "salario", valor: 2_500_000 }] }],
    reglasHash: "abc123",
  });

  it("alterar 1 peso en un monto anidado invalida la firma", async () => {
    const svc = await cargarServicio(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const payload = payloadBase();
    const firma = svc.firmarPayload(payload);
    const adulterado = payloadBase();
    adulterado.recibos[0]!.neto += 1;
    // El ataque económico mínimo: un peso. Si esto pasara, todos pasan.
    expect(svc.verificarFirma(adulterado, firma)).toBe(false);
  });

  it("quitar un campo o agregar uno invalida; reordenar claves NO (equivalente canónico)", async () => {
    const svc = await cargarServicio(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const payload = payloadBase();
    const firma = svc.firmarPayload(payload);

    const sinCampo: Record<string, unknown> = payloadBase();
    delete sinCampo.reglasHash;
    expect(svc.verificarFirma(sinCampo, firma)).toBe(false);

    expect(svc.verificarFirma({ ...payloadBase(), extra: true }, firma)).toBe(false);

    // Reordenar claves y re-serializar es EXACTAMENTE lo que hace cualquier
    // JSON.parse/stringify intermedio (gateways, jq, pin a IPFS) — la
    // canonicalización existe para que eso no rompa la verificación.
    const reordenado = { reglasHash: "abc123", recibos: payloadBase().recibos, empresa: { nit: "900123456-7", nombre: "Acme" }, version: "1" };
    expect(svc.verificarFirma(reordenado, firma)).toBe(true);
  });

  it("verificar con OTRA llave pública falla", async () => {
    const svc = await cargarServicio(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const payload = payloadBase();
    const firma = svc.firmarPayload(payload);
    // Un atacante que publique SU PEM junto a un output re-firmado no debe
    // poder hacerse pasar por el servidor: la llave ajena no verifica.
    const { publico: llaveAjena } = pemEd25519();
    expect(svc.verificarFirma(payload, firma, llaveAjena)).toBe(false);
  });

  it("un solo byte alterado en la firma la invalida, sin lanzar", async () => {
    const svc = await cargarServicio(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const payload = payloadBase();
    const firma = svc.firmarPayload(payload);
    const bytes = Buffer.from(firma.valor, "base64");
    bytes[0] = bytes[0]! ^ 0x01; // voltea un bit del primer byte
    const rota = { ...firma, valor: bytes.toString("base64") };
    expect(svc.verificarFirma(payload, rota)).toBe(false);
  });

  it("basura no-base64 o firma vacía devuelven false, nunca excepción", async () => {
    const svc = await cargarServicio(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const payload = payloadBase();
    const firma = svc.firmarPayload(payload);
    // La verificación es la superficie expuesta al input del buyer: tiene que
    // degradar a false, no tumbar el proceso.
    expect(svc.verificarFirma(payload, { ...firma, valor: "!!!no-es-base64!!!" })).toBe(false);
    expect(svc.verificarFirma(payload, { ...firma, valor: "" })).toBe(false);
  });

  it("la firma válida de OTRO payload no transfiere", async () => {
    const svc = await cargarServicio(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const firmaDeOtro = svc.firmarPayload({ recibo: "de-otro", neto: 1 });
    // Replay de firma: tomar una firma legítima y pegarla a un payload
    // distinto. Es el vector barato — la firma cubre bytes, no prestigio.
    expect(svc.verificarFirma(payloadBase(), firmaDeOtro)).toBe(false);
  });
});
