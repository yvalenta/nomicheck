/**
 * Los años cumplidos, como cortes en % del tramo de la línea de tiempo.
 *
 * Año comercial de 360 días — el mismo con el que el motor prorratea la
 * indemnización. Si acá se usaran 365, las marcas se irían corriendo del punto
 * en que la regla suma días, que es justo lo que el gráfico dice mostrar.
 */
export const DIAS_ANIO_COMERCIAL = 360;

/** Bajo este margen la etiqueta se solapa con la fecha final y no se lee. */
const MARGEN_FINAL_PCT = 96;

export function marcasDeAnios(diasServidos: number): { pct: number; etiqueta: string }[] {
  if (!(diasServidos > 0)) return [];
  return Array.from({ length: Math.floor(diasServidos / DIAS_ANIO_COMERCIAL) }, (_, i) => ({
    pct: ((i + 1) * DIAS_ANIO_COMERCIAL * 100) / diasServidos,
    etiqueta: `${i + 1}º año`,
  })).filter((m) => m.pct < MARGEN_FINAL_PCT);
}
