import type { CalculadoraNomina, DatosNominaFija, LineaResultado } from "./types.js";
import { round2 } from "./numero.js";
import { deduccionesDeLey } from "./deducciones.js";

export const CalculadoraSalarioFijo: CalculadoraNomina = {
  calcular(datos, reglas, _festivos) {
    if (datos.modo !== "salario-fijo") {
      throw new Error("CalculadoraSalarioFijo solo acepta datos en modo 'salario-fijo'");
    }
    const d = datos as DatosNominaFija;
    const advertencias: string[] = [];
    const lineas: LineaResultado[] = [];

    // IBC: salario básico. Los devengos extralegales declarados no afectan
    // el IBC salvo que el usuario los marque salariales — v1 no ofrece esa
    // marca todavía, así que se excluyen siempre.
    const ibc = d.salarioBasicoMensual;

    lineas.push({
      concepto: "Salario básico",
      base: round2(d.salarioBasicoMensual),
      valorCalculado: round2(d.salarioBasicoMensual),
      tipo: "devengo",
      ley: "Contrato de trabajo",
    });

    lineas.push(...deduccionesDeLey(ibc, reglas, d.periodoDesde));

    // Conceptos declarados por el usuario o extraídos del comprobante:
    // devengos extralegales y deducciones por convenio se suman tal cual,
    // sin recalcularlos.
    for (const c of d.conceptos) {
      const tipo = c.tipo.startsWith("devengo") ? "devengo" : "deduccion";
      lineas.push({
        concepto: c.nombre,
        base: c.base !== undefined ? round2(c.base) : undefined,
        valorCalculado: round2(c.valor),
        tipo,
        ley: c.tipo === "deduccion-legal" ? "Estatuto Tributario" : undefined,
      });

      if (c.tipo === "deduccion-legal" && /retenci[oó]n/i.test(c.nombre)) {
        advertencias.push(
          `"${c.nombre}" no se valida automáticamente en esta versión — la retención en la fuente depende de variables personales (aportes voluntarios, dependientes) que el sistema no conoce.`
        );
      }
    }

    const totalDevengos = round2(
      lineas.filter((l) => l.tipo === "devengo").reduce((s, l) => s + l.valorCalculado, 0)
    );
    const totalDeducciones = round2(
      lineas.filter((l) => l.tipo === "deduccion").reduce((s, l) => s + l.valorCalculado, 0)
    );

    return {
      modo: "salario-fijo",
      periodoDesde: d.periodoDesde,
      periodoHasta: d.periodoHasta,
      salarioBasicoMensual: d.salarioBasicoMensual,
      lineas,
      totalDevengos,
      totalDeducciones,
      netoEsperado: round2(totalDevengos - totalDeducciones),
      advertencias,
    };
  },
};
