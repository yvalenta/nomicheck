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

// --- Prestaciones sociales (año comercial de 360 días, CST) ---
//
// El "año comercial" de 360 días (12 meses de 30) es una convención legal
// fija: NO es el año calendario. Un año bisiesto (2028: 366 días reales) no
// altera ninguna de estas fórmulas — verificado con test dedicado en
// prestaciones.test.ts.

/** Año comercial: 12 meses de 30 días, base de cesantías/intereses/vacaciones. CST art. 249, 235. */
export const DIAS_ANO_COMERCIAL = 360;

/** Intereses sobre cesantías: 12% anual sobre el valor de las cesantías causadas. Ley 52 de 1975, art. 1. */
export const PCT_INTERES_CESANTIAS = 0.12;

/** Vacaciones: 15 días hábiles por año de servicio ⇒ divisor 720 (2×360) sobre el salario. CST art. 186. */
export const DIVISOR_VACACIONES = 720;

/** Prima de servicios: tope de 180 días por semestre (jun/dic), aunque el semestre calendario tenga más. CST art. 306, mod. Ley 1788 de 2016. */
export const DIAS_MAX_SEMESTRE_PRIMA = 180;

// --- Prestación de servicios (contratista independiente) ---
//
// No son ReglaLegal versionada: son tasas del sistema de seguridad social
// fijadas por ley, no ajustadas por decreto anual como el SMLMV.

/** IBC del independiente: 40% del ingreso mensual (no el 100%). Ley 1819 de 2016, art. 244. */
export const PCT_IBC_INDEPENDIENTE = 0.4;

/** Aporte a salud del independiente — paga el 100% (no hay empleador que asuma la mitad). Ley 100 de 1993, art. 204. */
export const PCT_SALUD_INDEPENDIENTE = 0.125;

// --- Patrón sospechoso de aprendizaje mal clasificado ---
//
// Ley 789 de 2002, art. 30: el aprendiz SENA en etapa práctica recibe entre
// 50% y 75% de un SMLMV como auxilio de sostenimiento (etapa lectiva es
// menor aún, pero varía por entidad). Un contrato "indefinido" declarado con
// un salario dentro de ese rango es una señal — no una prueba — de que en
// realidad se trata de un aprendiz mal registrado como empleado ordinario.

/** Piso del rango sospechoso, en múltiplos de SMLMV. */
export const PATRON_APRENDIZ_MIN_PCT_SMLMV = 0.5;

/** Techo del rango sospechoso, en múltiplos de SMLMV. */
export const PATRON_APRENDIZ_MAX_PCT_SMLMV = 0.75;

// --- Costo patronal (aportes del EMPLEADOR, no del empleado) ---
//
// Tarifas estructurales del sistema — no cambian por decreto anual como el
// SMLMV, por eso viven aquí y no como ReglaLegal versionada.

/** Salud a cargo del empleador: 8.5% del IBC. Ley 100 de 1993, art. 204. Exonerable (Ley 1607 de 2012, art. 25) para salarios < 10 SMLMV en empresas contribuyentes de renta. */
export const PCT_SALUD_EMPLEADOR = 0.085;

/** Pensión a cargo del empleador: 12% del IBC. Ley 100 de 1993, art. 20. NO exonerable. */
export const PCT_PENSION_EMPLEADOR = 0.12;

/** Caja de compensación familiar: 4% de la nómina. Ley 21 de 1982. NO exonerable. */
export const PCT_CAJA_COMPENSACION = 0.04;

/** SENA: 2% de la nómina. Ley 21 de 1982. Exonerable junto con salud (Ley 1607 de 2012, art. 25). */
export const PCT_SENA = 0.02;

/** ICBF: 3% de la nómina. Ley 89 de 1988. Exonerable junto con salud (Ley 1607 de 2012, art. 25). */
export const PCT_ICBF = 0.03;

/** Umbral de exoneración parafiscal por trabajador: salarios < 10 SMLMV (Ley 1607 de 2012, art. 25). */
export const EXONERACION_UMBRAL_SMLMV = 10;

/** Tarifas de ARL por clase de riesgo (I a V). Decreto 1772 de 1994, art. 13 (valores iniciales de la tabla vigente). El empleador paga el 100%. */
export const TARIFAS_ARL: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0.00522,
  2: 0.01044,
  3: 0.02436,
  4: 0.0435,
  5: 0.0696,
};

// --- Indemnización por terminación sin justa causa (CST art. 64, modificado por la Ley 50 de 1990, art. 6) ---
//
// El umbral de 10 SMLMV separa dos escalas de días de indemnización para
// contrato indefinido/tiempo parcial. Son cifras estructurales de la ley,
// no ReglaLegal versionada por decreto anual.

/** Umbral de salario (en SMLMV) que separa las dos escalas de indemnización. */
export const INDEMNIZACION_UMBRAL_SALARIO_SMLMV = 10;

/** Bajo el umbral: días del primer año de indemnización. */
export const INDEMNIZACION_DIAS_PRIMER_ANIO_BAJO_UMBRAL = 30;
/** Bajo el umbral: días adicionales por cada año subsiguiente (proporcional por fracción). */
export const INDEMNIZACION_DIAS_ANIO_ADICIONAL_BAJO_UMBRAL = 20;

/** Igual o sobre el umbral: días del primer año de indemnización. */
export const INDEMNIZACION_DIAS_PRIMER_ANIO_SOBRE_UMBRAL = 20;
/** Igual o sobre el umbral: días adicionales por cada año subsiguiente (proporcional por fracción). */
export const INDEMNIZACION_DIAS_ANIO_ADICIONAL_SOBRE_UMBRAL = 15;

/** Aporte a pensión del independiente — paga el 100%. Ley 100 de 1993, art. 20. */
export const PCT_PENSION_INDEPENDIENTE = 0.16;

// --- Redondeo monetario ---

// El peso colombiano no circula con fracciones (no hay centavos en la
// práctica). Cada línea del resultado se redondea al peso entero ANTES de
// sumar — si se redondeara solo al mostrar (con decimales internos aún
// vivos en el total), un empleado que multiplica horas × valor unitario
// impreso podía obtener un resultado distinto al total mostrado por
// unos pocos pesos ("paradoja de la calculadora", detectada 2026-07 en
// una liquidación real). Redondear cada línea primero garantiza que la
// suma de lo impreso siempre cuadre exactamente con el total impreso.
export const DECIMALES_REDONDEO = 0;
