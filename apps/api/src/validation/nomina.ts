import { z } from "zod";
import { fecha, horaHHmm } from "./comunes.js";

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

const tipoContrato = z.enum(["indefinido", "aprendizaje_sena_lectiva", "aprendizaje_sena_practica"]).optional();

const datosNominaTurnos = z.object({
  modo: z.literal("turnos"),
  salarioBasicoMensual: z.number().positive(),
  recibeAuxilioTransporte: z.boolean(),
  periodoDesde: fecha,
  periodoHasta: fecha,
  // Índice 0=domingo … 6=sábado; null = día de descanso.
  horarioBase: z.array(horarioDia.nullable()).length(7),
  novedades: z.array(novedadDia),
  aporteAfcMensual: z.number().nonnegative().optional(),
  prestamoMensual: z.number().nonnegative().optional(),
  ahorroMensual: z.number().nonnegative().optional(),
  reprocesoMensual: z.number().nonnegative().optional(),
  descuentoJudicial: z
    .object({
      tipo: z.enum(["ordinario", "alimentos_o_cooperativa"]),
      valorMensual: z.number().nonnegative(),
    })
    .optional(),
  tipoContrato,
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
  tipoContrato,
});

// Prestación de servicios (contratista independiente) — NO es contrato
// laboral (SDD §07): sin horarioBase/novedades/auxilio/tipoContrato.
const datosNominaServicios = z.object({
  modo: z.literal("servicios"),
  honorariosMensuales: z.number().positive(),
  periodoDesde: fecha,
  periodoHasta: fecha,
  conceptos: z.array(conceptoNomina).optional(),
});

export const datosNominaSchema = z
  .discriminatedUnion("modo", [datosNominaTurnos, datosNominaFija, datosNominaServicios])
  .refine((d) => d.periodoDesde <= d.periodoHasta, {
    message: "periodoDesde debe ser anterior o igual a periodoHasta",
  });
