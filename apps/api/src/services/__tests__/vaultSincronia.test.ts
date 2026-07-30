// Instrumento de sincronía entre el baúl (`sdd/vault/`) y el catálogo legal
// que el motor realmente usa.
//
// Existe porque el baúl es texto para humanos: nadie lo importa, nada lo
// compila, y por eso se desactualiza en silencio. Antes de este test el baúl
// documentaba 6 de las 27 claves que la semilla siembra y que
// `parametrosSnapshotService` publica firmadas a Execution Market — o sea que
// el API vendía procedencia legal para parámetros que su propia fuente de
// verdad no mencionaba.
//
// No verifica VALORES (esos tienen sus golden tests en packages/reglas): sólo
// verifica que baúl y catálogo hablen del mismo conjunto de cosas, y que la
// red de wikilinks no tenga enlaces rotos ni archivos huérfanos. Es el
// mínimo que hace del baúl algo citable en vez de decorativo.
//
// Cuando falla, la respuesta correcta casi nunca es relajar el test: es
// documentar la clave nueva en `05_Valores_Actualizables.md` y mapearla en
// `07_Trazabilidad_Codigo.md`. Ver el procedimiento de dos pasos en ese
// mismo archivo, §5.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CATALOGO_REGLAS_LEGALES } from "@pv/reglas";
import { REGLAS_SEMILLA } from "../../../prisma/semillaLegal.js";

const DIR_VAULT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../sdd/vault");

const ARCHIVO_VALORES = "05_Valores_Actualizables.md";
const ARCHIVO_TRAZABILIDAD = "07_Trazabilidad_Codigo.md";
const ARCHIVO_INDICE = "00_Indice_Nomina.md";

/** Los .md del baúl, por nombre de archivo. */
function archivosVault(): string[] {
  return readdirSync(DIR_VAULT)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

function leer(archivo: string): string {
  return readFileSync(join(DIR_VAULT, archivo), "utf8");
}

/** Nombre sin extensión — la forma en que un wikilink referencia un archivo. */
function comoWikilink(archivo: string): string {
  return archivo.replace(/\.md$/, "");
}

/** Todos los `[[destinos]]` de un texto. */
function wikilinksDe(texto: string): string[] {
  return [...texto.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim());
}

/** Claves citadas en el baúl como `clave_asi` dentro de backticks. */
function clavesCitadas(texto: string): Set<string> {
  return new Set([...texto.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]));
}

const CLAVES_SEMILLA = new Set(REGLAS_SEMILLA.map((r) => r.clave));
const CLAVES_CATALOGO = new Set(CATALOGO_REGLAS_LEGALES.map((r) => r.clave));

// No toda `clave` de ReglaLegal es una regla legal: los knobs de pago
// on-chain son política de producto (SDD §17) y no tienen norma colombiana
// que citar, así que no van en `05_Valores_Actualizables.md`. Se detectan por
// su propia fuente, no por una lista a mano: un knob de política nuevo queda
// exento solo, mientras una clave legal nueva sigue fallando el test.
const CLAVES_POLITICA = new Set(
  REGLAS_SEMILLA.filter((r) => r.fuente?.startsWith("Política NomiCheck")).map((r) => r.clave)
);
const CLAVES_LEGALES = [...CLAVES_SEMILLA].filter((c) => !CLAVES_POLITICA.has(c));

