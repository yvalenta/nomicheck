// Liquidación final de un contrato terminado, sin base de datos.
//
// `apps/api/src/services/liquidacionFinalService.ts` hace lo mismo para una
// empresa con historial en NomiCheck: lee los recibos previos para saber qué
// se provisionó y persiste un recibo de cierre. Eso no sirve para vender el
// cálculo a un tercero — el comprador no tiene recibos nuestros.
//
// Acá el historial ENTRA por parámetro. Es la misma información que trae
// cualquier planilla de liquidación colombiana: hasta cuándo se pagó la prima,
// hasta cuándo se consignaron las cesantías, cuántos días de vacaciones se
// disfrutaron. Cuando alguno falta se asume el caso simple (nunca se pagó) y
// **se declara el supuesto en la salida**: el motor no devuelve un número
// plausible sin decir sobre qué lo construyó.
import { calcularIndemnizacion, type DatosIndemnizacion } from "./indemnizacion.js";
import { calcularPrestacionesSociales } from "./prestaciones.js";
import type { LineaResultado, ReglaLegal } from "./types.js";
import { comoResolutor, diaSiguiente, type ResolutorReglas } from "./utils.js";

export interface DatosLiquidacionFinal {
  fechaIngreso: string;
  /** Último día del contrato. Se liquida hasta acá, inclusive. */
  fechaRetiro: string;
  salarioBase: number;
  /** Meses de salario ORDINARIO variable (comisiones, bonificaciones habituales). Si se envían, la base prestacional es su promedio y no `salarioBase` — CST art. 253. Entran a las cuatro prestaciones, vacaciones incluidas. */
  devengosVariables?: { mes: string; valor: number }[];
  /** Meses de horas extra y trabajo en descanso obligatorio. Van aparte: CST art. 192 num. 1 los excluye de vacaciones, pero hacen base de cesantías y prima. Es la diferencia entre liquidar bien y sobreliquidar las vacaciones de quien hizo muchas extras. */
  devengosSuplementarios?: { mes: string; valor: number }[];
  /** Monto mensual del auxilio si el trabajador tiene derecho. Entra a cesantías y prima, no a vacaciones. */
  auxilioTransporte?: number;
  /** Última fecha hasta la que YA se pagó prima. Si falta, se liquida desde el ingreso. */
  cortePrima?: string;
  /** Última fecha hasta la que YA se consignaron cesantías. Si falta, se liquidan desde el ingreso. */
  corteCesantias?: string;
  /** Días de vacaciones ya disfrutados. Si falta, se asume que no tomó ninguno. */
  diasVacacionesTomados?: number;
  /** Días sin remuneración (suspensión, licencia no remunerada) que no causan prestaciones. */
  diasSuspension?: string[];
  /** Si se envía, agrega la línea de indemnización. Su ausencia significa que no se pide, no que sea cero. */
  indemnizacion?: DatosIndemnizacion;
}

export interface ResultadoLiquidacionFinal {
  lineas: LineaResultado[];
  total: number;
  /** Defaults que se aplicaron por falta de dato. Vacío = todo vino explícito. */
  supuestos: string[];
  advertencias: string[];
}

/**
 * Liquidación final: las cuatro prestaciones pendientes al retiro, más la
 * indemnización si se pidió.
 *
 * Cada concepto se liquida sobre SU propio tramo, porque no todos se pagan al
 * mismo ritmo: la prima se paga en junio y diciembre, las cesantías se
 * consignan al fondo antes del 14 de febrero, y las vacaciones se disfrutan
 * cuando se puede. Liquidar los tres desde la misma fecha es el error clásico
 * de una planilla hecha a mano — paga de más lo ya pagado.
 */
