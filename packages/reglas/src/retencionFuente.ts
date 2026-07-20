import type { ReglaLegal } from "./types.js";
import { comoResolutor, type ResolutorReglas } from "./utils.js";
import { redondearPeso } from "./numero.js";
import { PCT_DEDUCCION_DEPENDIENTES, TABLA_RETENCION_FUENTE_ART_383 } from "./constantes.js";

// Retención en la fuente por el sistema de depuración (E.T. art. 383/388,
// Fase 2 — SDD.md §03 Módulo A "AFC — dos fases de tratamiento"): estima
// cuánto le corresponde retener el empleador sobre un salario mensual.
// Solo modela lo que el usuario puede declarar con confianza sin asesoría
// contable — aportes obligatorios de salud/pensión (siempre), renta exenta
// laboral del 25% (siempre, no depende de si declara renta — E.T. art.
// 206-10), aportes voluntarios a AFC/pensión voluntaria como renta exenta
// (SOLO si declara renta — E.T. art. 126-1/126-4, ver nota abajo) y
// deducción por dependientes (E.T. art. 387). NO modela intereses de
// vivienda, medicina prepagada ni otras deducciones — fuera de alcance de
// esta ronda, ver SDD.md.
export interface DatosRetencionFuente {
  /** Total devengado mensual gravable — salario + devengos habituales, SIN auxilio de transporte ni otros ingresos no constitutivos de renta. */
  ingresoLaboralMensual: number;
  /** Autodeclarado por el usuario — el sistema NO valida el umbral de ingresos/patrimonio para declarar renta (cambia cada año y depende de datos que no se recolectan). Ver advertencia en el resultado. */
  declaraRenta: boolean;
  /** Aporte voluntario mensual a AFC o pensión voluntaria — solo se toma en cuenta como renta exenta si declaraRenta=true. */
  aportesVoluntariosAfc?: number;
  /** Al menos un dependiente a cargo — deducción única (10% del ingreso, tope 32 UVT/mes), sin importar cuántos dependientes se declaren (E.T. art. 387, par. 2). */
  tieneDependientes?: boolean;
}

export interface ResultadoRetencionFuente {
  ingresoLaboralMensual: number;
  ingresoNoConstitutivo: number;
  deduccionDependientes: number;
  rentaExentaAfc: number;
  rentaExentaLaboral: number;
  totalExentoYDeducible: number;
  baseGravable: number;
  baseGravableUvt: number;
  retencionMensual: number;
  advertencias: string[];
}

// Recorre TABLA_RETENCION_FUENTE_ART_383 (constantes.ts) de mayor a menor
// rango y devuelve el primer tramo cuyo `desdeUvt` no supera la base —
// mismo patrón que pctFondoSolidaridad en deducciones.ts.
function tramoRetencion(baseUvt: number) {
  return [...TABLA_RETENCION_FUENTE_ART_383]
    .sort((a, b) => b.desdeUvt - a.desdeUvt)
    .find((t) => baseUvt >= t.desdeUvt)!;
}

