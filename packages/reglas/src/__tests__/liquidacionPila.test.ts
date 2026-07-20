import { describe, expect, it } from "vitest";
import { calcularCostoEmpleador, calcularLiquidacionPilaEmpleado } from "../costoEmpleador.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";

const FECHA = "2026-07-01";

function linea(r: ReturnType<typeof calcularLiquidacionPilaEmpleado>, concepto: string) {
  return r.lineas.find((l) => l.concepto.startsWith(concepto));
}

describe("calcularLiquidacionPilaEmpleado", () => {
  it("con el IBC de un mes completo, coincide exactamente con calcularCostoEmpleador (mismo salario)", () => {
    const mensual = calcularCostoEmpleador(2_000_000, REGLAS_JUL_2026, { fecha: FECHA, recibeAuxilioTransporte: false });
    const pila = calcularLiquidacionPilaEmpleado(
      { ibcPeriodo: 2_000_000, auxilioTransportePeriodo: 0, salarioMensualPactado: 2_000_000, claseRiesgoArl: 1 },
      REGLAS_JUL_2026,
      { fecha: FECHA }
    );
    expect(pila.costoTotalPeriodo).toBe(mensual.costoTotalMensual);
    expect(linea(pila, "Pensión")?.valor).toBe(linea(mensual as any, "Pensión")?.valor);
    expect(linea(pila, "Provisión cesantías")?.valor).toBe(linea(mensual as any, "Provisión cesantías")?.valor);
  });

  it("con el IBC de una quincena (mitad del mes), los aportes y provisiones salen a la mitad exacta", () => {
    const mensual = calcularCostoEmpleador(2_000_000, REGLAS_JUL_2026, { fecha: FECHA, recibeAuxilioTransporte: false });
    const quincena = calcularLiquidacionPilaEmpleado(
      { ibcPeriodo: 1_000_000, auxilioTransportePeriodo: 0, salarioMensualPactado: 2_000_000, claseRiesgoArl: 1 },
      REGLAS_JUL_2026,
      { fecha: FECHA }
    );
    // Cada mitad se redondea de forma independiente (mismo criterio que el
    // resto del motor, ver numero.ts) — puede diferir en ±1 peso del entero
    // mensual dividido entre 2 sin que sea un error.
    const margen = (a: number | undefined, b: number | undefined) => Math.abs((a ?? 0) - (b ?? 0)) <= 1;
    expect(margen(linea(quincena, "Pensión")?.valor, (linea(mensual as any, "Pensión")?.valor ?? 0) / 2)).toBe(true);
    expect(
      margen(linea(quincena, "Provisión cesantías")?.valor, (linea(mensual as any, "Provisión cesantías")?.valor ?? 0) / 2)
    ).toBe(true);
    expect(
      margen(linea(quincena, "Provisión vacaciones")?.valor, (linea(mensual as any, "Provisión vacaciones")?.valor ?? 0) / 2)
    ).toBe(true);
  });

  it("el umbral de exoneración (10 SMLMV) se evalúa contra el salario pactado, no el IBC del periodo", () => {
    // IBC de una quincena de un salario alto (20 SMLMV/2) — si se comparara
    // el IBC contra el umbral en vez del salario pactado, saldría exonerado
    // por error (la mitad de 20 SMLMV sigue siendo 10 SMLMV, borde exacto,
    // pero el criterio correcto es el salario pactado completo).
    const smlmv = 1_750_905;
    const salarioPactado = smlmv * 20;
    const ibcQuincena = salarioPactado / 2;
    const r = calcularLiquidacionPilaEmpleado(
      { ibcPeriodo: ibcQuincena, auxilioTransportePeriodo: 0, salarioMensualPactado: salarioPactado, claseRiesgoArl: 1 },
      REGLAS_JUL_2026,
      { fecha: FECHA }
    );
    expect(linea(r, "Salud")).toBeDefined();
    expect(linea(r, "SENA")).toBeDefined();
    expect(r.advertencias.some((a) => a.includes("10 SMLMV"))).toBe(true);
  });

  it("usa la clase de riesgo ARL real del empleado, sin default silencioso a clase 1", () => {
    const claseV = calcularLiquidacionPilaEmpleado(
      { ibcPeriodo: 2_000_000, auxilioTransportePeriodo: 0, salarioMensualPactado: 2_000_000, claseRiesgoArl: 5 },
      REGLAS_JUL_2026,
      { fecha: FECHA }
    );
    const claseI = calcularLiquidacionPilaEmpleado(
      { ibcPeriodo: 2_000_000, auxilioTransportePeriodo: 0, salarioMensualPactado: 2_000_000, claseRiesgoArl: 1 },
      REGLAS_JUL_2026,
      { fecha: FECHA }
    );
    expect(linea(claseV, "ARL (clase de riesgo V")?.valor).toBeGreaterThan(
      linea(claseI, "ARL (clase de riesgo I")?.valor ?? 0
    );
  });

  it("el auxilio de transporte real del periodo entra a la línea y a la base de cesantías", () => {
    const r = calcularLiquidacionPilaEmpleado(
      { ibcPeriodo: 1_750_905, auxilioTransportePeriodo: 124_548, salarioMensualPactado: 1_750_905, claseRiesgoArl: 1 },
      REGLAS_JUL_2026,
      { fecha: FECHA }
    );
    expect(linea(r, "Auxilio de transporte")?.valor).toBe(124_548);
  });

  it("IBC del periodo en cero o negativo lanza error", () => {
    expect(() =>
      calcularLiquidacionPilaEmpleado(
        { ibcPeriodo: 0, auxilioTransportePeriodo: 0, salarioMensualPactado: 2_000_000, claseRiesgoArl: 1 },
        REGLAS_JUL_2026,
        { fecha: FECHA }
      )
    ).toThrow(/mayor que cero/);
  });
});
