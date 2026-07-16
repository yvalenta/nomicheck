import { describe, expect, it } from "vitest";
import { CalculadoraPorTurnos } from "../calculadoraTurnos.js";
import { HORARIO_BASE_DEFAULT } from "../constantes.js";
import type { DatosNominaTurnos } from "../types.js";
import { FESTIVOS_2026, REGLAS_JUL_2026 } from "./fixtures.js";

function datosBase(extra: Partial<DatosNominaTurnos> = {}): DatosNominaTurnos {
  return {
    modo: "turnos",
    salarioBasicoMensual: 1750905,
    recibeAuxilioTransporte: true,
    periodoDesde: "2026-06-16",
    periodoHasta: "2026-06-30",
    horarioBase: HORARIO_BASE_DEFAULT,
    novedades: [],
    ...extra,
  };
}

describe("CalculadoraPorTurnos — fixture Restaurante Resplandor (16–30 jun 2026)", () => {
  // Aritmética esperada, calculada a mano:
  //   base       = 1.750.905/30 × 15 días       = 875.452,50
  //   valorHora  = 1.750.905/220                =   7.958,66
  //   dominical  = 12 h (dom 21 y 28, 6 h c/u) × 7.958,66 × 0,80 = 76.403,13
  //   auxilio    = 249.095/30 × 15              = 124.547,50
  //   IBC        = 875.452,50 + 76.403,13       = 951.855,63
  //   salud/pensión = IBC × 4 %                 =  38.074,23 c/u
  //   neto       = 1.076.403,13 − 76.148,46     = 1.000.254,67
  // El lunes 29-jun es festivo (San Pedro y San Pablo) → descanso por defecto.
  const resultado = CalculadoraPorTurnos.calcular(datosBase(), REGLAS_JUL_2026, FESTIVOS_2026);

  it("paga el salario básico proporcional a los 15 días del periodo", () => {
    const base = resultado.lineas.find((l) => l.concepto.startsWith("Salario básico"));
    expect(base?.valorCalculado).toBeCloseTo(875452.5, 1);
  });

  it("genera solo el recargo dominical (12 h al 80%), sin pagar la hora base de nuevo", () => {
    const recargo = resultado.lineas.find((l) => l.concepto.startsWith("Recargo dominical"));
    expect(recargo?.horas).toBe(12);
    expect(recargo?.recargoPct).toBe(0.8);
    expect(recargo?.valorCalculado).toBeCloseTo(76403.13, 1);
    expect(resultado.lineas.some((l) => l.concepto.startsWith("Horas dominicales"))).toBe(false);
  });

  it("no genera recargo nocturno ni horas extra con el horario base", () => {
    const conceptos = resultado.lineas.map((l) => l.concepto);
    expect(conceptos.some((c) => c.startsWith("Recargo nocturno"))).toBe(false);
    expect(conceptos.some((c) => c.startsWith("Hora extra"))).toBe(false);
  });

  it("deduce salud y pensión automáticamente sobre el IBC (sin auxilio)", () => {
    const salud = resultado.lineas.find((l) => l.concepto.startsWith("Salud"));
    const pension = resultado.lineas.find((l) => l.concepto.startsWith("Pensión"));
    expect(salud?.valorCalculado).toBeCloseTo(38074.23, 1);
    expect(pension?.valorCalculado).toBeCloseTo(38074.23, 1);
    expect(salud?.base).toBeCloseTo(951855.63, 1); // IBC excluye auxilio
  });

  it("incluye auxilio de transporte proporcional", () => {
    const aux = resultado.lineas.find((l) => l.concepto === "Auxilio de transporte");
    expect(aux?.valorCalculado).toBeCloseTo(124547.5, 1);
  });

  it("neto esperado = devengos − deducciones (regresión completa)", () => {
    expect(resultado.totalDevengos).toBeCloseTo(1076403.13, 1);
    expect(resultado.totalDeducciones).toBeCloseTo(76148.46, 1);
    expect(resultado.netoEsperado).toBeCloseTo(1000254.67, 1);
  });

  it("no genera advertencias (solo 2 domingos trabajados)", () => {
    expect(resultado.advertencias).toHaveLength(0);
  });
});

