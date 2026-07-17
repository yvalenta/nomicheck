import type { LineaResultado, ReglaLegal } from "./types.js";
import { comoResolutor, type ResolutorReglas } from "./utils.js";
import { redondearPeso } from "./numero.js";
import { DIAS_MES_COMERCIAL } from "./constantes.js";

export interface ResultadoAuxilio {
  linea?: LineaResultado;
  advertencia?: string;
}

// Auxilio de transporte: solo para quien devenga hasta
// `auxilio_transporte_tope_smlmv` (2) SMLMV; prorrateado por días del
// periodo. Compartido por ambas calculadoras — antes solo turnos lo
// aplicaba y el modo salario fijo ignoraba `recibeAuxilioTransporte`.
export function calcularAuxilioTransporte(
  salarioBasicoMensual: number,
  diasPeriodo: number,
  reglas: ReglaLegal[] | ResolutorReglas,
  fecha: string
): ResultadoAuxilio {
  const r = comoResolutor(reglas);
  const smlmv = r.en("smlmv", fecha);
  const topeSmlmv = r.en("auxilio_transporte_tope_smlmv", fecha);
  if (salarioBasicoMensual > smlmv * topeSmlmv) {
    return {
      advertencia: `No se reconoce auxilio de transporte: el salario ($${salarioBasicoMensual.toLocaleString("es-CO")}) supera ${topeSmlmv} SMLMV ($${redondearPeso(smlmv * topeSmlmv).toLocaleString("es-CO")}) — Decreto de salario mínimo vigente.`,
    };
  }
  const auxilioMensual = r.en("auxilio_transporte", fecha);
  return {
    linea: {
      concepto: "Auxilio de transporte",
      valorCalculado: redondearPeso((auxilioMensual / DIAS_MES_COMERCIAL) * diasPeriodo),
      tipo: "devengo",
      ley: "Decreto de salario mínimo vigente",
    },
  };
}
