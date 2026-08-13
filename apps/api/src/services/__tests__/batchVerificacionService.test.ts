// Tests del wrapper stateless de verificación (listing 5, RUMBO §3.4).
// `ejecutarBatchVerificacion` llama a `calcularNomina`, que internamente lee
// `obtenerReglasYFestivos` DENTRO de nominaService.ts (self-reference de
// módulo) — mockear solo el export no basta, así que se mockea `lib/prisma.js`
// (la fuente de datos real que `obtenerReglasYFestivos` consulta) con un
// fixture fijo. Deterministic, sin BD viva.
import { describe, expect, it, vi } from "vitest";

const REGLAS_FIXTURE = [
  { clave: "smlmv", valor: 1_750_905, vigenteDesde: "2026-01-01", vigenteHasta: null, fuente: null },
  { clave: "auxilio_transporte", valor: 249_095, vigenteDesde: "2026-01-01", vigenteHasta: null, fuente: null },
  { clave: "auxilio_transporte_tope_smlmv", valor: 2, vigenteDesde: "1950-01-01", vigenteHasta: null, fuente: null },
  { clave: "aporte_salud_empleado", valor: 0.04, vigenteDesde: "2020-01-01", vigenteHasta: null, fuente: null },
  { clave: "aporte_pension_empleado", valor: 0.04, vigenteDesde: "2020-01-01", vigenteHasta: null, fuente: null },
  { clave: "fondo_solidaridad_umbral_smlmv", valor: 4, vigenteDesde: "2020-01-01", vigenteHasta: null, fuente: null },
  { clave: "limite_deducciones_salario", valor: 0.5, vigenteDesde: "1950-01-01", vigenteHasta: null, fuente: null },
  { clave: "divisor_hora_ordinaria", valor: 210, vigenteDesde: "2026-07-15", vigenteHasta: null, fuente: null },
];

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    reglaLegal: { findMany: vi.fn(async () => REGLAS_FIXTURE) },
    festivo: { findMany: vi.fn(async () => []) },
  },
}));

const { ejecutarBatchVerificacion, resumenPrechequeo } = await import("../batchVerificacionService.js");
const { hashCatalogo, REGLAS_VERIFICADAS_AL } = await import("../reglasVerificadasService.js");
const { verificarFirma } = await import("../batchSignatureService.js");
const { batchVerificacionToCsv } = await import("../batchCsvService.js");
import type { BatchVerificacionInput } from "../../validation/batchVerificacion.js";

function baseInput(): BatchVerificacionInput {
  return {
    version: "1",
    buyer: { noExternalLlm: true },
    comprobantes: [
      {
        externalId: "CMP-1",
        salarioBasicoMensual: 2_000_000,
        recibeAuxilioTransporte: true,
        periodoDesde: "2026-07-01",
        periodoHasta: "2026-07-31",
        declarado: [
          { nombre: "Salario básico", valor: 2_000_000 },
          { nombre: "Auxilio de transporte", valor: 249_095 },
          { nombre: "Salud", valor: 80_000 },
          { nombre: "Pensión", valor: 80_000 },
        ],
      },
    ],
  };
}

