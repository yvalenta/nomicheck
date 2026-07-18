import type { ReglaLegal } from "./types.js";
import { comoResolutor, type ResolutorReglas } from "./utils.js";
import { redondearPeso } from "./numero.js";
import { calcularAuxilioTransporte } from "./auxilio.js";
import {
  DIAS_ANO_COMERCIAL,
  DIAS_MES_COMERCIAL,
  DIVISOR_VACACIONES,
  EXONERACION_UMBRAL_SMLMV,
  PCT_CAJA_COMPENSACION,
  PCT_ICBF,
  PCT_INTERES_CESANTIAS,
  PCT_PENSION_EMPLEADOR,
  PCT_SALUD_EMPLEADOR,
  PCT_SENA,
  TARIFAS_ARL,
} from "./constantes.js";

export type ClaseRiesgoArl = 1 | 2 | 3 | 4 | 5;

export interface OpcionesCostoEmpleador {
  /** Ley 1607 de 2012, art. 25: empresas contribuyentes de renta quedan exoneradas de salud patronal, SENA e ICBF para trabajadores con salario < 10 SMLMV. Default true (típico de la empresa pequeña objetivo). */
  exoneradoParafiscales?: boolean;
  /** Clase de riesgo laboral ARL (I a V, Decreto 1772 de 1994). Default 1 (riesgo mínimo — oficinas, comercio). */
  claseRiesgoArl?: ClaseRiesgoArl;
  /** Si el trabajador recibe auxilio de transporte (entra a la base de cesantías y al costo, no al IBC). Default true. */
  recibeAuxilioTransporte?: boolean;
  /** Fecha de referencia para resolver SMLMV/auxilio vigentes. Default hoy no aplica en motor puro: obligatoria. */
  fecha: string;
}

export interface LineaCostoEmpleador {
  concepto: string;
  pct?: number;
  valor: number;
  ley: string;
}

export interface ResultadoCostoEmpleador {
  salarioMensual: number;
  lineas: LineaCostoEmpleador[];
  /** Costo mensual total del empleador: salario + auxilio + aportes + provisiones. */
  costoTotalMensual: number;
  /** costoTotalMensual / salarioMensual — cuánto cuesta realmente cada peso de salario. */
  factorSobreSalario: number;
  advertencias: string[];
}

