import { describe, expect, it } from "vitest";
import { calcularIndemnizacion } from "../indemnizacion.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";

describe("calcularIndemnizacion — con justa causa", () => {
  it("nunca hay indemnización, sin importar el tipo de contrato", () => {
    const r = calcularIndemnizacion(
      {
        tipoContrato: "fijo",
        salarioMensual: 2_000_000,
        fechaTerminacion: "2026-07-01",
        fechaVencimientoPactada: "2026-12-31",
        conJustaCausa: true,
      },
      REGLAS_JUL_2026
    );
    expect(r.valor).toBe(0);
    expect(r.diasIndemnizacion).toBe(0);
  });
});

describe("calcularIndemnizacion — período de prueba (CST art. 80)", () => {
  it("sin indemnización aunque no haya justa causa alegada, en contrato indefinido", () => {
    const r = calcularIndemnizacion(
      {
        tipoContrato: "indefinido",
        salarioMensual: 2_000_000,
        fechaIngreso: "2026-07-01",
        fechaTerminacion: "2026-07-30",
        conJustaCausa: false,
        enPeriodoPrueba: true,
      },
      REGLAS_JUL_2026
    );
    expect(r.valor).toBe(0);
    expect(r.diasIndemnizacion).toBe(0);
    expect(r.ley).toBe("CST art. 80");
  });

  it("sin indemnización en contrato a término fijo", () => {
    const r = calcularIndemnizacion(
      {
        tipoContrato: "fijo",
        salarioMensual: 2_000_000,
        fechaTerminacion: "2026-07-30",
        fechaVencimientoPactada: "2026-12-31",
        conJustaCausa: false,
        enPeriodoPrueba: true,
      },
      REGLAS_JUL_2026
    );
    expect(r.valor).toBe(0);
    expect(r.diasIndemnizacion).toBe(0);
  });

  it("tiene prioridad sobre conJustaCausa en la explicación (base legal distinta, art. 80 no art. 62)", () => {
    const r = calcularIndemnizacion(
      {
        tipoContrato: "indefinido",
        salarioMensual: 2_000_000,
        fechaIngreso: "2026-07-01",
        fechaTerminacion: "2026-07-30",
        conJustaCausa: true,
        enPeriodoPrueba: true,
      },
      REGLAS_JUL_2026
    );
    expect(r.ley).toBe("CST art. 80");
  });
});

describe("calcularIndemnizacion — término fijo / obra o labor (CST art. 64 num. 1)", () => {
  it("indemniza los días que faltan hasta el vencimiento pactado", () => {
    const r = calcularIndemnizacion(
      {
        tipoContrato: "fijo",
        salarioMensual: 3_000_000,
        fechaTerminacion: "2026-07-01",
        fechaVencimientoPactada: "2026-08-01",
        conJustaCausa: false,
      },
      REGLAS_JUL_2026
    );
    expect(r.diasIndemnizacion).toBe(31);
    expect(r.valor).toBe(Math.round((3_000_000 / 30) * 31));
  });

  it("obra_labor usa la misma fórmula que fijo", () => {
    const r = calcularIndemnizacion(
      {
        tipoContrato: "obra_labor",
        salarioMensual: 3_000_000,
        fechaTerminacion: "2026-07-01",
        fechaVencimientoPactada: "2026-08-01",
        conJustaCausa: false,
      },
      REGLAS_JUL_2026
    );
    expect(r.diasIndemnizacion).toBe(31);
  });

  it("vencimiento pactado anterior o igual a la terminación: lanza error", () => {
    expect(() =>
      calcularIndemnizacion(
        {
          tipoContrato: "fijo",
          salarioMensual: 3_000_000,
          fechaTerminacion: "2026-08-01",
          fechaVencimientoPactada: "2026-07-01",
          conJustaCausa: false,
        },
        REGLAS_JUL_2026
      )
    ).toThrow();
  });
});

