import { describe, expect, it } from "vitest";
import { calcularCostoEmpleador } from "../costoEmpleador.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";

const FECHA = "2026-07-01";
const SMLMV = 1_750_905;

function linea(r: ReturnType<typeof calcularCostoEmpleador>, concepto: string) {
  return r.lineas.find((l) => l.concepto.startsWith(concepto));
}

describe("calcularCostoEmpleador — exoneración Ley 1607", () => {
  it("salario < 10 SMLMV exonerado: sin salud patronal, SENA ni ICBF; pensión/ARL/caja sí", () => {
    const r = calcularCostoEmpleador(2_000_000, REGLAS_JUL_2026, { fecha: FECHA });
    expect(linea(r, "Salud")).toBeUndefined();
    expect(linea(r, "SENA")).toBeUndefined();
    expect(linea(r, "ICBF")).toBeUndefined();
    expect(linea(r, "Pensión")?.valor).toBe(240_000); // 12%
    expect(linea(r, "Caja")?.valor).toBe(80_000); // 4%
    expect(linea(r, "ARL")?.valor).toBe(10_440); // 0.522%
    expect(r.advertencias.some((a) => a.includes("Exoneración aplicada"))).toBe(true);
  });

  it("sin exoneración: salud 8.5%, SENA 2%, ICBF 3% presentes", () => {
    const r = calcularCostoEmpleador(2_000_000, REGLAS_JUL_2026, {
      fecha: FECHA,
      exoneradoParafiscales: false,
    });
    expect(linea(r, "Salud")?.valor).toBe(170_000);
    expect(linea(r, "SENA")?.valor).toBe(40_000);
    expect(linea(r, "ICBF")?.valor).toBe(60_000);
  });

  it("borde exacto 10 SMLMV: la exoneración NO aplica aunque esté activada", () => {
    const r = calcularCostoEmpleador(SMLMV * 10, REGLAS_JUL_2026, { fecha: FECHA });
    expect(linea(r, "Salud")).toBeDefined();
    expect(linea(r, "SENA")).toBeDefined();
    expect(r.advertencias.some((a) => a.includes("10 SMLMV"))).toBe(true);
  });
});

describe("calcularCostoEmpleador — auxilio de transporte y provisiones", () => {
  it("salario <= 2 SMLMV: auxilio presente y entra a la base de cesantías/prima", () => {
    const r = calcularCostoEmpleador(SMLMV, REGLAS_JUL_2026, { fecha: FECHA });
    const auxilio = linea(r, "Auxilio de transporte");
    expect(auxilio).toBeDefined();
    const cesantias = linea(r, "Provisión cesantías")!;
    // base = salario + auxilio, /12
    expect(cesantias.valor).toBe(Math.round((SMLMV + auxilio!.valor) / 12));
    const vacaciones = linea(r, "Provisión vacaciones")!;
    // vacaciones NO incluye auxilio: salario*30/720
    expect(vacaciones.valor).toBe(Math.round((SMLMV * 30) / 720));
  });

  it("salario > 2 SMLMV: sin auxilio, provisiones sobre solo salario", () => {
    const r = calcularCostoEmpleador(4_000_000, REGLAS_JUL_2026, { fecha: FECHA });
    expect(linea(r, "Auxilio de transporte")).toBeUndefined();
    expect(linea(r, "Provisión cesantías")?.valor).toBe(Math.round(4_000_000 / 12));
  });

  it("recibeAuxilioTransporte=false lo omite aunque el salario esté bajo el tope", () => {
    const r = calcularCostoEmpleador(SMLMV, REGLAS_JUL_2026, {
      fecha: FECHA,
      recibeAuxilioTransporte: false,
    });
    expect(linea(r, "Auxilio de transporte")).toBeUndefined();
  });
});

describe("calcularCostoEmpleador — clases de riesgo ARL", () => {
  it("clase V cobra 6.96%", () => {
    const r = calcularCostoEmpleador(2_000_000, REGLAS_JUL_2026, {
      fecha: FECHA,
      claseRiesgoArl: 5,
    });
    expect(linea(r, "ARL")?.valor).toBe(139_200);
    expect(linea(r, "ARL")?.concepto).toContain("V");
  });
});

describe("calcularCostoEmpleador — totales", () => {
  it("costoTotalMensual = salario + suma de todas las líneas; factor > 1", () => {
    const r = calcularCostoEmpleador(2_000_000, REGLAS_JUL_2026, { fecha: FECHA });
    const sumaLineas = r.lineas.reduce((s, l) => s + l.valor, 0);
    expect(r.costoTotalMensual).toBe(Math.round(2_000_000 + sumaLineas));
    expect(r.factorSobreSalario).toBeGreaterThan(1.3);
    expect(r.factorSobreSalario).toBeLessThan(1.6);
  });

  it("salario <= 0 lanza error", () => {
    expect(() => calcularCostoEmpleador(0, REGLAS_JUL_2026, { fecha: FECHA })).toThrow();
  });
});
