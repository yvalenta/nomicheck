import { DECIMALES_REDONDEO } from "./constantes.js";

// Redondea al peso entero (DECIMALES_REDONDEO = 0 — ver constantes.ts).
// Debe aplicarse a CADA línea de resultado antes de sumarla a un total,
// nunca solo al formatear para mostrar: si el total se calcula con
// decimales internos y solo se redondea al final, la suma de las líneas
// impresas (ya enteras) puede no cuadrar con el total impreso.
export function redondearPeso(n: number): number {
  const factor = 10 ** DECIMALES_REDONDEO;
  return Math.round(n * factor) / factor;
}
