// Tests del CSV export de los cinco wrappers stateless.
//
// Por qué esta suite existe aparte de las de cada wrapper: el CSV es el
// artefacto que sale del producto y que un TERCERO audita — la cabecera lleva
// el `reglas_hash` y el disclaimer legal (Ley 43/1990), y el repo de operación
// tiene una sonda que verifica eso contra producción. Un CSV mal formado no da
// error: da un archivo que se abre bien y dice algo DISTINTO de lo que el JSON
// firmado dice. Ese fallo no lo caza un test del servicio que lo produce, solo
// uno que lee el archivo de vuelta.
//
// SIN BASE DE DATOS, y esta vez de verdad. El 2026-07-29 se descubrió que diez
// tests de esta misma suite consultaban Supabase mientras el `vitest.config.ts`
// declaraba "solo módulos PUROS (sin BD/HTTP)". Acá el corte es más simple que
// mockear Prisma: `batchCsvService` es una función pura de un objeto tipado, así
// que los payloads se construyen a mano y NO se importa ningún servicio. Lo
// único que entra son `import type`, que el bundler borra: este archivo no tiene
// una sola importación en runtime fuera del propio módulo bajo prueba.
//
// Construir los payloads a mano tampoco es solo higiene de dependencias: los
// casos que importan —un apellido con coma, un recibo sin líneas, un campo
// ausente— son justo los que el pipeline real no produce nunca, así que a través
// del servicio no habría forma de escribirlos.
//
// El CSV se lee de vuelta con un parser RFC 4180 (abajo) en vez de `includes`:
// lo que hay que probar es que la CELDA que abre el contador diga lo que el JSON
// firmado dice, y `includes` no distingue una celda de un pedazo de otra.
import { describe, expect, it } from "vitest";

import {
  batchLiquidacionFinalToCsv,
  batchPagoOnchainToCsv,
  batchRetencionToCsv,
  batchToCsv,
  batchVerificacionToCsv,
  escaparCampo,
} from "../batchCsvService.js";
import type {
  BatchLiquidarOutput,
  FirmaOutput,
  HabeasDataConstancia,
  LineaBatch,
  ReciboBatch,
} from "../../validation/batchPublico.js";
import type {
  BatchRetencionOutput,
  ResultadoRetencionBatch,
} from "../../validation/batchRetencion.js";
import type {
  BatchPagoOnchainOutput,
  ItemPagoOnchain,
} from "../../validation/batchPagoOnchain.js";
import type {
  BatchVerificacionOutput,
  LineaVerificada,
  ResultadoVerificacion,
} from "../../validation/batchVerificacion.js";
import type {
  BatchLiquidacionFinalOutput,
  ResultadoLiquidacionBatch,
} from "../../validation/batchLiquidacionFinal.js";
import type { TasaSnapshot } from "../tasaCambioService.js";

// ── Utilidades de lectura ───────────────────────────────────────────────────

/** Parser RFC 4180 mínimo: comillas, comillas duplicadas, comas y saltos de
 *  línea DENTRO de un campo citado. Es el lector que hay que satisfacer — si
 *  el escapado está mal, acá la fila sale con otra cantidad de celdas. */
function parsearCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"' && campo === "") {
      enComillas = true;
      continue;
    }
    if (c === ",") {
      fila.push(campo);
      campo = "";
      continue;
    }
    if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
      continue;
    }
    campo += c;
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

/**
 * Parte el archivo en sus tres bloques por POSICIÓN, no por contenido: la
 * cabecera es la corrida inicial de líneas `#`, las notas son la corrida final,
 * y en el medio va todo lo demás.
 *
 * Que el corte sea posicional es lo que hace útil la comprobación: si un salto
 * de línea en un campo de la cabecera inyecta una fila, esa fila NO empieza con
 * `#`, así que corta la corrida y aparece contada como fila de datos.
 */
function bloques(csv: string): { cabecera: string[]; filas: string[][]; notas: string[] } {
  const lineas = csv.split("\n");
  if (lineas[lineas.length - 1] === "") lineas.pop();
  let ini = 0;
  while (ini < lineas.length && lineas[ini].startsWith("#")) ini++;
  let fin = lineas.length;
  while (fin > ini && lineas[fin - 1].startsWith("#")) fin--;
  return {
    cabecera: lineas.slice(0, ini),
    filas: parsearCsv(lineas.slice(ini, fin).join("\n")),
    notas: lineas.slice(fin),
  };
}

/** Cabecera `# clave: valor` a Map. El valor puede venir vacío — y ese es
 *  justamente el caso que hay que poder distinguir. */
function claves(cabecera: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of cabecera) {
    const i = l.indexOf(": ");
    if (i !== -1) m.set(l.slice(2, i), l.slice(i + 2));
  }
  return m;
}

const cab = (csv: string) => claves(bloques(csv).cabecera);
/** Filas de datos sin la de columnas. */
const datos = (csv: string) => bloques(csv).filas.slice(1);
const columnas = (csv: string) => bloques(csv).filas[0];

/**
 * El sobre verificable, tal cual va en los cuatro exports que comparten
 * cabecera. Se compara VALOR contra VALOR: buscar la etiqueta no alcanza (ver
 * el test del hash vacío más abajo).
 */
