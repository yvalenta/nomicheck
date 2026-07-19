import { z } from "zod";
import { fecha } from "./comunes.js";

// Calculadoras anónimas por concepto (SDD §14) — hermanas de la de
// indemnización: informativas, sin auth, un schema por endpoint.

export const datosPrimaSchema = z.object({
  salarioMensual: z.number().positive(),
  fechaIngreso: fecha,
  fechaCorte: fecha,
});

export const datosCesantiasSchema = z.object({
  salarioMensual: z.number().positive(),
  // El auxilio de transporte SÍ hace base de cesantías (CST art. 249) — el
  // monto vigente lo resuelve el servidor, el usuario solo declara si aplica.
  recibeAuxilioTransporte: z.boolean().default(false),
  fechaIngreso: fecha,
  fechaCorte: fecha,
});

const horasNoNegativas = z.number().min(0).optional();

export const datosRecargosSchema = z.object({
  salarioMensual: z.number().positive(),
  fechaReferencia: fecha,
  horas: z.object({
    nocturnas: horasNoNegativas,
    dominicalesDiurnas: horasNoNegativas,
    dominicalesNocturnas: horasNoNegativas,
    extrasDiurnas: horasNoNegativas,
    extrasNocturnas: horasNoNegativas,
    extrasDominicalesDiurnas: horasNoNegativas,
    extrasDominicalesNocturnas: horasNoNegativas,
  }),
});
