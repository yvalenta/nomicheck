import type { ReglaLegal } from "./types.js";

export interface ResolutorReglas {
  en(clave: string, fecha: string): number;
}

// Resolutor pre-indexado: agrupa las reglas por clave UNA vez (ordenadas
// desc por vigenteDesde) y cachea cada (clave, fecha) consultada. Un
// cálculo de turnos de 15 días hace ~40 consultas de reglas — con el
// filter+sort de reglaEn() cada una recorría y ordenaba el arreglo
// completo; aquí el índice se construye una vez por cálculo, sin estado
// global ni problema de invalidación (vive lo que dura el cálculo).
export function crearResolutorReglas(reglas: ReglaLegal[]): ResolutorReglas {
  const porClave = new Map<string, ReglaLegal[]>();
  for (const r of reglas) {
    if (!porClave.has(r.clave)) porClave.set(r.clave, []);
    porClave.get(r.clave)!.push(r);
  }
  // Desc por vigenteDesde: la primera vigente que se encuentre es también
  // la más reciente — preserva la semántica de reglaEn ante solapamientos.
  for (const lista of porClave.values()) {
    lista.sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde));
  }

  const cache = new Map<string, number>();
  return {
    en(clave: string, fecha: string): number {
      const claveCache = `${clave}|${fecha}`;
      const memo = cache.get(claveCache);
      if (memo !== undefined) return memo;

      const vigente = (porClave.get(clave) ?? []).find(
        (r) => r.vigenteDesde <= fecha && (r.vigenteHasta === undefined || r.vigenteHasta >= fecha)
      );
      if (!vigente) {
        throw new Error(`No hay regla legal vigente para "${clave}" en ${fecha}`);
      }
      cache.set(claveCache, vigente.valor);
      return vigente.valor;
    },
  };
}

// Normaliza el parámetro de reglas: los helpers del motor aceptan tanto
// el arreglo crudo (compatibilidad con llamadores/tests existentes) como
// un resolutor ya construido (para compartir el índice y el cache dentro
// de un mismo cálculo).
export function comoResolutor(reglas: ReglaLegal[] | ResolutorReglas): ResolutorReglas {
  return Array.isArray(reglas) ? crearResolutorReglas(reglas) : reglas;
}

// Devuelve el valor de una regla legal vigente en la fecha dada.
// Si el periodo cruza una fecha de corte, el llamador debe consultar
// la regla para cada sub-tramo de forma independiente. Para consultas
// repetidas dentro de un mismo cálculo, usar crearResolutorReglas().
export function reglaEn(
  reglas: ReglaLegal[],
  clave: string,
  fecha: string
): number {
  return crearResolutorReglas(reglas).en(clave, fecha);
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
// Días calendario entre dos fechas (hasta - desde), puede ser negativo si
// "hasta" es anterior a "desde" — quien llama decide si eso es un error.
export function diasEntreFechas(desde: string, hasta: string): number {
  const d = new Date(`${desde}T00:00:00Z`).getTime();
  const h = new Date(`${hasta}T00:00:00Z`).getTime();
  return Math.round((h - d) / 86_400_000);
}

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
