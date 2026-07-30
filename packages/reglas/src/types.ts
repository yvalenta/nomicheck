// Tipos compartidos entre web, api y el motor de cálculo

export type ModoCalculo = "turnos" | "salario-fijo" | "servicios";

// El motor asume tácitamente término indefinido salvo que se indique lo
// contrario. Aprendizaje SENA sigue siendo una relación con horario (turnos
// aplican) — solo cambian deducciones/devengo base, por eso vive aquí y no
// como un modo de cálculo distinto (a diferencia de "servicios", ver
// DatosNominaServicios). "fijo"/"obra_labor"/"tiempo_parcial" liquidan
// exactamente igual que "indefinido" período a período (CST: recargos,
// extras y deducciones de ley no dependen del tipo de término) — la
// diferencia real entre estos contratos está en preaviso/indemnización al
// terminar, fuera del alcance de un verificador de nómina periódica; se
// advierte explícitamente en vez de fingir una rama de cálculo que no
// existe en la ley.
export type TipoContrato =
  | "indefinido"
  | "fijo"
  | "obra_labor"
  | "tiempo_parcial"
  | "aprendizaje_sena_lectiva"
  | "aprendizaje_sena_practica";

export interface ReglaLegal {
  clave: string;
  valor: number;
  vigenteDesde: string; // ISO date YYYY-MM-DD
  vigenteHasta?: string;
  fuente?: string;
}

export interface Festivo {
  fecha: string; // ISO date YYYY-MM-DD
  nombre: string;
}

// Entrada para el modo turnos: el usuario declara TIEMPO (horario semanal y
// novedades por día), nunca conceptos contables — el motor clasifica (SDD §12).
export interface HorarioDia {
  horaInicio: string; // HH:mm
  horaFin: string; // HH:mm
}

export interface NovedadDia {
  fecha: string; // YYYY-MM-DD
  trabajo: boolean; // false = ese día no trabajó (descanso, permiso, ausentismo)
  horaInicio?: string; // requeridas cuando trabajo=true
  horaFin?: string;
  // Solo aplica cuando trabajo=false: descanso/permiso remunerado (default,
  // ej. descanso dominical) vs ausentismo NO remunerado (incapacidad no
  // reconocida, inasistencia injustificada, etc.). El motor NUNCA reduce en
  // silencio el "Salario básico" del periodo — si hay días no remunerados,
  // agrega una línea de deducción explícita ("Regla 2": transparencia en
  // ausentismos, ver calculadoraTurnos.ts).
  remunerada?: boolean;
}

export interface DatosNominaTurnos {
  modo: "turnos";
  salarioBasicoMensual: number;
  recibeAuxilioTransporte: boolean;
  periodoDesde: string; // YYYY-MM-DD
  periodoHasta: string; // YYYY-MM-DD
  // Horario base semanal: índice 0=domingo … 6=sábado; null = día de descanso.
  horarioBase: (HorarioDia | null)[];
  // Días que difieren del horario base (no trabajó, o trabajó otras horas).
  novedades: NovedadDia[];
  // Deducciones por convenio, monto fijo mensual autorizado por el
  // trabajador (Fase 1 — ver deducciones.ts). Cada una se prorratea por
  // días del periodo igual que el auxilio de transporte. undefined/0 =
  // sin esa deducción. Checks simples e independientes en la UI — el
  // empleador solo marca las que aplican, cada una con su monto.
  aporteAfcMensual?: number;
  prestamoMensual?: number;
  ahorroMensual?: number;
  reprocesoMensual?: number;
  // Embargo judicial mensual (ordinario CST art. 154-155, o alimentos/
  // cooperativa art. 156). Se prorratea por días del periodo y se limita al
  // tope legal de cada régimen — ver deducciones.ts, limiteEmbargo().
  descuentoJudicial?: DescuentoJudicial;
  /** Default "indefinido" — ver TipoContrato. */
  tipoContrato?: TipoContrato;
}

