import { describe, expect, it } from "vitest";
import { CalculadoraSalarioFijo } from "../calculadoraSalarioFijo.js";
import { CalculadoraServicios } from "../calculadoraServicios.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";

const PERIODO = { periodoDesde: "2026-07-01", periodoHasta: "2026-07-31" } as const;

describe("tipoContrato — aprendizaje SENA", () => {
  it("etapa lectiva: sin ninguna deducción de ley, sin auxilio, devengo 'Auxilio de sostenimiento'", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 900_000,
        recibeAuxilioTransporte: true,
        tipoContrato: "aprendizaje_sena_lectiva",
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    expect(r.lineas.some((l) => l.tipo === "deduccion")).toBe(false);
    expect(r.lineas.some((l) => l.concepto === "Auxilio de transporte")).toBe(false);
    expect(r.lineas[0].concepto).toBe("Auxilio de sostenimiento");
    expect(r.totalDeducciones).toBe(0);
  });

  it("etapa práctica: solo aporte de salud, sin pensión ni fondo de solidaridad", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 1_312_000, // ~75% SMLMV, valor típico de práctica
        recibeAuxilioTransporte: true,
        tipoContrato: "aprendizaje_sena_practica",
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    const deducciones = r.lineas.filter((l) => l.tipo === "deduccion");
    expect(deducciones).toHaveLength(1);
    expect(deducciones[0].concepto).toBe("Salud (aporte empleado)");
    expect(r.lineas.some((l) => l.concepto === "Auxilio de transporte")).toBe(false);
  });

  it("indefinido (u omitido): comportamiento idéntico al actual — regresión", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 2_000_000,
        recibeAuxilioTransporte: false,
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    expect(r.lineas[0].concepto).toBe("Salario básico");
    const deducciones = r.lineas.filter((l) => l.tipo === "deduccion");
    expect(deducciones.map((l) => l.concepto)).toEqual(["Salud (aporte empleado)", "Pensión (aporte empleado)"]);
  });
});

describe("CalculadoraServicios — prestación de servicios", () => {
  it("neto == honorarios: nada se resta (los aportes del independiente no se retienen)", () => {
    const r = CalculadoraServicios.calcular(
      { modo: "servicios", honorariosMensuales: 3_000_000, periodoDesde: "2026-07-01", periodoHasta: "2026-07-31" },
      REGLAS_JUL_2026,
      []
    );
    expect(r.totalDevengos).toBe(3_000_000);
    expect(r.totalDeducciones).toBe(0);
    expect(r.netoEsperado).toBe(3_000_000);
    expect(r.lineas.some((l) => l.concepto === "Auxilio de transporte")).toBe(false);
    expect(r.lineas.some((l) => l.concepto.startsWith("Recargo"))).toBe(false);
    expect(r.advertencias.some((a) => a.includes("1.200.000"))).toBe(true); // IBC 40% de 3.000.000
    expect(r.advertencias.some((a) => a.includes("prestaciones sociales"))).toBe(true);
  });

  it("periodo parcial (quincena) prorratea igual que salario fijo", () => {
    const r = CalculadoraServicios.calcular(
      { modo: "servicios", honorariosMensuales: 3_000_000, periodoDesde: "2026-07-01", periodoHasta: "2026-07-15" },
      REGLAS_JUL_2026,
      []
    );
    expect(r.totalDevengos).toBe(1_500_000);
  });

  it("honorarios <= 0 lanza error", () => {
    expect(() =>
      CalculadoraServicios.calcular(
        { modo: "servicios", honorariosMensuales: 0, periodoDesde: "2026-07-01", periodoHasta: "2026-07-31" },
        REGLAS_JUL_2026,
        []
      )
    ).toThrow();
  });
});

describe("advertencia — posible aprendiz mal clasificado como indefinido", () => {
  it("salario dentro de 50%-75% SMLMV en contrato indefinido: advierte", () => {
    const r = CalculadoraSalarioFijo.calcular(
      { modo: "salario-fijo", salarioBasicoMensual: 1_000_000, recibeAuxilioTransporte: false, conceptos: [], ...PERIODO },
      REGLAS_JUL_2026,
      []
    );
    expect(r.advertencias.some((a) => a.includes("aprendiz SENA"))).toBe(true);
  });

  it("borde inclusivo: exactamente 50% y 75% SMLMV advierten", () => {
    const smlmv = 1_750_905;
    const min = CalculadoraSalarioFijo.calcular(
      { modo: "salario-fijo", salarioBasicoMensual: smlmv * 0.5, recibeAuxilioTransporte: false, conceptos: [], ...PERIODO },
      REGLAS_JUL_2026,
      []
    );
    const max = CalculadoraSalarioFijo.calcular(
      { modo: "salario-fijo", salarioBasicoMensual: smlmv * 0.75, recibeAuxilioTransporte: false, conceptos: [], ...PERIODO },
      REGLAS_JUL_2026,
      []
    );
    expect(min.advertencias.some((a) => a.includes("aprendiz SENA"))).toBe(true);
    expect(max.advertencias.some((a) => a.includes("aprendiz SENA"))).toBe(true);
  });

  it("salario normal (2.000.000, fuera del rango): sin advertencia", () => {
    const r = CalculadoraSalarioFijo.calcular(
      { modo: "salario-fijo", salarioBasicoMensual: 2_000_000, recibeAuxilioTransporte: false, conceptos: [], ...PERIODO },
      REGLAS_JUL_2026,
      []
    );
    expect(r.advertencias.some((a) => a.includes("aprendiz SENA"))).toBe(false);
  });

  it("mismo salario bajo, pero ya declarado como aprendiz SENA: sin advertencia (no aplica a sí mismo)", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 1_000_000,
        recibeAuxilioTransporte: false,
        tipoContrato: "aprendizaje_sena_practica",
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    expect(r.advertencias.some((a) => a.includes("aprendiz SENA"))).toBe(false);
  });
});

