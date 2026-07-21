import type { DescuentoJudicial, LineaResultado, ReglaLegal, TipoEmbargo } from "./types.js";
import { comoResolutor, type ResolutorReglas } from "./utils.js";
import { redondearPeso } from "./numero.js";
import { TABLA_FONDO_SOLIDARIDAD } from "./constantes.js";
import { crearIssue, emitirIssue } from "./qa/index.js";
import type { IssueQA } from "./qa/tipos.js";

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

/** Cuánto de las deducciones de ley aplica: "completo" (default, indefinido),
 * "solo_salud" (aprendiz SENA etapa práctica — no cotiza a pensión), o
 * "ninguno" (aprendiz SENA etapa lectiva — el SENA gestiona la afiliación). */
export type AlcanceDeduccionesLey = "completo" | "solo_salud" | "ninguno";

// Deducciones obligatorias del empleado calculadas automáticamente sobre el
// IBC (devengado salarial, excluye auxilio de transporte): salud 4%,
// pensión 4% y fondo de solidaridad si IBC ≥ 4 SMLMV. Compartida por ambas
// calculadoras — el usuario nunca declara estas deducciones (SDD §12).
export function deduccionesDeLey(
  ibc: number,
  reglas: ReglaLegal[] | ResolutorReglas,
  fecha: string,
  alcance: AlcanceDeduccionesLey = "completo"
): LineaResultado[] {
  if (alcance === "ninguno") return [];

  const r = comoResolutor(reglas);
  const pctSalud = r.en("aporte_salud_empleado", fecha);

  const lineas: LineaResultado[] = [
    {
      concepto: "Salud (aporte empleado)",
      base: redondearPeso(ibc),
      recargoPct: pctSalud,
      valorCalculado: redondearPeso(ibc * pctSalud),
      tipo: "deduccion",
      ley: "Ley 100 de 1993",
    },
  ];
  if (alcance === "solo_salud") return lineas;

  const pctPension = r.en("aporte_pension_empleado", fecha);
  const umbralSolidaridadSmlmv = r.en("fondo_solidaridad_umbral_smlmv", fecha);
  const smlmv = r.en("smlmv", fecha);

  lineas.push({
    concepto: "Pensión (aporte empleado)",
    base: redondearPeso(ibc),
    recargoPct: pctPension,
    valorCalculado: redondearPeso(ibc * pctPension),
    tipo: "deduccion",
    ley: "Ley 100 de 1993",
  });

  const ibcEnSmlmv = ibc / smlmv;
  if (ibcEnSmlmv >= umbralSolidaridadSmlmv) {
    const pct = pctFondoSolidaridad(ibcEnSmlmv);
    lineas.push({
      concepto: "Fondo de solidaridad pensional",
      base: redondearPeso(ibc),
      recargoPct: pct,
      valorCalculado: redondearPeso(ibc * pct),
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
  /** Issues tipados equivalentes a las advertencias (SDD §15 pilar 2). */
  issues: IssueQA[];
}

// TipoEmbargo/DescuentoJudicial viven en types.ts (los usa también la
// entrada del motor DatosNominaTurnos) — el barrel los exporta desde allá.

// Deducciones por convenio: monto fijo autorizado por el trabajador, NO
// afectan el IBC de salud/pensión (a diferencia del embargo, comparten el
// tope del 50% del art. 149 CST y se recortan proporcionalmente entre
// ellas si el total lo supera — nunca los aportes obligatorios de ley).
export interface DeduccionConvenio {
  concepto: string;
  /** Ya prorrateado por el llamador (igual que el auxilio de transporte). */
  valorMensual: number;
  ley?: string;
}

export interface OpcionesDeducciones {
  deduccionesConvenio?: DeduccionConvenio[];
  descuentoJudicial?: DescuentoJudicial;
  alcanceDeduccionesLey?: AlcanceDeduccionesLey;
}

// Límite legal de un embargo de salario. Dos regímenes independientes
// (CST art. 154–156), el segundo tiene prioridad constitucional y NO
// respeta la inembargabilidad del mínimo:
//  - "ordinario" (créditos comunes: bancos, tarjetas, civiles): inembargable
//    hasta 1 SMLMV (art. 154); del excedente solo se puede embargar 1/5
//    (art. 155).
//  - "alimentos_o_cooperativa" (cuota alimentaria u obligación con
//    cooperativa/fondo de empleados): hasta 50% de CUALQUIER salario,
//    incluido el mínimo (art. 156).
// `factorPeriodo` = fracción del mes que cubre el periodo (ej. 15/30 en una
// quincena). El SMLMV es una cifra MENSUAL — hay que prorratearlo antes de
// compararlo contra un devengado parcial, o el excedente embargable
// (art. 155) siempre daría cero en periodos menores a un mes.
export function limiteEmbargo(
  tipo: TipoEmbargo,
  totalDevengado: number,
  reglas: ReglaLegal[] | ResolutorReglas,
  fecha: string,
  factorPeriodo = 1
): number {
  const r = comoResolutor(reglas);
  if (tipo === "alimentos_o_cooperativa") {
    const pctMax = r.en("embargo_alimentos_pct_max", fecha);
    return redondearPeso(totalDevengado * pctMax);
  }
  const smlmvPeriodo = r.en("smlmv", fecha) * factorPeriodo;
  const fraccion = r.en("embargo_ordinario_fraccion_excedente", fecha);
  const excedente = Math.max(0, totalDevengado - smlmvPeriodo);
  return redondearPeso(excedente * fraccion);
}

// Deducciones completas de un periodo: ley (deduccionesDeLey) + deducciones
// por convenio (AFC, préstamo, ahorro, reproceso... — Fase 1: monto fijo
// autorizado por el trabajador, NO reduce el IBC de salud/pensión) +
// embargo judicial si aplica. Protege el mínimo vital: si el total de
// deducciones VOLUNTARIAS (ley + convenio) supera `limite_deducciones_salario`
// (CST art. 149, tope histórico 50%) se recorta el convenio
// PROPORCIONALMENTE entre todas sus líneas — nunca los aportes obligatorios
// de ley ni el embargo, que ya trae su propio tope legal — y se deja
// constancia en `advertencias`. El embargo se calcula y se recorta por
// separado, contra su propio límite (art. 154–156), sin importar la
// voluntariedad.
export function aplicarDeducciones(
  totalDevengado: number,
  ibc: number,
  reglas: ReglaLegal[] | ResolutorReglas,
  fecha: string,
  opciones: OpcionesDeducciones = {},
  factorPeriodo = 1
): ResultadoDeducciones {
  const r = comoResolutor(reglas);
  const lineas = deduccionesDeLey(ibc, r, fecha, opciones.alcanceDeduccionesLey);
  const advertencias: string[] = [];
  const issues: IssueQA[] = [];

  const convenio = (opciones.deduccionesConvenio ?? []).filter((c) => c.valorMensual > 0);
  const lineasConvenio = convenio.map((c) => ({
    concepto: c.concepto,
    valorCalculado: redondearPeso(c.valorMensual),
    tipo: "deduccion" as const,
    ley: c.ley,
  }));
  lineas.push(...lineasConvenio);

  const totalConvenioSolicitado = redondearPeso(lineasConvenio.reduce((s, l) => s + l.valorCalculado, 0));
  const topePct = r.en("limite_deducciones_salario", fecha);
  const topeMonto = redondearPeso(totalDevengado * topePct);
  let totalDeducciones = redondearPeso(lineas.reduce((s, l) => s + l.valorCalculado, 0));

  if (totalDeducciones > topeMonto && totalConvenioSolicitado > 0) {
    const totalLey = redondearPeso(totalDeducciones - totalConvenioSolicitado);
    const convenioDisponible = Math.max(0, redondearPeso(topeMonto - totalLey));
    const factorRecorte = convenioDisponible / totalConvenioSolicitado;
    for (const l of lineasConvenio) l.valorCalculado = redondearPeso(l.valorCalculado * factorRecorte);
    totalDeducciones = redondearPeso(totalLey + convenioDisponible);
    emitirIssue(issues, advertencias, crearIssue(
      "TOPE_DEDUCCIONES_SUPERADO",
      "advertencia",
      `Tus deducciones por convenio (AFC, préstamos, ahorro, etc.) se recortaron de $${totalConvenioSolicitado.toLocaleString("es-CO")} a $${convenioDisponible.toLocaleString("es-CO")} porque el total de deducciones no puede superar el ${redondearPeso(topePct * 100)}% del salario devengado (CST art. 149 — mínimo vital).`,
      "CST art. 149",
      totalConvenioSolicitado,
      convenioDisponible
    ));
  }

  const embargo = opciones.descuentoJudicial;
  if (embargo && embargo.valorMensual > 0) {
    const solicitado = redondearPeso(embargo.valorMensual);
    const limite = limiteEmbargo(embargo.tipo, totalDevengado, r, fecha, factorPeriodo);
    const embargable = Math.min(solicitado, limite);
    const ley =
      embargo.tipo === "alimentos_o_cooperativa"
        ? "CST art. 156 — hasta 50% de cualquier salario"
        : "CST art. 154 y 155 — inembargable hasta 1 SMLMV, 1/5 del excedente";
    lineas.push({
      concepto: `Embargo judicial (${embargo.tipo === "alimentos_o_cooperativa" ? "alimentos/cooperativa" : "ordinario"})`,
      valorCalculado: redondearPeso(embargable),
      tipo: "deduccion",
      ley,
    });
    totalDeducciones = redondearPeso(totalDeducciones + embargable);
    if (embargable < solicitado) {
      advertencias.push(
        `El embargo ordenado ($${solicitado.toLocaleString("es-CO")}) se limitó a $${embargable.toLocaleString("es-CO")} por el tope legal de embargabilidad (${ley}).`
      );
    }
  }

  return { lineas, totalDeducciones, advertencias, issues };
}
