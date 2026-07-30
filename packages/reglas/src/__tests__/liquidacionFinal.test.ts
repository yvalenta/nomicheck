import { describe, expect, it } from "vitest";
import { calcularLiquidacionFinal } from "../liquidacionFinal.js";
import { calcularPrestacionesSociales } from "../prestaciones.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";

const valorDe = (r: { lineas: { codigo: string; valorCalculado: number }[] }, codigo: string) =>
  r.lineas.find((l) => l.codigo === codigo)!.valorCalculado;

describe("calcularLiquidacionFinal", () => {
  // La planilla real que motivó este listing: un mes exacto de contrato, con
  // auxilio de transporte, sin cortes previos y sin vacaciones tomadas.
  const planilla = {
    fechaIngreso: "2026-07-01",
    fechaRetiro: "2026-07-30",
    salarioBase: 1_850_000,
    auxilioTransporte: 249_095,
  };

  it("reproduce al peso una planilla de liquidación real", () => {
    // Planilla de referencia: básico 1.850.000, "otros conceptos" 241.943
    // (extras y recargos), auxilio 249.095, del 1 al 30 de julio de 2026.
    // Base de cesantías y prima = 2.341.038; base de vacaciones = solo el
    // básico, porque el art. 192 num. 1 excluye extras y descanso obligatorio.
    const r = calcularLiquidacionFinal(
      {
        ...planilla,
        devengosSuplementarios: [{ mes: "2026-07", valor: 241_943 }],
        diasVacacionesTomados: 0,
      },
      REGLAS_JUL_2026
    );
    expect(valorDe(r, "LIQUIDACION_FINAL_CESANTIAS")).toBe(195_087);
    expect(valorDe(r, "LIQUIDACION_FINAL_INTERESES_CESANTIAS")).toBe(1_951);
    expect(valorDe(r, "LIQUIDACION_FINAL_PRIMA")).toBe(195_087);
    expect(valorDe(r, "LIQUIDACION_FINAL_VACACIONES")).toBe(77_083);
    expect(r.total).toBe(469_208); // la planilla suma 469.207: un peso de redondeo
  });

  it("el trabajo suplementario hace base de cesantías y prima, pero NO de vacaciones (art. 192 num. 1)", () => {
    const extras = [{ mes: "2026-07", valor: 241_943 }];
    const con = calcularLiquidacionFinal({ ...planilla, devengosSuplementarios: extras }, REGLAS_JUL_2026);
    const sin = calcularLiquidacionFinal(planilla, REGLAS_JUL_2026);

    expect(valorDe(con, "LIQUIDACION_FINAL_CESANTIAS")).toBeGreaterThan(valorDe(sin, "LIQUIDACION_FINAL_CESANTIAS"));
    expect(valorDe(con, "LIQUIDACION_FINAL_PRIMA")).toBeGreaterThan(valorDe(sin, "LIQUIDACION_FINAL_PRIMA"));
    expect(valorDe(con, "LIQUIDACION_FINAL_VACACIONES")).toBe(valorDe(sin, "LIQUIDACION_FINAL_VACACIONES"));
  });

  it("una comisión sí entra a la base de vacaciones; una hora extra no", () => {
    // El mismo monto, clasificado distinto, da vacaciones distintas. Es toda
    // la diferencia entre los dos campos.
    const monto = [{ mes: "2026-07", valor: 2_091_943 }];
    const comision = calcularLiquidacionFinal({ ...planilla, devengosVariables: monto }, REGLAS_JUL_2026);
    const extra = calcularLiquidacionFinal(
      { ...planilla, devengosSuplementarios: [{ mes: "2026-07", valor: 241_943 }] },
      REGLAS_JUL_2026
    );
    expect(valorDe(comision, "LIQUIDACION_FINAL_VACACIONES")).toBeGreaterThan(
      valorDe(extra, "LIQUIDACION_FINAL_VACACIONES")
    );
  });

  it("emite las cuatro prestaciones, cada una con su norma", () => {
    const r = calcularLiquidacionFinal(planilla, REGLAS_JUL_2026);
    expect(r.lineas.map((l) => l.codigo)).toEqual([
      "LIQUIDACION_FINAL_CESANTIAS",
      "LIQUIDACION_FINAL_INTERESES_CESANTIAS",
      "LIQUIDACION_FINAL_PRIMA",
      "LIQUIDACION_FINAL_VACACIONES",
    ]);
    expect(r.lineas.map((l) => l.ley)).toEqual([
      "CST art. 249",
      "Ley 52 de 1975, art. 1",
      "CST art. 306",
      "CST art. 186",
    ]);
    // Todas son dinero que el trabajador recibe, no provisión.
    expect(r.lineas.every((l) => l.tipo === "devengo")).toBe(true);
    expect(r.total).toBe(r.lineas.reduce((s, l) => s + l.valorCalculado, 0));
  });

  it("el auxilio entra a cesantías y prima pero no a vacaciones (Ley 1ª de 1963, art. 7)", () => {
    const con = calcularLiquidacionFinal(planilla, REGLAS_JUL_2026);
    const sin = calcularLiquidacionFinal({ ...planilla, auxilioTransporte: undefined }, REGLAS_JUL_2026);

    expect(valorDe(con, "LIQUIDACION_FINAL_CESANTIAS")).toBeGreaterThan(valorDe(sin, "LIQUIDACION_FINAL_CESANTIAS"));
    expect(valorDe(con, "LIQUIDACION_FINAL_PRIMA")).toBeGreaterThan(valorDe(sin, "LIQUIDACION_FINAL_PRIMA"));
    expect(valorDe(con, "LIQUIDACION_FINAL_VACACIONES")).toBe(valorDe(sin, "LIQUIDACION_FINAL_VACACIONES"));
  });

  it("sin cortes informados, declara los supuestos en vez de asumirlos en silencio", () => {
    const r = calcularLiquidacionFinal(planilla, REGLAS_JUL_2026);
    expect(r.supuestos).toHaveLength(3); // cesantías, prima, vacaciones
    expect(r.supuestos.join(" ")).toContain("cesantías");
    expect(r.supuestos.join(" ")).toContain("prima");
    expect(r.supuestos.join(" ")).toContain("vacaciones");
  });

  it("con todo el historial informado no queda ningún supuesto", () => {
    const r = calcularLiquidacionFinal(
      { ...planilla, cortePrima: "2026-06-30", corteCesantias: "2025-12-31", diasVacacionesTomados: 0 },
      REGLAS_JUL_2026
    );
    expect(r.supuestos).toEqual([]);
  });

  it("cada concepto se liquida desde SU corte, no todos desde el ingreso", () => {
    const desdeIngreso = calcularLiquidacionFinal(
      { ...planilla, fechaIngreso: "2026-01-01", diasVacacionesTomados: 0 },
      REGLAS_JUL_2026
    );
    // Misma historia, pero la prima del primer semestre ya se pagó el 30-jun.
    const conCortePrima = calcularLiquidacionFinal(
      { ...planilla, fechaIngreso: "2026-01-01", cortePrima: "2026-06-30", diasVacacionesTomados: 0 },
      REGLAS_JUL_2026
    );

    expect(valorDe(conCortePrima, "LIQUIDACION_FINAL_PRIMA")).toBeLessThan(
      valorDe(desdeIngreso, "LIQUIDACION_FINAL_PRIMA")
    );
    // El corte de prima no puede tocar las otras tres.
    for (const codigo of [
      "LIQUIDACION_FINAL_CESANTIAS",
      "LIQUIDACION_FINAL_INTERESES_CESANTIAS",
      "LIQUIDACION_FINAL_VACACIONES",
    ]) {
      expect(valorDe(conCortePrima, codigo)).toBe(valorDe(desdeIngreso, codigo));
    }
  });

  it("un corte posterior al retiro deja ese concepto en cero, sin lanzar", () => {
    // Caso real: se pagó la prima por adelantado hasta diciembre y el retiro
    // fue en julio. No hay tramo pendiente — pero tampoco es un error.
    const r = calcularLiquidacionFinal({ ...planilla, cortePrima: "2026-12-31" }, REGLAS_JUL_2026);
    expect(valorDe(r, "LIQUIDACION_FINAL_PRIMA")).toBe(0);
    expect(valorDe(r, "LIQUIDACION_FINAL_CESANTIAS")).toBeGreaterThan(0);
  });

  it("las vacaciones se causan sobre todo el tiempo servido, aunque haya corte de cesantías", () => {
    // El corte de cesantías acorta SU tramo; las vacaciones no se enteran.
    const conCorte = calcularLiquidacionFinal(
      { ...planilla, fechaIngreso: "2025-01-01", corteCesantias: "2025-12-31" },
      REGLAS_JUL_2026
    );
    const esperado = calcularPrestacionesSociales({
      fechaIngreso: "2025-01-01",
      fechaCorte: "2026-07-30",
      salarioBase: planilla.salarioBase,
      auxilioTransporte: planilla.auxilioTransporte,
    });
    expect(valorDe(conCorte, "LIQUIDACION_FINAL_VACACIONES")).toBe(esperado.vacaciones);
  });

  it("la indemnización se agrega solo si se pide, y suma al total", () => {
    const sin = calcularLiquidacionFinal(planilla, REGLAS_JUL_2026);
    expect(sin.lineas.some((l) => l.codigo === "INDEMNIZACION_DESPIDO")).toBe(false);

    const con = calcularLiquidacionFinal(
      {
        ...planilla,
        indemnizacion: {
          tipoContrato: "fijo",
          salarioMensual: planilla.salarioBase,
          fechaTerminacion: "2026-07-30",
          fechaVencimientoPactada: "2026-12-31",
          conJustaCausa: false,
        },
      },
      REGLAS_JUL_2026
    );
    const indem = valorDe(con, "INDEMNIZACION_DESPIDO");
    expect(indem).toBeGreaterThan(0);
    expect(con.total).toBe(sin.total + indem);
  });

  it("indemnización en cero por período de prueba: se emite la línea y se explica por qué", () => {
    // El punto entero del listing: la liquidación se paga igual aunque la
    // indemnización sea cero. Un cero mudo se lee como un error de cálculo.
    const r = calcularLiquidacionFinal(
      {
        ...planilla,
        indemnizacion: {
          tipoContrato: "indefinido",
          salarioMensual: planilla.salarioBase,
          fechaIngreso: planilla.fechaIngreso,
          fechaTerminacion: "2026-07-30",
          conJustaCausa: false,
          enPeriodoPrueba: true,
        },
      },
      REGLAS_JUL_2026
    );
    expect(valorDe(r, "INDEMNIZACION_DESPIDO")).toBe(0);
    expect(r.advertencias.join(" ")).toContain("período de prueba");
    expect(r.total).toBeGreaterThan(0);
  });

  it("las vacaciones disfrutadas se descuentan de la liquidación", () => {
    const sinTomar = calcularLiquidacionFinal({ ...planilla, diasVacacionesTomados: 0 }, REGLAS_JUL_2026);
    const conTomadas = calcularLiquidacionFinal({ ...planilla, diasVacacionesTomados: 1 }, REGLAS_JUL_2026);
    expect(valorDe(conTomadas, "LIQUIDACION_FINAL_VACACIONES")).toBeLessThan(
      valorDe(sinTomar, "LIQUIDACION_FINAL_VACACIONES")
    );
  });
});
