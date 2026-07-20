import { describe, expect, it } from "vitest";
import { calcularRetencionFuente } from "../retencionFuente.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";

const FECHA = "2026-07-20";

describe("calcularRetencionFuente", () => {
  it("salario alto sin declarar renta: solo aplica la renta exenta laboral del 25%", () => {
    const r = calcularRetencionFuente(
      { ingresoLaboralMensual: 8_000_000, declaraRenta: false },
      REGLAS_JUL_2026,
      FECHA
    );
    expect(r.ingresoNoConstitutivo).toBe(640_000);
    expect(r.deduccionDependientes).toBe(0);
    expect(r.rentaExentaAfc).toBe(0);
    expect(r.rentaExentaLaboral).toBe(1_840_000);
    expect(r.baseGravable).toBe(5_520_000);
    expect(r.retencionMensual).toBe(103_449);
  });

  it("salario bajo el umbral de retención (tramo 0%) da retención cero", () => {
    const r = calcularRetencionFuente(
      { ingresoLaboralMensual: 3_000_000, declaraRenta: false },
      REGLAS_JUL_2026,
      FECHA
    );
    expect(r.retencionMensual).toBe(0);
  });

  it("declara renta + AFC + dependientes: se recorta al tope combinado del 40%", () => {
    const r = calcularRetencionFuente(
      {
        ingresoLaboralMensual: 8_000_000,
        declaraRenta: true,
        aportesVoluntariosAfc: 1_000_000,
        tieneDependientes: true,
      },
      REGLAS_JUL_2026,
      FECHA
    );
    // subtotal1 = 7.360.000; 40% = 2.944.000 — más ajustado que el tope
    // anual (1340 UVT / 12), así que el 40% es el que corta.
    expect(r.deduccionDependientes).toBe(689_619);
    expect(r.rentaExentaAfc).toBe(936_983);
    expect(r.rentaExentaLaboral).toBe(1_317_398);
    expect(r.totalExentoYDeducible).toBe(2_944_000);
    expect(r.retencionMensual).toBe(0);
    expect(r.advertencias.some((a) => a.includes("se recortaron"))).toBe(true);
  });

  it("ingreso alto sin AFC ni dependientes: el tope anual (1.340 UVT/12) corta antes que el 40%", () => {
    const r = calcularRetencionFuente(
      { ingresoLaboralMensual: 30_000_000, declaraRenta: false },
      REGLAS_JUL_2026,
      FECHA
    );
    // 40% de subtotal1 (27.600.000) = 11.040.000, pero el tope anual
    // equivalente mensual (1340 UVT/12 × UVT) es menor — ese es el que corta.
    expect(r.rentaExentaLaboral).toBe(5_848_430);
    expect(r.retencionMensual).toBe(4_569_793);
  });

  it("aporte voluntario AFC declarado sin marcar declaraRenta: no se toma como renta exenta y advierte", () => {
    const r = calcularRetencionFuente(
      { ingresoLaboralMensual: 8_000_000, declaraRenta: false, aportesVoluntariosAfc: 500_000 },
      REGLAS_JUL_2026,
      FECHA
    );
    expect(r.rentaExentaAfc).toBe(0);
    expect(r.advertencias.some((a) => a.includes("no se tomó como renta exenta"))).toBe(true);
  });

  it("siempre incluye la advertencia de que 'declara renta' es autodeclarado", () => {
    const r = calcularRetencionFuente({ ingresoLaboralMensual: 5_000_000, declaraRenta: false }, REGLAS_JUL_2026, FECHA);
    expect(r.advertencias.some((a) => a.includes("no valida el umbral"))).toBe(true);
  });

  it("lanza si falta una regla legal (ej. uvt no sembrada)", () => {
    const sinUvt = REGLAS_JUL_2026.filter((r) => r.clave !== "uvt");
    expect(() =>
      calcularRetencionFuente({ ingresoLaboralMensual: 5_000_000, declaraRenta: false }, sinUvt, FECHA)
    ).toThrow(/No hay regla legal vigente/);
  });
});
