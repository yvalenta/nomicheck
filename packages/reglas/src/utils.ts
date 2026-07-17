import type { ReglaLegal } from "./types.js";

// Devuelve el valor de una regla legal vigente en la fecha dada.
// Si el periodo cruza una fecha de corte, el llamador debe consultar
// la regla para cada sub-tramo de forma independiente.
export function reglaEn(
  reglas: ReglaLegal[],
  clave: string,
  fecha: string
): number {
  const vigentes = reglas.filter(
    (r) =>
      r.clave === clave &&
      r.vigenteDesde <= fecha &&
      (r.vigenteHasta === undefined || r.vigenteHasta >= fecha)
  );
  if (vigentes.length === 0) {
    throw new Error(`No hay regla legal vigente para "${clave}" en ${fecha}`);
  }
  // Si por error hay solapamiento, usamos la más reciente (vigenteDesde mayor)
  return vigentes.sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0].valor;
}

// Valida que una fecha YYYY-MM-DD exista realmente en el calendario:
// "2026-02-30" pasa un regex de formato pero Date la desborda a marzo en
// silencio — el round-trip la detecta porque la fecha normalizada difiere.
export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

// Validación de periodo compartida por ambas calculadoras — última línea
// de defensa: liquidacionService pasa datos de la DB sin pasar por zod, y
// un periodo invertido produciría un resultado silencioso de $0.
export function validarPeriodo(desde: string, hasta: string): void {
  for (const f of [desde, hasta]) {
    if (!esFechaValida(f)) {
      throw new Error(`Fecha inválida o inexistente en el calendario: "${f}"`);
    }
  }
  if (desde > hasta) {
    throw new Error(`El periodo está invertido: desde ${desde} es posterior a hasta ${hasta}`);
  }
}

// Genera la lista de fechas (YYYY-MM-DD) entre dos fechas inclusive.
export function rangoFechas(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  const d = new Date(desde);
  const h = new Date(hasta);
  while (d <= h) {
    fechas.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return fechas;
}

// 0=domingo, 1=lunes ... 6=sábado (UTC para evitar ambigüedades de timezone)
export function diaSemana(fecha: string): number {
  return new Date(fecha).getUTCDay();
}

export function esDomingo(fecha: string): boolean {
  return diaSemana(fecha) === 0;
}

export function esLunes(fecha: string): boolean {
  return diaSemana(fecha) === 1;
}

// Horas entre dos strings HH:mm (puede cruzar medianoche)
export function horasEntre(inicio: string, fin: string): number {
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fin.split(":").map(Number);
  let minutos = hf * 60 + mf - (hi * 60 + mi);
  if (minutos < 0) minutos += 24 * 60;
  return minutos / 60;
}

// Horas de un intervalo que caen en jornada nocturna (19:00–06:00)
export function horasNocturnas(inicio: string, fin: string): number {
  // Simplificación para v1: turno dentro del mismo día diurno no tiene nocturnas
  const [hi] = inicio.split(":").map(Number);
  const [hf] = fin.split(":").map(Number);
  if (hi >= 6 && hf <= 19) return 0;
  // Para turnos que sí cruzan las 19h o el amanecer, calcular tramo nocturno
  const totalMin = horasEntre(inicio, fin) * 60;
  const nocturnaMin =
    Math.max(0, (hf <= 6 ? hf + 24 : hf) * 60 - 19 * 60) +
    Math.max(0, 6 * 60 - hi * 60);
  return Math.min(nocturnaMin, totalMin) / 60;
}

// Fecha fin de un periodo "mensual" a partir de la fecha de inicio: mismo
// día del mes siguiente, menos 1 día. Si el mes siguiente no tiene ese día
// (ej. iniciar el 31 y el mes siguiente tiene 30 o menos — o particularmente
// febrero, con 28 o 29 según sea año bisiesto), se usa el ÚLTIMO día del mes
// siguiente en vez de dejar que `Date` desborde al mes subsiguiente
// (bug real: sin este clamp, 31-ene terminaba dando 1 o 2 de MARZO en vez
// de fin de febrero). El año bisiesto se resuelve solo (Date.UTC(año, mes, 0)
// conoce el calendario real), por eso "iniciar el 1 de febrero" ya daba bien
// 28/29 de febrero incluso sin este fix — el bug solo aparecía en los días
// 29/30/31 de un mes cuando el mes siguiente es más corto.
export function finDePeriodoMensual(desde: string): string {
  const d = new Date(`${desde}T00:00:00Z`);
  const anio = d.getUTCFullYear();
  const mes = d.getUTCMonth();
  const dia = d.getUTCDate();
  const ultimoDiaMesSiguiente = new Date(Date.UTC(anio, mes + 2, 0)).getUTCDate();
  const fin = new Date(Date.UTC(anio, mes + 1, Math.min(dia, ultimoDiaMesSiguiente)));
  fin.setUTCDate(fin.getUTCDate() - 1);
  return fin.toISOString().slice(0, 10);
}

export function formatCOP(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor);
}
