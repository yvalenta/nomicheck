import type { ReglaLegal } from "./types.js";
import { comoResolutor, type ResolutorReglas } from "./utils.js";
import { diasEntreFechas, esFechaValida } from "./utils.js";
import { redondearPeso } from "./numero.js";
import { DIAS_MES_COMERCIAL } from "./constantes.js";
import {
  INDEMNIZACION_DIAS_ANIO_ADICIONAL_BAJO_UMBRAL,
  INDEMNIZACION_DIAS_ANIO_ADICIONAL_SOBRE_UMBRAL,
  INDEMNIZACION_DIAS_PRIMER_ANIO_BAJO_UMBRAL,
  INDEMNIZACION_DIAS_PRIMER_ANIO_SOBRE_UMBRAL,
  INDEMNIZACION_UMBRAL_SALARIO_SMLMV,
} from "./constantes.js";

// Año "comercial" de 360 días, igual que el resto del motor (prestaciones
// sociales) — no el calendario real, para ser consistente con cómo ya se
// prorratea todo lo demás en NomiCheck.
const DIAS_ANIO_COMERCIAL = 360;

/** Los tres tipos de término que SÍ tienen fecha de vencimiento pactada o estimable — CST art. 64 num. 1. */
export type TipoContratoConTermino = "fijo" | "obra_labor";

export interface DatosIndemnizacionTermino {
  tipoContrato: TipoContratoConTermino;
  salarioMensual: number;
  fechaTerminacion: string;
  /** Fecha pactada de vencimiento del contrato a término fijo, o fecha estimada de fin de la obra/labor. */
  fechaVencimientoPactada: string;
  conJustaCausa: boolean;
}

export interface DatosIndemnizacionIndefinido {
  tipoContrato: "indefinido" | "tiempo_parcial";
  salarioMensual: number;
  fechaIngreso: string;
  fechaTerminacion: string;
  conJustaCausa: boolean;
}

export type DatosIndemnizacion = DatosIndemnizacionTermino | DatosIndemnizacionIndefinido;

export interface ResultadoIndemnizacion {
  diasIndemnizacion: number;
  valor: number;
  explicacion: string;
  ley: string;
}

function esTerminoDefinido(datos: DatosIndemnizacion): datos is DatosIndemnizacionTermino {
  return datos.tipoContrato === "fijo" || datos.tipoContrato === "obra_labor";
}

function validarFechas(fechas: Record<string, string>) {
  for (const [nombre, fecha] of Object.entries(fechas)) {
    if (!esFechaValida(fecha)) {
      throw new Error(`Fecha inválida o inexistente en "${nombre}": "${fecha}"`);
    }
  }
}

/**
 * Aproximación de la indemnización por terminación SIN justa causa. Es
 * informativa (SDD §13/§14): no reemplaza una liquidación oficial ni asesoría
 * legal — casos reales (salario variable, fuero, convenciones colectivas,
 * etc.) pueden diferir.
 */
export function calcularIndemnizacion(
  datos: DatosIndemnizacion,
  reglas: ReglaLegal[] | ResolutorReglas
): ResultadoIndemnizacion {
  if (!(datos.salarioMensual > 0)) {
    throw new Error(`El salario mensual debe ser mayor que cero (recibido: ${datos.salarioMensual})`);
  }

  if (datos.conJustaCausa) {
    return {
      diasIndemnizacion: 0,
      valor: 0,
      explicacion: "Con justa causa comprobada no hay lugar a indemnización.",
      ley: "CST art. 62",
    };
  }

  if (esTerminoDefinido(datos)) {
    validarFechas({
      "fecha de terminación": datos.fechaTerminacion,
      "fecha de vencimiento pactada": datos.fechaVencimientoPactada,
    });
    const diasFaltantes = diasEntreFechas(datos.fechaTerminacion, datos.fechaVencimientoPactada);
    if (diasFaltantes <= 0) {
      throw new Error(
        `La fecha de vencimiento pactada (${datos.fechaVencimientoPactada}) no es posterior a la fecha de terminación (${datos.fechaTerminacion}) — el contrato ya se habría cumplido`
      );
    }
    const valor = redondearPeso((datos.salarioMensual / DIAS_MES_COMERCIAL) * diasFaltantes);
    const etiqueta = datos.tipoContrato === "fijo" ? "a término fijo" : "por obra o labor";
    return {
      diasIndemnizacion: diasFaltantes,
      valor,
      explicacion: `Contrato ${etiqueta}: se debe el salario de los ${diasFaltantes} días que faltaban para cumplir el plazo pactado (hasta ${datos.fechaVencimientoPactada}).`,
      ley: "CST art. 64, num. 1",
    };
  }

  validarFechas({ "fecha de ingreso": datos.fechaIngreso, "fecha de terminación": datos.fechaTerminacion });
  const diasServidos = diasEntreFechas(datos.fechaIngreso, datos.fechaTerminacion);
  if (diasServidos <= 0) {
    throw new Error(
      `La fecha de terminación (${datos.fechaTerminacion}) no es posterior a la fecha de ingreso (${datos.fechaIngreso})`
    );
  }

  const r = comoResolutor(reglas);
  const smlmv = r.en("smlmv", datos.fechaTerminacion);
  const sobreUmbral = datos.salarioMensual >= smlmv * INDEMNIZACION_UMBRAL_SALARIO_SMLMV;
  const diasPrimerAnio = sobreUmbral
    ? INDEMNIZACION_DIAS_PRIMER_ANIO_SOBRE_UMBRAL
    : INDEMNIZACION_DIAS_PRIMER_ANIO_BAJO_UMBRAL;
  const diasPorAnioAdicional = sobreUmbral
    ? INDEMNIZACION_DIAS_ANIO_ADICIONAL_SOBRE_UMBRAL
    : INDEMNIZACION_DIAS_ANIO_ADICIONAL_BAJO_UMBRAL;

  const dias =
    diasServidos <= DIAS_ANIO_COMERCIAL
      ? diasPrimerAnio
      : diasPrimerAnio + diasPorAnioAdicional * ((diasServidos - DIAS_ANIO_COMERCIAL) / DIAS_ANIO_COMERCIAL);

  const valor = redondearPeso((datos.salarioMensual / DIAS_MES_COMERCIAL) * dias);
  const aniosServidos = redondearPeso((diasServidos / DIAS_ANIO_COMERCIAL) * 100) / 100;

  return {
    diasIndemnizacion: Math.round(dias * 100) / 100,
    valor,
    explicacion:
      `Contrato ${datos.tipoContrato === "tiempo_parcial" ? "a tiempo parcial" : "indefinido"}, ` +
      `${aniosServidos} años servidos, salario ${sobreUmbral ? "≥" : "<"} ${INDEMNIZACION_UMBRAL_SALARIO_SMLMV} SMLMV: ` +
      `${diasPrimerAnio} días del primer año` +
      (diasServidos > DIAS_ANIO_COMERCIAL ? ` + ${diasPorAnioAdicional} días por cada año adicional (proporcional).` : "."),
    ley: "CST art. 64, modificado por la Ley 50 de 1990, art. 6",
  };
}
