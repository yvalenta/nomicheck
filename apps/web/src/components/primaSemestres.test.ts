import { describe, expect, it } from "vitest";
import {
  diasNoComputados,
  etiquetaSemestre,
  fechaMaximaPago,
  repartirPorSemestre,
} from "./primaSemestres.ts";
import type { SemestrePrima } from "../api.ts";

const primero: SemestrePrima = { desde: "2026-01-01", hasta: "2026-06-30", dias: 61, topado: false };
const segundo: SemestrePrima = { desde: "2026-07-01", hasta: "2026-12-31", dias: 62, topado: false };

describe("etiquetaSemestre y fechaMaximaPago", () => {
  it("distinguen el semestre por su fecha de inicio, no por su posición", () => {
    expect(etiquetaSemestre(primero)).toBe("Ene–Jun 2026");
    expect(etiquetaSemestre(segundo)).toBe("Jul–Dic 2026");
    expect(fechaMaximaPago(primero)).toBe("2026-06-30");
    expect(fechaMaximaPago(segundo)).toBe("2026-12-20");
  });

  it("un periodo que arranca en el segundo semestre no se lee como el primero", () => {
    // El caso que rompería una implementación por índice: una sola cuota, y es
    // la de diciembre.
    expect(fechaMaximaPago({ ...segundo, dias: 30 })).toBe("2026-12-20");
  });
});

describe("repartirPorSemestre", () => {
  it("reparte en proporción a los días", () => {
    const partes = repartirPorSemestre([primero, segundo], 683_333);
    // 61 y 62 días de 123: casi mitad y mitad, con el segundo un día arriba.
    expect(partes[0].valor).toBe(338_889);
    expect(partes[1].valor).toBe(344_444);
  });

  it("las partes suman exactamente el total, sin peso perdido en el redondeo", () => {
    for (const total of [683_333, 1, 999_999, 344_444]) {
      const partes = repartirPorSemestre([primero, segundo], total);
      expect(partes.reduce((s, p) => s + p.valor, 0)).toBe(total);
    }
  });

  it("no divide por cero si ningún semestre causó días", () => {
    expect(repartirPorSemestre([{ ...primero, dias: 0 }], 0)).toEqual([
      { semestre: { ...primero, dias: 0 }, valor: 0 },
    ]);
  });
});

describe("diasNoComputados", () => {
  it("es cero mientras el tope no muerda", () => {
    expect(diasNoComputados(123, 123)).toBe(0);
  });

  it("cuenta los días servidos que el tope de 180 dejó afuera", () => {
    // Un año calendario completo: 365 servidos, 360 que liquidan prima.
    expect(diasNoComputados(365, 360)).toBe(5);
  });
});
