import { z } from "zod";
import { fecha } from "./comunes.js";

export const registroSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  nombre: z.string().min(1),
  empresa: z.object({
    nombre: z.string().min(1),
    nit: z.string().min(1),
    sector: z.string().min(1),
  }),
});

export const empleadoSchema = z.object({
  nombre: z.string().min(1),
  documento: z.string().min(1),
  salarioBase: z.number().positive(),
  tipoNomina: z.enum(["turnos", "fijo"]),
  auxilioTransporte: z.boolean().default(false),
  // Base de antigüedad para cesantías/intereses/prima/vacaciones (prestaciones.ts).
  fechaIngreso: fecha,
  // "servicios" NO aplica aquí — un contratista de servicios no es Empleado (SDD §07).
  tipoContrato: z
    .enum([
      "indefinido",
      "fijo",
      "obra_labor",
      "tiempo_parcial",
      "aprendizaje_sena_lectiva",
      "aprendizaje_sena_practica",
    ])
    .default("indefinido"),
});

export const empleadoUpdateSchema = empleadoSchema.partial().extend({
  activo: z.boolean().optional(),
});

export const invitarSchema = z.object({
  email: z.string().email(),
});

export const retiroSchema = z.object({
  fechaRetiro: fecha,
});

export const contratistaSchema = z.object({
  nombre: z.string().min(1),
  documento: z.string().min(1),
  honorariosMensuales: z.number().positive(),
});

export const contratistaUpdateSchema = contratistaSchema.partial().extend({
  activo: z.boolean().optional(),
});
