import { describe, expect, it } from "vitest";
import { CalculadoraSalarioFijo } from "../calculadoraSalarioFijo.js";
import type { DatosNominaFija } from "../types.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";

describe("CalculadoraSalarioFijo — fixture nómina ejecutiva", () => {
  // Comprobante real: sueldo básico $12.958.400/mes, con devengos extralegales
  // (prima legal, aux. vivienda, medicina prepagada, seguro de vida) y
  // deducciones por convenio (créditos, seguros) además de los aportes de ley.
  const datos: DatosNominaFija = {
    modo: "salario-fijo",
    salarioBasicoMensual: 12958400,
    recibeAuxilioTransporte: false,
    periodoDesde: "2026-07-01",
    periodoHasta: "2026-07-31",
    conceptos: [
      { codigo: "M460", nombre: "Prima legal de servicio", tipo: "devengo-extralegal", valor: 1079867 },
      { codigo: "1BAV", nombre: "Auxilio de vivienda", tipo: "devengo-extralegal", valor: 500000 },
      { codigo: "BN07", nombre: "Medicina prepagada", tipo: "devengo-extralegal", valor: 350000 },
      { codigo: "BNSB", nombre: "Seguro de vida", tipo: "devengo-extralegal", valor: 45000 },
      { nombre: "Crédito AV Villas", tipo: "deduccion-convenio", valor: 300000 },
      { nombre: "Crédito Banco de Bogotá", tipo: "deduccion-convenio", valor: 250000 },
      { nombre: "Seguro de vida", tipo: "deduccion-convenio", valor: 45000 },
      { nombre: "Colsanitas", tipo: "deduccion-convenio", valor: 180000 },
      { nombre: "Retención en la fuente", tipo: "deduccion-legal", valor: 950000 },
    ],
  };

  const resultado = CalculadoraSalarioFijo.calcular(datos, REGLAS_JUL_2026, []);

  it("calcula salud al 4% del IBC — coincide con el comprobante ($518.336)", () => {
    const salud = resultado.lineas.find((l) => l.concepto.startsWith("Salud"));
    expect(salud?.valorCalculado).toBeCloseTo(518336, 0);
  });

  it("calcula pensión al 4% del IBC — coincide con el comprobante ($518.336)", () => {
    const pension = resultado.lineas.find((l) => l.concepto.startsWith("Pensión"));
    expect(pension?.valorCalculado).toBeCloseTo(518336, 0);
  });

  it("calcula fondo de solidaridad al 1% porque el IBC supera 4 SMLMV — coincide con el comprobante ($129.584)", () => {
    const smlmv = 1750905;
    expect(datos.salarioBasicoMensual).toBeGreaterThanOrEqual(4 * smlmv);
    const solidaridad = resultado.lineas.find((l) => l.concepto === "Fondo de solidaridad pensional");
    expect(solidaridad?.valorCalculado).toBeCloseTo(129584, 0);
    expect(solidaridad?.recargoPct).toBe(0.01);
  });

  it("no exige fondo de solidaridad por debajo de 4 SMLMV", () => {
    const bajoUmbral: DatosNominaFija = { ...datos, salarioBasicoMensual: 3000000, conceptos: [] };
    const r = CalculadoraSalarioFijo.calcular(bajoUmbral, REGLAS_JUL_2026, []);
    expect(r.lineas.some((l) => l.concepto === "Fondo de solidaridad pensional")).toBe(false);
  });

  it("suma los devengos extralegales y deducciones por convenio sin recalcularlos", () => {
    const prima = resultado.lineas.find((l) => l.concepto === "Prima legal de servicio");
    const credito = resultado.lineas.find((l) => l.concepto === "Crédito AV Villas");
    expect(prima?.valorCalculado).toBe(1079867);
    expect(prima?.tipo).toBe("devengo");
    expect(credito?.valorCalculado).toBe(300000);
    expect(credito?.tipo).toBe("deduccion");
  });

  it("advierte que la retención en la fuente no se valida automáticamente", () => {
    expect(resultado.advertencias.some((a) => /[Rr]etenci[oó]n/.test(a))).toBe(true);
  });

  it("el neto esperado es devengos menos deducciones", () => {
    expect(resultado.netoEsperado).toBeCloseTo(resultado.totalDevengos - resultado.totalDeducciones, 2);
  });
});

describe("CalculadoraSalarioFijo — auxilio de transporte (antes ignorado en este modo)", () => {
  const base: DatosNominaFija = {
    modo: "salario-fijo",
    salarioBasicoMensual: 1750905,
    recibeAuxilioTransporte: true,
    periodoDesde: "2026-06-01",
    periodoHasta: "2026-06-30",
    conceptos: [],
  };

  it("paga el auxilio completo en un mes de 30 días si el salario está bajo el tope", () => {
    const r = CalculadoraSalarioFijo.calcular(base, REGLAS_JUL_2026, []);
    const aux = r.lineas.find((l) => l.concepto === "Auxilio de transporte");
    expect(aux?.valorCalculado).toBe(249095);
  });

  it("no paga auxilio y advierte si el salario supera 2 SMLMV", () => {
    const r = CalculadoraSalarioFijo.calcular(
      { ...base, salarioBasicoMensual: 4000000 },
      REGLAS_JUL_2026,
      []
    );
    expect(r.lineas.some((l) => l.concepto === "Auxilio de transporte")).toBe(false);
    expect(r.advertencias.some((a) => a.includes("auxilio de transporte"))).toBe(true);
  });

  it("no genera línea de auxilio si recibeAuxilioTransporte es false", () => {
    const r = CalculadoraSalarioFijo.calcular(
      { ...base, recibeAuxilioTransporte: false },
      REGLAS_JUL_2026,
      []
    );
    expect(r.lineas.some((l) => l.concepto === "Auxilio de transporte")).toBe(false);
    expect(r.advertencias).toHaveLength(0);
  });
});
