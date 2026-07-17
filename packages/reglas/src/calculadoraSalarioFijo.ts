import type { CalculadoraNomina, DatosNominaFija, LineaResultado } from "./types.js";
import { redondearPeso } from "./numero.js";
import { aplicarDeducciones } from "./deducciones.js";
import { validarPeriodo } from "./utils.js";

export const CalculadoraSalarioFijo: CalculadoraNomina = {
  calcular(datos, reglas, _festivos) {
    if (datos.modo !== "salario-fijo") {
      throw new Error("CalculadoraSalarioFijo solo acepta datos en modo 'salario-fijo'");
    }
    const d = datos as DatosNominaFija;
    validarPeriodo(d.periodoDesde, d.periodoHasta);
    if (!(d.salarioBasicoMensual > 0)) {
      throw new Error(`El salario básico mensual debe ser mayor que cero (recibido: ${d.salarioBasicoMensual})`);
    }
    const advertencias: string[] = [];
    const lineas: LineaResultado[] = [];

    // IBC: salario básico. Los devengos extralegales declarados no afectan
    // el IBC salvo que el usuario los marque salariales — v1 no ofrece esa
    // marca todavía, así que se excluyen siempre.
    const ibc = d.salarioBasicoMensual;

    lineas.push({
      concepto: "Salario básico",
      base: redondearPeso(d.salarioBasicoMensual),
      valorCalculado: redondearPeso(d.salarioBasicoMensual),
      tipo: "devengo",
      ley: "Contrato de trabajo",
    });

    // Solo se aplica el tope del 50% (CST art. 149) a salud/pensión/fondo:
    // los conceptos declarados abajo (incl. AFC si viene del comprobante)
    // llegan como valores ya extraídos, no como un monto ajustable aquí.
    const { lineas: lineasDeduccionLey, advertencias: advertenciasLey } = aplicarDeducciones(
      d.salarioBasicoMensual,
      ibc,
      reglas,
      d.periodoDesde
    );
    lineas.push(...lineasDeduccionLey);
    advertencias.push(...advertenciasLey);

    // Conceptos declarados por el usuario o extraídos del comprobante:
    // devengos extralegales y deducciones por convenio se suman tal cual,
    // sin recalcularlos.
    for (const c of d.conceptos) {
      const tipo = c.tipo.startsWith("devengo") ? "devengo" : "deduccion";
      lineas.push({
        concepto: c.nombre,
        base: c.base !== undefined ? redondearPeso(c.base) : undefined,
        valorCalculado: redondearPeso(c.valor),
        tipo,
        ley: c.tipo === "deduccion-legal" ? "Estatuto Tributario" : undefined,
      });

      if (c.tipo === "deduccion-legal" && /retenci[oó]n/i.test(c.nombre)) {
        advertencias.push(
          `"${c.nombre}" no se valida automáticamente en esta versión — la retención en la fuente depende de variables personales (aportes voluntarios, dependientes) que el sistema no conoce.`
        );
      }
    }

    const totalDevengos = redondearPeso(
      lineas.filter((l) => l.tipo === "devengo").reduce((s, l) => s + l.valorCalculado, 0)
    );
    const totalDeducciones = redondearPeso(
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
      netoEsperado: redondearPeso(totalDevengos - totalDeducciones),
      advertencias,
    };
  },
};
