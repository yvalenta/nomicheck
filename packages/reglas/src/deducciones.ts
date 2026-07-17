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

export type TipoEmbargo = "ordinario" | "alimentos_o_cooperativa";

export interface DescuentoJudicial {
  tipo: TipoEmbargo;
  /** Monto que ordena el juzgado/entidad para el periodo (ya prorrateado por el llamador). */
  valorMensual: number;
}

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
  reglas: ReglaLegal[],
  fecha: string,
  factorPeriodo = 1
): number {
  if (tipo === "alimentos_o_cooperativa") {
    const pctMax = reglaEn(reglas, "embargo_alimentos_pct_max", fecha);
    return round2(totalDevengado * pctMax);
  }
  const smlmvPeriodo = reglaEn(reglas, "smlmv", fecha) * factorPeriodo;
  const fraccion = reglaEn(reglas, "embargo_ordinario_fraccion_excedente", fecha);
  const excedente = Math.max(0, totalDevengado - smlmvPeriodo);
  return round2(excedente * fraccion);
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
  reglas: ReglaLegal[],
  fecha: string,
  opciones: OpcionesDeducciones = {},
  factorPeriodo = 1
): ResultadoDeducciones {
  const lineas = deduccionesDeLey(ibc, reglas, fecha);
  const advertencias: string[] = [];

  const convenio = (opciones.deduccionesConvenio ?? []).filter((c) => c.valorMensual > 0);
  const lineasConvenio = convenio.map((c) => ({
    concepto: c.concepto,
    valorCalculado: round2(c.valorMensual),
    tipo: "deduccion" as const,
    ley: c.ley,
  }));
  lineas.push(...lineasConvenio);

  const totalConvenioSolicitado = round2(lineasConvenio.reduce((s, l) => s + l.valorCalculado, 0));
  const topePct = reglaEn(reglas, "limite_deducciones_salario", fecha);
  const topeMonto = round2(totalDevengado * topePct);
  let totalDeducciones = round2(lineas.reduce((s, l) => s + l.valorCalculado, 0));

  if (totalDeducciones > topeMonto && totalConvenioSolicitado > 0) {
    const totalLey = round2(totalDeducciones - totalConvenioSolicitado);
    const convenioDisponible = Math.max(0, round2(topeMonto - totalLey));
    const factorRecorte = convenioDisponible / totalConvenioSolicitado;
    for (const l of lineasConvenio) l.valorCalculado = round2(l.valorCalculado * factorRecorte);
    totalDeducciones = round2(totalLey + convenioDisponible);
    advertencias.push(
      `Tus deducciones por convenio (AFC, préstamos, ahorro, etc.) se recortaron de $${totalConvenioSolicitado.toLocaleString("es-CO")} a $${convenioDisponible.toLocaleString("es-CO")} porque el total de deducciones no puede superar el ${round2(topePct * 100)}% del salario devengado (CST art. 149 — mínimo vital).`
    );
  }

  const embargo = opciones.descuentoJudicial;
  if (embargo && embargo.valorMensual > 0) {
    const solicitado = round2(embargo.valorMensual);
    const limite = limiteEmbargo(embargo.tipo, totalDevengado, reglas, fecha, factorPeriodo);
    const embargable = Math.min(solicitado, limite);
    const ley =
      embargo.tipo === "alimentos_o_cooperativa"
        ? "CST art. 156 — hasta 50% de cualquier salario"
        : "CST art. 154 y 155 — inembargable hasta 1 SMLMV, 1/5 del excedente";
    lineas.push({
      concepto: `Embargo judicial (${embargo.tipo === "alimentos_o_cooperativa" ? "alimentos/cooperativa" : "ordinario"})`,
      valorCalculado: round2(embargable),
      tipo: "deduccion",
      ley,
    });
    totalDeducciones = round2(totalDeducciones + embargable);
    if (embargable < solicitado) {
      advertencias.push(
        `El embargo ordenado ($${solicitado.toLocaleString("es-CO")}) se limitó a $${embargable.toLocaleString("es-CO")} por el tope legal de embargabilidad (${ley}).`
      );
    }
  }

  return { lineas, totalDeducciones, advertencias };
}