function esperarSobre(
  csv: string,
  s: {
    generadoEn: string;
    reglasVerificadasAl: string;
    reglasHash: string;
    disclaimer: string;
    habeasData: HabeasDataConstancia;
    signature: FirmaOutput;
  }
): void {
  const c = cab(csv);
  const esperado: [string, string][] = [
    ["generado_en", s.generadoEn],
    ["reglas_verificadas_al", s.reglasVerificadasAl],
    ["reglas_hash", s.reglasHash],
    ["habeas_data", s.habeasData.norma],
    ["signature_algo", s.signature.algo],
    ["signature_public_key_id", s.signature.publicKeyId],
    ["signature_value", s.signature.valor],
    ["disclaimer", s.disclaimer],
  ];
  for (const [clave, valor] of esperado) {
    expect(c.get(clave), `cabecera ${clave}`).toBe(valor);
    expect(c.get(clave), `cabecera ${clave} vacía`).not.toBe("");
  }
}

// ── Payloads ────────────────────────────────────────────────────────────────

const HASH = "0123456789abcdef".repeat(4);
const HASH_TASA = "fedcba9876543210".repeat(4);

const HABEAS: HabeasDataConstancia = {
  norma: "Ley 1581 de 2012 (habeas data Colombia). Encargado de tratamiento — Ley 1581 art. 25.",
  procesado: true,
  descartado: true,
  persistidoEnBd: false,
  procesadoPorLlmExterno: false,
};

const FIRMA: FirmaOutput = {
  algo: "ed25519",
  valor: "ZmlybWEtZGUtcHJ1ZWJhLW5vLXZlcmlmaWNhYmxl",
  publicKeyId: "0123456789abcdef0123456789abcdef",
  cubreCampos: "todos_menos_signature",
  canonical: "sorted_keys_utf8_json",
};

// Con comas adentro a propósito: el disclaimer es el campo más largo de la
// cabecera y el que más se parece a una fila de datos.
const DISCLAIMER =
  "Cálculo informativo determinístico basado en la legislación laboral colombiana vigente al " +
  "2026-07-15. NO constituye dictamen contable ni asesoría legal — requiere revisión de contador " +
  "titulado (Ley 43/1990) antes de usarse como liquidación oficial. NomiCheck no persiste los " +
  "datos de este batch (Ley 1581/2012 habeas data).";

const SOBRE = {
  generadoEn: "2026-08-05T12:00:00.000Z",
  reglasVerificadasAl: "2026-07-15",
  reglasHash: HASH,
  disclaimer: DISCLAIMER,
  habeasData: HABEAS,
  signature: FIRMA,
};

function linea(over: Partial<LineaBatch> = {}): LineaBatch {
  return {
    codigo: "SALARIO_BASICO",
    concepto: "Salario básico",
    tipo: "devengo",
    valor: 2_000_000,
    referenciaLegal: "CST art. 127",
    ...over,
  };
}

function recibo(over: Partial<ReciboBatch> = {}): ReciboBatch {
  return {
    externalId: "EMP-1",
    nombre: "Ana Gómez",
    documento: "1000000001",
    tipo: "empleado",
    lineas: [linea()],
    advertencias: [],
    totalDevengado: 2_000_000,
    totalDeducido: 160_000,
    neto: 1_840_000,
    ...over,
  };
}

function salidaLiquidar(over: Partial<BatchLiquidarOutput> = {}): BatchLiquidarOutput {
  return {
    version: "1",
    pais: "CO",
    moneda: "COP",
    locale: "es",
    ...SOBRE,
    empresa: { nombre: "Restaurante Demo", nit: "900123456-7", sector: "servicios" },
    periodo: { fechaInicio: "2026-07-01", fechaFin: "2026-07-15" },
    recibos: [recibo()],
    rechazos: [],
    ...over,
  };
}

function persona(over: Partial<ResultadoRetencionBatch> = {}): ResultadoRetencionBatch {
  return {
    externalId: "P-1",
    ingresoLaboralMensual: 8_000_000,
    ingresoNoConstitutivo: 640_000,
    deduccionDependientes: 800_000,
    deduccionMedicinaPrepagada: 0,
    rentaExentaAfcYPension: 0,
    rentaExentaLaboral: 1_112_000,
    totalExentoYDeducible: 2_552_000,
    baseGravable: 4_808_000,
    baseGravableUvt: 90.5,
    retencionMensual: 245_300,
    advertencias: [],
    referenciaLegal: "E.T. art. 383 y 388 (Ley 2277 de 2022, art. 7)",
    ...over,
  };
}

function salidaRetencion(
  resultados: ResultadoRetencionBatch[] = [persona()]
): BatchRetencionOutput {
  return { version: "1", ...SOBRE, resultados };
}

const TASA: TasaSnapshot = {
  trm: 3950.12,
  fuente: "TRM oficial — Superintendencia Financiera vía datos.gov.co (32sa-8pi3)",
  fechaTrm: "2026-08-04",
  primaPct: 0.02,
  tasaEfectiva: 4029.1224,
  capturadoEn: "2026-08-05T12:00:00.000Z",
  hash: HASH_TASA,
};

function itemPago(over: Partial<ItemPagoOnchain> = {}): ItemPagoOnchain {
  return {
    externalId: "CT-1",
    destinoWallet: "0x1111111111111111111111111111111111111111",
    montoCop: 5_000_000,
    montoUsdc: 1240.945_6,
    linkEip681:
      "ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=0x1111111111111111111111111111111111111111&uint256=1240945600",
    ...over,
  };
}

function salidaPago(over: Partial<BatchPagoOnchainOutput> = {}): BatchPagoOnchainOutput {
  return {
    version: "1",
    ...SOBRE,
    red: "base",
    token: "USDC",
    tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    chainId: 8453,
    tasaSnapshot: TASA,
    totalCop: 5_000_000,
    totalUsdc: 1240.945_6,
    expiraEn: "2026-08-05T14:00:00.000Z",
    items: [itemPago()],
    excluidosSinWallet: [],
    safeBatch: {},
    ...over,
  };
}

