import { describe, expect, it } from "vitest";
import { esHoraExtra, hayDobleLineaDominicalNocturna, totalizar, valorPorHora } from "./recargosLineas.ts";
import type { LineaRecargo } from "../api.ts";

const linea = (codigo: string, horas: number, valor: number): LineaRecargo => ({
  codigo,
  concepto: codigo,
  horas,
  valorCalculado: valor,
});

describe("esHoraExtra", () => {
  it("separa por código, no por el texto del concepto", () => {
    expect(esHoraExtra("HORA_EXTRA_DOMINICAL_NOCTURNA")).toBe(true);
    expect(esHoraExtra("RECARGO_NOCTURNO")).toBe(false);
    // El concepto lleva sufijos de tramo; el código no cambia con ellos.
    expect(esHoraExtra("RECARGO_NOCTURNO_DOMINICAL")).toBe(false);
  });
});

describe("valorPorHora", () => {
  it("sale de la línea, no de recalcular el porcentaje", () => {
    expect(valorPorHora(linea("HORA_EXTRA_DIURNA", 34, 354_350))).toBeCloseTo(10_422, 0);
  });

  it("no divide por cero cuando la línea no trae horas", () => {
    expect(valorPorHora({ codigo: "X", concepto: "X", valorCalculado: 1000 })).toBeNull();
  });
});

describe("totalizar", () => {
  it("suma aparte recargos y extras", () => {
    const t = totalizar([
      linea("RECARGO_NOCTURNO", 34, 99_218),
      linea("HORA_EXTRA_DIURNA", 34, 354_350),
    ]);
    expect(t.recargos).toBe(99_218);
    expect(t.extras).toBe(354_350);
    expect(t.horasExtras).toBe(34);
  });

  it("no suma dos veces las horas nocturnas dominicales, que figuran en dos líneas", () => {
    // 8 h dominicales, de las cuales 8 son nocturnas: el motor emite recargo
    // dominical (8 h) y recargo nocturno dominical (8 h). Son 8 horas, no 16.
    const lineas = [
      linea("RECARGO_DOMINICAL", 8, 100_000),
      linea("RECARGO_NOCTURNO_DOMINICAL", 8, 50_000),
    ];
    expect(totalizar(lineas).horasRecargos).toBe(8);
    expect(totalizar(lineas).recargos).toBe(150_000);
    expect(hayDobleLineaDominicalNocturna(lineas)).toBe(true);
  });
});
