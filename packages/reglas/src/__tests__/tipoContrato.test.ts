import { describe, expect, it } from "vitest";
import { CalculadoraSalarioFijo } from "../calculadoraSalarioFijo.js";
import { CalculadoraServicios } from "../calculadoraServicios.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";

const PERIODO = { periodoDesde: "2026-07-01", periodoHasta: "2026-07-31" } as const;

describe("tipoContrato — aprendizaje SENA", () => {
  it("etapa lectiva: sin ninguna deducción de ley, sin auxilio, devengo 'Auxilio de sostenimiento'", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 900_000,
        recibeAuxilioTransporte: true,
        tipoContrato: "aprendizaje_sena_lectiva",
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    expect(r.lineas.some((l) => l.tipo === "deduccion")).toBe(false);
    expect(r.lineas.some((l) => l.concepto === "Auxilio de transporte")).toBe(false);
    expect(r.lineas[0].concepto).toBe("Auxilio de sostenimiento");
    expect(r.totalDeducciones).toBe(0);
  });

  it("etapa práctica: solo aporte de salud, sin pensión ni fondo de solidaridad", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 1_312_000, // ~75% SMLMV, valor típico de práctica
        recibeAuxilioTransporte: true,
        tipoContrato: "aprendizaje_sena_practica",
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    const deducciones = r.lineas.filter((l) => l.tipo === "deduccion");
    expect(deducciones).toHaveLength(1);
    expect(deducciones[0].concepto).toBe("Salud (aporte empleado)");
    expect(r.lineas.some((l) => l.concepto === "Auxilio de transporte")).toBe(false);
  });

  it("indefinido (u omitido): comportamiento idéntico al actual — regresión", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 2_000_000,
        recibeAuxilioTransporte: false,
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    expect(r.lineas[0].concepto).toBe("Salario básico");
    const deducciones = r.lineas.filter((l) => l.tipo === "deduccion");
    expect(deducciones.map((l) => l.concepto)).toEqual(["Salud (aporte empleado)", "Pensión (aporte empleado)"]);
  });
});

describe("CalculadoraServicios — prestación de servicios", () => {
  it("neto == honorarios: nada se resta (los aportes del independiente no se retienen)", () => {
    const r = CalculadoraServicios.calcular(
      { modo: "servicios", honorariosMensuales: 3_000_000, periodoDesde: "2026-07-01", periodoHasta: "2026-07-31" },
      REGLAS_JUL_2026,
      []
    );
    expect(r.totalDevengos).toBe(3_000_000);
    expect(r.totalDeducciones).toBe(0);
    expect(r.netoEsperado).toBe(3_000_000);
    expect(r.lineas.some((l) => l.concepto === "Auxilio de transporte")).toBe(false);
    expect(r.lineas.some((l) => l.concepto.startsWith("Recargo"))).toBe(false);
    expect(r.advertencias.some((a) => a.includes("1.200.000"))).toBe(true); // IBC 40% de 3.000.000
    expect(r.advertencias.some((a) => a.includes("prestaciones sociales"))).toBe(true);
  });

  it("periodo parcial (quincena) prorratea igual que salario fijo", () => {
    const r = CalculadoraServicios.calcular(
      { modo: "servicios", honorariosMensuales: 3_000_000, periodoDesde: "2026-07-01", periodoHasta: "2026-07-15" },
      REGLAS_JUL_2026,
      []
    );
    expect(r.totalDevengos).toBe(1_500_000);
  });

  it("honorarios <= 0 lanza error", () => {
    expect(() =>
      CalculadoraServicios.calcular(
        { modo: "servicios", honorariosMensuales: 0, periodoDesde: "2026-07-01", periodoHasta: "2026-07-31" },
        REGLAS_JUL_2026,
        []
      )
    ).toThrow();
  });
});
