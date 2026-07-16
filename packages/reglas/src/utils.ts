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

export function formatCOP(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor);
}