describe("calcularIndemnizacion — indefinido / tiempo parcial (CST art. 64, Ley 50 de 1990 art. 6)", () => {
  it("exactamente 1 año servido, salario bajo el umbral: 30 días", () => {
    const r = calcularIndemnizacion(
      {
        tipoContrato: "indefinido",
        salarioMensual: 2_000_000,
        fechaIngreso: "2026-01-01",
        fechaTerminacion: "2026-12-27", // 360 días comerciales exactos
        conJustaCausa: false,
      },
      REGLAS_JUL_2026
    );
    expect(r.diasIndemnizacion).toBe(30);
    expect(r.valor).toBe(2_000_000);
  });

  it("más de 1 año: días adicionales proporcionales, sube el valor", () => {
    const unAnio = calcularIndemnizacion(
      {
        tipoContrato: "indefinido",
        salarioMensual: 2_000_000,
        fechaIngreso: "2026-01-01",
        fechaTerminacion: "2026-12-27",
        conJustaCausa: false,
      },
      REGLAS_JUL_2026
    );
    const masDeUnAnio = calcularIndemnizacion(
      {
        tipoContrato: "indefinido",
        salarioMensual: 2_000_000,
        fechaIngreso: "2026-01-01",
        fechaTerminacion: "2026-12-28", // 361 días
        conJustaCausa: false,
      },
      REGLAS_JUL_2026
    );
    expect(masDeUnAnio.diasIndemnizacion).toBeGreaterThan(unAnio.diasIndemnizacion);
    expect(masDeUnAnio.valor).toBeGreaterThan(unAnio.valor);
  });

  it("salario igual o sobre 10 SMLMV usa la escala reducida (20 + 15 días/año)", () => {
    const r = calcularIndemnizacion(
      {
        tipoContrato: "indefinido",
        salarioMensual: 18_000_000, // > 10 SMLMV (1.750.905 * 10 = 17.509.050)
        fechaIngreso: "2026-01-01",
        fechaTerminacion: "2026-12-27",
        conJustaCausa: false,
      },
      REGLAS_JUL_2026
    );
    expect(r.diasIndemnizacion).toBe(20);
    expect(r.valor).toBe(12_000_000);
  });

  it("tiempo_parcial usa la misma fórmula que indefinido", () => {
    const r = calcularIndemnizacion(
      {
        tipoContrato: "tiempo_parcial",
        salarioMensual: 2_000_000,
        fechaIngreso: "2026-01-01",
        fechaTerminacion: "2026-12-27",
        conJustaCausa: false,
      },
      REGLAS_JUL_2026
    );
    expect(r.diasIndemnizacion).toBe(30);
  });

  it("fecha de terminación anterior o igual al ingreso: lanza error", () => {
    expect(() =>
      calcularIndemnizacion(
        {
          tipoContrato: "indefinido",
          salarioMensual: 2_000_000,
          fechaIngreso: "2026-07-01",
          fechaTerminacion: "2026-01-01",
          conJustaCausa: false,
        },
        REGLAS_JUL_2026
      )
    ).toThrow();
  });

  it("salario <= 0 lanza error", () => {
    expect(() =>
      calcularIndemnizacion(
        {
          tipoContrato: "indefinido",
          salarioMensual: 0,
          fechaIngreso: "2026-01-01",
          fechaTerminacion: "2026-12-27",
          conJustaCausa: false,
        },
        REGLAS_JUL_2026
      )
    ).toThrow();
  });
});

// El desglose es lo que la interfaz grafica. Si deja de coincidir con el total
// o con la prosa, el gráfico miente sin que ningún otro test se entere: el
// valor seguiría siendo correcto y el dibujo no.
describe("calcularIndemnizacion — desglose estructurado", () => {
  it("en indefinido, los días del desglose reconstruyen el total", () => {
    const r = calcularIndemnizacion(
      {
        tipoContrato: "indefinido",
        salarioMensual: 3_000_000,
        fechaIngreso: "2023-07-01",
        fechaTerminacion: "2026-07-01",
        conJustaCausa: false,
      },
      REGLAS_JUL_2026
    );
    if (r.desglose.base !== "indefinido") throw new Error("se esperaba desglose indefinido");
    const d = r.desglose;
    expect(d.diasPrimerAnio + d.diasAdicionales).toBeCloseTo(r.diasIndemnizacion, 2);
    // `salarioDiario` va redondeado al peso y los días a dos decimales —los dos
    // son redondeos de presentación—, así que el producto no da el total exacto.
    // Lo que se exige es que lo reconstruya: por eso el gráfico puede repartir
    // el total entre los días, y por eso lo muestra con "≈".
    expect(d.salarioDiario * r.diasIndemnizacion).toBeCloseTo(r.valor, -3);
    expect(d.sobreUmbral).toBe(false);
    expect(d.fechaIngreso).toBe("2023-07-01");
  });

  it("en término fijo, el desglose son los días que faltaban", () => {
    const r = calcularIndemnizacion(
      {
        tipoContrato: "fijo",
        salarioMensual: 2_000_000,
        fechaTerminacion: "2026-07-01",
        fechaVencimientoPactada: "2026-12-31",
        conJustaCausa: false,
      },
      REGLAS_JUL_2026
    );
    if (r.desglose.base !== "termino_definido") throw new Error("se esperaba desglose de término definido");
    expect(r.desglose.diasFaltantes).toBe(r.diasIndemnizacion);
    expect(r.desglose.fechaVencimientoPactada).toBe("2026-12-31");
  });

  it("el $0 dice por cuál de las dos causas lo es", () => {
    const base = {
      tipoContrato: "indefinido" as const,
      salarioMensual: 2_000_000,
      fechaIngreso: "2026-01-01",
      fechaTerminacion: "2026-07-01",
    };
    const prueba = calcularIndemnizacion({ ...base, conJustaCausa: false, enPeriodoPrueba: true }, REGLAS_JUL_2026);
    const justa = calcularIndemnizacion({ ...base, conJustaCausa: true }, REGLAS_JUL_2026);
    expect(prueba.desglose).toEqual({ base: "sin_lugar", motivo: "periodo_prueba" });
    expect(justa.desglose).toEqual({ base: "sin_lugar", motivo: "justa_causa" });
  });
});