export type TipoEmbargo = "ordinario" | "alimentos_o_cooperativa";

export interface DescuentoJudicial {
  tipo: TipoEmbargo;
  /** Monto mensual ordenado por el juzgado/entidad. */
  valorMensual: number;
}

// Entrada para el modo salario fijo
export interface DatosNominaFija {
  modo: "salario-fijo";
  salarioBasicoMensual: number;
  recibeAuxilioTransporte: boolean;
  periodoDesde: string;
  periodoHasta: string;
  conceptos: ConceptoNomina[];
  /** Default "indefinido" — ver TipoContrato. */
  tipoContrato?: TipoContrato;
}

// Entrada para prestación de servicios (contratista independiente) — NO es
// contrato laboral (SDD §07): no hay auxilio de transporte, recargos ni
// prestaciones sociales, y el IBC de seguridad social es 40% del ingreso
// (no 100%). Por eso es un modo de cálculo propio, no una variante de
// DatosNominaFija.
export interface DatosNominaServicios {
  modo: "servicios";
  honorariosMensuales: number;
  periodoDesde: string;
  periodoHasta: string;
  conceptos?: ConceptoNomina[];
}

export interface ConceptoNomina {
  codigo?: string;
  nombre: string;
  tipo: "devengo-legal" | "devengo-extralegal" | "deduccion-legal" | "deduccion-convenio";
  base?: number;
  valor: number;
}

// Resultado unificado de ambas calculadoras
export interface ResultadoNomina {
  modo: ModoCalculo;
  periodoDesde: string;
  periodoHasta: string;
  salarioBasicoMensual: number;
  lineas: LineaResultado[];
  totalDevengos: number;
  totalDeducciones: number;
  netoEsperado: number;
  /** Mensajes libres del motor — legacy, se conservan para el semáforo y la UI.
   * Migración en curso (SDD §15 pilar 2) hacia `issues` tipado; por ahora
   * ambos coexisten (los issues emiten también su mensaje al string). */
  advertencias: string[];
  /** Issues tipados que el motor detectó durante el cálculo (horas extra
   * excedidas, tope del art. 149 activado, etc.). El QA pre-pago los consume
   * directamente (SDD §15 pilar 2) sin re-parsear los strings de arriba. */
  issues: import("./qa/tipos.js").IssueQA[];
  /** Salario mensual / 30 — dato de cabecera del comprobante. */
  valorDia?: number;
  /** Salario mensual / divisor vigente al cierre del periodo (220 ó 210, Ley 2101 de 2021). */
  valorHoraOrdinaria?: number;
  /** Días efectivamente laborados (con turno), no días calendario del periodo — solo modo turnos. */
  diasLaborados?: number;
  /** Desglose día a día del periodo — solo modo turnos. Ver `DetalleDia`. */
  detalleDias?: DetalleDia[];
}

/**
 * Un día del periodo, con sus horas y su parte proporcional del dinero.
 *
 * **Es informativo, no una liquidación diaria.** La nómina no se liquida por
 * día: el salario y el auxilio remuneran el mes y acá se prorratean sobre el
 * mes comercial de 30; las deducciones de ley se calculan sobre el IBC del
 * periodo completo y acá se reparten en proporción al devengo salarial de cada
 * día. Lo único genuinamente diario son las horas y los recargos que causan.
 *
 * Por eso la suma de `netoDia` puede diferir del `netoEsperado` en unos pocos
 * pesos: cada día se redondea por separado.
 */
