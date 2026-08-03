import type { SemestrePrima } from "../api.ts";

/** Tope de días que cada semestre calendario puede aportar (CST art. 306). */
export const DIAS_MAX_SEMESTRE = 180;

/**
 * Nombre legible del semestre. El motor los identifica por su fecha de inicio
 * —01-01 o 07-01—, que es dato, no texto: la etiqueta se arma acá.
 */
export function etiquetaSemestre(s: SemestrePrima): string {
  const anio = s.desde.slice(0, 4);
  return s.desde.endsWith("-01-01") ? `Ene–Jun ${anio}` : `Jul–Dic ${anio}`;
}

/**
 * Fecha máxima de pago de la cuota de ese semestre: 30 de junio para el
 * primero, 20 de diciembre para el segundo (CST art. 306). Son las dos fechas
 * que el propio resultado ya afirma en su explicación.
 */
export function fechaMaximaPago(s: SemestrePrima): string {
  const anio = s.desde.slice(0, 4);
  return s.desde.endsWith("-01-01") ? `${anio}-06-30` : `${anio}-12-20`;
}

/**
 * Reparte el total entre los semestres en proporción a sus días.
 *
 * No recalcula la prima: el motor liquidó `total` sobre la suma de esos días,
 * así que repartirlo por días da exactamente sus cuotas. Se ajusta el último
 * renglón con lo que sobre del redondeo para que la suma de las partes sea el
 * total mostrado — un peso de diferencia entre la tabla y la cifra grande es el
 * tipo de detalle que hace desconfiar de todo lo demás.
 */
export function repartirPorSemestre(
  semestres: SemestrePrima[],
  total: number
): { semestre: SemestrePrima; valor: number }[] {
  const diasTotales = semestres.reduce((s, x) => s + x.dias, 0);
  if (diasTotales <= 0) return semestres.map((semestre) => ({ semestre, valor: 0 }));

  const partes = semestres.map((semestre) => ({
    semestre,
    valor: Math.round((total * semestre.dias) / diasTotales),
  }));
  const sobra = total - partes.reduce((s, p) => s + p.valor, 0);
  if (sobra !== 0 && partes.length > 0) {
    partes[partes.length - 1].valor += sobra;
  }
  return partes;
}

/** Días servidos que el tope dejó por fuera de la prima. */
export function diasNoComputados(diasServidos: number, diasPrima: number): number {
  return Math.max(0, diasServidos - diasPrima);
}
