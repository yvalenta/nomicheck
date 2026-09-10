// Suite del puerto a TypeScript de `sobre.mjs` (`~/Developer/sobre`, commit
// `ca011e2`, CC0). Contra los vectores vendorizados en `../sobreVectores/`
// (copia byte a byte, ver `ORIGEN.md` ahí) — la única forma de saber que un
// puerto nuevo habla el mismo bytes que la referencia es medirlo contra los
// mismos vectores, no releer el algoritmo y confiar.
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  bytesCanonicos,
  ErrorDeCanonicalizacion,
  firmar,
  idDeLlave,
  serializarOrdenado,
  sinNulos,
  verificar,
} from "../sobre.js";

const V = new URL("../sobreVectores/", import.meta.url);
const leer = (nombre: string) => readFileSync(new URL(nombre, V), "utf8");

describe("bytesCanonicos contra los vectores", () => {
  it("el vector ASCII: idéntico byte a byte a canonico.txt", () => {
    const sobre = JSON.parse(leer("sobre.json"));
    expect(bytesCanonicos(sobre)).toBe(leer("canonico.txt"));
  });

  it("el vector unicode — el que sí prueba lo difícil (§7): idéntico byte a byte", () => {
    // Trae la clave tipo entero "0" (trampa #1: V8 la reordena sola al
    // frente si uno reconstruye el objeto) y el par Ａ/🐦 (trampa #2:
    // .sort() por UTF-16 los ordena al revés que por bytes UTF-8).
    const sobre = JSON.parse(leer("sobre-unicode.json"));
    expect(bytesCanonicos(sobre)).toBe(leer("canonico-unicode.txt"));
  });

  it("claves tipo entero mantienen el orden de BYTES, no saltan al frente", () => {
    // "-nota" (0x2D) ordena antes que "0" (0x30) por bytes — pero si el
    // código reconstruyera un objeto JS y dejara que JSON.stringify decida,
    // "0" saltaría al frente porque V8 reordena las claves tipo entero solo.
    expect(bytesCanonicos({ "-nota": "x", "0": "y", version: "1" })).toBe(
      '{"-nota":"x","0":"y","version":"1"}'
    );
  });

  it("RECHAZA un surrogate UTF-16 suelto en un VALOR — Ruby no puede parsearlo", () => {
    // Repro cruzada (reparación DX402 punto 2, hallazgo del refutador
    // `identidad`): `sobre.mjs` (la referencia JS) y `sobre.rb` (la
    // referencia Ruby) divergían acá — JS firmaba, Ruby reventaba con
    // "incomplete surrogate pair". Un `\ud800` suelto es una unidad UTF-16
    // válida pero no tiene codificación UTF-8, así que viola la regla de
    // la spec (§3: "UTF-8 sin escapar").
    expect(() => bytesCanonicos({ nombre: "\ud800" })).toThrow(ErrorDeCanonicalizacion);
    expect(() => bytesCanonicos({ nombre: "\ud800" })).toThrow(/surrogate/);
  });

  it("RECHAZA un surrogate UTF-16 suelto en una CLAVE, no solo en un valor", () => {
    expect(() => bytesCanonicos({ "\ud800": "x" })).toThrow(ErrorDeCanonicalizacion);
  });

  it("ACEPTA un par de surrogates válido (emoji), que sí es UTF-16 bien formado", () => {
    expect(bytesCanonicos({ emoji: "🐦" })).toBe('{"emoji":"🐦"}');
  });
});

describe("idDeLlave", () => {
  it("reproduce el publicKeyId publicado en SPEC.md §7", () => {
    expect(idDeLlave(leer("llave-publica.pem"))).toBe("b6b3aa455b1826e2e04402d4a695e40f");
  });
});

