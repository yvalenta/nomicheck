import { ErrorDeDatos } from "./errores.js";
import type { LineaResultado, ReglaLegal } from "./types.js";
import { comoResolutor, esFechaValida, type ResolutorReglas } from "./utils.js";
import { redondearPeso } from "./numero.js";

// Horas con hasta 2 decimales (las horas no son pesos — redondearPeso las
// dejaría en enteros y "1.5 h" se perdería).
function redondearHoras(horas: number): number {
  return Math.round(horas * 100) / 100;
}

/**
 * Horas del periodo clasificadas por tipo de recargo. Todas opcionales
 * (default 0). "Dominicales" cubre domingos Y festivos (mismo recargo,
 * Ley 2466 de 2025, art. 2).
 */
export interface HorasRecargo {
  /** Ordinarias nocturnas en día hábil. */
  nocturnas?: number;
  /** Ordinarias diurnas en domingo/festivo. */
  dominicalesDiurnas?: number;
  /** Ordinarias nocturnas en domingo/festivo. */
  dominicalesNocturnas?: number;
  /** Extras diurnas en día hábil. */
  extrasDiurnas?: number;
  /** Extras nocturnas en día hábil. */
  extrasNocturnas?: number;
  /** Extras diurnas en domingo/festivo. */
  extrasDominicalesDiurnas?: number;
  /** Extras nocturnas en domingo/festivo. */
  extrasDominicalesNocturnas?: number;
}

export interface PorcentajesRecargo {
  recargoNocturno: number;
  recargoDominical: number;
  extraDiurnaPct: number;
  extraNocturnaPct: number;
}

/**
 * Construye las líneas de recargos y horas extra a partir de horas ya
 * clasificadas. Compartida entre CalculadoraPorTurnos (que clasifica desde
 * turnos reales, por tramo normativo) y calcularRecargos (calculadora
 * anónima por concepto, un solo tramo).
 *
 * Convenciones del recibo (mismas que siempre tuvo el motor):
 * - Recargos sobre horas ordinarias pagan SOLO el porcentaje — la hora base
 *   ya está cubierta por el salario proporcional.
 * - Las horas nocturnas dominicales generan DOS líneas por las mismas horas:
 *   el recargo dominical (junto con las diurnas) y el recargo nocturno.
 * - Las extras pagan hora completa + recargo (1 + pct); las extras
 *   dominicales suman el recargo dominical al de la extra.
 */
