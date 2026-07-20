import { z } from "zod";
import { fecha } from "./comunes.js";

// Calculadoras anónimas por concepto (SDD §14) — hermanas de la de
// indemnización: informativas, sin auth, un schema por endpoint.

export const datosPrimaSchema = z.object({
  salarioMensual: z.number().positive(),
  // El auxilio de transporte SÍ hace base de prima (Ley 1ª de 1963, art. 7 —
  // mismo criterio que cesantías) — el usuario solo declara si lo recibe.
  recibeAuxilioTransporte: z.boolean().default(false),
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

export const datosRetencionSchema = z.object({
  ingresoLaboralMensual: z.number().positive(),
  declaraRenta: z.boolean().default(false),
  // Solo se toman en cuenta si declaraRenta=true — comparten el mismo tope
  // combinado (E.T. art. 126-1) — ver calcularRetencionFuente.
  aportesVoluntariosAfc: z.number().min(0).optional(),
  aportesVoluntariosPensionObligatoria: z.number().min(0).optional(),
  tieneDependientes: z.boolean().default(false),
  // Deducible sin importar declaraRenta (E.T. art. 387, par. 1).
  medicinaPrepagadaMensual: z.number().min(0).optional(),
});

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
