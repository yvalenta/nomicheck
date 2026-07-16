import { DECIMALES_REDONDEO } from "./constantes.js";

export function round2(n: number): number {
  const factor = 10 ** DECIMALES_REDONDEO;
  return Math.round(n * factor) / factor;
}