// Costo REAL mensual de un empleado para el empleador (SDD §13): salario +
// auxilio de transporte + aportes patronales (salud/pensión/ARL/caja/SENA/
// ICBF, con la exoneración de la Ley 1607 cuando aplica) + provisión mensual
// de prestaciones sociales (cesantías, intereses, prima, vacaciones — mismas
// fórmulas de prestaciones.ts expresadas como fracción mensual). Es un
// estimado gerencial: no reemplaza la PILA ni el cálculo exacto por días
// trabajados. Aprendices SENA y contratistas NO generan estos costos — el
// llamador decide a quién aplicarlo (mismo criterio de liquidacionService).
export function calcularCostoEmpleador(
  salarioMensual: number,
  reglas: ReglaLegal[] | ResolutorReglas,
  opciones: OpcionesCostoEmpleador
): ResultadoCostoEmpleador {
  if (!(salarioMensual > 0)) {
    throw new Error(`El salario mensual debe ser mayor que cero (recibido: ${salarioMensual})`);
  }
  const r = comoResolutor(reglas);
  const {
    exoneradoParafiscales = true,
    claseRiesgoArl = 1,
    recibeAuxilioTransporte = true,
    fecha,
  } = opciones;

  const advertencias: string[] = [];
  const lineas: LineaCostoEmpleador[] = [];

  const smlmv = r.en("smlmv", fecha);
  const exonerado = exoneradoParafiscales && salarioMensual < smlmv * EXONERACION_UMBRAL_SMLMV;
  if (exoneradoParafiscales && !exonerado) {
    advertencias.push(
      `Este salario ($${salarioMensual.toLocaleString("es-CO")}) es igual o superior a ${EXONERACION_UMBRAL_SMLMV} SMLMV: la exoneración de la Ley 1607 de 2012 no aplica y se cobran salud patronal, SENA e ICBF completos.`
    );
  }

  // Auxilio de transporte (si aplica por tope de 2 SMLMV) — es costo del
  // empleador y base de cesantías, pero no IBC de seguridad social.
  let auxilioMensual = 0;
  if (recibeAuxilioTransporte) {
    const auxilio = calcularAuxilioTransporte(salarioMensual, DIAS_MES_COMERCIAL, r, fecha);
    if (auxilio.linea) {
      auxilioMensual = auxilio.linea.valorCalculado;
      lineas.push({
        concepto: "Auxilio de transporte",
        valor: auxilioMensual,
        ley: "Decreto de salario mínimo vigente",
      });
    }
  }

  // --- Aportes patronales sobre el IBC (= salario, sin auxilio) ---
  if (!exonerado) {
    lineas.push({
      concepto: "Salud (aporte empleador)",
      pct: PCT_SALUD_EMPLEADOR,
      valor: redondearPeso(salarioMensual * PCT_SALUD_EMPLEADOR),
      ley: "Ley 100 de 1993, art. 204",
    });
  }
  lineas.push({
    concepto: "Pensión (aporte empleador)",
    pct: PCT_PENSION_EMPLEADOR,
    valor: redondearPeso(salarioMensual * PCT_PENSION_EMPLEADOR),
    ley: "Ley 100 de 1993, art. 20",
  });
  lineas.push({
    concepto: `ARL (clase de riesgo ${["I", "II", "III", "IV", "V"][claseRiesgoArl - 1]})`,
    pct: TARIFAS_ARL[claseRiesgoArl],
    valor: redondearPeso(salarioMensual * TARIFAS_ARL[claseRiesgoArl]),
    ley: "Decreto 1772 de 1994, art. 13",
  });
  lineas.push({
    concepto: "Caja de compensación familiar",
    pct: PCT_CAJA_COMPENSACION,
    valor: redondearPeso(salarioMensual * PCT_CAJA_COMPENSACION),
    ley: "Ley 21 de 1982",
  });
  if (!exonerado) {
    lineas.push({
      concepto: "SENA",
      pct: PCT_SENA,
      valor: redondearPeso(salarioMensual * PCT_SENA),
      ley: "Ley 21 de 1982",
    });
    lineas.push({
      concepto: "ICBF",
      pct: PCT_ICBF,
      valor: redondearPeso(salarioMensual * PCT_ICBF),
      ley: "Ley 89 de 1988",
    });
  }
  if (exonerado) {
    advertencias.push(
      "Exoneración aplicada (Ley 1607 de 2012, art. 25): sin salud patronal, SENA ni ICBF para salarios menores a 10 SMLMV en empresas contribuyentes de renta. Si la empresa no es contribuyente (p. ej. entidad sin ánimo de lucro), desactiva la exoneración."
    );
  }

  // --- Provisión mensual de prestaciones sociales (mismas bases de
  // prestaciones.ts, expresadas como fracción de un mes de 30 días) ---
  const baseCesantias = salarioMensual + auxilioMensual;
  const cesantiasMes = redondearPeso((baseCesantias * DIAS_MES_COMERCIAL) / DIAS_ANO_COMERCIAL);
  lineas.push({
    concepto: "Provisión cesantías",
    valor: cesantiasMes,
    ley: "CST art. 249",
  });
  lineas.push({
    concepto: "Provisión intereses sobre cesantías",
    pct: PCT_INTERES_CESANTIAS,
    valor: redondearPeso(cesantiasMes * PCT_INTERES_CESANTIAS),
    ley: "Ley 52 de 1975",
  });
  lineas.push({
    concepto: "Provisión prima de servicios",
    valor: redondearPeso((baseCesantias * DIAS_MES_COMERCIAL) / DIAS_ANO_COMERCIAL),
    ley: "CST art. 306",
  });
  lineas.push({
    concepto: "Provisión vacaciones",
    valor: redondearPeso((salarioMensual * DIAS_MES_COMERCIAL) / DIVISOR_VACACIONES),
    ley: "CST art. 186",
  });

  const costoTotalMensual = redondearPeso(
    salarioMensual + lineas.reduce((s, l) => s + l.valor, 0)
  );

  return {
    salarioMensual: redondearPeso(salarioMensual),
    lineas,
    costoTotalMensual,
    factorSobreSalario: Math.round((costoTotalMensual / salarioMensual) * 1000) / 1000,
    advertencias,
  };
}