function lineaVerificada(over: Partial<LineaVerificada> = {}): LineaVerificada {
  return {
    claveConcepto: "salud",
    nombreDeclarado: "Aporte salud",
    valorDeclarado: 84_000,
    valorCalculado: 80_000,
    delta: 4_000,
    impactoNeto: -4_000,
    veredicto: "pagado_de_mas",
    referenciaLegal: "Ley 100 de 1993 art. 204",
    ...over,
  };
}

function resultadoVerificacion(over: Partial<ResultadoVerificacion> = {}): ResultadoVerificacion {
  return {
    externalId: "C-1",
    veredicto: "discrepancias_encontradas",
    deltaNetoEstimado: -4_000,
    lineas: [lineaVerificada()],
    advertencias: [],
    ...over,
  };
}

function salidaVerificacion(
  resultados: ResultadoVerificacion[] = [resultadoVerificacion()]
): BatchVerificacionOutput {
  return { version: "1", ...SOBRE, resultados };
}

function resultadoLiquidacion(
  over: Partial<ResultadoLiquidacionBatch> = {}
): ResultadoLiquidacionBatch {
  return {
    externalId: "E-1",
    nombre: "Ana Gómez",
    documento: "1000000001",
    fechaIngreso: "2026-01-01",
    fechaRetiro: "2026-07-30",
    lineas: [
      {
        codigo: "LIQUIDACION_FINAL_CESANTIAS",
        concepto: "Cesantías",
        valorCalculado: 195_087,
        ley: "CST art. 249",
      },
    ],
    total: 195_087,
    supuestos: [],
    advertencias: [],
    noSolicitado: [],
    ...over,
  };
}

function salidaLiquidacionFinal(
  over: Partial<BatchLiquidacionFinalOutput> = {}
): BatchLiquidacionFinalOutput {
  return {
    version: "1",
    ...SOBRE,
    empresa: { nombre: "Restaurante Demo", nit: "900123456-7" },
    resultados: [resultadoLiquidacion()],
    ...over,
  };
}

// ── escaparCampo ────────────────────────────────────────────────────────────

describe("escaparCampo", () => {
  it("no cita lo que no hace falta: el CSV también lo lee un humano", () => {
    expect(escaparCampo("EMP-1")).toBe("EMP-1");
    expect(escaparCampo("Ana Gómez")).toBe("Ana Gómez");
  });

  it("cita el campo con COMA — un apellido compuesto que parte una fila es corrupción silenciosa", () => {
    // "Gómez, Ana" sin comillas convierte una fila de 14 celdas en uno de 15,
    // y a partir de ahí todas las columnas quedan corridas: el valor cae en la
    // columna de horas y nadie ve un error.
    expect(escaparCampo("Gómez, Ana")).toBe('"Gómez, Ana"');
  });

  it("cita y DUPLICA las comillas internas (RFC 4180), no las borra", () => {
    expect(escaparCampo('Ana "La Jefa" Gómez')).toBe('"Ana ""La Jefa"" Gómez"');
  });

  it("cita el campo con salto de línea", () => {
    expect(escaparCampo("Calle 1\nApto 2")).toBe('"Calle 1\nApto 2"');
    expect(escaparCampo("Calle 1\r\nApto 2")).toBe('"Calle 1\r\nApto 2"');
  });

  it("cita el campo con retorno de carro SUELTO", () => {
    // RFC 4180 delimita con CRLF: un CR sin LF dentro de un campo sin comillas
    // parte la fila igual en Excel y en Numbers, y no lo ve nadie leyendo el
    // archivo en un editor que solo muestra LF.
    expect(escaparCampo("Ana\rGómez")).toBe('"Ana\rGómez"');
  });

  it("deja las tildes, la ñ y los símbolos intactos y SIN citar", () => {
    // UTF-8 pasa tal cual: citar por tener tilde no rompe nada pero delata que
    // el escapado se hizo por lista de caracteres "raros" en vez de por RFC.
    expect(escaparCampo("José Peña Ñuñez")).toBe("José Peña Ñuñez");
    expect(escaparCampo("Bonificación — año 2026 (½ mes)")).toBe(
      "Bonificación — año 2026 (½ mes)"
    );
    expect(escaparCampo("Ñ")).toHaveLength(1);
  });

  it("ausente es celda VACÍA, nunca el texto 'undefined' ni 'null'", () => {
    // Una celda que dice "undefined" se lee como un dato roto, no como un dato
    // ausente — y este archivo lo pega un contador junto a su planilla.
    expect(escaparCampo(undefined)).toBe("");
    expect(escaparCampo(null)).toBe("");
  });

  it("el CERO no es ausente: sale '0'", () => {
    // Un `if (!v) return ""` pasa todos los tests de arriba y convierte cada
    // deducción en cero en una celda vacía.
    expect(escaparCampo(0)).toBe("0");
    expect(escaparCampo("")).toBe("");
  });

  it("los números salen sin separador de miles y sin notación científica", () => {
    // `toLocaleString()` en vez de `toString()` daría "1,234,567.89": el CSV
    // queda bien formado (la coma va citada) pero el número que lee el contador
    // ya no es el que firmó el JSON. Y la notación científica en una nómina es
    // ilegible: nadie concilia "1.2e+7" contra un extracto bancario.
    expect(escaparCampo(1_234_567.89)).toBe("1234567.89");
    expect(escaparCampo(12_345_678)).toBe("12345678");
    expect(escaparCampo(1_234_567_890_123)).toBe("1234567890123");
    expect(escaparCampo(-45_000)).toBe("-45000");
  });

  it("no pierde decimales chicos: USDC tiene seis", () => {
    expect(escaparCampo(1240.9456)).toBe("1240.9456");
    expect(escaparCampo(0.000001)).toBe("0.000001");
    expect(escaparCampo(0.1 + 0.2)).toBe("0.30000000000000004");
  });
});