describe("CalculadoraPorTurnos — novedades", () => {
  it("una novedad 'no trabajé' el domingo reduce el recargo dominical a 6 h", () => {
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ novedades: [{ fecha: "2026-06-21", trabajo: false }] }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const recargo = resultado.lineas.find((l) => l.concepto.startsWith("Recargo dominical"));
    expect(recargo?.horas).toBe(6);
  });

  it("una novedad con turno largo genera recargo nocturno y hora extra nocturna", () => {
    // Martes 16-jun 14:00–22:00 (8 h): ordinarias 14:00–21:00 (2 h nocturnas
    // desde las 19:00) + 1 h extra 21:00–22:00 (nocturna).
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [{ fecha: "2026-06-16", trabajo: true, horaInicio: "14:00", horaFin: "22:00" }],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const nocturno = resultado.lineas.find(
      (l) => l.concepto.startsWith("Recargo nocturno") && !l.concepto.includes("dominical")
    );
    const extraNocturna = resultado.lineas.find((l) => l.concepto.startsWith("Hora extra nocturna"));
    expect(nocturno?.horas).toBe(2);
    expect(nocturno?.recargoPct).toBe(0.35);
    expect(extraNocturna?.horas).toBe(1);
    expect(extraNocturna?.recargoPct).toBe(0.75);
  });

  it("trabajar un festivo (por novedad) genera recargo dominical/festivo", () => {
    // Lunes 29-jun es festivo — por defecto descanso; la novedad lo activa.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [{ fecha: "2026-06-29", trabajo: true, horaInicio: "10:00", horaFin: "16:00" }],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const recargo = resultado.lineas.find((l) => l.concepto.startsWith("Recargo dominical"));
    expect(recargo?.horas).toBe(18); // 12 h de domingos + 6 h del festivo
  });

  it("lanza error si la novedad dice trabajo=true sin horas", () => {
    expect(() =>
      CalculadoraPorTurnos.calcular(
        datosBase({ novedades: [{ fecha: "2026-06-16", trabajo: true }] }),
        REGLAS_JUL_2026,
        FESTIVOS_2026
      )
    ).toThrow();
  });
});

describe("CalculadoraPorTurnos — descanso compensatorio", () => {
  it("advierte cuando se trabajan 3 o más domingos en el periodo", () => {
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ periodoDesde: "2026-06-01", periodoHasta: "2026-06-30" }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    // Junio 2026 tiene domingos 7, 14, 21 y 28 — los 4 trabajados por defecto.
    expect(resultado.advertencias.some((a) => /compensatorio/.test(a))).toBe(true);
  });
});

describe("CalculadoraPorTurnos — cortes normativos", () => {
  it("separa el recargo dominical en tramos 80%/90% cuando el periodo cruza el 1-jul-2026", () => {
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ periodoDesde: "2026-06-28", periodoHasta: "2026-07-05" }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const recargos = resultado.lineas
      .filter((l) => l.concepto.startsWith("Recargo dominical"))
      .map((l) => l.recargoPct)
      .sort();
    expect(recargos).toEqual([0.8, 0.9]);
  });

  it("usa el divisor 210 (42 h/sem) para recargos posteriores al 15-jul-2026", () => {
    // Periodo 16–31 jul: domingos 19 y 26 (12 h); el festivo 20-jul es
    // descanso por defecto. Recargo = 12 h × (salario/210) × 0,90.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ periodoDesde: "2026-07-16", periodoHasta: "2026-07-31" }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const recargo = resultado.lineas.find((l) => l.concepto.startsWith("Recargo dominical"));
    const valorHora210 = 1750905 / 210;
    expect(recargo?.horas).toBe(12);
    expect(recargo?.valorCalculado).toBeCloseTo(12 * valorHora210 * 0.9, 1);
  });
});

describe("CalculadoraPorTurnos — validaciones de entrada", () => {
  it("rechaza un horarioBase que no tenga 7 posiciones", () => {
    expect(() =>
      CalculadoraPorTurnos.calcular(
        datosBase({ horarioBase: [null, null] }),
        REGLAS_JUL_2026,
        FESTIVOS_2026
      )
    ).toThrow(/7 posiciones/);
  });
});
