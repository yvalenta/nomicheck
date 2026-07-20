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

/**
 * Salario básico por debajo de un SMLMV en un contrato de tiempo COMPLETO
 * (indefinido/fijo/obra_labor) — nunca es legal, a diferencia de tiempo
 * parcial (proporcional por diseño, ver advertenciaIbcTiempoParcial) o
 * aprendizaje SENA (su "salario" es legalmente un auxilio de sostenimiento
 * menor al SMLMV, Ley 789 de 2002). Señal para el semáforo de cumplimiento
 * de la empresa (SDD.md §14).
 */
export function advertenciaSalarioBajoMinimo(
  salarioBasicoMensual: number,
  tipoContrato: TipoContrato | undefined,
  reglas: ReglaLegal[] | ResolutorReglas,
  fecha: string
): string | undefined {
  if (tipoContrato === "tiempo_parcial") return undefined;
  if (tipoContrato?.startsWith("aprendizaje_sena")) return undefined;
  const r = comoResolutor(reglas);
  const smlmv = r.en("smlmv", fecha);
  if (salarioBasicoMensual >= smlmv) return undefined;
  return (
    `El salario básico declarado ($${salarioBasicoMensual.toLocaleString("es-CO")}) está por debajo del ` +
    `salario mínimo legal mensual vigente ($${smlmv.toLocaleString("es-CO")}). Para un contrato de tiempo ` +
    `completo esto no es legal salvo que sea tiempo parcial o aprendizaje SENA (CST art. 145).`
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

/**
 * Tiempo parcial con salario por debajo de 1 SMLMV: antes de 2020 la ley
 * exigía cotizar sobre un IBC mínimo de 1 SMLMV sin importar lo devengado
 * (encareciendo el trabajo parcial). El Decreto 1174 de 2020 creó el Piso
 * de Protección Social (BEPS) como régimen alternativo para estos casos —
 * cotización reducida vía BEPS + afiliación subsidiada a salud, en vez de
 * forzar el IBC al mínimo. Cuál régimen aplica depende de si el trabajador
 * ya cotiza en el régimen contributivo por otra vía, algo que este
 * verificador no conoce — por eso se advierte en vez de recalcular en
 * silencio el IBC (que podría sobrecargar al trabajador si no aplica).
 */
export function advertenciaIbcTiempoParcial(
  salarioBasicoMensual: number,
  tipoContrato: TipoContrato | undefined,
  reglas: ReglaLegal[] | ResolutorReglas,
  fecha: string
): string | undefined {
  if (tipoContrato !== "tiempo_parcial") return undefined;
  const r = comoResolutor(reglas);
  const smlmv = r.en("smlmv", fecha);
  if (salarioBasicoMensual >= smlmv) return undefined;
  return (
    `El salario declarado ($${salarioBasicoMensual.toLocaleString("es-CO")}) está por debajo de un SMLMV ` +
    `($${smlmv.toLocaleString("es-CO")}). Este verificador calcula salud y pensión sobre el IBC real (el salario ` +
    `devengado), pero dependiendo del caso el trabajador podría estar cubierto por el Piso de Protección Social ` +
    `(Decreto 1174 de 2020, cotización reducida vía BEPS) en vez del régimen contributivo ordinario — verifica cuál ` +
    `régimen le corresponde antes de descontar estas cifras.`
  );
}
