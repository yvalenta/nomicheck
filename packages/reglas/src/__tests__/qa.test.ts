import { describe, expect, it } from "vitest";
import { evaluarQA, type DatosQA } from "../qa/index.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";

const SMLMV = 1_750_905;
const FECHA = "2026-07-01";

// Base: liquidación mensual limpia de un salario de $2.000.000 — devengado
// = salario, deducciones = 4% salud + 4% pensión = $160.000, neto = $1.840.000.
// IBC = $2.000.000 (dentro de [1, 25] SMLMV).
function baseLegal(): DatosQA {
  return {
    fecha: FECHA,
    periodoDesde: "2026-07-01",
    periodoHasta: "2026-07-30",
    totalDevengado: 2_000_000,
    totalDeducciones: 160_000,
    netoPagado: 1_840_000,
    ibcPeriodo: 2_000_000,
  };
}

describe("evaluarQA", () => {
  it("liquidación legal estándar → aprobada, score 100, sin issues", () => {
    const r = evaluarQA(baseLegal(), REGLAS_JUL_2026);
    expect(r.estado).toBe("aprobada");
    expect(r.score).toBe(100);
    expect(r.issues).toEqual([]);
  });

  it("horas extra semanales excedidas → rechazada con código y referencia legal correctos", () => {
    const r = evaluarQA(
      {
        ...baseLegal(),
        excesosHorasExtraDia: [{ fecha: "2026-07-06", horas: 3 }],
        excesosHorasExtraSemana: [{ semana: "2026-07-06", horas: 15 }],
      },
      REGLAS_JUL_2026
    );
    expect(r.estado).toBe("rechazada");
    const semanal = r.issues.find((i) => i.codigo === "HORAS_EXTRA_EXCEDIDAS_SEMANA");
    expect(semanal?.referenciaLegal).toBe("Ley 6 de 1981");
    expect(semanal?.detalles.valorLimite).toBe(12);
    const diario = r.issues.find((i) => i.codigo === "HORAS_EXTRA_EXCEDIDAS_DIA");
    expect(diario?.referenciaLegal).toBe("D.L. 13 de 1967, art. 1");
    expect(diario?.detalles.valorLimite).toBe(2);
  });

  it("deducciones sobre el 50% y neto bajo el SMLMV → rechazada con ambos issues", () => {
    // Devengado 2M, deducciones 1.5M (75%), neto 500k (< SMLMV 1.750.905).
    const r = evaluarQA(
      {
        ...baseLegal(),
        totalDeducciones: 1_500_000,
        netoPagado: 500_000,
      },
      REGLAS_JUL_2026
    );
    expect(r.estado).toBe("rechazada");
    const codigos = r.issues.map((i) => i.codigo);
    expect(codigos).toContain("TOPE_DEDUCCIONES_SUPERADO");
    expect(codigos).toContain("NETO_BAJO_MINIMO");
  });

  it("IBC sobre el techo de 25 SMLMV → error IBC_FUERA_DE_RANGO", () => {
    const r = evaluarQA(
      { ...baseLegal(), ibcPeriodo: SMLMV * 30 },
      REGLAS_JUL_2026
    );
    expect(r.estado).toBe("rechazada");
    const ibc = r.issues.find((i) => i.codigo === "IBC_FUERA_DE_RANGO");
    expect(ibc?.detalles.valorLimite).toBe(SMLMV * 25);
  });

  it("tope de deducciones activado sin superarlo → advertencia (no error), score 95", () => {
    const r = evaluarQA(
      { ...baseLegal(), toperoDeduccionesActivado: true },
      REGLAS_JUL_2026
    );
    expect(r.estado).toBe("con_advertencias");
    expect(r.score).toBe(95);
    expect(r.issues[0].severidad).toBe("advertencia");
    expect(r.issues[0].codigo).toBe("TOPE_DEDUCCIONES_SUPERADO");
  });

  it("piso y techo de IBC se prorratean por periodo (quincena → mitad)", () => {
    // IBC de $900k en una quincena: piso prorrateado = SMLMV × 15/30 = 875.452,
    // debe pasar. Si NO se prorrateara, quedaría bajo el SMLMV mensual y daría error.
    const r = evaluarQA(
      {
        ...baseLegal(),
        periodoDesde: "2026-07-01",
        periodoHasta: "2026-07-15",
        totalDevengado: 1_000_000,
        totalDeducciones: 80_000,
        netoPagado: 920_000,
        ibcPeriodo: 900_000,
      },
      REGLAS_JUL_2026
    );
    expect(r.issues.some((i) => i.codigo === "IBC_FUERA_DE_RANGO")).toBe(false);
    expect(r.issues.some((i) => i.codigo === "NETO_BAJO_MINIMO")).toBe(false);
  });
});
