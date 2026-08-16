// Los meses del selector de «Tu cuenta», y cómo se escriben.
//
// Vive en un módulo propio y no dentro del componente por el mismo motivo que
// `estadosPeriodo.ts`: así se prueba sin montar React ni necesitar credenciales
// de Supabase. Y hace falta probarlo, porque es lo único de esa pantalla que
// puede equivocarse **sin que se note**.
//
// ── El mes es COLOMBIANO, no el del navegador ──────────────────────────────
//
// El backend congela el mes de facturación en UTC-5 al cerrar el periodo (ver
// `mesColombiano` en `services/medidorCierres.ts`): un cierre del 31 a las 9 de
// la noche en Bogotá pertenece a agosto aunque en UTC ya sea septiembre.
//
// Si esta lista se construyera con la zona del navegador, alguien mirando desde
// otro huso —o desde Colombia en los últimos minutos del mes— vería un mes
// corrido respecto del que el servidor factura: pediría "septiembre" creyendo
// que es el corriente y recibiría un mes vacío, con la cuenta en cero y ninguna
// pista de por qué.

/** El mes calendario colombiano de un instante, en `YYYY-MM`.
 *  Espejo de `mesColombiano` del backend — si uno cambia, cambia el otro. */
export function mesColombiano(instante: Date): string {
  const co = new Date(instante.getTime() - 5 * 60 * 60 * 1000);
  return `${co.getUTCFullYear()}-${String(co.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Los últimos `n` meses colombianos, del más reciente al más viejo. */
export function ultimosMeses(n = 12, ahora: Date = new Date()): string[] {
  const actual = mesColombiano(ahora);
  const [a, m] = actual.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    // Se retrocede sobre el mes YA convertido a hora colombiana. Restar meses
    // sobre la fecha original y convertir después daría el mismo resultado casi
    // siempre, y se equivocaría justo en el borde que este módulo existe para
    // no equivocar.
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** `2026-08` → `agosto de 2026`. Devuelve la entrada tal cual si no la entiende:
 *  un selector con una etiqueta rara es molesto; uno que revienta deja a la
 *  empresa sin poder ver su cuenta. */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split("-");
  const nombre = MESES[Number(m) - 1];
  return nombre && a ? `${nombre} de ${a}` : mes;
}
