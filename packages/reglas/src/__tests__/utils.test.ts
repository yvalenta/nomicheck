import { describe, expect, it } from "vitest";
import {
  diaSemana,
  diasComerciales,
  esDomingo,
  esFechaValida,
  crearResolutorReglas,
  finDePeriodoMensual,
  formatFechaLegible,
  formatRangoFechas,
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

describe("crearResolutorReglas — paridad con reglaEn", () => {
  it("devuelve lo mismo que reglaEn para todas las claves y fechas del fixture", () => {
    const r = crearResolutorReglas(REGLAS_JUL_2026);
    const claves = [...new Set(REGLAS_JUL_2026.map((x) => x.clave))];
    for (const clave of claves) {
      for (const fecha of ["2026-06-30", "2026-07-01", "2026-07-14", "2026-07-15", "2026-12-31"]) {
        expect(r.en(clave, fecha)).toBe(reglaEn(REGLAS_JUL_2026, clave, fecha));
      }
    }
  });

  it("ante solapamiento gana la regla con vigenteDesde mayor (misma semántica que reglaEn)", () => {
    const solapadas = [
      { clave: "x", valor: 1, vigenteDesde: "2026-01-01" },
      { clave: "x", valor: 2, vigenteDesde: "2026-06-01" }, // solapa: sin vigenteHasta ambas
    ];
    expect(crearResolutorReglas(solapadas).en("x", "2026-07-01")).toBe(2);
    expect(reglaEn(solapadas, "x", "2026-07-01")).toBe(2);
  });

  it("cachea la consulta repetida sin alterar el resultado", () => {
    const r = crearResolutorReglas(REGLAS_JUL_2026);
    const a = r.en("recargo_dominical", "2026-06-30");
    const b = r.en("recargo_dominical", "2026-06-30");
    expect(a).toBe(b);
    expect(a).toBe(0.8);
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

describe("diasComerciales", () => {
  it("la segunda quincena son 15 días tenga el mes 28, 29, 30 o 31", () => {
    expect(diasComerciales("2026-01-16", "2026-01-31")).toBe(15); // 31 días
    expect(diasComerciales("2026-02-16", "2026-02-28")).toBe(15); // 28 días
    expect(diasComerciales("2028-02-16", "2028-02-29")).toBe(15); // bisiesto
    expect(diasComerciales("2026-06-16", "2026-06-30")).toBe(15); // 30 días
    expect(diasComerciales("2026-07-16", "2026-07-31")).toBe(15); // el caso real
  });

  it("la primera quincena siempre son 15 días", () => {
    for (const mes of ["01", "02", "06", "07"]) {
      expect(diasComerciales(`2026-${mes}-01`, `2026-${mes}-15`)).toBe(15);
    }
  });

  it("el mes completo son 30 días en cualquier mes — la invariante que importa", () => {
    // Es la propiedad que el bug rompía: quincena 1 + quincena 2 debe dar
    // exactamente el mes, o el salario mensual pactado no cuadra.
    const finDeMes: Record<string, string> = {
      "01": "31", "02": "28", "03": "31", "04": "30", "05": "31", "06": "30",
      "07": "31", "08": "31", "09": "30", "10": "31", "11": "30", "12": "31",
    };
    for (const [mes, ultimo] of Object.entries(finDeMes)) {
      const q1 = diasComerciales(`2026-${mes}-01`, `2026-${mes}-15`);
      const q2 = diasComerciales(`2026-${mes}-16`, `2026-${mes}-${ultimo}`);
      expect(q1 + q2, `mes ${mes}`).toBe(30);
      expect(diasComerciales(`2026-${mes}-01`, `2026-${mes}-${ultimo}`), `mes ${mes}`).toBe(30);
    }
  });

  it("un periodo parcial cuenta sus días reales, sin inventar el 31", () => {
    expect(diasComerciales("2026-06-17", "2026-06-30")).toBe(14); // ingreso tardío
    expect(diasComerciales("2026-07-20", "2026-07-31")).toBe(11); // 20…30 comercial
    expect(diasComerciales("2026-07-16", "2026-07-16")).toBe(1);
  });

  it("un periodo que cruza de mes suma los días comerciales de cada uno", () => {
    expect(diasComerciales("2026-07-31", "2026-08-15")).toBe(16);
    expect(diasComerciales("2026-01-16", "2026-02-15")).toBe(30);
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

describe("formatFechaLegible", () => {
  it("formatea con nombre de mes completo", () => {
    expect(formatFechaLegible("2026-06-01")).toBe("1 junio 2026");
    expect(formatFechaLegible("2026-12-31")).toBe("31 diciembre 2026");
  });
});

describe("formatRangoFechas", () => {
  it("mismo mes y año: no repite el mes", () => {
    expect(formatRangoFechas("2026-06-01", "2026-06-15")).toBe("1 — 15 junio 2026");
  });
  it("cruza de mes, mismo año: no repite el año", () => {
    expect(formatRangoFechas("2026-06-28", "2026-07-05")).toBe("28 junio — 5 julio 2026");
  });
  it("cruza de año: fecha completa en ambos extremos", () => {
    expect(formatRangoFechas("2026-12-28", "2027-01-05")).toBe("28 diciembre 2026 — 5 enero 2027");
  });
});

