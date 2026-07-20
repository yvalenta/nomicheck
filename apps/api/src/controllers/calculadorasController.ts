import type { Request, Response } from "express";
import {
  calcularPrestacionesSociales,
  calcularRecargos as calcularRecargosReglas,
  crearResolutorReglas,
} from "@pv/reglas";
import {
  datosCesantiasSchema,
  datosPrimaSchema,
  datosRecargosSchema,
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
      advertencias,
      explicacion:
        "Un mes de salario por año trabajado (proporcional por días sobre año de 360). El auxilio de transporte hace parte de la base. Los intereses son el 12% anual sobre el saldo, proporcionales al tiempo.",
      ley: "CST art. 249 (cesantías); Ley 52 de 1975, art. 1 (intereses)",
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