export function lineasRecargos(
  valorHora: number,
  horas: HorasRecargo,
  pcts: PorcentajesRecargo,
  sufijo = ""
): LineaResultado[] {
  const h = {
    nocturnas: horas.nocturnas ?? 0,
    dominicalesDiurnas: horas.dominicalesDiurnas ?? 0,
    dominicalesNocturnas: horas.dominicalesNocturnas ?? 0,
    extrasDiurnas: horas.extrasDiurnas ?? 0,
    extrasNocturnas: horas.extrasNocturnas ?? 0,
    extrasDominicalesDiurnas: horas.extrasDominicalesDiurnas ?? 0,
    extrasDominicalesNocturnas: horas.extrasDominicalesNocturnas ?? 0,
  };
  const lineas: LineaResultado[] = [];

  if (h.nocturnas > 0) {
    lineas.push({
      codigo: "RECARGO_NOCTURNO",
      concepto: `Recargo nocturno${sufijo}`,
      horas: redondearHoras(h.nocturnas),
      recargoPct: pcts.recargoNocturno,
      valorCalculado: redondearPeso(h.nocturnas * valorHora * pcts.recargoNocturno),
      tipo: "devengo",
      ley: "Ley 2466 de 2025, art. 3",
    });
  }

  const dominicales = h.dominicalesDiurnas + h.dominicalesNocturnas;
  if (dominicales > 0) {
    lineas.push({
      codigo: "RECARGO_DOMINICAL",
      concepto: `Recargo dominical/festivo${sufijo}`,
      horas: redondearHoras(dominicales),
      recargoPct: pcts.recargoDominical,
      valorCalculado: redondearPeso(dominicales * valorHora * pcts.recargoDominical),
      tipo: "devengo",
      ley: "Ley 2466 de 2025, art. 2",
    });
  }

  if (h.dominicalesNocturnas > 0) {
    lineas.push({
      codigo: "RECARGO_NOCTURNO_DOMINICAL",
      concepto: `Recargo nocturno dominical/festivo${sufijo}`,
      horas: redondearHoras(h.dominicalesNocturnas),
      recargoPct: pcts.recargoNocturno,
      valorCalculado: redondearPeso(h.dominicalesNocturnas * valorHora * pcts.recargoNocturno),
      tipo: "devengo",
      ley: "Ley 2466 de 2025, art. 3",
    });
  }

  if (h.extrasDiurnas > 0) {
    lineas.push({
      codigo: "HORA_EXTRA_DIURNA",
      concepto: `Hora extra diurna${sufijo}`,
      horas: redondearHoras(h.extrasDiurnas),
      recargoPct: pcts.extraDiurnaPct,
      valorCalculado: redondearPeso(h.extrasDiurnas * valorHora * (1 + pcts.extraDiurnaPct)),
      tipo: "devengo",
      ley: "CST art. 168",
    });
  }

  if (h.extrasNocturnas > 0) {
    lineas.push({
      codigo: "HORA_EXTRA_NOCTURNA",
      concepto: `Hora extra nocturna${sufijo}`,
      horas: redondearHoras(h.extrasNocturnas),
      recargoPct: pcts.extraNocturnaPct,
      valorCalculado: redondearPeso(h.extrasNocturnas * valorHora * (1 + pcts.extraNocturnaPct)),
      tipo: "devengo",
      ley: "CST art. 168",
    });
  }

  // Extra dominical: diurna y nocturna con factores distintos (recargo
  // dominical + 25%/75% de extra) — nunca fusionar en una sola línea.
  if (h.extrasDominicalesDiurnas > 0) {
    const pct = pcts.recargoDominical + pcts.extraDiurnaPct;
    lineas.push({
      codigo: "HORA_EXTRA_DOMINICAL_DIURNA",
      concepto: `Hora extra dominical/festiva diurna${sufijo}`,
      horas: redondearHoras(h.extrasDominicalesDiurnas),
      recargoPct: pct,
      valorCalculado: redondearPeso(h.extrasDominicalesDiurnas * valorHora * (1 + pct)),
      tipo: "devengo",
      ley: "Ley 2466 de 2025; CST art. 168",
    });
  }

  if (h.extrasDominicalesNocturnas > 0) {
    const pct = pcts.recargoDominical + pcts.extraNocturnaPct;
    lineas.push({
      codigo: "HORA_EXTRA_DOMINICAL_NOCTURNA",
      concepto: `Hora extra dominical/festiva nocturna${sufijo}`,
      horas: redondearHoras(h.extrasDominicalesNocturnas),
      recargoPct: pct,
      valorCalculado: redondearPeso(h.extrasDominicalesNocturnas * valorHora * (1 + pct)),
      tipo: "devengo",
      ley: "Ley 2466 de 2025; CST art. 168",
    });
  }

  return lineas;
}

export interface DatosRecargos {
  salarioMensual: number;
  /** Fecha (YYYY-MM-DD) para resolver divisor y porcentajes vigentes. */
  fechaReferencia: string;
  horas: HorasRecargo;
}

export interface ResultadoRecargos {
  valorHoraOrdinaria: number;
  lineas: LineaResultado[];
  total: number;
}

/**
 * Calculadora anónima de recargos por concepto: dado el salario mensual y
 * las horas ya clasificadas, valora cada recargo/extra con las reglas
 * vigentes en la fecha de referencia (mismos porcentajes y divisor de hora
 * que usa CalculadoraPorTurnos — Ley 2101 de 2021: 220→210 según fecha).
 * Informativa: no arma un recibo ni aplica deducciones.
 */
export function calcularRecargos(
  datos: DatosRecargos,
  reglas: ReglaLegal[] | ResolutorReglas
): ResultadoRecargos {
  if (!(datos.salarioMensual > 0)) {
    throw new ErrorDeDatos(`El salario mensual debe ser mayor que cero (recibido: ${datos.salarioMensual})`);
  }
  if (!esFechaValida(datos.fechaReferencia)) {
    throw new ErrorDeDatos(`Fecha de referencia inválida o inexistente: "${datos.fechaReferencia}"`);
  }
  for (const [campo, valor] of Object.entries(datos.horas)) {
    if (valor !== undefined && (!Number.isFinite(valor) || valor < 0)) {
      throw new ErrorDeDatos(`Las horas no pueden ser negativas (${campo}: ${valor})`);
    }
  }

  const r = comoResolutor(reglas);
  const fecha = datos.fechaReferencia;
  const valorHora = datos.salarioMensual / r.en("divisor_hora_ordinaria", fecha);
  const lineas = lineasRecargos(valorHora, datos.horas, {
    recargoNocturno: r.en("recargo_nocturno", fecha),
    recargoDominical: r.en("recargo_dominical", fecha),
    extraDiurnaPct: r.en("hora_extra_diurna", fecha),
    extraNocturnaPct: r.en("hora_extra_nocturna", fecha),
  });

  return {
    valorHoraOrdinaria: redondearPeso(valorHora),
    lineas,
    total: redondearPeso(lineas.reduce((s, l) => s + l.valorCalculado, 0)),
  };
}
