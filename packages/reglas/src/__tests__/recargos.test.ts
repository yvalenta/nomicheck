import { describe, expect, it } from "vitest";
import { calcularRecargos } from "../recargos.js";
import { CalculadoraPorTurnos } from "../calculadoraTurnos.js";
import { FESTIVOS_2026, REGLAS_JUL_2026 } from "./fixtures.js";

// Con divisor 210 (vigente desde 2026-07-15) un salario de 2.100.000 da una
// hora ordinaria de $10.000 exactos — los valores esperados salen a mano.
const SALARIO = 2_100_000;
const FECHA = "2026-08-01";

describe("calcularRecargos — valor hora por fecha (Ley 2101 de 2021)", () => {
  it("usa el divisor 210 después del corte de 2026-07-15", () => {
    const r = calcularRecargos({ salarioMensual: SALARIO, fechaReferencia: FECHA, horas: {} }, REGLAS_JUL_2026);
    expect(r.valorHoraOrdinaria).toBe(10_000);
  });

  it("usa el divisor 220 antes del corte", () => {
    const r = calcularRecargos(
      { salarioMensual: 2_200_000, fechaReferencia: "2026-07-01", horas: {} },
      REGLAS_JUL_2026
    );
    expect(r.valorHoraOrdinaria).toBe(10_000);
  });
});

describe("calcularRecargos — una línea por tipo de hora", () => {
  it("valora cada categoría con su porcentaje vigente", () => {
    const r = calcularRecargos(
      {
        salarioMensual: SALARIO,
        fechaReferencia: FECHA,
        horas: {
          nocturnas: 2,
          dominicalesDiurnas: 3,
          extrasDiurnas: 1,
          extrasNocturnas: 1,
          extrasDominicalesDiurnas: 1,
          extrasDominicalesNocturnas: 1,
        },
      },
      REGLAS_JUL_2026
    );
    const valor = (concepto: string) => r.lineas.find((l) => l.concepto === concepto)?.valorCalculado;
    // Recargos ordinarios: solo el pct (la hora base ya está en el salario).
    expect(valor("Recargo nocturno")).toBe(2 * 10_000 * 0.35);
    expect(valor("Recargo dominical/festivo")).toBe(3 * 10_000 * 0.9);
    // Extras: hora completa + recargo.
    expect(valor("Hora extra diurna")).toBe(10_000 * 1.25);
    expect(valor("Hora extra nocturna")).toBe(10_000 * 1.75);
    // Extras dominicales: recargo dominical + pct de la extra.
    expect(valor("Hora extra dominical/festiva diurna")).toBe(10_000 * (1 + 0.9 + 0.25));
    expect(valor("Hora extra dominical/festiva nocturna")).toBe(10_000 * (1 + 0.9 + 0.75));
    expect(r.total).toBe(r.lineas.reduce((s, l) => s + l.valorCalculado, 0));
  });

  it("las horas dominicales nocturnas generan DOS líneas (dominical + nocturno)", () => {
    const r = calcularRecargos(
      { salarioMensual: SALARIO, fechaReferencia: FECHA, horas: { dominicalesNocturnas: 2 } },
      REGLAS_JUL_2026
    );
    expect(r.lineas.map((l) => l.concepto)).toEqual([
      "Recargo dominical/festivo",
      "Recargo nocturno dominical/festivo",
    ]);
    expect(r.lineas[0].valorCalculado).toBe(2 * 10_000 * 0.9);
    expect(r.lineas[1].valorCalculado).toBe(2 * 10_000 * 0.35);
    expect(r.total).toBe(2 * 10_000 * (0.9 + 0.35));
  });

  it("sin horas devuelve total 0 y sin líneas", () => {
    const r = calcularRecargos({ salarioMensual: SALARIO, fechaReferencia: FECHA, horas: {} }, REGLAS_JUL_2026);
    expect(r.lineas).toEqual([]);
    expect(r.total).toBe(0);
  });
});

describe("calcularRecargos — validaciones", () => {
  it("rechaza salario no positivo", () => {
    expect(() =>
      calcularRecargos({ salarioMensual: 0, fechaReferencia: FECHA, horas: {} }, REGLAS_JUL_2026)
    ).toThrow(/salario/i);
  });

  it("rechaza fecha inválida", () => {
    expect(() =>
      calcularRecargos({ salarioMensual: SALARIO, fechaReferencia: "2026-02-30", horas: {} }, REGLAS_JUL_2026)
    ).toThrow(/fecha/i);
  });

  it("rechaza horas negativas", () => {
    expect(() =>
      calcularRecargos({ salarioMensual: SALARIO, fechaReferencia: FECHA, horas: { nocturnas: -1 } }, REGLAS_JUL_2026)
    ).toThrow(/negativas/);
  });
});

describe("calcularRecargos — equivalencia con CalculadoraPorTurnos", () => {
  it("valora un turno nocturno igual que el motor de recibos", () => {
    // Lunes 2026-08-03, turno 20:00→24:00 — el motor clasifica las horas
    // nocturnas él mismo; le pasamos a calcularRecargos exactamente las
    // horas que el motor reporta en su línea y los valores deben coincidir.
    const recibo = CalculadoraPorTurnos.calcular(
      {
        modo: "turnos",
        salarioBasicoMensual: SALARIO,
        recibeAuxilioTransporte: false,
        periodoDesde: "2026-08-03",
        periodoHasta: "2026-08-03",
        horarioBase: [null, null, null, null, null, null, null],
        novedades: [{ fecha: "2026-08-03", trabajo: true, horaInicio: "20:00", horaFin: "24:00" }],
      },
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const lineaMotor = recibo.lineas.find((l) => l.concepto === "Recargo nocturno");
    expect(lineaMotor).toBeDefined();

    const r = calcularRecargos(
      { salarioMensual: SALARIO, fechaReferencia: "2026-08-03", horas: { nocturnas: lineaMotor!.horas! } },
      REGLAS_JUL_2026
    );
    expect(r.lineas[0].valorCalculado).toBe(lineaMotor!.valorCalculado);
    expect(r.lineas[0].recargoPct).toBe(lineaMotor!.recargoPct);
  });
});
