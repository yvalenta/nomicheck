// Tipos compartidos entre web, api y el motor de cálculo

export type ModoCalculo = "turnos" | "salario-fijo" | "servicios";

// El motor asume tácitamente término indefinido salvo que se indique lo
// contrario. Aprendizaje SENA sigue siendo una relación con horario (turnos
// aplican) — solo cambian deducciones/devengo base, por eso vive aquí y no
// como un modo de cálculo distinto (a diferencia de "servicios", ver
// DatosNominaServicios).
export type TipoContrato = "indefinido" | "aprendizaje_sena_lectiva" | "aprendizaje_sena_practica";

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
  trabajo: boolean; // false = ese día no trabajó (descanso, permiso)
  horaInicio?: string; // requeridas cuando trabajo=true
  horaFin?: string;
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
  advertencias: string[];
}

export interface LineaResultado {
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
  /** Últimos meses devengados si el salario varía — promedio de estos (o del tiempo servido si es menor a 12). */
  devengosVariables?: DevengoMensual[];
  /** Monto mensual vigente del auxilio de transporte. Solo afecta la base de cesantías (Ley 15 de 1959, art. 7) — NO prima ni vacaciones. */
  auxilioTransporte?: number;
  /** Fechas (YYYY-MM-DD) excluidas del conteo por suspensión disciplinaria o licencia no remunerada — interrumpen el contrato para efecto de estas 4 prestaciones. */
  diasSuspension?: string[];
}

export interface ResultadoPrestaciones {
  diasTrabajadosAcumulado: number;
  cesantias: number;
  interesesCesantias: number;
  prima: number;
  vacaciones: number;
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
