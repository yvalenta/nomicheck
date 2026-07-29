import type { CodigoConcepto, LineaResultado } from "./types.js";

/**
 * Catálogo de conceptos: agrupaciones y etiquetas por idioma.
 *
 * Existe para que nadie vuelva a clasificar una línea por su texto. Antes, la
 * web decidía qué ícono poner y qué contaba como "ingreso salarial" con
 * `concepto.startsWith("Recargo")` — se rompía al reescribir una etiqueta, y
 * hacía imposible traducir el recibo sin romper la lógica.
 */

/** Idiomas en que el motor sabe rotular sus líneas. */
export type Locale = "es" | "en";

/** Recargos y horas extra — la vista "Recargos y extras" del recibo. */
export const CODIGOS_RECARGO_EXTRA = [
  "RECARGO_NOCTURNO",
  "RECARGO_DOMINICAL",
  "RECARGO_NOCTURNO_DOMINICAL",
  "HORA_EXTRA_DIURNA",
  "HORA_EXTRA_NOCTURNA",
  "HORA_EXTRA_DOMINICAL_DIURNA",
  "HORA_EXTRA_DOMINICAL_NOCTURNA",
] as const satisfies readonly CodigoConcepto[];

/**
 * Ingresos que constituyen salario o su equivalente contractual.
 *
 * Ojo: el auxilio de transporte entra acá porque el comprobante lo presenta
 * entre los ingresos salariales, pero **no hace base para salud/pensión**
 * (Ley 15 de 1959, art. 2). El IBC se arma aparte, en cada calculadora.
 */
export const CODIGOS_INGRESO_SALARIAL = [
  "SALARIO_BASE",
  "AUXILIO_SOSTENIMIENTO",
  "AUXILIO_TRANSPORTE",
  "HONORARIOS",
  ...CODIGOS_RECARGO_EXTRA,
] as const satisfies readonly CodigoConcepto[];

const RECARGO_EXTRA = new Set<string>(CODIGOS_RECARGO_EXTRA);
const INGRESO_SALARIAL = new Set<string>(CODIGOS_INGRESO_SALARIAL);

export function esRecargoOExtra(l: Pick<LineaResultado, "codigo">): boolean {
  return RECARGO_EXTRA.has(l.codigo);
}

export function esIngresoSalarial(l: Pick<LineaResultado, "codigo">): boolean {
  return INGRESO_SALARIAL.has(l.codigo);
}

/** Devengo base del periodo, sin recargos: lo que se paga por existir el contrato. */
export function esDevengoBase(l: Pick<LineaResultado, "codigo">): boolean {
  return (
    l.codigo === "SALARIO_BASE" ||
    l.codigo === "AUXILIO_SOSTENIMIENTO" ||
    l.codigo === "AUXILIO_TRANSPORTE" ||
    l.codigo === "HONORARIOS"
  );
}

/**
 * Etiqueta de cada concepto por idioma.
 *
 * El inglés es para consumidores del API que no operan en español (SDD: la
 * entrega a Execution Market). **No traduce el campo `ley`**: una cita legal
 * es un nombre propio — "Ley 2466 de 2025" traducido a "Law 2466 of 2025" no
 * se encuentra en ningún buscador ni en el Diario Oficial. Se deja tal cual.
 */