export interface DetalleDia {
  fecha: string; // YYYY-MM-DD
  /** Domingo o festivo: día de descanso obligatorio (CST art. 172 y 177). */
  esDominicalFestivo: boolean;
  /** Festivo del calendario (no domingo) — para distinguirlo en la UI. */
  esFestivo: boolean;
  /** Hubo turno ese día. */
  trabajado: boolean;
  /** Ausencia declarada explícitamente como NO remunerada. */
  ausenciaNoRemunerada: boolean;
  horasOrdinarias: number;
  horasExtra: number;
  /** Horas del turno que caen en jornada nocturna (desde las 7 p.m.). */
  horasNocturnas: number;
  horasTotales: number;
  /** Salario base prorrateado del día (mensual / 30). */
  salarioDia: number;
  /** Auxilio de transporte prorrateado del día. */
  auxilioDia: number;
  /** Recargos y horas extra causados ese día. */
  recargosDia: number;
  /** Salud + pensión en proporción al devengo salarial del día. */
  deduccionesDia: number;
  /** salarioDia + auxilioDia + recargosDia − deduccionesDia. */
  netoDia: number;
}

/**
 * Código estable de cada línea de la liquidación.
 *
 * **Es el contrato con los consumidores; `concepto` no lo es.** `concepto` es
 * una etiqueta para mostrar: puede reescribirse, traducirse o llevar sufijos
 * (el tramo normativo, la cantidad de días). Comparar contra esa etiqueta —
 * `concepto.startsWith("Recargo")` — se rompe en cuanto cambia el texto, y es
 * lo que hoy hacen ~100 sitios entre web, API y tests.
 *
 * Los códigos son deliberadamente neutros respecto del país donde se puede:
 * `SALARIO_BASE` y `HONORARIOS` existen en cualquier jurisdicción. Los que
 * nombran una figura propia de Colombia (`FONDO_SOLIDARIDAD`, `AUXILIO_TRANSPORTE`,
 * `PROVISION_PRIMA`) simplemente no los emite un motor de otro país.
 */
export type CodigoConcepto =
  // --- Devengos ---
  | "SALARIO_BASE"
  | "AUXILIO_SOSTENIMIENTO" // aprendiz SENA — no es salario
  | "AUXILIO_TRANSPORTE"
  | "HONORARIOS" // prestación de servicios / freelance
  | "RECARGO_NOCTURNO"
  | "RECARGO_DOMINICAL"
  | "RECARGO_NOCTURNO_DOMINICAL"
  | "HORA_EXTRA_DIURNA"
  | "HORA_EXTRA_NOCTURNA"
  | "HORA_EXTRA_DOMINICAL_DIURNA"
  | "HORA_EXTRA_DOMINICAL_NOCTURNA"
  // --- Deducciones ---
  | "AJUSTE_AUSENTISMO"
  | "SALUD_EMPLEADO"
  | "PENSION_EMPLEADO"
  | "FONDO_SOLIDARIDAD"
  | "APORTE_AFC"
  | "PRESTAMO"
  | "AHORRO"
  | "REPROCESO"
  | "EMBARGO_JUDICIAL"
  // --- Provisiones (pasivo del empleador, no dinero del periodo) ---
  | "PROVISION_CESANTIAS"
  | "PROVISION_INTERESES_CESANTIAS"
  | "PROVISION_PRIMA"
  | "PROVISION_VACACIONES"
  // --- Liquidación final (pago al terminar el contrato, no provisión) ---
  | "LIQUIDACION_FINAL_CESANTIAS"
  | "LIQUIDACION_FINAL_INTERESES_CESANTIAS"
  | "LIQUIDACION_FINAL_PRIMA"
  | "LIQUIDACION_FINAL_VACACIONES"
  /** Indemnización por despido sin justa causa (CST art. 64). NO es una
   *  prestación: es la sanción por terminar el contrato antes de tiempo, y
   *  puede ser cero mientras las cuatro de arriba se pagan igual. */
  | "INDEMNIZACION_DESPIDO"
  /** Línea que declaró quien llama (`ConceptoNomina`), no una regla del motor.
   *  Su código propio, si lo mandó, viaja en `codigoDeclarado`. */
  | "CONCEPTO_DECLARADO";

