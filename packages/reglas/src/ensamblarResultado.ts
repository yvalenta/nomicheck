import type { LineaResultado, ModoCalculo, ResultadoNomina } from "./types.js";
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
  /** Si el llamador ya totalizó deducciones (con topes aplicados), se respeta. */
  totalDeducciones?: number;
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
  };
}