export const ETIQUETAS_CONCEPTO: Record<CodigoConcepto, Record<Locale, string>> = {
  SALARIO_BASE: { es: "Salario básico", en: "Base salary" },
  AUXILIO_SOSTENIMIENTO: { es: "Auxilio de sostenimiento", en: "Apprentice stipend" },
  AUXILIO_TRANSPORTE: { es: "Auxilio de transporte", en: "Transport allowance" },
  HONORARIOS: { es: "Honorarios", en: "Professional fees" },
  RECARGO_NOCTURNO: { es: "Recargo nocturno", en: "Night differential" },
  RECARGO_DOMINICAL: { es: "Recargo dominical/festivo", en: "Sunday/holiday differential" },
  RECARGO_NOCTURNO_DOMINICAL: {
    es: "Recargo nocturno dominical/festivo",
    en: "Night differential on Sunday/holiday",
  },
  HORA_EXTRA_DIURNA: { es: "Hora extra diurna", en: "Daytime overtime" },
  HORA_EXTRA_NOCTURNA: { es: "Hora extra nocturna", en: "Night overtime" },
  HORA_EXTRA_DOMINICAL_DIURNA: {
    es: "Hora extra dominical/festiva diurna",
    en: "Daytime overtime on Sunday/holiday",
  },
  HORA_EXTRA_DOMINICAL_NOCTURNA: {
    es: "Hora extra dominical/festiva nocturna",
    en: "Night overtime on Sunday/holiday",
  },
  AJUSTE_AUSENTISMO: { es: "Ajuste por ausentismo", en: "Unpaid absence adjustment" },
  SALUD_EMPLEADO: { es: "Salud (aporte empleado)", en: "Health contribution (employee)" },
  PENSION_EMPLEADO: { es: "Pensión (aporte empleado)", en: "Pension contribution (employee)" },
  FONDO_SOLIDARIDAD: { es: "Fondo de solidaridad pensional", en: "Pension solidarity fund" },
  APORTE_AFC: { es: "Aporte AFC (convenio)", en: "AFC savings (agreed deduction)" },
  PRESTAMO: { es: "Préstamo (convenio)", en: "Loan (agreed deduction)" },
  AHORRO: { es: "Ahorro (convenio)", en: "Savings (agreed deduction)" },
  REPROCESO: { es: "Reproceso", en: "Rework charge" },
  EMBARGO_JUDICIAL: { es: "Embargo judicial", en: "Court-ordered garnishment" },
  PROVISION_CESANTIAS: { es: "Provisión cesantías", en: "Severance accrual" },
  PROVISION_INTERESES_CESANTIAS: {
    es: "Provisión intereses sobre cesantías",
    en: "Severance interest accrual",
  },
  PROVISION_PRIMA: { es: "Provisión prima de servicios", en: "Statutory bonus accrual" },
  PROVISION_VACACIONES: { es: "Provisión vacaciones", en: "Vacation accrual" },
  LIQUIDACION_FINAL_CESANTIAS: { es: "Liquidación final — cesantías", en: "Final settlement — severance" },
  LIQUIDACION_FINAL_INTERESES_CESANTIAS: {
    es: "Liquidación final — intereses a las cesantías",
    en: "Final settlement — severance interest",
  },
  LIQUIDACION_FINAL_PRIMA: {
    es: "Liquidación final — prima de servicios",
    en: "Final settlement — statutory bonus",
  },
  LIQUIDACION_FINAL_VACACIONES: { es: "Liquidación final — vacaciones", en: "Final settlement — vacation" },
  CONCEPTO_DECLARADO: { es: "Concepto declarado", en: "Declared item" },
};

/**
 * Reescribe las etiquetas de un resultado al idioma pedido, dejando intactos
 * los importes, los códigos y las citas legales.
 *
 * Dos cosas que NO hace, a propósito:
 * - **No traduce `CONCEPTO_DECLARADO`**: ese texto lo escribió quien llamó, en
 *   su propio idioma. Traducirlo sería inventarle un nombre a un dato ajeno.
 * - **No traduce `advertencias`**: hoy son strings libres en español. La salida
 *   tipada equivalente es `issues` (SDD §15 pilar 2), y hasta que esa migración
 *   termine no hay forma honesta de traducirlas sin parsear prosa.
 */
export function traducirLineas(lineas: LineaResultado[], locale: Locale): LineaResultado[] {
  if (locale === "es") return lineas;
  return lineas.map((l) =>
    l.codigo === "CONCEPTO_DECLARADO"
      ? l
      : { ...l, concepto: ETIQUETAS_CONCEPTO[l.codigo]?.[locale] ?? l.concepto }
  );
}
