import { ErrorDeDatos } from "./errores.js";
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

/** Un intervalo de fechas sin regla vigente para una clave. */
export interface HuecoVigencia {
  clave: string;
  /** Primera fecha sin cobertura (YYYY-MM-DD). */
  desde: string;
  /** Última fecha sin cobertura, o `null` si el hueco llega hasta el final del rango auditado. */
  hasta: string | null;
  motivo: "antes-del-primer-tramo" | "entre-tramos" | "despues-del-ultimo-tramo";
}

// Audita la cobertura temporal de un catálogo de reglas: para cada clave,
// qué intervalos del rango [desde, hasta] NO tienen ninguna fila vigente.
//
// Existe porque `crearResolutorReglas().en()` LANZA cuando no encuentra
// vigencia, y las calculadoras resuelven varias claves de forma
// incondicional al inicio de cada tramo de días — antes de saber si el
// concepto aplica. Una clave con la ventana cerrada no degrada el cálculo:
// lo tumba entero. Y como la fecha del fallo es la del periodo liquidado,
// no la de hoy, el problema es invisible hasta que alguien liquida el mes
// equivocado (o hasta que llega la fecha).
//
// Caso real: `recargo_dominical` tenía tramos solo entre 2025-07-01 y
// 2027-06-30. Toda liquidación por turnos fechada fuera de esa ventana
// lanzaba, hubiera o no trabajo dominical.
export function auditarVigencias(
  reglas: ReglaLegal[],
  desde: string,
  hasta: string,
  claves?: string[]
): HuecoVigencia[] {
  const porClave = new Map<string, ReglaLegal[]>();
  for (const r of reglas) {
    if (!porClave.has(r.clave)) porClave.set(r.clave, []);
    porClave.get(r.clave)!.push(r);
  }

  const diaSiguiente = (f: string): string => {
    const d = new Date(`${f}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  const huecos: HuecoVigencia[] = [];
  for (const clave of claves ?? [...porClave.keys()]) {
    const tramos = [...(porClave.get(clave) ?? [])].sort((a, b) =>
      a.vigenteDesde.localeCompare(b.vigenteDesde)
    );
    if (tramos.length === 0) {
      huecos.push({ clave, desde, hasta, motivo: "antes-del-primer-tramo" });
      continue;
    }

    if (tramos[0].vigenteDesde > desde) {
      huecos.push({
        clave,
        desde,
        hasta: tramos[0].vigenteDesde,
        motivo: "antes-del-primer-tramo",
      });
    }

    for (let i = 0; i < tramos.length - 1; i++) {
      const fin = tramos[i].vigenteHasta;
      // Un tramo abierto (`vigenteHasta` ausente) cubre todo lo que sigue:
      // el resolutor toma el más reciente vigente, así que no hay hueco.
      if (!fin) continue;
      const esperado = diaSiguiente(fin);
      if (tramos[i + 1].vigenteDesde > esperado) {
        huecos.push({
          clave,
          desde: esperado,
          hasta: tramos[i + 1].vigenteDesde,
          motivo: "entre-tramos",
        });
      }
    }

    const ultimo = tramos[tramos.length - 1];
    if (ultimo.vigenteHasta && ultimo.vigenteHasta < hasta) {
      huecos.push({
        clave,
        desde: diaSiguiente(ultimo.vigenteHasta),
        hasta: null,
        motivo: "despues-del-ultimo-tramo",
      });
    }
  }
  return huecos;
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
      throw new ErrorDeDatos(`Fecha inválida o inexistente en el calendario: "${f}"`);
    }
  }
  if (desde > hasta) {
    throw new ErrorDeDatos(`El periodo está invertido: desde ${desde} es posterior a hasta ${hasta}`);
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
/**
 * El día calendario siguiente, en UTC.
 *
 * Se usa para abrir un tramo justo después de un corte ya pagado: si la prima
 * se pagó hasta el 30 de junio, el tramo pendiente empieza el 1 de julio, no
 * el 30 — cobrar ese día otra vez es pagarlo dos veces.
 */
export function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

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

// Días de un periodo medidos en el MES COMERCIAL de 30 días — no en días
// calendario. El salario mensual pactado remunera el mes completo (CST art.
// 127), tenga 28, 30 o 31 días: ni un mes largo paga de más, ni febrero paga
// de menos.
//
// Contar días calendario rompe la nómina en los dos extremos del año, y el
// error es asimétrico (detectado 2026-07 auditando comprobantes reales):
//   - 2ª quincena de julio (16–31) = 16 días → paga 1 día de MÁS
//   - 2ª quincena de febrero (16–28) = 13 días → paga 2 días de MENOS, es
//     decir por debajo del salario mensual pactado
// Junio (16–30) da 15 por coincidencia: es el único mes donde la quincena
// calendario y la comercial coinciden.
//
// Reglas del mes comercial: el día 31 no existe (se topa a 30), y el último
// día de febrero cuenta como 30 para que la quincena cierre en 15. Así
// quincena 1 + quincena 2 = 30 días exactos en CUALQUIER mes.
export function diasComerciales(desde: string, hasta: string): number {
  const d = new Date(`${desde}T00:00:00Z`);
  const h = new Date(`${hasta}T00:00:00Z`);
  const diaComercial = (f: Date): number => {
    const dia = f.getUTCDate();
    const ultimoDelMes = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
    // Febrero (mes 1): su último día real (28 o 29) cierra el mes comercial
    // en 30. `ultimoDelMes` conoce el año bisiesto, así que 2028 sale solo.
    if (f.getUTCMonth() === 1 && dia === ultimoDelMes) return 30;
    return Math.min(dia, 30);
  };
  const meses =
    (h.getUTCFullYear() - d.getUTCFullYear()) * 12 + (h.getUTCMonth() - d.getUTCMonth());
  return meses * 30 + (diaComercial(h) - diaComercial(d)) + 1;
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

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "2026-06-01" → "1 junio 2026". Parseo manual (no Date) para evitar
// ambigüedad de timezone en fechas YYYY-MM-DD (mismo motivo que diaSemana).
export function formatFechaLegible(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return `${d} ${MESES_LARGOS[m - 1]} ${y}`;
}

// "2026-06-01", "2026-06-15" → "1 — 15 junio 2026" (mismo mes/año) o
// "28 junio — 5 julio 2026" (cruza mes) — evita repetir el año/mes cuando
// coinciden, más legible en listas y encabezados de periodo.
export function formatRangoFechas(desde: string, hasta: string): string {
  const [yd, md, dd] = desde.split("-").map(Number);
  const [yh, mh, dh] = hasta.split("-").map(Number);
  if (yd === yh && md === mh) return `${dd} — ${dh} ${MESES_LARGOS[md - 1]} ${yd}`;
  if (yd === yh) return `${dd} ${MESES_LARGOS[md - 1]} — ${dh} ${MESES_LARGOS[mh - 1]} ${yd}`;
  return `${formatFechaLegible(desde)} — ${formatFechaLegible(hasta)}`;
}
