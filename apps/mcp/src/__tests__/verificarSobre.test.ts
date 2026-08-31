// Tests de `nomicheck_verificar_sobre` contra un sobre REAL.
//
// El fixture no es un sobre de utilería: es la salida firmada que producción
// sirvió el 2026-08-11 en `/retencion/ejemplo`, guardada junto a la llave que
// la firmó. Un fixture inventado probaría que el verificador se entiende a sí
// mismo; este prueba que entiende lo que el servidor FIRMA DE VERDAD — la
// canonicalización ya divergió una vez entre implementaciones por un decimal
// (`baseGravableUvt: 105.4`) y fue producción quien lo contó.
//
// Todo corre OFFLINE: cuando hay red simulada es porque el test la pide a
// propósito, y cuando no la hay, `fetch` revienta para probarlo.
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verificarSobre } from "../lib/sobreLocal.js";
import { firmar } from "../vendor/sobre.mjs";

const FIXTURES = new URL("./fixtures/", import.meta.url);
const leerFixture = (nombre: string) =>
  JSON.parse(readFileSync(new URL(nombre, FIXTURES), "utf8")) as Record<string, unknown>;

const SOBRE = leerFixture("sobre-retencion.json").sobre as Record<string, unknown>;
const PUBLICKEY = leerFixture("publickey.json").respuesta as Record<string, unknown>;
const PEM = PUBLICKEY.publicKeyPem as string;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Copia profunda: mutar el fixture compartido contaminaría al test siguiente. */
const clonar = (v: unknown) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;

describe("verificarSobre con llave pinneada", () => {
  it("el sobre real de producción es `verificable`, sin tocar la red", async () => {
    // Si algo intenta salir a la red acá, el test tiene que caerse: la
    // verificación local que "de paso" hace un fetch ya no es local.
    vi.stubGlobal("fetch", () => {
      throw new Error("la verificación con llave pinneada no debe tocar la red");
    });

    const r = await verificarSobre(clonar(SOBRE), PEM);
    expect(r.veredicto).toBe("verificable");
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.fuenteLlave).toContain("pinned");
  });

  it("alterar UNA cifra del resultado vuelve el sobre `invalido`", async () => {
    // El ataque que la firma existe para cazar: mismo documento, otro número.
    const alterado = clonar(SOBRE);
    const resultados = alterado.resultados as Record<string, unknown>[];
    resultados[0].retencionFuente = 999_999;

    const r = await verificarSobre(alterado, PEM);
    expect(r.veredicto).toBe("invalido");
    expect(r.checks.find((c) => c.id === "sobre.firma_verifica")?.ok).toBe(false);
  });

  it("quitar `reglasHash` NO da `firmado_sin_procedencia`: rompe la firma, da `invalido`", async () => {
    // La firma cubre todos los campos menos `signature`, así que amputar la
    // procedencia de un sobre YA firmado no lo degrada — lo invalida. La
    // distinción importa: `firmado_sin_procedencia` es para quien firmó POCO,
    // no para quien recortó un sobre ajeno.
    const amputado = clonar(SOBRE);
    delete amputado.reglasHash;

    const r = await verificarSobre(amputado, PEM);
    expect(r.veredicto).toBe("invalido");
  });

  it("una firma válida sin procedencia queda en `firmado_sin_procedencia`, no en `verificable`", async () => {
    // El caso que hace útil al tercer veredicto: alguien firma bien un
    // documento que no declara contra qué catálogo se comprueba. Es una
    // opinión firmada — tratarla como verificable anularía la diferencia
    // entre "dice quién" y "dice contra qué".
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const pemPrivado = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pemPublico = publicKey.export({ type: "spki", format: "pem" }).toString();
    const opinion = firmar({ salida: { total: 42 } }, pemPrivado) as Record<string, unknown>;

    const r = await verificarSobre(opinion, pemPublico);
    expect(r.veredicto).toBe("firmado_sin_procedencia");
    expect(r.explicacion).toContain("signed opinion");
    // Los checks críticos pasaron todos; lo que falta es no-crítico.
    expect(r.checks.filter((c) => c.critico).every((c) => c.ok)).toBe(true);
  });

  it("verificar con la llave EQUIVOCADA es `invalido`, aunque la firma sea de verdad", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const otraLlave = publicKey.export({ type: "spki", format: "pem" }).toString();

    const r = await verificarSobre(clonar(SOBRE), otraLlave);
    expect(r.veredicto).toBe("invalido");
  });
});

describe("verificarSobre sin llave: la baja de /publickey y lo dice", () => {
  it("baja la llave del servidor y verifica, declarando la fuente débil", async () => {
    vi.stubEnv("NOMICHECK_BASE_URL", "https://nomicheck.test");
    const pedidas: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      pedidas.push(String(url));
      return new Response(JSON.stringify(PUBLICKEY), { status: 200 });
    });

    const r = await verificarSobre(clonar(SOBRE));
    expect(pedidas).toEqual(["https://nomicheck.test/api/batch/publickey"]);
    expect(r.veredicto).toBe("verificable");
    // La honestidad epistémica es parte del contrato: llave del mismo origen
    // que el sobre = consistencia, no identidad. El caller tiene que verlo.
    expect(r.fuenteLlave).toContain("consistency, not identity");
  });

  it("si /publickey no trae la llave, revienta con la URL en la mano en vez de verificar contra nada", async () => {
    vi.stubEnv("NOMICHECK_BASE_URL", "https://nomicheck.test");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ algo: "ed25519" }), { status: 200 }));

    await expect(verificarSobre(clonar(SOBRE))).rejects.toThrow("publicKeyPem");
  });
});