// ── batchToCsv (listing 8a) ─────────────────────────────────────────────────

describe("batchToCsv", () => {
  it("declara el sobre completo en la cabecera, con VALOR y no solo la clave", () => {
    esperarSobre(batchToCsv(salidaLiquidar()), salidaLiquidar());
  });

  it("un `includes('# reglas_hash: ')` pasa con el hash VACÍO — por eso se compara el valor", () => {
    // Este error exacto ya se cometió en el repo de operación: la sonda daba
    // verde porque buscaba la etiqueta, y la etiqueta está siempre.
    const conHash = batchToCsv(salidaLiquidar());
    const sinHash = batchToCsv(salidaLiquidar({ reglasHash: "" }));
    expect(conHash.includes("# reglas_hash: ")).toBe(true);
    expect(sinHash.includes("# reglas_hash: ")).toBe(true); // ← el falso verde
    expect(cab(conHash).get("reglas_hash")).toMatch(/^[0-9a-f]{64}$/);
    expect(cab(sinHash).get("reglas_hash")).toBe("");
  });

  it("el disclaimer viaja ENTERO y en una sola línea, con las dos normas citables", () => {
    // Es lo que un tercero audita: sin Ley 43/1990 el archivo deja de decir que
    // necesita revisión de contador titulado, y sigue abriendo igual en Excel.
    const csv = batchToCsv(salidaLiquidar());
    expect(cab(csv).get("disclaimer")).toBe(DISCLAIMER);
    expect(cab(csv).get("disclaimer")).toContain("Ley 43/1990");
    expect(cab(csv).get("disclaimer")).toContain("Ley 1581/2012");
    expect(bloques(csv).cabecera.filter((l) => l.startsWith("# disclaimer:"))).toHaveLength(1);
  });

  it("emite las catorce columnas, en orden", () => {
    expect(columnas(batchToCsv(salidaLiquidar()))).toEqual([
      "external_id",
      "tipo",
      "nombre",
      "documento",
      "concepto",
      "tipo_linea",
      "valor",
      "referencia_legal",
      "horas",
      "base",
      "recargo_pct",
      "total_devengado",
      "total_deducido",
      "neto",
    ]);
  });

  it("una fila por LÍNEA, con los totales del recibo repetidos en cada una", () => {
    // El formato es plano a propósito: el contador filtra por externalId sin
    // perder el neto. Si el total dejara de repetirse, filtrar devolvería
    // líneas sin total y la suma daría otra cosa.
    const csv = batchToCsv(
      salidaLiquidar({
        recibos: [
          recibo({
            lineas: [linea(), linea({ codigo: "SALUD", concepto: "Salud", tipo: "deduccion", valor: 80_000 })],
          }),
        ],
      })
    );
    const filas = datos(csv);
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f[4])).toEqual(["Salario básico", "Salud"]);
    // Los tres totales, por columna y con valores distintos entre sí:
    // devengado y deducido invertidos dan un archivo que abre perfecto y
    // declara que a la empleada se le dedujo su sueldo entero.
    for (const f of filas) {
      expect(f.slice(11)).toEqual(["2000000", "160000", "1840000"]);
    }
  });

  it("el orden es el del payload: recibos en su orden, líneas en el suyo, rechazos al final", () => {
    // Un `sort()` de conveniencia acá rompe la conciliación contra el JSON
    // firmado, que no está ordenado alfabéticamente.
    const csv = batchToCsv(
      salidaLiquidar({
        recibos: [
          recibo({ externalId: "Z-9", lineas: [linea({ concepto: "L1" }), linea({ concepto: "L2" })] }),
          recibo({ externalId: "A-1", lineas: [linea({ concepto: "L3" })] }),
        ],
        rechazos: [{ externalId: "M-5", nombre: "Bad", documento: "9", issues: [{ campo: "salarioBase" }] }],
      })
    );
    expect(datos(csv).map((f) => f[0])).toEqual(["Z-9", "Z-9", "A-1", "M-5"]);
    expect(datos(csv).map((f) => f[4])).toEqual(["L1", "L2", "L3", "issues=1"]);
  });

  it("un recibo SIN líneas produce exactamente una fila, con los totales y el resto vacío", () => {
    // Sin esta rama el empleado desaparecería del archivo estando en el JSON:
    // el CSV diría que se liquidó a uno menos.
    const csv = batchToCsv(salidaLiquidar({ recibos: [recibo({ lineas: [] })] }));
    const filas = datos(csv);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toHaveLength(14);
    expect(filas[0].slice(0, 4)).toEqual(["EMP-1", "empleado", "Ana Gómez", "1000000001"]);
    expect(filas[0].slice(4, 11)).toEqual(["", "", "", "", "", "", ""]);
    expect(filas[0].slice(11)).toEqual(["2000000", "160000", "1840000"]);
  });

  it("un batch vacío no revienta: cabecera, columnas y nada más", () => {
    const csv = batchToCsv(salidaLiquidar({ recibos: [], rechazos: [] }));
    expect(datos(csv)).toEqual([]);
    expect(columnas(csv)[0]).toBe("external_id");
    expect(cab(csv).get("reglas_hash")).toBe(HASH);
    expect(csv.endsWith("\n")).toBe(true);
    expect(csv.endsWith("\n\n")).toBe(false);
  });

  it("los opcionales ausentes salen como celdas vacías y la fila conserva sus catorce columnas", () => {
    const csv = batchToCsv(
      salidaLiquidar({
        recibos: [
          recibo({
            lineas: [
              {
                codigo: "BONO",
                concepto: "Bono",
                tipo: "devengo",
                valor: 100_000,
                // referenciaLegal, horas, base y recargoPct ausentes: el motor
                // no las emite en las líneas extralegales.
              },
            ],
          }),
        ],
      })
    );
    const fila = datos(csv)[0];
    expect(fila).toHaveLength(14);
    expect(fila.slice(7, 11)).toEqual(["", "", "", ""]);
    expect(csv).not.toContain("undefined");
  });

  it("un nombre con coma, comillas, salto de línea y tildes vuelve INTACTO al leerlo", () => {
    // El caso que motiva toda la suite: si el escapado falla, esta fila se
    // parte en dos y el archivo se abre igual de bien.
    const hostil = 'Gómez "Peña", Ana\nMaría';
    const csv = batchToCsv(
      salidaLiquidar({
        recibos: [
          recibo({ nombre: hostil, documento: "10,20" }),
          recibo({ externalId: "EMP-2", nombre: "Bob" }),
        ],
      })
    );
    const filas = datos(csv);
    expect(filas).toHaveLength(2);
    expect(filas[0][2]).toBe(hostil);
    expect(filas[0][3]).toBe("10,20");
    expect(filas[0]).toHaveLength(14);
    expect(filas[1][0]).toBe("EMP-2");
  });

  it("el bloque de rechazos marca `#rechazo` y el JSON de issues sobrevive citado", () => {
    // `JSON.stringify` mete comas y comillas por definición: sin escapar, cada
    // rechazo destruye la fila.
    const issues = [{ campo: "salarioBase", mensaje: "por debajo del mínimo" }];
    const csv = batchToCsv(
      salidaLiquidar({
        recibos: [],
        rechazos: [{ externalId: "BAD-1", nombre: "Carlos", documento: "2", issues }],
      })
    );
    const fila = datos(csv)[0];
    expect(fila).toHaveLength(14);
    expect(fila[1]).toBe("#rechazo");
    expect(fila[4]).toBe("issues=1");
    expect(JSON.parse(fila[7])).toEqual(issues);
  });

  it("los importes conservan sus decimales al pasar por la celda", () => {
    const csv = batchToCsv(
      salidaLiquidar({
        recibos: [
          recibo({
            lineas: [linea({ valor: 1_234_567.89, base: 0.5, horas: 7.5, recargoPct: 0.35 })],
            neto: 12_345_678_901,
          }),
        ],
      })
    );
    const fila = datos(csv)[0];
    expect(fila[6]).toBe("1234567.89");
    expect(fila[8]).toBe("7.5");
    expect(fila[9]).toBe("0.5");
    expect(fila[10]).toBe("0.35");
    expect(fila[13]).toBe("12345678901");
  });

  it("es determinista: el mismo payload da byte por byte el mismo archivo", () => {
    const s = salidaLiquidar();
    expect(batchToCsv(s)).toBe(batchToCsv(s));
  });
});

