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
// `07_Trazabilidad_Codigo.md`. Ver el procedimiento de tres pasos en ese
// mismo archivo, §5.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { auditarVigencias, CATALOGO_REGLAS_LEGALES } from "@pv/reglas";
import type { ReglaLegal } from "@pv/reglas";
import { REGLAS_SEMILLA } from "../../../prisma/semillaLegal.js";

const DIR_VAULT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../sdd/vault");
const RUTA_SERVICIO_VERIFICADAS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../reglasVerificadasService.ts"
);

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

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Las fechas de verificación que declara el encabezado de
 * `05_Valores_Actualizables.md`, en ISO y ordenadas.
 *
 * El encabezado es la parte anterior al primer `##`, y solo cuentan sus
 * líneas de cita que hablan de una *verificación*: la pasada de trazabilidad
 * que vive ahí al lado no re-mira ninguna fuente oficial, así que no mueve la
 * fecha que el API publica.
 */
function fechasDeVerificacionDelVault(): string[] {
  const encabezado = leer(ARCHIVO_VALORES).split(/\n## /)[0];
  const fechas: string[] = [];
  for (const linea of encabezado.split("\n")) {
    if (!linea.startsWith(">") || !/erificaci[óo]n/i.test(linea)) continue;
    const m = linea.match(/(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i);
    if (!m) continue;
    const mes = MESES.indexOf(m[2].toLowerCase());
    if (mes < 0) continue;
    fechas.push(`${m[3]}-${String(mes + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  }
  return fechas.sort();
}

/**
 * `REGLAS_VERIFICADAS_AL`, leída del archivo como texto.
 *
 * Importar el módulo traería `nominaService` y con él un `PrismaClient` — que
 * es justo lo que se evitó al separar `semillaLegal.ts` de `seed.ts`. Este
 * test no necesita una base para comparar dos fechas.
 */
function reglasVerificadasAl(): string {
  const src = readFileSync(RUTA_SERVICIO_VERIFICADAS, "utf8");
  const m = src.match(/REGLAS_VERIFICADAS_AL\s*=\s*"(\d{4}-\d{2}-\d{2})"/);
  if (!m) throw new Error("no se encontró REGLAS_VERIFICADAS_AL en reglasVerificadasService.ts");
  return m[1];
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
    // Identificadores en backticks que NO son claves de ReglaLegal: campos de
    // la tabla, nombres de columna, códigos de error del API. El caso que
    // importa es el inverso (una clave fantasma documentada que el sistema no
    // conoce), y ahí callar sería dejar el baúl mintiendo.
    //
    // La lista crece cuando el baúl nombra un identificador nuevo *de otra
    // clase* — algo que el sistema sí tiene, pero que no es una `clave`. Lo
    // que NO va acá es una palabra técnica cualquiera que alguien puso entre
    // backticks: en el baúl los backticks significan "identificador que el
    // sistema conoce", así que si el test se queja de un verbo de Prisma o de
    // un término de oficio, la corrección es quitarle los backticks, no
    // ensanchar esta lista. Cada nombre exento es un lugar donde una clave
    // fantasma podría esconderse por colisión.
    const noSonClaves = new Set([
      "clave",
      "valor",
      "fecha_inicio",
      "fecha_fin",
      "fuente",
      "vigenteDesde",
      "vigenteHasta",
      "ley", // campo de LineaResultado con la cita legal de cada línea
      "internal_error", // código de error del API, citado en §6 de trazabilidad
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

describe("paso 3 del procedimiento: la fecha que el API publica", () => {
  // Los tres pasos de cambiar un valor legal están en 07_Trazabilidad §5.
  // Los dos primeros se notan solos: el baúl se lee y el cálculo cambia. El
  // tercero —mover `REGLAS_VERIFICADAS_AL`— no rompe nada si se olvida, así
  // que se olvidó dos veces seguidas y el API quedó publicando una fecha de
  // dos semanas atrás a quien compró procedencia. Esto lo amarra.

  it("el encabezado del baúl declara al menos una fecha de verificación", () => {
    // Si el encabezado se reescribe y el formato deja de reconocerse, el test
    // de abajo pasaría por vacío — que es exactamente el modo de falla que
    // este instrumento existe para evitar. Mejor fallar acá y ruidosamente.
    expect(
      fechasDeVerificacionDelVault(),
      `no se reconoció ninguna fecha en el encabezado de ${ARCHIVO_VALORES} — ` +
        "se espera una línea de cita del tipo `> 🗓️ **…verificación…:** 30 de julio de 2026`"
    ).not.toEqual([]);
  });

  it("REGLAS_VERIFICADAS_AL es la última fecha de verificación del baúl", () => {
    const fechas = fechasDeVerificacionDelVault();
    const ultima = fechas[fechas.length - 1];
    expect(
      reglasVerificadasAl(),
      `el baúl declara verificaciones ${fechas.join(", ")} y el API publica otra fecha. ` +
        "Si se re-verificó y re-sembró el catálogo, actualizar REGLAS_VERIFICADAS_AL " +
        `a ${ultima}; si la verificación fue parcial, anotar su alcance en el ` +
        "encabezado del baúl (07_Trazabilidad_Codigo.md §5)"
    ).toBe(ultima);
  });
});

describe("cobertura temporal de la semilla real", () => {
  // `packages/reglas` verifica lo mismo sobre su fixture; esto lo verifica
  // sobre lo que de verdad se siembra. Son dos archivos distintos (el motor
  // no puede depender de Prisma para testearse) y por eso pueden divergir —
  // esta es la mitad que importa en producción.
  const SEMILLA = REGLAS_SEMILLA as ReglaLegal[];

  it("ninguna clave deja de resolver en una fecha futura", () => {
    const cerradas = auditarVigencias(SEMILLA, "2026-01-01", "2030-12-31").filter(
      (h) => h.motivo === "despues-del-ultimo-tramo"
    );
    expect(cerradas, "claves con la ventana cerrada — tumban la nómina en esa fecha").toEqual([]);
  });

  it("las claves que las calculadoras resuelven sin condición cubren 2021-2030", () => {
    // Estas cinco se resuelven al abrir cada tramo de días, antes de saber si
    // el concepto aplica: un hueco acá no da un número raro, lanza excepción.
    const huecos = auditarVigencias(SEMILLA, "2021-01-01", "2030-12-31", [
      "divisor_hora_ordinaria",
      "recargo_dominical",
      "recargo_nocturno",
      "hora_extra_diurna",
      "hora_extra_nocturna",
    ]);
    expect(huecos, "fechas en que una liquidación por turnos fallaría").toEqual([]);
  });

  it("ninguna clave tiene huecos entre tramos", () => {
    const entreTramos = auditarVigencias(SEMILLA, "1950-01-01", "2030-12-31").filter(
      (h) => h.motivo === "entre-tramos"
    );
    expect(entreTramos, "tramos no contiguos dentro de una misma clave").toEqual([]);
  });

  it("las claves de decreto anual cubren año por año desde 2020", () => {
    // smlmv, auxilio_transporte y uvt no se pueden deducir: cada año sale de
    // un decreto o resolución distinta. Un año faltante deja inliquidable ese
    // año entero, y un hueco de un día (olvidar el 31-dic) deja inliquidable
    // ese día solo — el bug más difícil de ver a mano.
    const huecos = auditarVigencias(SEMILLA, "2020-01-01", "2030-12-31", [
      "smlmv",
      "auxilio_transporte",
      "uvt",
    ]);
    expect(huecos, "años sin valor sembrado").toEqual([]);
  });

  it("2020 es el piso de lo liquidable en nómina", () => {
    // Dos exclusiones, ambas límites reales y no descuidos:
    //  - los topes de retención arrancan en 2023 (Ley 2277 de 2022) — ver el
    //    comentario largo en vigencias.test.ts de packages/reglas;
    //  - los knobs de pago on-chain arrancan cuando se lanzó la función: no
    //    existe un "valor histórico" de una política de producto.
    const soloRetencion = ["limite_rentas_exentas_porcentaje", "limite_rentas_exentas_uvt_anual"];
    const tardias = auditarVigencias(SEMILLA, "2020-01-01", "2030-12-31")
      .filter((h) => h.motivo === "antes-del-primer-tramo")
      .map((h) => h.clave)
      .filter((c) => !soloRetencion.includes(c) && !CLAVES_POLITICA.has(c));
    expect(tardias, "claves de nómina que arrancan después de 2020").toEqual([]);
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
