// Tests del wrapper stateless de LIQUIDACIÓN FINAL. Mockean
// `obtenerReglasYFestivos` con un fixture fijo para ser deterministas y no
// depender de la BD — el cálculo en sí ya tiene sus golden en
// packages/reglas/src/__tests__/liquidacionFinal.test.ts.
//
// Lo que se prueba acá es lo que el WRAPPER agrega: el sobre verificable, que
// el auxilio se resuelva a la fecha de retiro (no a la de hoy), que la
// indemnización se arme desde los datos del empleado sin pedirlos dos veces, y
// que los supuestos viajen hasta la salida.
import { describe, expect, it, vi } from "vitest";
import type { Festivo, ReglaLegal } from "@pv/reglas";

// Dos tramos de auxilio a propósito: es lo que permite verificar que una
// liquidación de 2024 no se liquide con el auxilio de 2026.
const REGLAS: ReglaLegal[] = [
  { clave: "smlmv", valor: 1_300_000, vigenteDesde: "2024-01-01", vigenteHasta: "2024-12-31" },
  { clave: "smlmv", valor: 1_750_905, vigenteDesde: "2026-01-01" },
  { clave: "auxilio_transporte", valor: 162_000, vigenteDesde: "2024-01-01", vigenteHasta: "2024-12-31" },
  { clave: "auxilio_transporte", valor: 249_095, vigenteDesde: "2026-01-01" },
];
const FESTIVOS: Festivo[] = [];

vi.mock("../nominaService.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../nominaService.js")>()),
  obtenerReglasYFestivos: vi.fn(async () => ({ reglas: REGLAS, festivos: FESTIVOS })),
}));

const { ejecutarBatchLiquidacionFinal } = await import("../batchLiquidacionFinalService.js");
const { hashCatalogo, REGLAS_VERIFICADAS_AL } = await import("../reglasVerificadasService.js");
const { verificarFirma } = await import("../batchSignatureService.js");
const { batchLiquidacionFinalToCsv } = await import("../batchCsvService.js");
import type { BatchLiquidacionFinalInput } from "../../validation/batchLiquidacionFinal.js";

// El caso de la planilla de referencia: un mes exacto, con auxilio y con
// "otros conceptos" como trabajo suplementario.
function baseInput(): BatchLiquidacionFinalInput {
  return {
    version: "1",
    buyer: { noExternalLlm: true },
    empresa: { nombre: "Restaurante Demo", nit: "900123456-7" },
    empleados: [
      {
        externalId: "E-1",
        salarioBase: 1_850_000,
        auxilioTransporte: true,
        fechaIngreso: "2026-07-01",
        fechaRetiro: "2026-07-30",
        devengosSuplementarios: [{ mes: "2026-07", valor: 241_943 }],
        cortePrima: "2026-06-30",
        corteCesantias: "2026-06-30",
        diasVacacionesTomados: 0,
      },
    ],
  };
}

const valorDe = (r: { lineas: { codigo: string; valorCalculado: number }[] }, codigo: string) =>
  r.lineas.find((l) => l.codigo === codigo)?.valorCalculado;

// La empresa es OPCIONAL, y la calculadora pública de `/servicios` la omite.
// Antes mandaba "(no declarada)" de relleno porque el contrato la exigía, y ese
// texto quedaba DENTRO de una respuesta firmada: la firma terminaba avalando un
// dato que nadie dio. Lo que se prueba acá es que ausente se dice por ausencia.
describe("empresa no declarada", () => {
  const sinEmpresa = (): BatchLiquidacionFinalInput => {
    const i = baseInput();
    delete (i as { empresa?: unknown }).empresa;
    return i;
  };

  it("calcula igual sin empresa: no entra en ningún número", async () => {
    const con = await ejecutarBatchLiquidacionFinal(baseInput());
    const sin = await ejecutarBatchLiquidacionFinal(sinEmpresa());
    expect(sin.resultados[0].total).toBe(con.resultados[0].total);
  });

  it("OMITE la clave en vez de emitir null o un texto de relleno", async () => {
    // `null` o "(no declarada)" serían un dato inventado bajo la firma. La
    // clave ausente es la única forma de decir "no me lo dieron".
    const salida = await ejecutarBatchLiquidacionFinal(sinEmpresa());
    expect("empresa" in salida).toBe(false);
    expect(JSON.stringify(salida)).not.toContain("no declarada");
  });

  it("la firma sigue verificando sin la clave", async () => {
    // El sobre firma el payload completo: quitar un campo cambia lo firmado.
    const salida = await ejecutarBatchLiquidacionFinal(sinEmpresa());
    expect(verificarFirma({ ...salida, signature: undefined }, salida.signature)).toBe(true);
  });

  it("el CSV no escribe una cabecera de empresa vacía", async () => {
    // `# empresa: undefined (NIT undefined)` se lee como un dato roto, no como
    // un dato ausente — y este CSV lo pega un contador junto a su planilla.
    const csv = batchLiquidacionFinalToCsv(await ejecutarBatchLiquidacionFinal(sinEmpresa()));
    expect(csv).not.toContain("undefined");
    expect(csv).not.toContain("# empresa:");
  });
});

