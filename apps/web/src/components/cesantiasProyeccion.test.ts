import { describe, expect, it } from "vitest";
import { DIAS_ANIO_COMERCIAL, proyectar, serieHastaElAnio } from "./cesantiasProyeccion.ts";

// El caso real: $1.750.905 + $249.095 de auxilio = base $2.000.000, 31 días.
const CORTE = { dias: 31, cesantias: 172_222, intereses: 1_780 };

describe("proyectar", () => {
  it("al año completo, las cesantías son un mes de la base", () => {
    const anio = proyectar(CORTE, DIAS_ANIO_COMERCIAL);
    // 172.222 × 360/31 ≈ 2.000.000, que es la base mensual.
    expect(anio.cesantias).toBeCloseTo(2_000_000, -4);
  });

  it("los intereses crecen con el cuadrado de los días, no en línea recta", () => {
    const anio = proyectar(CORTE, DIAS_ANIO_COMERCIAL);
    // 12% de un mes de salario al completar el año.
    expect(anio.intereses).toBeCloseTo(240_000, -4);
    // Al doble de días, cuatro veces los intereses — no el doble.
    expect(proyectar(CORTE, 62).intereses).toBeCloseTo(CORTE.intereses * 4, -1);
  });

  it("no divide por cero si el corte no acumuló días", () => {
    expect(proyectar({ dias: 0, cesantias: 0, intereses: 0 }, 100)).toEqual({
      dias: 100,
      cesantias: 0,
      intereses: 0,
    });
  });
});

describe("serieHastaElAnio", () => {
  it("incluye el corte real aunque caiga entre dos pasos", () => {
    const serie = serieHastaElAnio(CORTE);
    const punto = serie.find((p) => p.dias === 31);
    expect(punto).toBeTruthy();
    expect(punto!.cesantias).toBe(CORTE.cesantias);
    expect(serie.map((p) => p.dias)).toEqual([...serie.map((p) => p.dias)].sort((a, b) => a - b));
  });

  it("extiende el horizonte cuando el corte ya pasó el año", () => {
    const largo = { dias: 500, cesantias: 2_777_778, intereses: 46_296 };
    expect(serieHastaElAnio(largo).at(-1)!.dias).toBe(500);
  });
});