export function calcularLiquidacionFinal(
  datos: DatosLiquidacionFinal,
  reglas: ReglaLegal[] | ResolutorReglas
): ResultadoLiquidacionFinal {
  const supuestos: string[] = [];
  const advertencias: string[] = [];

  const desdeCesantias = datos.corteCesantias ? diaSiguiente(datos.corteCesantias) : datos.fechaIngreso;
  if (!datos.corteCesantias) {
    supuestos.push(
      "No se informó hasta cuándo se consignaron las cesantías: se liquidan desde la fecha de ingreso. Si ya se consignó alguna anualidad al fondo, esta cifra la está pagando de nuevo."
    );
  }

  const desdePrima = datos.cortePrima ? diaSiguiente(datos.cortePrima) : datos.fechaIngreso;
  if (!datos.cortePrima) {
    supuestos.push(
      "No se informó hasta cuándo se pagó la prima de servicios: se liquida desde la fecha de ingreso. Si ya se pagó la de algún semestre, esta cifra la está pagando de nuevo."
    );
  }

  if (datos.diasVacacionesTomados === undefined) {
    supuestos.push(
      "No se informaron días de vacaciones disfrutados: se asume que no tomó ninguno y se liquidan todas las causadas."
    );
  }

  const comunes = {
    salarioBase: datos.salarioBase,
    devengosVariables: datos.devengosVariables,
    devengosSuplementarios: datos.devengosSuplementarios,
    auxilioTransporte: datos.auxilioTransporte,
    diasSuspension: datos.diasSuspension,
  };

  // Tres cortes distintos, tres llamadas. De cada una se toma solo lo que ese
  // tramo justifica; mezclarlas sería atribuirle a un concepto el tiempo de otro.
  const porCesantias =
    desdeCesantias <= datos.fechaRetiro
      ? calcularPrestacionesSociales({ ...comunes, fechaIngreso: desdeCesantias, fechaCorte: datos.fechaRetiro })
      : null;
  const porPrima =
    desdePrima <= datos.fechaRetiro
      ? calcularPrestacionesSociales({ ...comunes, fechaIngreso: desdePrima, fechaCorte: datos.fechaRetiro })
      : null;
  // Las vacaciones se causan sobre TODO el tiempo servido; lo disfrutado se
  // resta en días, no acortando el tramo — por eso acá sí se va desde el ingreso.
  const porVacaciones = calcularPrestacionesSociales({
    ...comunes,
    fechaIngreso: datos.fechaIngreso,
    fechaCorte: datos.fechaRetiro,
    diasVacacionesTomados: datos.diasVacacionesTomados,
  });
  advertencias.push(...porVacaciones.advertencias);

  const lineas: LineaResultado[] = [
    {
      codigo: "LIQUIDACION_FINAL_CESANTIAS",
      concepto: "Liquidación final — cesantías",
      tipo: "devengo",
      valorCalculado: porCesantias?.cesantias ?? 0,
      ley: "CST art. 249",
    },
    {
      codigo: "LIQUIDACION_FINAL_INTERESES_CESANTIAS",
      concepto: "Liquidación final — intereses a las cesantías",
      tipo: "devengo",
      valorCalculado: porCesantias?.interesesCesantias ?? 0,
      ley: "Ley 52 de 1975, art. 1",
    },
    {
      codigo: "LIQUIDACION_FINAL_PRIMA",
      concepto: "Liquidación final — prima de servicios",
      tipo: "devengo",
      valorCalculado: porPrima?.prima ?? 0,
      ley: "CST art. 306",
    },
    {
      codigo: "LIQUIDACION_FINAL_VACACIONES",
      concepto: "Liquidación final — vacaciones",
      tipo: "devengo",
      valorCalculado: porVacaciones.vacaciones,
      ley: "CST art. 186",
    },
  ];

  if (datos.indemnizacion) {
    const ind = calcularIndemnizacion(datos.indemnizacion, comoResolutor(reglas));
    lineas.push({
      codigo: "INDEMNIZACION_DESPIDO",
      concepto: "Indemnización por despido sin justa causa",
      tipo: "devengo",
      valorCalculado: ind.valor,
      ley: ind.ley,
    });
    // La explicación del motor de indemnización vale también acá: un cero con
    // motivo legal no es lo mismo que un cero por no haberlo pedido.
    if (ind.valor === 0) advertencias.push(ind.explicacion);
  }

  const total = lineas.reduce((s, l) => s + l.valorCalculado, 0);
  return { lineas, total, supuestos, advertencias };
}
