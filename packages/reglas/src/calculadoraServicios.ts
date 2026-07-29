import type { CalculadoraNomina, ConceptoNomina, DatosNominaServicios, LineaResultado } from "./types.js";
import { redondearPeso } from "./numero.js";
import { ensamblarResultado } from "./ensamblarResultado.js";
import { diasComerciales, validarPeriodo } from "./utils.js";
import { DIAS_MES_COMERCIAL, PCT_IBC_INDEPENDIENTE, PCT_PENSION_INDEPENDIENTE, PCT_SALUD_INDEPENDIENTE } from "./constantes.js";

// Prestación de servicios (contratista independiente) NO es contrato
// laboral (SDD §07): sin auxilio de transporte, sin recargos nocturnos/
// dominicales/extra (no hay jornada legal que recargar), sin prestaciones
// sociales. El IBC de seguridad social es 40% del ingreso (Ley 1819 de
// 2016, art. 244), y el independiente paga el 100% de sus aportes — quien
// contrata NO los retiene del pago, por eso van como advertencia
// informativa y NO como línea de deducción (restarlos daría un neto
// esperado menor al que realmente debe depositarse).
const clasificacion = {
  "devengo-legal": "devengo",
  "devengo-extralegal": "devengo",
  "deduccion-legal": "deduccion",
  "deduccion-convenio": "deduccion",
} satisfies Record<ConceptoNomina["tipo"], LineaResultado["tipo"]>;

export const CalculadoraServicios: CalculadoraNomina = {
  calcular(datos, _reglas, _festivos) {
    if (datos.modo !== "servicios") {
      throw new Error("CalculadoraServicios solo acepta datos en modo 'servicios'");
    }
    const d = datos as DatosNominaServicios;
    validarPeriodo(d.periodoDesde, d.periodoHasta);
    if (!(d.honorariosMensuales > 0)) {
      throw new Error(`Los honorarios mensuales deben ser mayores que cero (recibido: ${d.honorariosMensuales})`);
    }

    const advertencias: string[] = [];
    const lineas: LineaResultado[] = [];

    // Mes comercial de 30 días, no días calendario — ver `diasComerciales`.
    const diasPeriodo = Math.min(
      diasComerciales(d.periodoDesde, d.periodoHasta),
      DIAS_MES_COMERCIAL
    );
    const honorarios = (d.honorariosMensuales / DIAS_MES_COMERCIAL) * diasPeriodo;
    lineas.push({
      codigo: "HONORARIOS",
      concepto: `Honorarios (${diasPeriodo} días)`,
      base: redondearPeso(d.honorariosMensuales),
      valorCalculado: redondearPeso(honorarios),
      tipo: "devengo",
      ley: "Contrato de prestación de servicios",
    });

    for (const c of d.conceptos ?? []) {
      lineas.push({
        codigo: "CONCEPTO_DECLARADO",
        codigoDeclarado: c.codigo,
        concepto: c.nombre,
        base: c.base !== undefined ? redondearPeso(c.base) : undefined,
        valorCalculado: redondearPeso(c.valor),
        tipo: clasificacion[c.tipo],
      });
    }

    const ibcIndependiente = redondearPeso(d.honorariosMensuales * PCT_IBC_INDEPENDIENTE);
    const salud = redondearPeso(ibcIndependiente * PCT_SALUD_INDEPENDIENTE);
    const pension = redondearPeso(ibcIndependiente * PCT_PENSION_INDEPENDIENTE);
    advertencias.push(
      `Como contratista independiente, tú mismo debes liquidar y pagar tus aportes a seguridad social por PILA — quien te contrata NO los descuenta de este pago (Ley 1819 de 2016, art. 244). Referencia sobre un IBC de $${ibcIndependiente.toLocaleString("es-CO")} (40% de tus honorarios mensuales): salud ≈ $${salud.toLocaleString("es-CO")} (12.5%), pensión ≈ $${pension.toLocaleString("es-CO")} (16%).`
    );
    advertencias.push(
      "La prestación de servicios no es una relación laboral: no genera auxilio de transporte, recargos nocturnos/dominicales/festivos, horas extra, ni prestaciones sociales (cesantías, prima, vacaciones)."
    );

    return ensamblarResultado({
      modo: "servicios",
      periodoDesde: d.periodoDesde,
      periodoHasta: d.periodoHasta,
      salarioBasicoMensual: d.honorariosMensuales,
      lineas,
      advertencias,
    });
  },
};