describe("tipoContrato — término fijo / obra o labor / tiempo parcial", () => {
  it("fijo liquida idéntico a indefinido (mismas líneas) y advierte sobre preaviso/indemnización", () => {
    const indefinido = CalculadoraSalarioFijo.calcular(
      { modo: "salario-fijo", salarioBasicoMensual: 2_000_000, recibeAuxilioTransporte: false, conceptos: [], ...PERIODO },
      REGLAS_JUL_2026,
      []
    );
    const fijo = CalculadoraSalarioFijo.calcular(
      { modo: "salario-fijo", salarioBasicoMensual: 2_000_000, recibeAuxilioTransporte: false, tipoContrato: "fijo", conceptos: [], ...PERIODO },
      REGLAS_JUL_2026,
      []
    );
    expect(fijo.netoEsperado).toBe(indefinido.netoEsperado);
    expect(fijo.lineas.map((l) => l.concepto)).toEqual(indefinido.lineas.map((l) => l.concepto));
    expect(fijo.advertencias.some((a) => a.includes("preaviso"))).toBe(true);
    expect(indefinido.advertencias.some((a) => a.includes("preaviso"))).toBe(false);
  });

  it("obra_labor y tiempo_parcial también advierten, sin cambiar el neto", () => {
    for (const tipoContrato of ["obra_labor", "tiempo_parcial"] as const) {
      const r = CalculadoraSalarioFijo.calcular(
        { modo: "salario-fijo", salarioBasicoMensual: 2_000_000, recibeAuxilioTransporte: false, tipoContrato, conceptos: [], ...PERIODO },
        REGLAS_JUL_2026,
        []
      );
      expect(r.netoEsperado).toBeGreaterThan(0);
      expect(r.advertencias.some((a) => a.includes("preaviso"))).toBe(true);
    }
  });

  it("tiempo_parcial bajo un SMLMV advierte sobre el Piso de Protección Social (Decreto 1174 de 2020)", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 900_000,
        recibeAuxilioTransporte: false,
        tipoContrato: "tiempo_parcial",
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    expect(r.advertencias.some((a) => a.includes("Piso de Protección Social"))).toBe(true);
    // El IBC no se eleva en silencio: salud/pensión se calculan sobre el salario real.
    const salud = r.lineas.find((l) => l.concepto === "Salud (aporte empleado)");
    expect(salud?.valorCalculado).toBe(Math.round(900_000 * 0.04));
  });

  it("tiempo_parcial igual o sobre un SMLMV no advierte sobre el IBC", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 2_000_000,
        recibeAuxilioTransporte: false,
        tipoContrato: "tiempo_parcial",
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    expect(r.advertencias.some((a) => a.includes("Piso de Protección Social"))).toBe(false);
  });

  it("fijo/obra_labor/indefinido nunca advierten sobre el IBC de tiempo parcial, sin importar el salario", () => {
    for (const tipoContrato of ["fijo", "obra_labor", "indefinido"] as const) {
      const r = CalculadoraSalarioFijo.calcular(
        {
          modo: "salario-fijo",
          salarioBasicoMensual: 500_000,
          recibeAuxilioTransporte: false,
          tipoContrato,
          conceptos: [],
          ...PERIODO,
        },
        REGLAS_JUL_2026,
        []
      );
      expect(r.advertencias.some((a) => a.includes("Piso de Protección Social"))).toBe(false);
    }
  });
});

describe("advertencia — salario bajo el mínimo (tiempo completo)", () => {
  it("indefinido/fijo/obra_labor bajo un SMLMV advierten (CST art. 145)", () => {
    for (const tipoContrato of ["indefinido", "fijo", "obra_labor"] as const) {
      const r = CalculadoraSalarioFijo.calcular(
        {
          modo: "salario-fijo",
          salarioBasicoMensual: 1_500_000,
          recibeAuxilioTransporte: false,
          tipoContrato,
          conceptos: [],
          ...PERIODO,
        },
        REGLAS_JUL_2026,
        []
      );
      expect(r.advertencias.some((a) => a.includes("salario mínimo legal mensual vigente"))).toBe(true);
    }
  });

  it("tiempo_parcial bajo un SMLMV NO dispara esta advertencia (tiene la suya propia de IBC)", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 900_000,
        recibeAuxilioTransporte: false,
        tipoContrato: "tiempo_parcial",
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    expect(r.advertencias.some((a) => a.includes("salario mínimo legal mensual vigente"))).toBe(false);
  });

  it("aprendizaje SENA bajo un SMLMV tampoco dispara esta advertencia (su pago es legalmente menor)", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 900_000,
        recibeAuxilioTransporte: false,
        tipoContrato: "aprendizaje_sena_practica",
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    expect(r.advertencias.some((a) => a.includes("salario mínimo legal mensual vigente"))).toBe(false);
  });

  it("salario igual o sobre un SMLMV no advierte", () => {
    const r = CalculadoraSalarioFijo.calcular(
      {
        modo: "salario-fijo",
        salarioBasicoMensual: 1_750_905,
        recibeAuxilioTransporte: false,
        tipoContrato: "indefinido",
        conceptos: [],
        ...PERIODO,
      },
      REGLAS_JUL_2026,
      []
    );
    expect(r.advertencias.some((a) => a.includes("salario mínimo legal mensual vigente"))).toBe(false);
  });
});