describe("firmar", () => {
  it("reproduce la firma determinística exacta del §7 (Ed25519 no depende del reloj)", () => {
    // Documento exacto del informe `sobre` §(4) / SPEC.md §7.
    const doc = {
      version: "1",
      reglasHash: "ca49edf08c164c80a1a178a0ef12feb93e6418b2a73da9809546eb7bacce229f",
      reglasVerificadasAl: "2026-07-16",
      habeasData: { persistidoEnBd: false, procesadoPorLlmExterno: false },
      resultados: [{ externalId: "T-1", valor: 1234567 }],
    };
    const firmado = firmar(doc, leer("llave-privada-SOLO-PRUEBAS.pem"));
    expect(firmado.signature.valor).toBe(
      "/evR5PJMg6b/n29bBeWpDAfllT7/a26y+A9Nt5lpmmu423zC7lWHGf1gECoLWDM7GoZHA8osiF/7PP77tAi7Aw=="
    );
    expect(firmado.signature.algo).toBe("ed25519");
    expect(firmado.signature.publicKeyId).toBe("b6b3aa455b1826e2e04402d4a695e40f");
    // Menos superficie a propósito: sin cubreCampos/canonical en la salida
    // (testigo los tolera ausentes — vendor/sobre/sobre.rb, informe testigo §4).
    expect(firmado.signature).not.toHaveProperty("cubreCampos");
    expect(firmado.signature).not.toHaveProperty("canonical");
  });

  it("RECHAZA una clave signature anidada fuera de la raíz", () => {
    const doc = { version: "1", anidado: { signature: { valor: "x" } } };
    expect(() => firmar(doc, leer("llave-privada-SOLO-PRUEBAS.pem"))).toThrow(ErrorDeCanonicalizacion);
    expect(() => firmar(doc, leer("llave-privada-SOLO-PRUEBAS.pem"))).toThrow(/signature.*anidada/);
  });

  it("RECHAZA cualquier null, en cualquier profundidad", () => {
    const privada = leer("llave-privada-SOLO-PRUEBAS.pem");
    expect(() => firmar({ version: "1", campo: null }, privada)).toThrow(ErrorDeCanonicalizacion);
    expect(() => firmar({ version: "1", anidado: { campo: null } }, privada)).toThrow(/null/);
  });

  it("RECHAZA un null dentro de un array, no solo en un valor de clave", () => {
    // Más estricto que SPEC.md §3 leída en aislamiento ("descartar toda
    // clave cuyo valor sea null" no dice nada de arrays) pero consistente
    // con el informe `testigo` §(4), que rechaza "cualquier null en el
    // documento" sin distinguir array de objeto (ver el comentario grande al
    // inicio de `sobre.ts`). El caso real es `resultados[].lineas[].delta`.
    const privada = leer("llave-privada-SOLO-PRUEBAS.pem");
    expect(() => firmar({ version: "1", resultados: [{ delta: null, valor: 1 }] }, privada)).toThrow(
      ErrorDeCanonicalizacion
    );
    expect(() => firmar({ version: "1", lista: [1, null, 3] }, privada)).toThrow(/null/);
  });

  it("RECHAZA un surrogate suelto antes de firmar — nunca produce un sobre que testigo/Ruby no pueda parsear", () => {
    const privada = leer("llave-privada-SOLO-PRUEBAS.pem");
    expect(() => firmar({ version: "1", nombreDeclarado: "\ud800" }, privada)).toThrow(
      ErrorDeCanonicalizacion
    );
  });

  it("NO rechaza una signature preexistente en la RAÍZ: la reemplaza (re-firmar)", () => {
    const doc = { version: "1", signature: { algo: "ed25519", valor: "vieja", publicKeyId: "x" } };
    const firmado = firmar(doc, leer("llave-privada-SOLO-PRUEBAS.pem"));
    expect(firmado.signature.valor).not.toBe("vieja");
  });
});

