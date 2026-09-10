// Suite de la llave del sobre de /verificar/durable — DX402 punto 2.
//
// Mismo motivo que `batchSignatureService.test.ts` para el patrón de carga:
// el keypair es un singleton de módulo que lee `process.env` al primer uso, y
// acá además importa `batchSignatureService.js` (para el chequeo "misma
// llave que el batch"), que TIENE SU PROPIO singleton — así que cada test
// que dependa de cualquiera de los dos carga el grafo FRESCO con
// `vi.resetModules()` + import dinámico, o el primer test fijaría la llave
// (de cualquiera de los dos módulos) para todos los demás.
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { idDeLlave, verificar } from "../../lib/sobre.js";

type Servicio = typeof import("../sobreSignatureService.js");

const ENV_SOBRE = "NOMICHECK_SOBRE_SIGNING_KEY_PEM";
const ENV_BATCH = "NOMICHECK_BATCH_SIGNING_KEY_PEM";
const envSobreOriginal = process.env[ENV_SOBRE];
const envBatchOriginal = process.env[ENV_BATCH];

function pemEd25519(): { privado: string; publico: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privado: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publico: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

/**
 * Módulo fresco con las DOS envs controladas. `undefined` en cualquiera de
 * las dos significa variable AUSENTE, no vacía.
 */
async function cargarServicio(pemSobre?: string, pemBatch?: string): Promise<Servicio> {
  vi.resetModules();
  if (pemSobre === undefined) delete process.env[ENV_SOBRE];
  else process.env[ENV_SOBRE] = pemSobre;
  if (pemBatch === undefined) delete process.env[ENV_BATCH];
  else process.env[ENV_BATCH] = pemBatch;
  return import("../sobreSignatureService.js");
}

afterEach(() => {
  if (envSobreOriginal === undefined) delete process.env[ENV_SOBRE];
  else process.env[ENV_SOBRE] = envSobreOriginal;
  if (envBatchOriginal === undefined) delete process.env[ENV_BATCH];
  else process.env[ENV_BATCH] = envBatchOriginal;
  vi.restoreAllMocks();
});

describe("sin NOMICHECK_SOBRE_SIGNING_KEY_PEM", () => {
  it("firmarSobre lanza CON NOMBRE de la variable — nunca cae a una llave efímera", async () => {
    const svc = await cargarServicio(undefined);
    // A diferencia de batchSignatureService: no hay salida efímera. Cobrar sin
    // poder producir el sobre es peor que no arrancar.
    expect(() => svc.firmarSobre({ version: "1" })).toThrow(ENV_SOBRE);
    expect(() => svc.obtenerSobrePublicKeyPem()).toThrow(ENV_SOBRE);
    expect(() => svc.obtenerSobrePublicKeyId()).toThrow(ENV_SOBRE);
  });

  it("sobreConfigurado() NO lanza: devuelve el motivo como string", async () => {
    const svc = await cargarServicio(undefined);
    const problema = svc.sobreConfigurado();
    expect(problema).not.toBeNull();
    expect(problema).toContain(ENV_SOBRE);
  });
});

describe("NOMICHECK_SOBRE_SIGNING_KEY_PEM rota", () => {
  it("un PEM corrupto falla CON NOMBRE de la variable, nunca de largo", async () => {
    const svc = await cargarServicio("-----BEGIN PRIVATE KEY-----\nbasura==\n-----END PRIVATE KEY-----\n");
    expect(() => svc.obtenerSobrePublicKeyId()).toThrow(new RegExp(ENV_SOBRE));
    expect(svc.sobreConfigurado()).toContain(ENV_SOBRE);
  });

  it("una llave que NO es Ed25519 se rechaza con nombre, no firma basura", async () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = rsa.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const svc = await cargarServicio(pem);
    expect(() => svc.obtenerSobrePublicKeyId()).toThrow(/Ed25519/);
    expect(() => svc.obtenerSobrePublicKeyId()).toThrow(new RegExp(ENV_SOBRE));
    expect(svc.sobreConfigurado()).toMatch(/Ed25519/);
  });
});

describe("NOMICHECK_SOBRE_SIGNING_KEY_PEM válida", () => {
  it("firma, y lo firmado verifica con la pública publicada", async () => {
    const { privado } = pemEd25519();
    const svc = await cargarServicio(privado);
    const firmado = svc.firmarSobre({ version: "1", resultados: [{ externalId: "A", valor: 1 }] });
    expect(firmado.signature.algo).toBe("ed25519");
    expect(firmado.signature.publicKeyId).toBe(svc.obtenerSobrePublicKeyId());
    expect(verificar(firmado, svc.obtenerSobrePublicKeyPem())).toBe(true);
  });

  it("el publicKeyId es recomputable con idDeLlave sobre el PEM publicado", async () => {
    const { privado } = pemEd25519();
    const svc = await cargarServicio(privado);
    expect(svc.obtenerSobrePublicKeyId()).toBe(idDeLlave(svc.obtenerSobrePublicKeyPem()));
  });

  it("es singleton: dos llamadas devuelven el mismo publicKeyId sin releer la env", async () => {
    const { privado } = pemEd25519();
    const svc = await cargarServicio(privado);
    const a = svc.obtenerSobrePublicKeyId();
    const b = svc.obtenerSobrePublicKeyId();
    expect(a).toBe(b);
  });

  it("sin NOMICHECK_BATCH_SIGNING_KEY_PEM configurada, sobreConfigurado() da null (nada que comparar)", async () => {
    const { privado } = pemEd25519();
    const svc = await cargarServicio(privado, undefined);
    expect(svc.sobreConfigurado()).toBeNull();
  });

  it("distinta de la llave del batch: sobreConfigurado() da null", async () => {
    const { privado: sobrePriv } = pemEd25519();
    const { privado: batchPriv } = pemEd25519();
    const svc = await cargarServicio(sobrePriv, batchPriv);
    expect(svc.sobreConfigurado()).toBeNull();
  });

  it("la MISMA llave que el batch: sobreConfigurado() lo rechaza con el publicKeyId compartido", async () => {
    const { privado } = pemEd25519();
    // Deliberadamente la MISMA llave en las dos variables — el error que
    // debe cazarse antes de que este código llegue a producción.
    const svc = await cargarServicio(privado, privado);
    const problema = svc.sobreConfigurado();
    expect(problema).not.toBeNull();
    expect(problema).toContain(svc.obtenerSobrePublicKeyId());
    expect(problema).toMatch(/misma llave/i);
  });
});