export function calcularRetencionFuente(
  datos: DatosRetencionFuente,
  reglas: ReglaLegal[] | ResolutorReglas,
  fecha: string
): ResultadoRetencionFuente {
  const r = comoResolutor(reglas);
  const advertencias: string[] = [];

  const uvt = r.en("uvt", fecha);
  const pctSalud = r.en("aporte_salud_empleado", fecha);
  const pctPension = r.en("aporte_pension_empleado", fecha);
  const ingresoNoConstitutivo = redondearPeso(datos.ingresoLaboralMensual * (pctSalud + pctPension));
  const subtotal1 = datos.ingresoLaboralMensual - ingresoNoConstitutivo;

  let deduccionDependientes = 0;
  if (datos.tieneDependientes) {
    const topeDependientesUvt = r.en("limite_deduccion_dependientes_uvt_mes", fecha);
    deduccionDependientes = redondearPeso(
      Math.min(subtotal1 * PCT_DEDUCCION_DEPENDIENTES, topeDependientesUvt * uvt)
    );
  }

  let rentaExentaAfc = 0;
  if (datos.declaraRenta && datos.aportesVoluntariosAfc && datos.aportesVoluntariosAfc > 0) {
    const pctMaxAfc = r.en("limite_porcentaje_afc", fecha);
    const limiteAnualUvtAfc = r.en("limite_anual_uvt_afc", fecha);
    const topeMensualEquivalente = (limiteAnualUvtAfc * uvt) / 12;
    rentaExentaAfc = redondearPeso(
      Math.min(datos.aportesVoluntariosAfc, subtotal1 * pctMaxAfc, topeMensualEquivalente)
    );
    advertencias.push(
      "El aporte voluntario a AFC/pensión voluntaria se topó con el equivalente MENSUAL del límite anual (3.800 UVT/año ÷ 12, E.T. art. 126-1 y 126-4) — el sistema calcula por periodo y no lleva el acumulado real del año; si ya usaste parte del cupo en otros meses, tu tope disponible puede ser menor al mostrado aquí."
    );
  } else if (datos.aportesVoluntariosAfc && datos.aportesVoluntariosAfc > 0 && !datos.declaraRenta) {
    advertencias.push(
      "Marcaste un aporte voluntario a AFC/pensión voluntaria pero no que declaras renta — ese aporte no se tomó como renta exenta (E.T. art. 126-1 y 126-4 aplica a quien declara renta); si sí declaras, marca la casilla para que se incluya."
    );
  }

  const baseAntesRentaExenta = subtotal1 - deduccionDependientes - rentaExentaAfc;
  const topeLaboralUvt = r.en("limite_renta_exenta_laboral_uvt_mes", fecha);
  let rentaExentaLaboral = redondearPeso(Math.min(Math.max(0, baseAntesRentaExenta) * 0.25, topeLaboralUvt * uvt));

  let totalExentoYDeducible = redondearPeso(deduccionDependientes + rentaExentaAfc + rentaExentaLaboral);

  const pctTopeCombinado = r.en("limite_rentas_exentas_porcentaje", fecha);
  const topeUvtAnual = r.en("limite_rentas_exentas_uvt_anual", fecha);
  const topeCombinadoMonto = Math.min(
    redondearPeso(subtotal1 * pctTopeCombinado),
    redondearPeso((topeUvtAnual * uvt) / 12)
  );

  if (totalExentoYDeducible > topeCombinadoMonto && totalExentoYDeducible > 0) {
    const factor = topeCombinadoMonto / totalExentoYDeducible;
    deduccionDependientes = redondearPeso(deduccionDependientes * factor);
    rentaExentaAfc = redondearPeso(rentaExentaAfc * factor);
    rentaExentaLaboral = redondearPeso(rentaExentaLaboral * factor);
    advertencias.push(
      `Tus rentas exentas y deducciones ($${totalExentoYDeducible.toLocaleString("es-CO")}) se recortaron a $${topeCombinadoMonto.toLocaleString("es-CO")} porque no pueden superar el ${redondearPeso(pctTopeCombinado * 100)}% de tu ingreso ni el equivalente mensual de ${topeUvtAnual} UVT anuales (E.T. art. 336).`
    );
    totalExentoYDeducible = topeCombinadoMonto;
  }

  const baseGravable = Math.max(0, redondearPeso(subtotal1 - totalExentoYDeducible));
  const baseGravableUvt = baseGravable / uvt;

  const tramo = tramoRetencion(baseGravableUvt);
  const retencionUvt = tramo.tarifa === 0 ? 0 : (baseGravableUvt - tramo.desdeUvt) * tramo.tarifa + tramo.restarUvt;
  const retencionMensual = redondearPeso(Math.max(0, retencionUvt * uvt));

  advertencias.push(
    "\"¿Declaras renta?\" es lo que tú marcas — el sistema no valida el umbral de ingresos/patrimonio vigente (cambia cada año), así que confirma con tu contador si no estás seguro."
  );

  return {
    ingresoLaboralMensual: redondearPeso(datos.ingresoLaboralMensual),
    ingresoNoConstitutivo,
    deduccionDependientes,
    rentaExentaAfc,
    rentaExentaLaboral,
    totalExentoYDeducible,
    baseGravable,
    baseGravableUvt: Math.round(baseGravableUvt * 100) / 100,
    retencionMensual,
    advertencias,
  };
}
