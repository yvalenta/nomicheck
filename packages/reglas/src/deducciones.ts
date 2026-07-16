import type { LineaResultado, ReglaLegal } from "./types.js";
import { reglaEn } from "./utils.js";
import { round2 } from "./numero.js";
import { TABLA_FONDO_SOLIDARIDAD } from "./constantes.js";

// Recorre TABLA_FONDO_SOLIDARIDAD (constantes.ts) de mayor a menor rango y
// devuelve el porcentaje del primer tramo que aplica. La tabla en sí —
// valores y fuente legal — vive en un solo lugar (constantes.ts) para que un
// cambio normativo futuro no obligue a tocar la lógica de cálculo.
export function pctFondoSolidaridad(ibcEnSmlmv: number): number {
  const tramo = [...TABLA_FONDO_SOLIDARIDAD]
    .sort((a, b) => b.desdeSmlmv - a.desdeSmlmv)
    .find((t) => ibcEnSmlmv >= t.desdeSmlmv);
  return tramo?.pct ?? 0;
}

// Deducciones obligatorias del empleado calculadas automáticamente sobre el
// IBC (devengado salarial, excluye auxilio de transporte): salud 4%,
// pensión 4% y fondo de solidaridad si IBC ≥ 4 SMLMV. Compartida por ambas
// calculadoras — el usuario nunca declara estas deducciones (SDD §12).
export function deduccionesDeLey(ibc: number, reglas: ReglaLegal[], fecha: string): LineaResultado[] {
  const pctSalud = reglaEn(reglas, "aporte_salud_empleado", fecha);
  const pctPension = reglaEn(reglas, "aporte_pension_empleado", fecha);
  const umbralSolidaridadSmlmv = reglaEn(reglas, "fondo_solidaridad_umbral_smlmv", fecha);
  const smlmv = reglaEn(reglas, "smlmv", fecha);

  const lineas: LineaResultado[] = [
    {
      concepto: "Salud (aporte empleado)",
      base: round2(ibc),
      recargoPct: pctSalud,
      valorCalculado: round2(ibc * pctSalud),
      tipo: "deduccion",
      ley: "Ley 100 de 1993",
    },
    {
      concepto: "Pensión (aporte empleado)",
      base: round2(ibc),
      recargoPct: pctPension,
      valorCalculado: round2(ibc * pctPension),
      tipo: "deduccion",
      ley: "Ley 100 de 1993",
    },
  ];

  const ibcEnSmlmv = ibc / smlmv;
  if (ibcEnSmlmv >= umbralSolidaridadSmlmv) {
    const pct = pctFondoSolidaridad(ibcEnSmlmv);
    lineas.push({
      concepto: "Fondo de solidaridad pensional",
      base: round2(ibc),
      recargoPct: pct,
      valorCalculado: round2(ibc * pct),
      tipo: "deduccion",
      ley: "Ley 100 de 1993, art. 27; Ley 797 de 2003, art. 8",
    });
  }

  return lineas;
}

export interface ResultadoDeducciones {
  lineas: LineaResultado[];
  totalDeducciones: number;
  advertencias: string[];
}

// Deducciones completas de un periodo: ley (deduccionesDeLey) + AFC por
// convenio (Fase 1 — E.T. art. 126-4: el trabajador NO declara renta, así
// que el AFC es solo un descuento fijo autorizado, no reduce el IBC de
// salud/pensión). Protege el mínimo vital: si el total de deducciones
// supera `limite_deducciones_salario` (CST art. 149, tope histórico 50%)
// se recorta primero el AFC — nunca los aportes obligatorios de ley — y se
// deja constancia en `advertencias`.
export function aplicarDeducciones(
  totalDevengado: number,
  ibc: number,
  reglas: ReglaLegal[],
  fecha: string,
  aporteAfcMensual = 0
): ResultadoDeducciones {
  const lineas = deduccionesDeLey(ibc, reglas, fecha);
  const advertencias: string[] = [];

  const afcSolicitado = round2(aporteAfcMensual);
  if (afcSolicitado > 0) {
    lineas.push({
      concepto: "Aporte AFC (convenio)",
      valorCalculado: afcSolicitado,
      tipo: "deduccion",
      ley: "E.T. art. 126-4 — deducción por convenio, no afecta IBC (Fase 1: sin declaración de renta)",
    });
  }

  const topePct = reglaEn(reglas, "limite_deducciones_salario", fecha);
  const topeMonto = round2(totalDevengado * topePct);
  let totalDeducciones = round2(lineas.reduce((s, l) => s + l.valorCalculado, 0));

  if (totalDeducciones > topeMonto && afcSolicitado > 0) {
    const exceso = round2(totalDeducciones - topeMonto);
    const afcAjustado = Math.max(0, round2(afcSolicitado - exceso));
    const lineaAfc = lineas.find((l) => l.concepto === "Aporte AFC (convenio)")!;
    lineaAfc.valorCalculado = afcAjustado;
    totalDeducciones = round2(totalDeducciones - afcSolicitado + afcAjustado);
    advertencias.push(
      `El aporte AFC solicitado ($${afcSolicitado.toLocaleString("es-CO")}) se ajustó a $${afcAjustado.toLocaleString("es-CO")} porque el total de deducciones no puede superar el ${round2(topePct * 100)}% del salario devengado (CST art. 149 — mínimo vital).`
    );
  }

  return { lineas, totalDeducciones, advertencias };
}
