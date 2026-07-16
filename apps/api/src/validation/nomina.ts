import { z } from "zod";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");
const horaHHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)");

const excepcionTurno = z.object({
  fecha,
  horaInicio: horaHHmm,
  horaFin: horaHHmm,
});

const datosNominaTurnos = z.object({
  modo: z.literal("turnos"),
  salarioBasicoMensual: z.number().positive(),
  recibeAuxilioTransporte: z.boolean(),
  periodoDesde: fecha,
  periodoHasta: fecha,
  dominicosTrabajaos: z.number().int().min(0),
  excepciones: z.array(excepcionTurno),
});

const conceptoNomina = z.object({
  codigo: z.string().optional(),
  nombre: z.string().min(1),
  tipo: z.enum(["devengo-legal", "devengo-extralegal", "deduccion-legal", "deduccion-convenio"]),
  base: z.number().optional(),
  valor: z.number(),
});

const datosNominaFija = z.object({
  modo: z.literal("salario-fijo"),
  salarioBasicoMensual: z.number().positive(),
  recibeAuxilioTransporte: z.boolean(),
  periodoDesde: fecha,
  periodoHasta: fecha,
  conceptos: z.array(conceptoNomina),
});

export const datosNominaSchema = z.discriminatedUnion("modo", [
  datosNominaTurnos,
  datosNominaFija,
]);
