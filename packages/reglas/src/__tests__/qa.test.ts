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

  it("issues del motor (horas extra) llegan tal cual al ResultadoQA", () => {
    // Los issues los emite el motor durante el cálculo (SDD §15 pilar 2) y
    // el QA los pasa por sin re-detectarlos.
    const issuesMotor = [
      {
        codigo: "HORAS_EXTRA_EXCEDIDAS_DIA" as const,
        severidad: "error" as const,
        mensaje: "día excedido",
        referenciaLegal: "D.L. 13 de 1967, art. 1",
        detalles: { valorCalculado: 3, valorLimite: 2, contexto: "2026-07-06" },
      },
      {
        codigo: "HORAS_EXTRA_EXCEDIDAS_SEMANA" as const,
        severidad: "error" as const,
        mensaje: "semana excedida",
        referenciaLegal: "Ley 6 de 1981",
        detalles: { valorCalculado: 15, valorLimite: 12, contexto: "2026-07-06" },
      },
    ];
    const r = evaluarQA({ ...baseLegal(), issuesMotor }, REGLAS_JUL_2026);
    expect(r.estado).toBe("rechazada");
    expect(r.issues.filter((i) => i.codigo.startsWith("HORAS_EXTRA")).length).toBe(2);
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

  it("issue de advertencia (tope 149 activado por el motor) → con_advertencias, score 95", () => {
    const issuesMotor = [
      {
        codigo: "TOPE_DEDUCCIONES_SUPERADO" as const,
        severidad: "advertencia" as const,
        mensaje: "recortado",
        referenciaLegal: "CST art. 149",
        detalles: { valorCalculado: 100, valorLimite: 50 },
      },
    ];
    const r = evaluarQA({ ...baseLegal(), issuesMotor }, REGLAS_JUL_2026);
    expect(r.estado).toBe("con_advertencias");
    expect(r.score).toBe(95);
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

  it("choque novedades vs tiempo (incapacidad + horas trabajadas mismo día) → rechazada con INCOMPATIBILIDAD_NOVEDAD_TIEMPO", () => {
    // Guardarraíl defensivo: NovedadDia solo debe tener un estado por fecha.
    // Aquí simulamos que el input llegó con 3 días de incapacidad (trabajo:false,
    // remunerada:false) Y turnos trabajados en las mismas fechas — la matriz
    // de turnos quedó inconsistente y el motor no puede decidir cuál gana.
    const dias = ["2026-07-10", "2026-07-11", "2026-07-12"];
    const novedades = [
      ...dias.map((f) => ({ fecha: f, trabajo: false, remunerada: false })),
      ...dias.map((f) => ({ fecha: f, trabajo: true })),
    ];
    const r = evaluarQA({ ...baseLegal(), novedades }, REGLAS_JUL_2026);
    expect(r.estado).toBe("rechazada");
    const choques = r.issues.filter((i) => i.codigo === "INCOMPATIBILIDAD_NOVEDAD_TIEMPO");
    expect(choques).toHaveLength(3);
    expect(choques.map((i) => i.detalles.contexto).sort()).toEqual(dias);
  });

  it("novedades sin choque (una por fecha) → sin issue de incompatibilidad", () => {
    const novedades = [
      { fecha: "2026-07-10", trabajo: false, remunerada: false },
      { fecha: "2026-07-11", trabajo: true },
    ];
    const r = evaluarQA({ ...baseLegal(), novedades }, REGLAS_JUL_2026);
    expect(r.issues.some((i) => i.codigo === "INCOMPATIBILIDAD_NOVEDAD_TIEMPO")).toBe(false);
  });

  it("decimales en totales → con_advertencias con DECIMALES_DETECTADOS_PILA", () => {
    // Los operadores PILA (SOI, Arus) rechazan planillas con centavos. La
    // regla es defensiva: el motor ya redondea con redondearPeso en cada
    // línea, pero si un total llega sucio (bug futuro, dato exógeno), lo
    // visibilizamos como advertencia.
    const r = evaluarQA(
      { ...baseLegal(), totalDeducciones: 160_000.5, netoPagado: 1_839_999.5 },
      REGLAS_JUL_2026
    );
    expect(r.estado).toBe("con_advertencias");
    const decimales = r.issues.filter((i) => i.codigo === "DECIMALES_DETECTADOS_PILA");
    expect(decimales).toHaveLength(1);
    expect(decimales[0].severidad).toBe("advertencia");
    expect(decimales[0].mensaje).toContain("totalDeducciones");
    expect(decimales[0].mensaje).toContain("netoPagado");
  });

  it("todos los totales enteros → sin issue de decimales", () => {
    const r = evaluarQA(baseLegal(), REGLAS_JUL_2026);
    expect(r.issues.some((i) => i.codigo === "DECIMALES_DETECTADOS_PILA")).toBe(false);
  });
});
