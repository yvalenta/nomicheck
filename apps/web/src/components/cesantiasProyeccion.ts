/**
 * Proyección de cesantías e intereses a otros cortes del mismo periodo.
 *
 * NO reimplementa la fórmula: la escala desde el punto que devolvió el motor.
 * Las cesantías crecen en proporción directa a los días trabajados, y los
 * intereses son un porcentaje anual sobre ese saldo, también proporcional al
 * tiempo — o sea, crecen con el cuadrado de los días. Escalar el resultado real
 * da exactamente lo mismo que recalcular, con la diferencia de que si la regla
 * cambia en `@pv/reglas`, esta curva cambia con ella en vez de contradecirla.
 */

/** Año comercial: el mismo con el que el motor prorratea la prestación. */
export const DIAS_ANIO_COMERCIAL = 360;

export interface Punto {
  dias: number;
  cesantias: number;
  intereses: number;
}

export function proyectar(base: Punto, dias: number): Punto {
  if (base.dias <= 0) return { dias, cesantias: 0, intereses: 0 };
  const factor = dias / base.dias;
  return {
    dias,
    cesantias: Math.round(base.cesantias * factor),
    intereses: Math.round(base.intereses * factor * factor),
  };
}

/**
 * La curva desde el primer día hasta el año completo, pasando por el corte
 * real. El horizonte es el año comercial porque es donde la prestación vale un
 * mes de salario — el punto de referencia que la gente ya conoce.
 */
export function serieHastaElAnio(base: Punto, puntos = 24): Punto[] {
  const tope = Math.max(DIAS_ANIO_COMERCIAL, base.dias);
  const paso = tope / puntos;
  const serie: Punto[] = [];
  for (let i = 0; i <= puntos; i++) {
    serie.push(proyectar(base, Math.round(paso * i)));
  }
  // El corte real tiene que estar en la serie: si cae entre dos pasos, la
  // curva pasaría al lado del punto que marca "acá estás".
  if (!serie.some((p) => p.dias === base.dias)) {
    serie.push({ dias: base.dias, cesantias: base.cesantias, intereses: base.intereses });
    serie.sort((a, b) => a.dias - b.dias);
  }
  return serie;
}