// ── batchRetencionToCsv (listing 6) ─────────────────────────────────────────

describe("batchRetencionToCsv", () => {
  it("declara el sobre completo en la cabecera", () => {
    esperarSobre(batchRetencionToCsv(salidaRetencion()), salidaRetencion());
  });

  it("una fila por persona, en el orden del payload", () => {
    // Es el único listing donde "una fila por persona" es literal: si el
    // recuento no coincide, alguien se quedó sin retención declarada.
    const csv = batchRetencionToCsv(
      salidaRetencion([
        persona({ externalId: "P-3" }),
        persona({ externalId: "P-1" }),
        persona({ externalId: "P-2" }),
      ])
    );
    expect(datos(csv)).toHaveLength(3);
    expect(datos(csv).map((f) => f[0])).toEqual(["P-3", "P-1", "P-2"]);
  });

  it("emite las doce columnas y cada fila trae las doce celdas", () => {
    const csv = batchRetencionToCsv(salidaRetencion());
    expect(columnas(csv)).toHaveLength(12);
    expect(columnas(csv)[10]).toBe("retencion_mensual");
    expect(datos(csv)[0]).toHaveLength(12);
    expect(datos(csv)[0][10]).toBe("245300");
  });

  it("sin resultados no revienta: quedan la cabecera y las columnas", () => {
    const csv = batchRetencionToCsv(salidaRetencion([]));
    expect(datos(csv)).toEqual([]);
    expect(cab(csv).get("disclaimer")).toBe(DISCLAIMER);
  });

  it("un externalId con coma no corre las columnas de la depuración", () => {
    // El externalId lo elige el comprador y no tiene ninguna restricción de
    // formato en el schema: puede traer una coma perfectamente.
    const csv = batchRetencionToCsv(
      salidaRetencion([persona({ externalId: 'Nómina "julio", sede 2' })])
    );
    expect(datos(csv)[0]).toHaveLength(12);
    expect(datos(csv)[0][0]).toBe('Nómina "julio", sede 2');
    expect(datos(csv)[0][10]).toBe("245300");
  });

  it("un cero declarado se escribe '0', no se pierde como celda vacía", () => {
    // "sin dependientes" y "no informado" son cosas distintas para quien
    // reconstruye la depuración desde el archivo.
    const csv = batchRetencionToCsv(
      salidaRetencion([persona({ deduccionDependientes: 0, retencionMensual: 0 })])
    );
    expect(datos(csv)[0][3]).toBe("0");
    expect(datos(csv)[0][10]).toBe("0");
  });

  it("los UVT con decimales no se redondean al pasar a la celda", () => {
    const csv = batchRetencionToCsv(salidaRetencion([persona({ baseGravableUvt: 90.53125 })]));
    expect(datos(csv)[0][9]).toBe("90.53125");
  });
});

