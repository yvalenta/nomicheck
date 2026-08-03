import type { Request, Response } from "express";
import {
  PCT_INTERES_CESANTIAS,
  calcularPrestacionesSociales,
  calcularRecargos as calcularRecargosReglas,
  calcularRetencionFuente,
  crearResolutorReglas,
} from "@pv/reglas";
import {
  datosCesantiasSchema,
  datosPrimaSchema,
  datosRecargosSchema,
  datosRetencionSchema,
} from "../validation/calculadoras.js";
import { obtenerReglasYFestivos } from "../services/nominaService.js";

// Calculadoras anónimas por concepto (SDD §14): informativas, sin recibo ni
// deducciones — mismo patrón que indemnizacionController (400 validación,
// 422 error de cálculo). Prima y cesantías reusan calcularPrestacionesSociales
// respondiendo solo el subconjunto pertinente.

// El auxilio de transporte hace base de cesantías Y prima (Ley 1ª de 1963,
// art. 7) — mismo cálculo del monto vigente y de la advertencia de tope de
// 2 SMLMV para ambas calculadoras, factorizado para no duplicarlo.
async function resolverAuxilioDeclarado(
  recibeAuxilioTransporte: boolean,
  salarioMensual: number,
  fechaCorte: string
) {
  const { reglas } = await obtenerReglasYFestivos();
  const resolutor = crearResolutorReglas(reglas);
  const advertencias: string[] = [];
  let auxilioTransporte: number | undefined;
  if (recibeAuxilioTransporte) {
    auxilioTransporte = resolutor.en("auxilio_transporte", fechaCorte);
    const tope = resolutor.en("smlmv", fechaCorte) * resolutor.en("auxilio_transporte_tope_smlmv", fechaCorte);
    if (salarioMensual > tope) {
      advertencias.push(
        `El auxilio de transporte solo aplica con salario de hasta 2 SMLMV ($${tope.toLocaleString("es-CO")}); con el salario declarado normalmente no se recibe — se incluyó en la base porque lo marcaste.`
      );
    }
  }
  return { auxilioTransporte, advertencias };
}

export async function calcularPrima(req: Request, res: Response) {
  const parseo = datosPrimaSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }

  try {
    const { salarioMensual, recibeAuxilioTransporte, fechaIngreso, fechaCorte } = parseo.data;
    const { auxilioTransporte, advertencias } = await resolverAuxilioDeclarado(
      recibeAuxilioTransporte,
      salarioMensual,
      fechaCorte
    );
    const r = calcularPrestacionesSociales({
      fechaIngreso,
      fechaCorte,
      salarioBase: salarioMensual,
      auxilioTransporte,
    });
    res.json({
      prima: r.prima,
      diasTrabajadosAcumulado: r.diasTrabajadosAcumulado,
      auxilioIncluido: auxilioTransporte ?? 0,
      advertencias,
      explicacion:
        "Un mes de salario por año trabajado, proporcional al tiempo servido en cada semestre calendario (topado a 180 días por semestre). El auxilio de transporte hace parte de la base (Ley 1ª de 1963, art. 7). Se paga en dos cuotas: máximo el 30 de junio y el 20 de diciembre.",
      ley: "CST art. 306, mod. Ley 1788 de 2016",
    });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Error de cálculo" });
  }
}

export async function calcularCesantias(req: Request, res: Response) {
  const parseo = datosCesantiasSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }

  try {
    const { salarioMensual, recibeAuxilioTransporte, fechaIngreso, fechaCorte } = parseo.data;
    const { auxilioTransporte, advertencias } = await resolverAuxilioDeclarado(
      recibeAuxilioTransporte,
      salarioMensual,
      fechaCorte
    );
    const r = calcularPrestacionesSociales({
      fechaIngreso,
      fechaCorte,
      salarioBase: salarioMensual,
      auxilioTransporte,
    });
    res.json({
      cesantias: r.cesantias,
      interesesCesantias: r.interesesCesantias,
      diasTrabajadosAcumulado: r.diasTrabajadosAcumulado,
      auxilioIncluido: auxilioTransporte ?? 0,
      // La base y el periodo van explícitos porque son la otra mitad de la
      // respuesta: sin ellos, el resultado dice cuánto pero no sobre qué. Los
      // toma del motor y del pedido — no se recomponen en la web, donde el
      // "salario + auxilio" volvería a ser una regla escrita dos veces.
      baseMensual: r.baseCesantiasYPrima,
      tasaInteresAnual: PCT_INTERES_CESANTIAS,
      fechaIngreso,
      fechaCorte,
      advertencias,
      explicacion:
        "Un mes de salario por año trabajado (proporcional por días sobre año de 360). El auxilio de transporte hace parte de la base. Los intereses son el 12% anual sobre el saldo, proporcionales al tiempo.",
      ley: "CST art. 249 (cesantías); Ley 52 de 1975, art. 1 (intereses)",
    });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Error de cálculo" });
  }
}

// Retención en la fuente (SDD §03 Módulo A, Fase 2): informativa, sin
// recibo — mismo patrón 400/422 que el resto. Usa la fecha de hoy (no hay
// concepto de "periodo" declarado por el usuario, a diferencia de
// prima/cesantías) para resolver las reglas/UVT vigentes.
export async function calcularRetencion(req: Request, res: Response) {
  const parseo = datosRetencionSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }

  try {
    const { reglas } = await obtenerReglasYFestivos();
    const hoy = new Date().toISOString().slice(0, 10);
    const r = calcularRetencionFuente(parseo.data, reglas, hoy);
    res.json({
      ...r,
      explicacion:
        "Estimado por el sistema de depuración (E.T. art. 383/388): del ingreso laboral se restan los aportes obligatorios de salud/pensión, la renta exenta laboral del 25% (siempre aplica, tope 790 UVT/mes) y, si declaras renta, el aporte voluntario a AFC/pensión voluntaria y la deducción por dependientes — sujeto a un tope combinado del 40% del ingreso (o 1.340 UVT/año, lo que sea menor). Sobre lo que queda se aplica la tabla de tarifas marginales del art. 383.",
      ley: "E.T. art. 383 y 388 (Ley 2277 de 2022, art. 7)",
    });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Error de cálculo" });
  }
}

export async function calcularRecargos(req: Request, res: Response) {
  const parseo = datosRecargosSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }

  try {
    const { reglas } = await obtenerReglasYFestivos();
    res.json(calcularRecargosReglas(parseo.data, reglas));
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Error de cálculo" });
  }
}