describe("ejecutarBatchLiquidacionFinal", () => {
  it("emite el sobre verificable v1: hash, fecha, disclaimer, habeas data y firma", async () => {
    const salida = await ejecutarBatchLiquidacionFinal(baseInput());
    expect(salida.version).toBe("1");
    expect(salida.reglasVerificadasAl).toBe(REGLAS_VERIFICADAS_AL);
    expect(salida.reglasHash).toBe(hashCatalogo(REGLAS, FESTIVOS));
    expect(salida.disclaimer.toLowerCase()).toContain("liquidación final");
    expect(salida.disclaimer).toContain("Ley 1581");
    expect(salida.habeasData.norma).toContain("Ley 1581");
    expect(verificarFirma({ ...salida, signature: undefined }, salida.signature)).toBe(true);
  });

  it("reproduce al peso la planilla de referencia", async () => {
    const salida = await ejecutarBatchLiquidacionFinal(baseInput());
    const r = salida.resultados[0];
    expect(valorDe(r, "LIQUIDACION_FINAL_CESANTIAS")).toBe(195_087);
    expect(valorDe(r, "LIQUIDACION_FINAL_INTERESES_CESANTIAS")).toBe(1_951);
    expect(valorDe(r, "LIQUIDACION_FINAL_PRIMA")).toBe(195_087);
    expect(valorDe(r, "LIQUIDACION_FINAL_VACACIONES")).toBe(77_083);
    expect(r.total).toBe(469_208);
    // Historial completo declarado ⇒ nada que suponer.
    expect(r.supuestos).toEqual([]);
  });

  it("el auxilio se resuelve a la fecha de RETIRO, no a la de hoy", async () => {
    // Es el punto por el que este listing necesita el catálogo histórico: una
    // liquidación de 2024 lleva el auxilio de 2024. Con el de 2026 la base de
    // cesantías se infla y el número sale plausible pero falso.
    const input = baseInput();
    input.empleados[0] = {
      ...input.empleados[0],
      fechaIngreso: "2024-07-01",
      fechaRetiro: "2024-07-30",
      cortePrima: "2024-06-30",
      corteCesantias: "2024-06-30",
      devengosSuplementarios: undefined,
    };
    const salida = await ejecutarBatchLiquidacionFinal(input);
    // Base = salario + auxilio 2024 (162.000), 30 días de 360.
    expect(valorDe(salida.resultados[0], "LIQUIDACION_FINAL_CESANTIAS")).toBe(
      Math.round(((1_850_000 + 162_000) * 30) / 360)
    );
  });

  it("sin declarar cortes, los supuestos viajan hasta la salida", async () => {
    const input = baseInput();
    input.empleados[0] = {
      ...input.empleados[0],
      cortePrima: undefined,
      corteCesantias: undefined,
      diasVacacionesTomados: undefined,
    };
    const salida = await ejecutarBatchLiquidacionFinal(input);
    expect(salida.resultados[0].supuestos).toHaveLength(3);
  });

  it("la indemnización se arma con los datos del empleado, sin pedirlos dos veces", async () => {
    const input = baseInput();
    input.empleados[0] = {
      ...input.empleados[0],
      indemnizacion: {
        tipoContrato: "fijo",
        conJustaCausa: false,
        enPeriodoPrueba: false,
        fechaVencimientoPactada: "2026-12-31",
      },
    };
    const salida = await ejecutarBatchLiquidacionFinal(input);
    // Días del 30-jul al 31-dic sobre el salario del propio empleado.
    expect(valorDe(salida.resultados[0], "INDEMNIZACION_DESPIDO")).toBe(
      Math.round((1_850_000 / 30) * 154)
    );
  });

  it("indemnización en cero por período de prueba: la línea se emite y se explica", async () => {
    const input = baseInput();
    input.empleados[0] = {
      ...input.empleados[0],
      indemnizacion: {
        tipoContrato: "indefinido",
        conJustaCausa: false,
        enPeriodoPrueba: true,
      },
    };
    const salida = await ejecutarBatchLiquidacionFinal(input);
    const r = salida.resultados[0];
    expect(valorDe(r, "INDEMNIZACION_DESPIDO")).toBe(0);
    expect(r.advertencias.join(" ")).toContain("período de prueba");
    // Y lo que importa del listing: la liquidación se paga igual.
    expect(r.total).toBeGreaterThan(0);
  });

  it("sin bloque de indemnización no se emite la línea, y la respuesta dice por qué", async () => {
    // La ausencia de una línea es ambigua para quien lee la respuesta sin
    // haber escrito el request — el caso normal cuando llama un agente. Que
    // no haya línea NO puede leerse como "la indemnización es cero".
    const salida = await ejecutarBatchLiquidacionFinal(baseInput());
    const r = salida.resultados[0];
    expect(valorDe(r, "INDEMNIZACION_DESPIDO")).toBeUndefined();
    expect(r.noSolicitado).toHaveLength(1);
    expect(r.noSolicitado[0].codigo).toBe("INDEMNIZACION_DESPIDO");
    expect(r.noSolicitado[0].motivo).toContain("NO significa que la indemnización sea cero");
  });

  it("pedida y en cero es distinto de no pedida: hay línea y no hay noSolicitado", async () => {
    const input = baseInput();
    input.empleados[0] = {
      ...input.empleados[0],
      indemnizacion: { tipoContrato: "indefinido", conJustaCausa: true, enPeriodoPrueba: false },
    };
    const salida = await ejecutarBatchLiquidacionFinal(input);
    const r = salida.resultados[0];
    expect(valorDe(r, "INDEMNIZACION_DESPIDO")).toBe(0);
    expect(r.noSolicitado).toEqual([]);
  });

  it("el schema publicado explica que omitir no es cero", async () => {
    // El comentario en TypeScript no viaja al agente; la descripción del zod sí,
    // porque zodToJsonSchema la emite en /schema/v1.json.
    const { zodToJsonSchema } = await import("zod-to-json-schema");
    const { batchLiquidacionFinalSchema } = await import("../../validation/batchLiquidacionFinal.js");
    const json = JSON.stringify(zodToJsonSchema(batchLiquidacionFinalSchema, { $refStrategy: "none" }));
    expect(json).toContain("NO equivale a cero");
    expect(json).toContain("se manda el DERECHO, no el monto".slice(3, 20));
    expect(json).toContain("AUSENTE = se liquida desde la fecha de ingreso");
  });

  it("no persiste nada: dos corridas del mismo input dan el mismo resultado", async () => {
    const a = await ejecutarBatchLiquidacionFinal(baseInput());
    const b = await ejecutarBatchLiquidacionFinal(baseInput());
    expect(b.resultados).toEqual(a.resultados);
    expect(b.reglasHash).toBe(a.reglasHash);
  });

  it("el CSV lleva la trazabilidad en la cabecera y los supuestos al final", async () => {
    const input = baseInput();
    input.empleados[0] = { ...input.empleados[0], cortePrima: undefined };
    const salida = await ejecutarBatchLiquidacionFinal(input);
    const csv = batchLiquidacionFinalToCsv(salida);

    expect(csv).toContain(`# reglas_hash: ${salida.reglasHash}`);
    expect(csv).toContain(`# signature_value: ${salida.signature.valor}`);
    expect(csv).toContain("# supuesto [E-1]:");
    // Una fila por línea de liquidación, más la de columnas.
    const filas = csv.split("\n").filter((l) => l.startsWith("E-1,"));
    expect(filas).toHaveLength(salida.resultados[0].lineas.length);
  });
});
