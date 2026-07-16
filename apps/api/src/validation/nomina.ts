import { z } from "zod";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");
const horaHHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)");

const horarioDia = z.object({
  horaInicio: horaHHmm,
  horaFin: horaHHmm,
});

const novedadDia = z
  .object({
    fecha,
    trabajo: z.boolean(),
    horaInicio: horaHHmm.optional(),
    horaFin: horaHHmm.optional(),
  })
  .refine((n) => !n.trabajo || (n.horaInicio && n.horaFin), {
    message: "Una novedad con trabajo=true requiere horaInicio y horaFin",
  });

const datosNominaTurnos = z.object({
  modo: z.literal("turnos"),
  salarioBasicoMensual: z.number().positive(),
  recibeAuxilioTransporte: z.boolean(),
  periodoDesde: fecha,
  periodoHasta: fecha,
  // Índice 0=domingo … 6=sábado; null = día de descanso.
  horarioBase: z.array(horarioDia.nullable()).length(7),
  novedades: z.array(novedadDia),
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