export interface LineaResultado {
  /** Identificador estable — usalo para comparar. Ver `CodigoConcepto`. */
  codigo: CodigoConcepto;
  /** Código propio de quien llamó, solo en líneas `CONCEPTO_DECLARADO`:
   *  permite correlacionar la respuesta con lo que envió. */
  codigoDeclarado?: string;
  /** Etiqueta legible. Para mostrar, nunca para comparar. */
  concepto: string;
  horas?: number;
  base?: number;
  recargoPct?: number;
  valorCalculado: number;
  // "provision": pasivo del empleador (cesantías/intereses/prima/vacaciones
  // provisionadas este periodo) — se lista en el recibo pero NO es dinero
  // que el colaborador reciba hoy, por eso ensamblarResultado la excluye de
  // totalDevengos/totalDeducciones/netoEsperado.
  tipo: "devengo" | "deduccion" | "provision";
  ley?: string; // referencia legal (ej. "Ley 2466 de 2025, art. 2")
}

// --- Prestaciones sociales (cesantías, intereses, prima, vacaciones) ---
// Cálculo independiente de las dos calculadoras Strategy: no es por periodo
// de pago sino de provisión/liquidación sobre el tiempo servido.

/** Devengo mensual real, usado cuando el salario varía (comisiones, horas extra habituales) — CST art. 253. */
export interface DevengoMensual {
  mes: string; // YYYY-MM
  valor: number;
}

export interface DatosPrestaciones {
  fechaIngreso: string; // YYYY-MM-DD
  fechaCorte: string; // YYYY-MM-DD — fin del periodo a provisionar/liquidar
  /** Salario fijo mensual. Ignorado si se pasa `devengosVariables`. */
  salarioBase: number;
  /** Últimos meses devengados de salario ORDINARIO variable (comisiones, bonificaciones habituales) — promedio de estos (o del tiempo servido si es menor a 12). Entran a la base de las cuatro prestaciones, vacaciones incluidas. */
  devengosVariables?: DevengoMensual[];
  /** Horas extra y trabajo en días de descanso obligatorio, por mes. Van aparte de `devengosVariables` porque **CST art. 192 num. 1 los excluye expresamente** de la remuneración de vacaciones ("el valor del trabajo en días de descanso obligatorio y el valor del trabajo suplementario en horas extras"), pero sí hacen base de cesantías y prima. Meterlos en `devengosVariables` sobreliquida las vacaciones. */
  devengosSuplementarios?: DevengoMensual[];
  /** Monto mensual vigente del auxilio de transporte. Entra a la base de cesantías Y de prima (Ley 1ª de 1963, art. 7: "se entiende incorporado al salario para todos los efectos"), NO a la de vacaciones — la CSJ lo excluye porque compensa un gasto que no se causa mientras el trabajador está de vacaciones. */
  auxilioTransporte?: number;
  /** Fechas (YYYY-MM-DD) excluidas del conteo por suspensión disciplinaria o licencia no remunerada — interrumpen el contrato para efecto de estas 4 prestaciones. */
  diasSuspension?: string[];
  /** Días de vacaciones ya disfrutados, que se restan de los causados. Al liquidar un retiro solo se paga lo pendiente: sin esto, quien ya tomó sus vacaciones las cobraría dos veces. */
  diasVacacionesTomados?: number;
}

export interface ResultadoPrestaciones {
  diasTrabajadosAcumulado: number;
  cesantias: number;
  interesesCesantias: number;
  prima: number;
  /** Valor de las vacaciones **pendientes** — ya descontadas las disfrutadas. */
  vacaciones: number;
  /** Días de vacación causados por el tiempo servido (15 hábiles por año, CST art. 186), antes de restar los disfrutados. */
  diasVacacionesCausados: number;
  advertencias: string[];
}

// Interfaz Strategy — las dos calculadoras implementan esto
export interface CalculadoraNomina {
  calcular(
    datos: DatosNominaTurnos | DatosNominaFija | DatosNominaServicios,
    reglas: ReglaLegal[],
    festivos: Festivo[]
  ): ResultadoNomina;
}