describe("verificar", () => {
  it("acepta el vector ASCII ya firmado, con la llave pública del vector", () => {
    const sobre = JSON.parse(leer("sobre.json"));
    expect(verificar(sobre, leer("llave-publica.pem"))).toBe(true);
  });

  it("acepta el vector unicode ya firmado", () => {
    const sobre = JSON.parse(leer("sobre-unicode.json"));
    expect(verificar(sobre, leer("llave-publica.pem"))).toBe(true);
  });

  it("rechaza una mutación de un campo firmado", () => {
    const sobre = JSON.parse(leer("sobre.json"));
    sobre.resultados[0].valor += 1;
    expect(verificar(sobre, leer("llave-publica.pem"))).toBe(false);
  });

  it("rechaza sin lanzar ante una firma con forma rota o ausente", () => {
    const sobre = JSON.parse(leer("sobre.json"));
    expect(verificar({ ...sobre, signature: { valor: "" } }, leer("llave-publica.pem"))).toBe(false);
    expect(verificar({ ...sobre, signature: undefined }, leer("llave-publica.pem"))).toBe(false);
    expect(verificar({ version: "1" }, leer("llave-publica.pem"))).toBe(false);
  });

  it("rechaza la firma correcta verificada contra la llave EQUIVOCADA", () => {
    const sobre = JSON.parse(leer("sobre.json"));
    const { publicKey } = generateKeyPairSync("ed25519");
    const ajena = publicKey.export({ format: "pem", type: "spki" }).toString();
    expect(verificar(sobre, ajena)).toBe(false);
  });
});

describe("serializarOrdenado", () => {
  it("es igual a bytesCanonicos salvo que NO descarta signature (a ninguna profundidad)", () => {
    const sobre = JSON.parse(leer("sobre.json"));
    // El documento SIN firmar da los mismos bytes por las dos rutas: no hay
    // signature que conservar o descartar.
    const { signature: _s, ...sinFirma } = sobre;
    expect(serializarOrdenado(sinFirma)).toBe(bytesCanonicos(sinFirma));
    // Con la firma puesta, serializarOrdenado la sirve en su lugar
    // ordenado; bytesCanonicos la sigue descartando — son los "bytes
    // canónicos con la firma en su lugar" que promete el brief.
    expect(serializarOrdenado(sobre)).not.toBe(bytesCanonicos(sobre));
    expect(serializarOrdenado(sobre)).toContain('"signature":{');
    expect(bytesCanonicos(sobre)).not.toContain("signature");
  });

  it("sigue descartando null/undefined igual que bytesCanonicos", () => {
    expect(serializarOrdenado({ a: 1, b: null, c: undefined })).toBe(bytesCanonicos({ a: 1, b: null }));
    expect(serializarOrdenado({ a: 1, b: null })).toBe('{"a":1}');
  });
});

describe("sinNulos", () => {
  it("quita las claves null/undefined de objetos, a cualquier profundidad", () => {
    expect(sinNulos({ a: 1, b: null, c: { d: null, e: 2 } })).toEqual({ a: 1, c: { e: 2 } });
  });

  it("deja intacto un array (nunca borra un elemento, ni siquiera si es null)", () => {
    // El orden de un array es información (spec regla 4) — borrar un
    // elemento cambia posiciones, que no es lo mismo que omitir una clave.
    expect(sinNulos({ lista: [1, null, 3] })).toEqual({ lista: [1, null, 3] });
  });

  it("limpia objetos anidados DENTRO de un array (el caso real: resultados[].lineas[].delta)", () => {
    expect(sinNulos({ resultados: [{ delta: null, valor: 1 }] })).toEqual({ resultados: [{ valor: 1 }] });
  });

  it("deja pasar `firmar` cuando se aplicó antes: el null de negocio ya no está", () => {
    const privada = leer("llave-privada-SOLO-PRUEBAS.pem");
    const doc = sinNulos({ version: "1", resultados: [{ delta: null, valor: 1 }] });
    expect(() => firmar(doc, privada)).not.toThrow();
  });
});