// ── batchPagoOnchainToCsv (listing 8b) ──────────────────────────────────────

describe("batchPagoOnchainToCsv", () => {
  it("declara el sobre y además la tasa congelada con su hash", () => {
    // Sin `tasa_hash` el archivo no se puede verificar en /api/tasa/verify, y
    // el monto en USDC deja de ser reproducible: es la mitad de la promesa.
    const s = salidaPago();
    const csv = batchPagoOnchainToCsv(s);
    const c = cab(csv);
    expect(c.get("reglas_hash")).toBe(HASH);
    expect(c.get("tasa_hash")).toBe(HASH_TASA);
    expect(c.get("tasa_hash")).not.toBe("");
    expect(c.get("tasa_trm")).toBe("3950.12 COP/USD (vigencia 2026-08-04)");
    expect(c.get("tasa_efectiva")).toBe("4029.1224 (prima 0.02)");
    expect(c.get("red")).toBe("base (chainId 8453)");
    expect(c.get("expira_en")).toBe(s.expiraEn);
    expect(c.get("signature_value")).toBe(FIRMA.valor);
  });

  it("una fila por item pagable, en orden, con el link EIP-681 entero", () => {
    const csv = batchPagoOnchainToCsv(
      salidaPago({
        items: [itemPago({ externalId: "CT-2" }), itemPago({ externalId: "CT-1" })],
      })
    );
    expect(datos(csv).map((f) => f[0])).toEqual(["CT-2", "CT-1"]);
    expect(datos(csv)[0][4]).toBe(itemPago().linkEip681);
    expect(datos(csv)[0]).toHaveLength(5);
  });

  it("el monto en USDC no se convierte en notación científica ni pierde decimales", () => {
    // USDC tiene seis decimales: un monto que sale como "1e-6" no se puede
    // pegar en una wallet, y uno redondeado paga otra cosa.
    const csv = batchPagoOnchainToCsv(
      salidaPago({ items: [itemPago({ montoUsdc: 0.000001, montoCop: 4 })] })
    );
    expect(datos(csv)[0][2]).toBe("4");
    expect(datos(csv)[0][3]).toBe("0.000001");
    expect(datos(csv)[0][3]).not.toContain("e");
  });

  it("los excluidos sin wallet se nombran TODOS en la cabecera", () => {
    // Es el único lugar del archivo donde aparecen: si se pierden, el CSV
    // parece un lote completo y hay gente sin pagar.
    const csv = batchPagoOnchainToCsv(
      salidaPago({ excluidosSinWallet: ["CT-7", "CT-8", "CT-9"] })
    );
    expect(cab(csv).get("excluidos_sin_wallet")).toBe("CT-7; CT-8; CT-9");
  });

  it("sin items no revienta: quedan cabecera y columnas", () => {
    const csv = batchPagoOnchainToCsv(salidaPago({ items: [], excluidosSinWallet: ["CT-1"] }));
    expect(datos(csv)).toEqual([]);
    expect(columnas(csv)).toEqual([
      "external_id",
      "destino_wallet",
      "monto_cop",
      "monto_usdc",
      "link_eip681",
    ]);
  });

  it("es determinista", () => {
    const s = salidaPago();
    expect(batchPagoOnchainToCsv(s)).toBe(batchPagoOnchainToCsv(s));
  });
});

// ── batchVerificacionToCsv (listing 5) ──────────────────────────────────────