describe("sincronía baúl ↔ catálogo legal", () => {
  it("hay al menos una clave de política, y quedan fuera del baúl legal", () => {
    // Si el filtro dejara de reconocerlas (cambió el prefijo de `fuente`),
    // los dos tests siguientes empezarían a exigir documentación legal para
    // algo que no la tiene, y alguien la inventaría para pasar el test.
    expect(CLAVES_POLITICA.size).toBeGreaterThan(0);
    expect(CLAVES_LEGALES.length).toBe(CLAVES_SEMILLA.size - CLAVES_POLITICA.size);
  });

  it("toda clave legal sembrada está documentada en 05_Valores_Actualizables", () => {
    const documentadas = clavesCitadas(leer(ARCHIVO_VALORES));
    const sinDocumentar = CLAVES_LEGALES.filter((c) => !documentadas.has(c)).sort();
    expect(sinDocumentar, "claves sembradas que el baúl no explica").toEqual([]);
  });

  it("toda clave sembrada está mapeada en 07_Trazabilidad_Codigo", () => {
    const mapeadas = clavesCitadas(leer(ARCHIVO_TRAZABILIDAD));
    const sinMapear = [...CLAVES_SEMILLA].filter((c) => !mapeadas.has(c)).sort();
    expect(sinMapear, "claves sembradas sin sección del baúl que las respalde").toEqual([]);
  });

  it("el baúl no cita claves que no existan en la semilla ni en el catálogo", () => {
    // Solo se auditan los dos archivos que hablan de claves a propósito: en
    // los de reglas, un `texto_asi` entre backticks puede ser cualquier cosa.
    const citadas = new Set([
      ...clavesCitadas(leer(ARCHIVO_VALORES)),
      ...clavesCitadas(leer(ARCHIVO_TRAZABILIDAD)),
    ]);
    // Palabras en snake_case que aparecen entre backticks sin ser claves de
    // ReglaLegal (campos de la tabla, nombres de columna).
    const noSonClaves = new Set([
      "clave",
      "valor",
      "fecha_inicio",
      "fecha_fin",
      "fuente",
      "vigenteDesde",
      "vigenteHasta",
      "ley", // campo de LineaResultado con la cita legal de cada línea
    ]);
    const fantasma = [...citadas]
      .filter((c) => !noSonClaves.has(c) && !CLAVES_SEMILLA.has(c) && !CLAVES_CATALOGO.has(c))
      .sort();
    expect(fantasma, "claves que el baúl explica pero el sistema no conoce").toEqual([]);
  });

  it("toda clave del catálogo de metadatos está sembrada", () => {
    // Si `catalogoReglas.ts` anuncia una clave que nadie siembra, el panel
    // admin la ofrecería para editar y el motor no la resolvería nunca.
    const sinSembrar = [...CLAVES_CATALOGO].filter((c) => !CLAVES_SEMILLA.has(c)).sort();
    expect(sinSembrar, "claves del catálogo que la semilla no trae").toEqual([]);
  });
});

describe("integridad de la red de wikilinks", () => {
  it("no hay wikilinks rotos", () => {
    const existentes = new Set(archivosVault().map(comoWikilink));
    const rotos: string[] = [];
    for (const archivo of archivosVault()) {
      for (const destino of wikilinksDe(leer(archivo))) {
        if (!existentes.has(destino)) rotos.push(`${archivo} → [[${destino}]]`);
      }
    }
    expect(rotos, "wikilinks que apuntan a archivos inexistentes").toEqual([]);
  });

  it("ningún archivo del baúl queda huérfano", () => {
    // Huérfano = nadie lo enlaza. En Obsidian es invisible desde el grafo, y
    // en la práctica se vuelve documentación que nadie encuentra.
    const enlazados = new Set<string>();
    for (const archivo of archivosVault()) {
      for (const destino of wikilinksDe(leer(archivo))) {
        if (destino !== comoWikilink(archivo)) enlazados.add(destino);
      }
    }
    const huerfanos = archivosVault()
      .map(comoWikilink)
      // El índice es la raíz del grafo: no necesita que nadie lo enlace.
      .filter((n) => n !== comoWikilink(ARCHIVO_INDICE) && !enlazados.has(n))
      .sort();
    expect(huerfanos, "archivos del baúl que nadie enlaza").toEqual([]);
  });

  it("el índice enlaza todos los archivos de reglas", () => {
    const desdeIndice = new Set(wikilinksDe(leer(ARCHIVO_INDICE)));
    const faltantes = archivosVault()
      .map(comoWikilink)
      .filter((n) => n !== comoWikilink(ARCHIVO_INDICE) && !desdeIndice.has(n))
      .sort();
    expect(faltantes, "archivos que el índice no lista").toEqual([]);
  });
});
