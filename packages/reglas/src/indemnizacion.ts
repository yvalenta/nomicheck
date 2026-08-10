import { ErrorDeDatos } from "./errores.js";
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
  /** Terminado dentro del período de prueba (CST art. 80): base independiente de `conJustaCausa` — cualquiera de las partes puede terminar sin previo aviso y sin indemnización, sin necesidad de alegar ni probar justa causa. */
  enPeriodoPrueba?: boolean;
}

export interface DatosIndemnizacionIndefinido {
  tipoContrato: "indefinido" | "tiempo_parcial";
  salarioMensual: number;
  fechaIngreso: string;
  fechaTerminacion: string;
  conJustaCausa: boolean;
  /** Terminado dentro del período de prueba (CST art. 80): base independiente de `conJustaCausa` — cualquiera de las partes puede terminar sin previo aviso y sin indemnización, sin necesidad de alegar ni probar justa causa. */
  enPeriodoPrueba?: boolean;
}

export type DatosIndemnizacion = DatosIndemnizacionTermino | DatosIndemnizacionIndefinido;

/**
 * Los números que la `explicacion` ya afirma en prosa, pero estructurados.
 *
 * Existe para que la interfaz pueda dibujar de dónde sale el total —línea de
 * tiempo, reparto por año, curva de antigüedad— sin volver a implementar la
 * regla ni, peor, parsear el texto. Son los coeficientes que ESTE cálculo usó,
 * no una segunda opinión: si la regla cambia, el gráfico cambia con ella.
 */
export type DesgloseIndemnizacion =
  | { base: "sin_lugar"; motivo: "periodo_prueba" | "justa_causa" }
  | {
      base: "termino_definido";
      salarioDiario: number;
      diasFaltantes: number;
      fechaTerminacion: string;
      fechaVencimientoPactada: string;
    }
  | {
      base: "indefinido";
      salarioDiario: number;
      fechaIngreso: string;
      fechaTerminacion: string;
      diasServidos: number;
      aniosServidos: number;
      /** SMLMV vigente a la fecha de terminación, el que decidió el umbral. */
      smlmv: number;
      umbralSmlmv: number;
      sobreUmbral: boolean;
      diasPrimerAnio: number;
      diasPorAnioAdicional: number;
      /** Días aportados por la antigüedad que pasa del primer año (proporcionales). */
      diasAdicionales: number;
    };

export interface ResultadoIndemnizacion {
  diasIndemnizacion: number;
  valor: number;
  explicacion: string;
  ley: string;
  desglose: DesgloseIndemnizacion;
}

function esTerminoDefinido(datos: DatosIndemnizacion): datos is DatosIndemnizacionTermino {
  return datos.tipoContrato === "fijo" || datos.tipoContrato === "obra_labor";
}

function validarFechas(fechas: Record<string, string>) {
  for (const [nombre, fecha] of Object.entries(fechas)) {
    if (!esFechaValida(fecha)) {
      throw new ErrorDeDatos(`Fecha inválida o inexistente en "${nombre}": "${fecha}"`);
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
    throw new ErrorDeDatos(`El salario mensual debe ser mayor que cero (recibido: ${datos.salarioMensual})`);
  }

  if (datos.enPeriodoPrueba) {
    return {
      diasIndemnizacion: 0,
      valor: 0,
      explicacion:
        "Terminado dentro del período de prueba: cualquiera de las partes puede darlo por terminado unilateralmente, sin previo aviso y sin lugar a indemnización — no depende de que haya justa causa.",
      ley: "CST art. 80",
      desglose: { base: "sin_lugar", motivo: "periodo_prueba" },
    };
  }

  if (datos.conJustaCausa) {
    return {
      diasIndemnizacion: 0,
      valor: 0,
      explicacion: "Con justa causa comprobada no hay lugar a indemnización.",
      ley: "CST art. 62",
      desglose: { base: "sin_lugar", motivo: "justa_causa" },
    };
  }

  if (esTerminoDefinido(datos)) {
    validarFechas({
      "fecha de terminación": datos.fechaTerminacion,
      "fecha de vencimiento pactada": datos.fechaVencimientoPactada,
    });
    const diasFaltantes = diasEntreFechas(datos.fechaTerminacion, datos.fechaVencimientoPactada);
    if (diasFaltantes <= 0) {
      throw new ErrorDeDatos(
        `La fecha de vencimiento pactada (${datos.fechaVencimientoPactada}) no es posterior a la fecha de terminación (${datos.fechaTerminacion}) — el contrato ya se habría cumplido`
      );
    }
    const salarioDiario = datos.salarioMensual / DIAS_MES_COMERCIAL;
    const valor = redondearPeso(salarioDiario * diasFaltantes);
    const etiqueta = datos.tipoContrato === "fijo" ? "a término fijo" : "por obra o labor";
    return {
      diasIndemnizacion: diasFaltantes,
      valor,
      explicacion: `Contrato ${etiqueta}: se debe el salario de los ${diasFaltantes} días que faltaban para cumplir el plazo pactado (hasta ${datos.fechaVencimientoPactada}).`,
      ley: "CST art. 64, num. 1",
      desglose: {
        base: "termino_definido",
        salarioDiario: redondearPeso(salarioDiario),
        diasFaltantes,
        fechaTerminacion: datos.fechaTerminacion,
        fechaVencimientoPactada: datos.fechaVencimientoPactada,
      },
    };
  }

  validarFechas({ "fecha de ingreso": datos.fechaIngreso, "fecha de terminación": datos.fechaTerminacion });
  const diasServidos = diasEntreFechas(datos.fechaIngreso, datos.fechaTerminacion);
  if (diasServidos <= 0) {
    throw new ErrorDeDatos(
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

  const diasAdicionales =
    diasServidos <= DIAS_ANIO_COMERCIAL
      ? 0
      : diasPorAnioAdicional * ((diasServidos - DIAS_ANIO_COMERCIAL) / DIAS_ANIO_COMERCIAL);
  const dias = diasPrimerAnio + diasAdicionales;

  const salarioDiario = datos.salarioMensual / DIAS_MES_COMERCIAL;
  const valor = redondearPeso(salarioDiario * dias);
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
    desglose: {
      base: "indefinido",
      salarioDiario: redondearPeso(salarioDiario),
      fechaIngreso: datos.fechaIngreso,
      fechaTerminacion: datos.fechaTerminacion,
      diasServidos,
      aniosServidos,
      smlmv,
      umbralSmlmv: INDEMNIZACION_UMBRAL_SALARIO_SMLMV,
      sobreUmbral,
      diasPrimerAnio,
      diasPorAnioAdicional,
      diasAdicionales: Math.round(diasAdicionales * 100) / 100,
    },
  };
}
