// Tipos compartidos entre web, api y el motor de cálculo

export type ModoCalculo = "turnos" | "salario-fijo";

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

// Entrada para el modo turnos
export interface DatosNominaTurnos {
  modo: "turnos";
  salarioBasicoMensual: number;
  recibeAuxilioTransporte: boolean;
  periodoDesde: string; // YYYY-MM-DD
  periodoHasta: string; // YYYY-MM-DD
  dominicosTrabajaos: number;
  excepciones: ExcepcionTurno[];
}

export interface ExcepcionTurno {
  fecha: string; // YYYY-MM-DD
  horaInicio: string; // HH:mm
  horaFin: string; // HH:mm
}

// Entrada para el modo salario fijo
export interface DatosNominaFija {
  modo: "salario-fijo";
  salarioBasicoMensual: number;
  recibeAuxilioTransporte: boolean;
  periodoDesde: string;
  periodoHasta: string;
  conceptos: ConceptoNomina[];
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
  tipo: "devengo" | "deduccion";
  ley?: string; // referencia legal (ej. "Ley 2466 de 2025, art. 2")
}

// Interfaz Strategy — las dos calculadoras implementan esto
export interface CalculadoraNomina {
  calcular(
    datos: DatosNominaTurnos | DatosNominaFija,
    reglas: ReglaLegal[],
    festivos: Festivo[]
  ): ResultadoNomina;
}
