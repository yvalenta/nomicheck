// Motor de QA de nómina pre-pago (SDD §15, pilar 2). Determinista, TS puro,
// sin dependencias — reusa los mismos umbrales/reglas del resto de
// @pv/reglas (nunca los redefine). El QA no recalcula la nómina: recibe una
// pre-liquidación ya calculada + señales del motor y decide si es apta para
// pagar. Estado "rechazada" bloquea la liquidación aguas arriba (422 con los
// issues); "con_advertencias" liquida pero deja los issues persistidos.

/** Códigos estables — el frontend y las políticas de gate se apoyan en el
 * código, no en el texto del mensaje (que puede cambiar por copy). Añadir
 * códigos nuevos aquí antes de emitirlos. */
export type CodigoIssueQA =
  | "HORAS_EXTRA_EXCEDIDAS_DIA"
  | "HORAS_EXTRA_EXCEDIDAS_SEMANA"
  | "TOPE_DEDUCCIONES_SUPERADO"
  | "NETO_BAJO_MINIMO"
  | "IBC_FUERA_DE_RANGO";

export type SeveridadQA = "error" | "advertencia";

export interface IssueQA {
  codigo: CodigoIssueQA;
  severidad: SeveridadQA;
  mensaje: string;
  referenciaLegal: string;
  detalles: {
    valorCalculado: number;
    valorLimite: number;
    /** Contexto opcional (p. ej. la fecha del día o la semana afectada). */
    contexto?: string;
  };
}

export interface ResultadoQA {
  estado: "aprobada" | "con_advertencias" | "rechazada";
  /** 0-100, determinista: 100 − 25 por error − 5 por advertencia (piso 0). */
  score: number;
  issues: IssueQA[];
}

/** Señales que el QA necesita, pre-computadas por el llamador a partir de la
 * liquidación (recibo + turnos). El QA no calcula la nómina, solo valida. */
export interface DatosQA {
  fecha: string;
  periodoDesde: string;
  periodoHasta: string;
  /** Total devengado del periodo (sin provisiones), tal como en ResultadoNomina. */
  totalDevengado: number;
  /** Total deducciones del periodo, YA con topes aplicados por aplicarDeducciones. */
  totalDeducciones: number;
  /** Neto que recibirá el trabajador. */
  netoPagado: number;
  /** IBC del periodo — leído del campo `base` de la línea "Salud (aporte empleado)". */
  ibcPeriodo: number;
  /** Issues ya detectados por el motor durante el cálculo (horas extra,
   * tope del art. 149…). El QA los incluye tal cual en su ResultadoQA y
   * agrega los que dependen de la vista global del recibo (IBC, neto). */
  issuesMotor?: IssueQA[];
}
