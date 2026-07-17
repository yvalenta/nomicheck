import { describe, expect, it } from "vitest";
import { diaSemana, esDomingo, esLunes, horasEntre, rangoFechas, reglaEn } from "../utils.js";
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
