// Constantes de cálculo que NO son ReglaLegal versionada por fecha (SDD.md
// §07): son valores estructurales del CST/reforma laboral que no cambian
// por decreto anual y no necesitan panel admin. Cada una documenta su fuente
// legal para que un cambio normativo futuro sea fácil de ubicar y editar
// aquí en un solo lugar — nunca como literal suelto en la lógica de cálculo.

// --- Jornada y horario base (spec calculo-turnos, requisitos 2 y 7) ---

/** Horas de jornada ordinaria máxima diaria en domingo/festivo antes de contar como extra. CST art. 161. */
export const JORNADA_DOMINICAL_HORAS = 6;

/** Horas de jornada ordinaria máxima diaria entre semana antes de contar como extra. CST art. 161. */
export const JORNADA_HABIL_HORAS = 7;

/** Horario base por defecto martes a sábado, sin excepción declarada. */
export const HORARIO_HABIL_INICIO = "10:00";
export const HORARIO_HABIL_FIN = "17:00";

/** Horario base por defecto domingo, sin excepción declarada. */
export const HORARIO_DOMINICAL_INICIO = "10:00";
export const HORARIO_DOMINICAL_FIN = "16:00";

/**
 * Horario base semanal por defecto (índice 0=domingo … 6=sábado, null =
 * descanso): dom 10–16, lun descanso, mar–sáb 10–17. Es el punto de partida
 * editable en la UI del wizard — no una regla legal.
 */
export const HORARIO_BASE_DEFAULT: ({ horaInicio: string; horaFin: string } | null)[] = [
  { horaInicio: HORARIO_DOMINICAL_INICIO, horaFin: HORARIO_DOMINICAL_FIN },
  null,
  { horaInicio: HORARIO_HABIL_INICIO, horaFin: HORARIO_HABIL_FIN },
  { horaInicio: HORARIO_HABIL_INICIO, horaFin: HORARIO_HABIL_FIN },
  { horaInicio: HORARIO_HABIL_INICIO, horaFin: HORARIO_HABIL_FIN },
  { horaInicio: HORARIO_HABIL_INICIO, horaFin: HORARIO_HABIL_FIN },
  { horaInicio: HORARIO_HABIL_INICIO, horaFin: HORARIO_HABIL_FIN },
];

// --- Jornada nocturna (Ley 2466 de 2025, art. 3 — vigente desde 25-dic-2025) ---

/** Hora del día (24h) en que inicia la jornada nocturna. */
export const HORA_INICIO_JORNADA_NOCTURNA = 19;

/** Hora del día (24h) en que termina la jornada nocturna. */
export const HORA_FIN_JORNADA_NOCTURNA = 6;

// --- Conversión de tiempo ---

export const MINUTOS_POR_HORA = 60;
export const MINUTOS_POR_DIA = 24 * MINUTOS_POR_HORA;

// --- Auxilio de transporte (spec calculo-turnos) ---

/** Divisor de días de mes comercial usado para prorratear el auxilio de transporte en periodos parciales. */
export const DIAS_MES_COMERCIAL = 30;

// --- Fondo de solidaridad pensional (Ley 797 de 2003, art. 8) ---
//
// Verificado 16-jul-2026: la reforma pensional (Ley 2381 de 2024), que
// modificaría esta tabla, sigue SUSPENDIDA por la Corte Constitucional
// (auto 841/25) por vicio de trámite legislativo — el sistema pensional
// sigue bajo Ley 100 de 1993 / Ley 797 de 2003. Si la reforma se reactiva,
// esta tabla debe revisarse (ver SDD.md §03 Módulo A).
//
// Estructura: rangos en múltiplos de SMLMV, ordenados de menor a mayor.
// `desdeSmlmv` es el límite inferior inclusive del rango.
export const TABLA_FONDO_SOLIDARIDAD: { desdeSmlmv: number; pct: number }[] = [
  { desdeSmlmv: 4, pct: 0.01 },
  { desdeSmlmv: 16, pct: 0.012 },
  { desdeSmlmv: 17, pct: 0.014 },
  { desdeSmlmv: 18, pct: 0.016 },
  { desdeSmlmv: 19, pct: 0.018 },
  { desdeSmlmv: 20, pct: 0.02 },
];

// --- Redondeo monetario ---

/** Decimales usados para redondear valores monetarios (pesos colombianos, sin centavos fraccionados en la práctica). */
export const DECIMALES_REDONDEO = 2;