describe("ejecutarBatchVerificacion", () => {
  it("emite el sobre verificable v1: hash, fecha, disclaimer, habeas data y firma", async () => {
    const salida = await ejecutarBatchVerificacion(baseInput());
    expect(salida.version).toBe("1");
    expect(salida.reglasVerificadasAl).toBe(REGLAS_VERIFICADAS_AL);
    expect(salida.reglasHash).toBe(hashCatalogo(REGLAS_FIXTURE as never, []));
    expect(salida.disclaimer.toLowerCase()).toContain("verificación");
    expect(salida.disclaimer).toContain("Ley 1581");
    expect(salida.habeasData.persistidoEnBd).toBe(false);
    expect(verificarFirma(salida, salida.signature)).toBe(true);
  });

  it("comprobante correcto (declarado = calculado por el motor): veredicto correcto", async () => {
    const salida = await ejecutarBatchVerificacion(baseInput());
    expect(salida.resultados).toHaveLength(1);
    const r = salida.resultados[0]!;
    expect(r.externalId).toBe("CMP-1");
    expect(r.veredicto).toBe("correcto");
    expect(r.deltaNetoEstimado).toBe(0);
  });

  it("comprobante con salud deducida de más: veredicto con discrepancia y delta negativo", async () => {
    const input = baseInput();
    input.comprobantes[0]!.declarado = [
      { nombre: "Salario básico", valor: 2_000_000 },
      { nombre: "Auxilio de transporte", valor: 249_095 },
      { nombre: "Salud", valor: 150_000 }, // debería ser 80.000 (4% de 2M)
      { nombre: "Pensión", valor: 80_000 },
    ];
    const salida = await ejecutarBatchVerificacion(input);
    const r = salida.resultados[0]!;
    expect(r.veredicto).toBe("discrepancias_encontradas");
    const salud = r.lineas.find((l) => l.claveConcepto === "salud")!;
    expect(salud.valorCalculado).toBe(80_000);
    expect(salud.impactoNeto).toBe(-70_000);
    expect(salud.veredicto).toBe("pagado_de_menos");
    expect(r.deltaNetoEstimado).toBe(-70_000);
  });

  it("procesa varios comprobantes y conserva su externalId cada uno", async () => {
    const input = baseInput();
    input.comprobantes.push({
      externalId: "CMP-2",
      salarioBasicoMensual: 3_000_000,
      recibeAuxilioTransporte: false,
      periodoDesde: "2026-07-01",
      periodoHasta: "2026-07-31",
      declarado: [{ nombre: "Salario básico", valor: 3_000_000 }],
    });
    const salida = await ejecutarBatchVerificacion(input);
    expect(salida.resultados.map((r) => r.externalId)).toEqual(["CMP-1", "CMP-2"]);
  });

  it("el CSV lleva cabecera con hash + disclaimer y una fila por línea verificada", async () => {
    const salida = await ejecutarBatchVerificacion(baseInput());
    const csv = batchVerificacionToCsv(salida);
    expect(csv).toContain(`# reglas_hash: ${salida.reglasHash}`);
    expect(csv).toContain("external_id,veredicto_comprobante");
    expect(csv).toContain("CMP-1,correcto,0,salario_basico,Salario básico,2000000,2000000,0,0,correcto");
  });

  describe("resumenPrechequeo (el teaser gratis)", () => {
    it("cuenta cuántos y cuánto, sobre la salida del MISMO motor", async () => {
      const salida = await ejecutarBatchVerificacion(baseInput());
      const r = resumenPrechequeo(salida);
      expect(r.comprobantes).toBe(1);
      expect(r.conDiscrepancias).toBe(salida.resultados[0].veredicto === "correcto" ? 0 : 1);
      expect(r.deltaNetoTotalEstimado).toBe(salida.resultados[0].deltaNetoEstimado);
      expect(r.reglasHash).toBe(salida.reglasHash);
    });

    it("JAMÁS filtra el detalle: ni líneas, ni normas, ni firma", async () => {
      const salida = await ejecutarBatchVerificacion(baseInput());
      const r = resumenPrechequeo(salida);
      // Las claves EXACTAS: una de más es detalle regalado o firma fingida.
      expect(Object.keys(r).sort()).toEqual([
        "comprobantes", "conDiscrepancias", "deltaNetoTotalEstimado",
        "detalle", "generadoEn", "reglasHash", "version",
      ]);
      const texto = JSON.stringify(r);
      expect(texto).not.toContain("lineas");
      expect(texto).not.toContain("referenciaLegal");
      expect(texto).not.toContain("signature");
    });

    it("un lote limpio da cero y cero — y por eso no paga", async () => {
      const r = resumenPrechequeo({
        version: "1", generadoEn: "x", reglasVerificadasAl: "x", reglasHash: "h",
        disclaimer: "d", habeasData: {} as never,
        resultados: [
          { externalId: "A", veredicto: "correcto", deltaNetoEstimado: 0, lineas: [], advertencias: [] },
          { externalId: "B", veredicto: "correcto", deltaNetoEstimado: 0, lineas: [], advertencias: [] },
        ],
        signature: {} as never,
      } as never);
      expect(r.conDiscrepancias).toBe(0);
      expect(r.deltaNetoTotalEstimado).toBe(0);
    });
  });
});
