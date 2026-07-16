import type { CalculadoraNomina, DatosNominaFija, LineaResultado } from "./types.js";
import { reglaEn } from "./utils.js";
import { round2 } from "./numero.js";
import { TABLA_FONDO_SOLIDARIDAD } from "./constantes.js";

// Recorre TABLA_FONDO_SOLIDARIDAD (constantes.ts) de mayor a menor rango y
// devuelve el porcentaje del primer tramo que aplica. La tabla en sí —
// valores y fuente legal — vive en un solo lugar (constantes.ts) para que un
// cambio normativo futuro no obligue a tocar la lógica de cálculo.
function pctFondoSolidaridad(ibcEnSmlmv: number): number {
  const tramo = [...TABLA_FONDO_SOLIDARIDAD]
    .sort((a, b) => b.desdeSmlmv - a.desdeSmlmv)
    .find((t) => ibcEnSmlmv >= t.desdeSmlmv);
  return tramo?.pct ?? 0;
}

export const CalculadoraSalarioFijo: CalculadoraNomina = {
  calcular(datos, reglas, _festivos) {
    if (datos.modo !== "salario-fijo") {
      throw new Error("CalculadoraSalarioFijo solo acepta datos en modo 'salario-fijo'");
    }
    const d = datos as DatosNominaFija;
    const advertencias: string[] = [];
    const lineas: LineaResultado[] = [];

    // IBC: salario básico. Los devengos extralegales declarados no afectan
    // el IBC salvo que el usuario los marque salariales (req. 4) — v1 no
    // ofrece esa marca todavía, así que se excluyen siempre.
    const ibc = d.salarioBasicoMensual;

    const pctSalud = reglaEn(reglas, "aporte_salud_empleado", d.periodoDesde);
    const pctPension = reglaEn(reglas, "aporte_pension_empleado", d.periodoDesde);
    const umbralSolidaridadSmlmv = reglaEn(reglas, "fondo_solidaridad_umbral_smlmv", d.periodoDesde);
    const smlmv = reglaEn(reglas, "smlmv", d.periodoDesde);

    lineas.push({
      concepto: "Salario básico",
      base: round2(d.salarioBasicoMensual),
      valorCalculado: round2(d.salarioBasicoMensual),
      tipo: "devengo",
      ley: "Contrato de trabajo",
    });

    const salud = ibc * pctSalud;
    lineas.push({
      concepto: "Salud (aporte empleado)",
      base: round2(ibc),
      recargoPct: pctSalud,
      valorCalculado: round2(salud),
      tipo: "deduccion",
      ley: "Ley 100 de 1993",
    });

    const pension = ibc * pctPension;
    lineas.push({
      concepto: "Pensión (aporte empleado)",
      base: round2(ibc),
      recargoPct: pctPension,
      valorCalculado: round2(pension),
      tipo: "deduccion",
      ley: "Ley 100 de 1993",
    });

    const ibcEnSmlmv = ibc / smlmv;
    if (ibcEnSmlmv >= umbralSolidaridadSmlmv) {
      const pctSolidaridad = pctFondoSolidaridad(ibcEnSmlmv);
      const solidaridad = ibc * pctSolidaridad;
      lineas.push({
        concepto: "Fondo de solidaridad pensional",
        base: round2(ibc),
        recargoPct: pctSolidaridad,
        valorCalculado: round2(solidaridad),
        tipo: "deduccion",
        ley: "Ley 100 de 1993, art. 27; Ley 797 de 2003, art. 8",
      });
    }

    // Conceptos declarados por el usuario o extraídos del comprobante:
    // devengos extralegales y deducciones por convenio se suman tal cual,
    // sin recalcularlos (req. 4 y 5).
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
    const netoEsperado = round2(totalDevengos - totalDeducciones);

    return {
      modo: "salario-fijo",
      periodoDesde: d.periodoDesde,
      periodoHasta: d.periodoHasta,
      salarioBasicoMensual: d.salarioBasicoMensual,
      lineas,
      totalDevengos,
      totalDeducciones,
      netoEsperado,
      advertencias,
    };
  },
};
