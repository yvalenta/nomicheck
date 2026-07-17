import { describe, expect, it } from "vitest";
import {
  diaSemana,
  esDomingo,
  esFechaValida,
  esLunes,
  finDePeriodoMensual,
  horasEntre,
  rangoFechas,
  reglaEn,
} from "../utils.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";

describe("reglaEn", () => {
  it("usa el divisor de jornada 44h (220) antes del corte 15-jul-2026", () => {
    expect(reglaEn(REGLAS_JUL_2026, "divisor_hora_ordinaria", "2026-07-14")).toBe(220);
  });

  it("usa el divisor de jornada 42h (210) desde el corte 15-jul-2026", () => {
    expect(reglaEn(REGLAS_JUL_2026, "divisor_hora_ordinaria", "2026-07-15")).toBe(210);
  });

  it("usa el recargo dominical 80% antes del corte 1-jul-2026", () => {
    expect(reglaEn(REGLAS_JUL_2026, "recargo_dominical", "2026-06-30")).toBe(0.8);
  });

  it("usa el recargo dominical 90% desde el corte 1-jul-2026", () => {
    expect(reglaEn(REGLAS_JUL_2026, "recargo_dominical", "2026-07-01")).toBe(0.9);
  });

  it("lanza error si no hay regla vigente para la fecha", () => {
    expect(() => reglaEn(REGLAS_JUL_2026, "recargo_dominical", "2000-01-01")).toThrow();
  });

  it("sigue devolviendo la regla vigente (90%) meses después del corte, sin necesidad de vigenteHasta nulo", () => {
    // La regla del 90% tiene vigenteHasta: "2027-06-30" (no null) porque la
    // Ley 2466 ya programó el siguiente escalón al 100% — reglaEn no
    // necesita un valor "abierto" para que una regla siga vigente, solo que
    // la fecha consultada caiga dentro de [vigenteDesde, vigenteHasta].
    expect(reglaEn(REGLAS_JUL_2026, "recargo_dominical", "2026-12-31")).toBe(0.9);
  });
});

describe("esFechaValida", () => {
  it("acepta fechas reales, incluido el 29 de febrero de años bisiestos", () => {
    expect(esFechaValida("2026-06-16")).toBe(true);
    expect(esFechaValida("2028-02-29")).toBe(true); // 2028 es bisiesto
  });

  it("rechaza fechas que solo existen por desborde de Date", () => {
    expect(esFechaValida("2026-02-30")).toBe(false);
    expect(esFechaValida("2027-02-29")).toBe(false); // 2027 NO es bisiesto
    expect(esFechaValida("2026-13-01")).toBe(false);
    expect(esFechaValida("no-es-fecha")).toBe(false);
  });
});

describe("calendario", () => {
  it("identifica correctamente domingos y lunes del periodo Resplandor", () => {
    const fechas = rangoFechas("2026-06-16", "2026-06-30");
    expect(fechas.filter(esDomingo)).toEqual(["2026-06-21", "2026-06-28"]);
    expect(fechas.filter(esLunes)).toEqual(["2026-06-22", "2026-06-29"]);
  });

  it("diaSemana devuelve 0 para domingo y 1 para lunes", () => {
    expect(diaSemana("2026-06-21")).toBe(0);
    expect(diaSemana("2026-06-22")).toBe(1);
  });

  it("incluye el 29 de febrero en un año bisiesto y lo omite en uno normal", () => {
    // 2028 es bisiesto (divisible por 4, no por 100) — 2026 no lo es. El
    // motor de nómina depende de rangoFechas para todo (salario
    // proporcional, festivos, recargos): si esto fallara, un periodo que
    // cruce fin de febrero en año bisiesto cobraría o pagaría un día de más
    // o de menos.
    expect(rangoFechas("2028-02-27", "2028-03-01")).toEqual([
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
    expect(rangoFechas("2026-02-27", "2026-03-01")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
  });
});

describe("finDePeriodoMensual", () => {
  it("un periodo mensual que inicia el 1 de febrero termina el último día real de febrero (28 o 29)", () => {
    expect(finDePeriodoMensual("2028-02-01")).toBe("2028-02-29"); // bisiesto
    expect(finDePeriodoMensual("2026-02-01")).toBe("2026-02-28"); // normal
  });

  it("un día del mes que no existe en el mes siguiente se ajusta al último día de ese mes (no desborda al subsiguiente)", () => {
    // Antes de este fix, 31-ene terminaba dando 1 o 2 de MARZO (Date
    // desbordaba el día 31 sobre un febrero más corto) en vez de fin de
    // febrero — este caso además se agrava o se corrige según el año sea
    // bisiesto, que es justamente el escenario a blindar.
    expect(finDePeriodoMensual("2026-01-31")).toBe("2026-02-27");
    expect(finDePeriodoMensual("2028-01-31")).toBe("2028-02-28");
  });

  it("un periodo mensual normal (día que existe en ambos meses) resta 1 día al mismo día del mes siguiente", () => {
    expect(finDePeriodoMensual("2026-06-16")).toBe("2026-07-15");
  });
});

describe("horasEntre", () => {
  it("calcula horas dentro del mismo día", () => {
    expect(horasEntre("10:00", "17:00")).toBe(7);
    expect(horasEntre("10:00", "16:00")).toBe(6);
  });

  it("calcula horas cuando el turno cruza medianoche", () => {
    expect(horasEntre("22:00", "02:00")).toBe(4);
  });
});
