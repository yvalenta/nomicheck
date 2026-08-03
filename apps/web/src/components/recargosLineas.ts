import type { LineaRecargo } from "../api.ts";

/**
 * La distinción que hace que el resultado se entienda o no.
 *
 * Un recargo sobre hora ordinaria paga SOLO el porcentaje —la hora base ya
 * está en el salario del mes—; una hora extra se paga completa MÁS su recargo.
 * Por eso 34 horas de recargo nocturno valen mucho menos que 34 extras diurnas,
 * y sin decirlo el resultado parece un error de cuentas.
 *
 * Se decide por el `codigo` que emite el motor, no por el texto del concepto:
 * el concepto lleva sufijos de tramo normativo ("… (desde jul-2025)") y está
 * escrito para leerse, no para que lo parseen.
 */
export function esHoraExtra(codigo: string): boolean {
  return codigo.startsWith("HORA_EXTRA");
}

/**
 * Lo que termina valiendo una hora de esa línea, con su recargo aplicado.
 *
 * Sale de la propia línea (valor ÷ horas), no de recalcular el porcentaje:
 * el motor ya redondeó al peso y las extras dominicales suman dos factores.
 * Reconstruirlo acá sería una segunda implementación de la tarifa.
 */
export function valorPorHora(linea: LineaRecargo): number | null {
  if (!linea.horas || linea.horas <= 0) return null;
  return linea.valorCalculado / linea.horas;
}

/** Las mismas horas aparecen en dos líneas y eso parece un cobro doble. */
export const CODIGO_NOCTURNO_DOMINICAL = "RECARGO_NOCTURNO_DOMINICAL";

export function hayDobleLineaDominicalNocturna(lineas: LineaRecargo[]): boolean {
  return lineas.some((l) => l.codigo === CODIGO_NOCTURNO_DOMINICAL);
}

export interface Totales {
  recargos: number;
  extras: number;
  horasRecargos: number;
  horasExtras: number;
}

/**
 * Totales por naturaleza. Las horas NO se suman entre líneas de recargo: una
 * hora nocturna dominical figura en dos, y sumarlas diría que se trabajaron el
 * doble. Se cuenta el máximo, que es el mayor número de horas realmente
 * cubiertas por alguna línea.
 */
export function totalizar(lineas: LineaRecargo[]): Totales {
  let recargos = 0;
  let extras = 0;
  let horasRecargos = 0;
  let horasExtras = 0;
  for (const l of lineas) {
    if (esHoraExtra(l.codigo)) {
      extras += l.valorCalculado;
      horasExtras += l.horas ?? 0;
    } else {
      recargos += l.valorCalculado;
      horasRecargos = Math.max(horasRecargos, l.horas ?? 0);
    }
  }
  return { recargos, extras, horasRecargos, horasExtras };
}
