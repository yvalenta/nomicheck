import type { ReglaLegal, TipoContrato } from "./types.js";
import { comoResolutor, type ResolutorReglas } from "./utils.js";
import {
  PATRON_APRENDIZ_MAX_PCT_SMLMV,
  PATRON_APRENDIZ_MIN_PCT_SMLMV,
} from "./constantes.js";

// Compartida por ambas calculadoras laborales (turnos y salario fijo) —
// aplica antes de cualquier cálculo, con el salario/honorario ya conocido.

/**
 * Si un contrato "indefinido" declara un salario dentro del rango que la ley
 * reserva al auxilio de sostenimiento de un aprendiz SENA en práctica (50%-75%
 * SMLMV, Ley 789 de 2002 art. 30), advierte el posible mal registro — nunca
 * recalcula ni reclasifica automáticamente.
 */
export function advertenciaPatronAprendiz(
  salarioBasicoMensual: number,
  tipoContrato: TipoContrato | undefined,
  reglas: ReglaLegal[] | ResolutorReglas,
  fecha: string
): string | undefined {
  if (tipoContrato !== undefined && tipoContrato !== "indefinido") return undefined;
  const r = comoResolutor(reglas);
  const smlmv = r.en("smlmv", fecha);
  const min = smlmv * PATRON_APRENDIZ_MIN_PCT_SMLMV;
  const max = smlmv * PATRON_APRENDIZ_MAX_PCT_SMLMV;
  if (salarioBasicoMensual < min || salarioBasicoMensual > max) return undefined;
  return (
    `El salario declarado ($${salarioBasicoMensual.toLocaleString("es-CO")}) está entre ${PATRON_APRENDIZ_MIN_PCT_SMLMV * 100}% y ${PATRON_APRENDIZ_MAX_PCT_SMLMV * 100}% de un SMLMV ($${smlmv.toLocaleString("es-CO")}) — el rango que la ley reserva al auxilio de sostenimiento de un aprendiz SENA en etapa práctica (Ley 789 de 2002, art. 30). ` +
    `Si esta persona es realmente un aprendiz, debería liquidarse con el tipo de contrato correspondiente, no como "indefinido".`
  );
}

const LABEL_TERMINO: Record<"fijo" | "obra_labor" | "tiempo_parcial", string> = {
  fijo: "a término fijo",
  obra_labor: "por obra o labor",
  tiempo_parcial: "a tiempo parcial",
};

/**
 * Los contratos a término fijo, por obra/labor y de tiempo parcial liquidan
 * exactamente igual que el indefinido período a período (recargos, extras y
 * deducciones de ley no dependen del tipo de término, CST). La diferencia
 * real está en preaviso e indemnización al terminar el contrato, que este
 * verificador de nómina periódica no calcula — se advierte en vez de omitir
 * silenciosamente esa limitación.
 */
export function advertenciaTerminoNoIndefinido(tipoContrato: TipoContrato | undefined): string | undefined {
  if (tipoContrato !== "fijo" && tipoContrato !== "obra_labor" && tipoContrato !== "tiempo_parcial") {
    return undefined;
  }
  return (
    `Este contrato ${LABEL_TERMINO[tipoContrato]} se liquida igual que uno indefinido para este periodo (los recargos, ` +
    `las horas extra y las deducciones de ley no cambian por el tipo de término). Lo que SÍ puede ser distinto — preaviso ` +
    `e indemnización si el contrato termina antes de tiempo — no lo calcula este verificador.`
  );
}