describe("batchVerificacionToCsv", () => {
  it("declara el sobre completo en la cabecera", () => {
    esperarSobre(batchVerificacionToCsv(salidaVerificacion()), salidaVerificacion());
  });

  it("una fila por línea verificada, repitiendo el veredicto del comprobante", () => {
    const csv = batchVerificacionToCsv(
      salidaVerificacion([
        resultadoVerificacion({
          externalId: "C-1",
          lineas: [lineaVerificada(), lineaVerificada({ claveConcepto: "pension" })],
        }),
        resultadoVerificacion({ externalId: "C-2", veredicto: "correcto", deltaNetoEstimado: 0 }),
      ])
    );
    const filas = datos(csv);
    expect(filas.map((f) => f[0])).toEqual(["C-1", "C-1", "C-2"]);
    expect(filas.map((f) => f[3])).toEqual(["salud", "pension", "salud"]);
    expect(filas[0][1]).toBe("discrepancias_encontradas");
    expect(filas[2][1]).toBe("correcto");
    expect(filas[0]).toHaveLength(11);
  });

  it("los deltas negativos se escriben con su signo", () => {
    // El signo ES el resultado: "-4000" contra "4000" invierte quién le debe a
    // quién. Un `Math.abs` de maquillaje pasaría desapercibido en el JSON.
    const csv = batchVerificacionToCsv(
      salidaVerificacion([
        resultadoVerificacion({
          deltaNetoEstimado: -12_345.5,
          lineas: [lineaVerificada({ delta: -4_000, impactoNeto: -4_000 })],
        }),
      ])
    );
    expect(datos(csv)[0][2]).toBe("-12345.5");
    expect(datos(csv)[0][7]).toBe("-4000");
    expect(datos(csv)[0][8]).toBe("-4000");
  });

  it("una línea extralegal sin referencia legal deja la celda vacía, no 'undefined'", () => {
    const csv = batchVerificacionToCsv(
      salidaVerificacion([
        resultadoVerificacion({
          lineas: [
            lineaVerificada({
              claveConcepto: "extralegal",
              nombreDeclarado: "Bono, de puntualidad",
              veredicto: "no_verificable_extralegal",
              valorCalculado: 0,
              referenciaLegal: undefined,
            }),
          ],
        }),
      ])
    );
    const fila = datos(csv)[0];
    expect(fila).toHaveLength(11);
    expect(fila[4]).toBe("Bono, de puntualidad");
    expect(fila[10]).toBe("");
    expect(csv).not.toContain("undefined");
  });

  it("un comprobante sin líneas no revienta y no descuadra las filas de los demás", () => {
    // OJO: sin líneas el comprobante no genera NINGUNA fila, así que su
    // externalId no aparece en el archivo aunque sí esté en el JSON firmado.
    // El schema exige `declarado.min(1)`, así que hoy el pipeline no lo
    // produce; lo que se fija acá es que el export no se rompa si lo hiciera.
    const csv = batchVerificacionToCsv(
      salidaVerificacion([
        resultadoVerificacion({ externalId: "C-VACIO", lineas: [] }),
        resultadoVerificacion({ externalId: "C-2" }),
      ])
    );
    expect(datos(csv).map((f) => f[0])).toEqual(["C-2"]);
    expect(cab(csv).get("reglas_hash")).toBe(HASH);
  });

  it("sin resultados no revienta", () => {
    expect(datos(batchVerificacionToCsv(salidaVerificacion([])))).toEqual([]);
  });
});

// ── batchLiquidacionFinalToCsv ──────────────────────────────────────────────

describe("batchLiquidacionFinalToCsv", () => {
  it("declara el sobre completo, más la empresa cuando la hay", () => {
    const csv = batchLiquidacionFinalToCsv(salidaLiquidacionFinal());
    esperarSobre(csv, salidaLiquidacionFinal());
    expect(cab(csv).get("empresa")).toBe("Restaurante Demo (NIT 900123456-7)");
  });

  it("sin empresa NO escribe la línea, ni 'undefined' en ningún lado", () => {
    // `# empresa: undefined (NIT undefined)` se lee como un dato roto en vez de
    // como un dato ausente. La clave se omite entera; lo mismo que hace el
    // JSON, que la firma cubre.
    const sin = salidaLiquidacionFinal();
    delete sin.empresa;
    const csv = batchLiquidacionFinalToCsv(sin);
    expect(csv).not.toContain("# empresa:");
    expect(csv).not.toContain("undefined");
    expect(cab(csv).get("reglas_hash")).toBe(HASH);
  });

  it("una fila por línea, con el total repetido, y el orden del payload", () => {
    const csv = batchLiquidacionFinalToCsv(
      salidaLiquidacionFinal({
        resultados: [
          resultadoLiquidacion({
            externalId: "Z-1",
            total: 469_208,
            lineas: [
              { codigo: "CESANTIAS", concepto: "Cesantías", valorCalculado: 195_087, ley: "CST art. 249" },
              { codigo: "PRIMA", concepto: "Prima", valorCalculado: 195_087, ley: "CST art. 306" },
            ],
          }),
          resultadoLiquidacion({ externalId: "A-2", total: 100 }),
        ],
      })
    );
    const filas = datos(csv);
    expect(filas.map((f) => f[0])).toEqual(["Z-1", "Z-1", "A-2"]);
    expect(filas.map((f) => f[5])).toEqual(["CESANTIAS", "PRIMA", "LIQUIDACION_FINAL_CESANTIAS"]);
    expect(filas.slice(0, 2).map((f) => f[9])).toEqual(["469208", "469208"]);
    expect(filas[0]).toHaveLength(10);
  });

  it("nombre y documento ausentes dejan celdas vacías: la liquidación se calcula sin saber quién es", () => {
    const csv = batchLiquidacionFinalToCsv(
      salidaLiquidacionFinal({
        resultados: [resultadoLiquidacion({ nombre: undefined, documento: undefined })],
      })
    );
    const fila = datos(csv)[0];
    expect(fila).toHaveLength(10);
    expect(fila.slice(0, 3)).toEqual(["E-1", "", ""]);
    expect(csv).not.toContain("undefined");
  });

  it("una línea sin cita legal deja la celda vacía", () => {
    const csv = batchLiquidacionFinalToCsv(
      salidaLiquidacionFinal({
        resultados: [
          resultadoLiquidacion({
            lineas: [{ codigo: "OTRO", concepto: "Otro", valorCalculado: 1 }],
          }),
        ],
      })
    );
    expect(datos(csv)[0][8]).toBe("");
  });

  it("supuestos, advertencias y no_calculado salen al final, nombrando a quién", () => {
    // Son la diferencia entre una cifra y una cifra que sabés sobre qué se
    // construyó. Sin el externalId no se pueden atribuir en un lote de 40.
    const csv = batchLiquidacionFinalToCsv(
      salidaLiquidacionFinal({
        resultados: [
          resultadoLiquidacion({
            externalId: "E-7",
            supuestos: ["No se informó cortePrima: se liquida desde el ingreso"],
            advertencias: ["Terminación en período de prueba"],
            noSolicitado: [{ codigo: "INDEMNIZACION_DESPIDO", motivo: "no se pidió" }],
          }),
        ],
      })
    );
    const { notas } = bloques(csv);
    expect(notas).toEqual([
      "# supuesto [E-7]: No se informó cortePrima: se liquida desde el ingreso",
      "# advertencia [E-7]: Terminación en período de prueba",
      "# no_calculado [E-7] INDEMNIZACION_DESPIDO: no se pidió",
    ]);
  });

  it("sin supuestos ni advertencias no queda bloque de notas ni línea de más", () => {
    const csv = batchLiquidacionFinalToCsv(salidaLiquidacionFinal());
    expect(bloques(csv).notas).toEqual([]);
    expect(csv.endsWith("\n")).toBe(true);
    expect(csv.endsWith("\n\n")).toBe(false);
  });

  it("un empleado sin líneas no genera filas: solo lo nombran sus notas", () => {
    // Consecuencia del formato "una fila por línea". Queda fijado acá para que
    // se vea al cambiarlo: el JSON firmado lo incluye y el cuerpo del CSV no.
    const csv = batchLiquidacionFinalToCsv(
      salidaLiquidacionFinal({
        resultados: [
          resultadoLiquidacion({ externalId: "E-VACIO", lineas: [], supuestos: ["nada que liquidar"] }),
          resultadoLiquidacion({ externalId: "E-2" }),
        ],
      })
    );
    expect(datos(csv).map((f) => f[0])).toEqual(["E-2"]);
    expect(bloques(csv).notas).toEqual(["# supuesto [E-VACIO]: nada que liquidar"]);
  });

  it("un nombre con coma y comillas vuelve intacto y no parte la fila", () => {
    const hostil = 'Gómez "Nena", María José';
    const csv = batchLiquidacionFinalToCsv(
      salidaLiquidacionFinal({
        resultados: [resultadoLiquidacion({ nombre: hostil }), resultadoLiquidacion({ externalId: "E-2" })],
      })
    );
    expect(datos(csv)).toHaveLength(2);
    expect(datos(csv)[0][1]).toBe(hostil);
    expect(datos(csv)[0]).toHaveLength(10);
  });

  it("es determinista", () => {
    const s = salidaLiquidacionFinal();
    expect(batchLiquidacionFinalToCsv(s)).toBe(batchLiquidacionFinalToCsv(s));
  });
});

