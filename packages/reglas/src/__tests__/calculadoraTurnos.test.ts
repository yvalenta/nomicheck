import { describe, expect, it } from "vitest";
import { CalculadoraPorTurnos } from "../calculadoraTurnos.js";
import type { DatosNominaTurnos } from "../types.js";
import { FESTIVOS_2026, REGLAS_JUL_2026 } from "./fixtures.js";

describe("CalculadoraPorTurnos — fixture Restaurante Resplandor", () => {
  // Periodo 16-30 jun 2026, salario básico $1.750.905, 15 días laborados,
  // sin excepciones (horario base todo el periodo). Sirve de regresión: si
  // alguien cambia la lógica de horario base o de agrupación por tramos,
  // este total deja de cuadrar con la fórmula esperada.
  const datos: DatosNominaTurnos = {
    modo: "turnos",
    salarioBasicoMensual: 1750905,
    recibeAuxilioTransporte: true,
    periodoDesde: "2026-06-16",
    periodoHasta: "2026-06-30",
    dominicosTrabajaos: 2,
    excepciones: [],
  };

  const resultado = CalculadoraPorTurnos.calcular(datos, REGLAS_JUL_2026, FESTIVOS_2026);

  it("no reporta advertencias cuando los domingos declarados coinciden con el rango", () => {
    expect(resultado.advertencias).toHaveLength(0);
  });

  it("calcula 77 horas ordinarias hábiles (11 días mar-sáb × 7h)", () => {
    const linea = resultado.lineas.find((l) => l.concepto === "Horas ordinarias");
    expect(linea?.horas).toBe(77);
  });

  it("calcula 12 horas dominicales (2 domingos × 6h) con recargo 80%", () => {
    const horas = resultado.lineas.find((l) => l.concepto === "Horas dominicales/festivas");
    const recargo = resultado.lineas.find((l) => l.concepto === "Recargo dominical/festivo");
    expect(horas?.horas).toBe(12);
    expect(recargo?.recargoPct).toBe(0.8);
  });

  it("no genera horas extra ni nocturnas (horario base no las produce)", () => {
    const conceptos = resultado.lineas.map((l) => l.concepto);
    expect(conceptos.some((c) => c.startsWith("Hora extra"))).toBe(false);
    expect(conceptos.some((c) => c.startsWith("Recargo nocturno"))).toBe(false);
  });

  it("incluye auxilio de transporte proporcional a los 15 días del periodo", () => {
    const aux = resultado.lineas.find((l) => l.concepto === "Auxilio de transporte");
    expect(aux?.valorCalculado).toBeCloseTo((249095 / 30) * 15, 1);
  });

  it("el total devengado coincide con la fórmula esperada (regresión)", () => {
    const valorHora = 1750905 / 220;
    const esperado =
      77 * valorHora + // ordinarias hábiles
      12 * valorHora * 1.8 + // dominicales (base + recargo 80%)
      (249095 / 30) * 15; // auxilio de transporte
    expect(resultado.totalDevengos).toBeCloseTo(esperado, 1);
  });
});

describe("CalculadoraPorTurnos — advertencia de domingos declarados", () => {
  it("advierte si el usuario declara más domingos de los que tiene el rango", () => {
    const datos: DatosNominaTurnos = {
      modo: "turnos",
      salarioBasicoMensual: 1750905,
      recibeAuxilioTransporte: false,
      periodoDesde: "2026-06-16",
      periodoHasta: "2026-06-30",
      dominicosTrabajaos: 5, // el rango solo tiene 2
      excepciones: [],
    };
    const resultado = CalculadoraPorTurnos.calcular(datos, REGLAS_JUL_2026, FESTIVOS_2026);
    expect(resultado.advertencias.length).toBeGreaterThan(0);
  });
});

describe("CalculadoraPorTurnos — corte normativo de divisor (15-jul-2026)", () => {
  it("divide el periodo en dos tramos con distinto valor hora a cada lado del corte", () => {
    const datos: DatosNominaTurnos = {
      modo: "turnos",
      salarioBasicoMensual: 1750905,
      recibeAuxilioTransporte: false,
      periodoDesde: "2026-07-13", // lunes: descanso
      periodoHasta: "2026-07-16", // jueves
      dominicosTrabajaos: 0,
      excepciones: [],
    };
    // 14-jul (martes, divisor 220) y 15-16 jul (mié/jue, divisor 210)
    const resultado = CalculadoraPorTurnos.calcular(datos, REGLAS_JUL_2026, FESTIVOS_2026);

    const lineasOrdinarias = resultado.lineas.filter((l) => l.concepto.startsWith("Horas ordinarias"));
    expect(lineasOrdinarias).toHaveLength(2);

    const valorHora220 = 1750905 / 220;
    const valorHora210 = 1750905 / 210;
    const bases = lineasOrdinarias.map((l) => l.base).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(bases[0]).toBeCloseTo(valorHora220, 1);
    expect(bases[1]).toBeCloseTo(valorHora210, 1);
  });
});

describe("CalculadoraPorTurnos — corte normativo de recargo dominical (1-jul-2026)", () => {
  it("aplica 80% al domingo antes del corte y 90% al domingo después del corte", () => {
    const datos: DatosNominaTurnos = {
      modo: "turnos",
      salarioBasicoMensual: 1750905,
      recibeAuxilioTransporte: false,
      periodoDesde: "2026-06-28", // domingo, recargo 80%
      periodoHasta: "2026-07-05", // domingo, recargo 90%
      dominicosTrabajaos: 2,
      excepciones: [],
    };
    const resultado = CalculadoraPorTurnos.calcular(datos, REGLAS_JUL_2026, FESTIVOS_2026);

    const recargos = resultado.lineas
      .filter((l) => l.concepto.startsWith("Recargo dominical/festivo"))
      .map((l) => l.recargoPct)
      .sort();
    expect(recargos).toEqual([0.8, 0.9]);
  });
});

describe("CalculadoraPorTurnos — excepción con horas extra y nocturnas", () => {
  it("clasifica horas por encima de la jornada como extra, y las nocturnas con su recargo", () => {
    const datos: DatosNominaTurnos = {
      modo: "turnos",
      salarioBasicoMensual: 1750905,
      recibeAuxilioTransporte: false,
      periodoDesde: "2026-06-16", // martes, hábil
      periodoHasta: "2026-06-16",
      dominicosTrabajaos: 0,
      excepciones: [{ fecha: "2026-06-16", horaInicio: "14:00", horaFin: "22:00" }], // 8h, jornada máx 7h
    };
    const resultado = CalculadoraPorTurnos.calcular(datos, REGLAS_JUL_2026, FESTIVOS_2026);

    // 7h ordinarias (14:00-21:00, ninguna nocturna) + 1h extra diurna (21:00-22:00... en realidad
    // la última hora 21:00-22:00 cae parcialmente en jornada nocturna desde 19:00, así que las
    // horas ordinarias 14:00-21:00 no tocan la noche, y la hora extra 21:00-22:00 sí es nocturna.
    const ordinarias = resultado.lineas.find((l) => l.concepto === "Horas ordinarias");
    const extraNocturna = resultado.lineas.find((l) => l.concepto === "Hora extra nocturna");
    expect(ordinarias?.horas).toBe(7);
    expect(extraNocturna?.horas).toBe(1);
  });
});
