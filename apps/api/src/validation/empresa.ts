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

// Onboarding manual por admin_plataforma (SDD §09 POST /api/admin/empresas):
// sin password — quien crea la cuenta no es quien la va a usar, la persona
// invitada la define por correo.
export const crearEmpresaAdminSchema = z.object({
  nombreAdmin: z.string().min(1),
  emailAdmin: z.string().email(),
  empresa: registroSchema.shape.empresa,
});

// Reasignar admin_empresa de una empresa existente (SDD §09): mismo shape
// que la parte de admin de crearEmpresaAdminSchema, sin datos de empresa.
export const reasignarAdminSchema = z.object({
  nombreAdmin: z.string().min(1),
  emailAdmin: z.string().email(),
});

export const cambiarEstadoEmpresaSchema = z.object({
  activa: z.boolean(),
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
  // Clase de riesgo laboral ARL (I a V, Decreto 1772 de 1994) — default 1
  // (riesgo mínimo). Usada en costos/PILA.
  claseRiesgoArl: z.number().int().min(1).max(5).default(1),
  // Sede/sucursal opcional (SDD §15, pilar 1). El backend NO valida que la
  // sedeId pertenezca a la empresa aquí — la FK del schema es la barrera
  // definitiva; empleadosService rechaza con 422 si Postgres devuelve FK.
  sedeId: z.number().int().positive().nullable().optional(),
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
  // Pago on-chain (SDD §17): dirección EVM donde recibe USDC. Opt-in.
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Dirección EVM inválida — formato 0x + 40 caracteres hexadecimales")
    .nullish()
    .transform((v) => v ?? null),
});

export const contratistaUpdateSchema = contratistaSchema.partial().extend({
  activo: z.boolean().optional(),
});