// ── Inyección de filas por la cabecera ──────────────────────────────────────
//
// Una línea `#` no tiene forma de escapar un salto de línea: lo que venga
// después deja de ser comentario. Y varios de los valores que se interpolan en
// la cabecera y en las notas son del COMPRADOR (`empresa.nombre`, `externalId`,
// los excluidos sin wallet), sin más validación que `min(1)` en el zod. Sin
// sanear, un nombre de empresa con `\n` mete filas que el contador ve idénticas
// a las reales y que el JSON firmado no contiene: el archivo se abre bien y dice
// otra cosa. Es exactamente el fallo que este export no puede tener.

describe("inyección por salto de línea", () => {
  it("un nombre de empresa con `\\n` no inyecta una fila de liquidación", () => {
    const csv = batchLiquidacionFinalToCsv(
      salidaLiquidacionFinal({
        empresa: {
          nombre: "Acme\nE-9,Fantasma,999,2026-01-01,2026-01-02,CESANTIAS,Cesantías,9999999,CST,9999999",
          nit: "900",
        },
      })
    );
    expect(datos(csv).map((f) => f[0])).toEqual(["E-1"]);
    expect(bloques(csv).cabecera.every((l) => l.startsWith("#"))).toBe(true);
    // Y el dato no se pierde ni se pega: el salto se colapsa a UN ESPACIO.
    // Borrarlo también neutraliza la inyección, pero convierte "Acme\nS.A.S"
    // en "AcmeS.A.S" — un nombre de empresa que no existe.
    expect(cab(csv).get("empresa")).toBe(
      "Acme E-9,Fantasma,999,2026-01-01,2026-01-02,CESANTIAS,Cesantías,9999999,CST,9999999 (NIT 900)"
    );
  });

  it("un supuesto con `\\n` no inyecta una fila después del cuerpo", () => {
    const csv = batchLiquidacionFinalToCsv(
      salidaLiquidacionFinal({
        resultados: [
          resultadoLiquidacion({
            supuestos: ["se liquida desde el ingreso\nE-9,Fantasma,999,x,x,X,Y,9999999,Z,9999999"],
          }),
        ],
      })
    );
    expect(datos(csv).map((f) => f[0])).toEqual(["E-1"]);
    expect(bloques(csv).notas.every((l) => l.startsWith("#"))).toBe(true);
  });

  it("un excluido sin wallet con `\\n` no inyecta un pago", () => {
    const csv = batchPagoOnchainToCsv(
      salidaPago({
        excluidosSinWallet: ["CT-7", "CT-8\nCT-9,0x2222222222222222222222222222222222222222,1,1,link"],
      })
    );
    expect(datos(csv).map((f) => f[0])).toEqual(["CT-1"]);
    expect(bloques(csv).cabecera.every((l) => l.startsWith("#"))).toBe(true);
  });

  it("un `\\r` en la cabecera tampoco parte la línea", () => {
    // El CR suelto no se ve en un editor y Excel lo trata como fin de fila.
    const csv = batchLiquidacionFinalToCsv(
      salidaLiquidacionFinal({ empresa: { nombre: "Acme\rE-9,Fantasma", nit: "900" } })
    );
    expect(bloques(csv).cabecera.every((l) => l.startsWith("#"))).toBe(true);
    expect(datos(csv).map((f) => f[0])).toEqual(["E-1"]);
  });
});
