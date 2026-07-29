import type { DetalleDia, LineaResultado, ModoCalculo, ResultadoNomina } from "./types.js";
import type { IssueQA } from "./qa/tipos.js";
import { redondearPeso } from "./numero.js";

// Cierre común de ambas calculadoras (Strategy): totaliza devengos y
// deducciones a partir de las líneas ya redondeadas por línea y construye
// el ResultadoNomina. Antes este bloque estaba duplicado en las dos.
export function ensamblarResultado(params: {
  modo: ModoCalculo;
  periodoDesde: string;
  periodoHasta: string;
  salarioBasicoMensual: number;
  lineas: LineaResultado[];
  advertencias: string[];
  /** Issues tipados que el motor emitió durante el cálculo — coexisten con
   * las advertencias-string mientras dure la migración (SDD §15, pilar 2). */
  issues?: IssueQA[];
  /** Si el llamador ya totalizó deducciones (con topes aplicados), se respeta. */
  totalDeducciones?: number;
  valorDia?: number;
  valorHoraOrdinaria?: number;
  diasLaborados?: number;
  detalleDias?: DetalleDia[];
}): ResultadoNomina {
  const totalDevengos = redondearPeso(
    params.lineas.filter((l) => l.tipo === "devengo").reduce((s, l) => s + l.valorCalculado, 0)
  );
  const totalDeducciones =
    params.totalDeducciones ??
    redondearPeso(
      params.lineas.filter((l) => l.tipo === "deduccion").reduce((s, l) => s + l.valorCalculado, 0)
    );

  return {
    modo: params.modo,
    periodoDesde: params.periodoDesde,
    periodoHasta: params.periodoHasta,
    salarioBasicoMensual: params.salarioBasicoMensual,
    lineas: params.lineas,
    totalDevengos,
    totalDeducciones,
    netoEsperado: redondearPeso(totalDevengos - totalDeducciones),
    advertencias: params.advertencias,
    issues: params.issues ?? [],
    valorDia: params.valorDia,
    valorHoraOrdinaria: params.valorHoraOrdinaria,
    diasLaborados: params.diasLaborados,
    detalleDias: params.detalleDias,
  };
}
