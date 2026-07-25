// Tests del wrapper stateless de retención (listing 6, RUMBO §3.4). Mockean
// `obtenerReglasYFestivos` con un fixture fijo (valores reales jul-2026) para
// ser deterministas y no depender de la BD — el motor `calcularRetencionFuente`
// ya tiene sus propios golden tests en packages/reglas.
import { describe, expect, it, vi } from "vitest";
import type { Festivo, ReglaLegal } from "@pv/reglas";

const REGLAS: ReglaLegal[] = [
  { clave: "aporte_salud_empleado", valor: 0.04, vigenteDesde: "2020-01-01" },
  { clave: "aporte_pension_empleado", valor: 0.04, vigenteDesde: "2020-01-01" },
  { clave: "uvt", valor: 52374, vigenteDesde: "2026-01-01" },
  { clave: "limite_porcentaje_afc", valor: 0.3, vigenteDesde: "2012-01-01" },
  { clave: "limite_anual_uvt_afc", valor: 3800, vigenteDesde: "2012-01-01" },
  { clave: "limite_rentas_exentas_porcentaje", valor: 0.4, vigenteDesde: "2023-01-01" },
  { clave: "limite_rentas_exentas_uvt_anual", valor: 1340, vigenteDesde: "2023-01-01" },
  { clave: "limite_renta_exenta_laboral_uvt_mes", valor: 790, vigenteDesde: "2007-01-01" },
  { clave: "limite_deduccion_dependientes_uvt_mes", valor: 32, vigenteDesde: "2016-01-01" },
  { clave: "limite_deduccion_salud_uvt_mes", valor: 16, vigenteDesde: "2016-01-01" },
];
const FESTIVOS: Festivo[] = [];

vi.mock("../nominaService.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../nominaService.js")>()),
  obtenerReglasYFestivos: vi.fn(async () => ({ reglas: REGLAS, festivos: FESTIVOS })),
}));

const { ejecutarBatchRetencion } = await import("../batchRetencionService.js");
const { hashCatalogo, REGLAS_VERIFICADAS_AL } = await import("../reglasVerificadasService.js");
const { verificarFirma } = await import("../batchSignatureService.js");
const { batchRetencionToCsv } = await import("../batchCsvService.js");
import type { BatchRetencionInput } from "../../validation/batchRetencion.js";

function baseInput(): BatchRetencionInput {
  return {
    version: "1",
    buyer: { noExternalLlm: true },
    personas: [
      { externalId: "P-1", ingresoLaboralMensual: 8_000_000, declaraRenta: false, tieneDependientes: false },
    ],
  };
}

describe("ejecutarBatchRetencion", () => {
  it("emite el sobre verificable v1: hash, fecha, disclaimer, habeas data y firma", async () => {
    const salida = await ejecutarBatchRetencion(baseInput());
    expect(salida.version).toBe("1");
    expect(salida.reglasVerificadasAl).toBe(REGLAS_VERIFICADAS_AL);
    expect(salida.reglasHash).toBe(hashCatalogo(REGLAS, FESTIVOS));
    expect(salida.disclaimer.toLowerCase()).toContain("retención");
    expect(salida.disclaimer).toContain("Ley 1581");
    expect(salida.habeasData.persistidoEnBd).toBe(false);
    expect(salida.habeasData.procesadoPorLlmExterno).toBe(false);
    expect(verificarFirma(salida, salida.signature)).toBe(true);
  });

  it("conserva el externalId del buyer y calcula la retención por persona", async () => {
    const salida = await ejecutarBatchRetencion(baseInput());
    expect(salida.resultados).toHaveLength(1);
    const r = salida.resultados[0]!;
    expect(r.externalId).toBe("P-1");
    expect(r.referenciaLegal).toContain("E.T. art. 383");
    // Golden del motor (packages/reglas): 8M sin declarar → renta exenta
    // laboral 25%, base 5.520.000, retención 103.449 con UVT 2026.
    expect(r.baseGravable).toBe(5_520_000);
    expect(r.retencionMensual).toBe(103_449);
  });

  it("procesa varias personas y no persiste (dos corridas dan montos idénticos)", async () => {
    const input: BatchRetencionInput = {
      version: "1",
      buyer: { noExternalLlm: true },
      personas: [
        { externalId: "A", ingresoLaboralMensual: 3_000_000, declaraRenta: false, tieneDependientes: false },
        { externalId: "B", ingresoLaboralMensual: 12_000_000, declaraRenta: true, tieneDependientes: true, aportesVoluntariosAfc: 1_000_000 },
      ],
    };
    const a = await ejecutarBatchRetencion(input);
    const b = await ejecutarBatchRetencion(input);
    expect(a.resultados.map((r) => r.externalId)).toEqual(["A", "B"]);
    // Salario bajo el umbral → retención 0 (tramo 0% del art. 383).
    expect(a.resultados[0]!.retencionMensual).toBe(0);
    expect(a.resultados[1]!.retencionMensual).toBe(b.resultados[1]!.retencionMensual);
  });

  it("el CSV lleva cabecera con hash + disclaimer y una fila por persona", async () => {
    const salida = await ejecutarBatchRetencion(baseInput());
    const csv = batchRetencionToCsv(salida);
    expect(csv).toContain(`# reglas_hash: ${salida.reglasHash}`);
    expect(csv).toContain("external_id,ingreso_laboral_mensual");
    expect(csv).toContain("P-1,8000000,");
  });
});
