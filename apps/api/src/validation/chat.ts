import { z } from "zod";

// Forma mínima del ResultadoNomina que el chat necesita para dar contexto —
// no se re-valida contra el schema completo del motor porque el chat nunca
// recalcula ni confía en estas cifras para nada más que citarlas (SDD §03
// Módulo E: "el LLM NO modifica, recalcula ni contradice las cifras").
const lineaResultadoSchema = z.object({
  concepto: z.string(),
  horas: z.number().optional(),
  base: z.number().optional(),
  recargoPct: z.number().optional(),
  valorCalculado: z.number(),
  tipo: z.enum(["devengo", "deduccion", "provision"]),
  ley: z.string().optional(),
});

const resultadoNominaSchema = z.object({
  modo: z.string(),
  periodoDesde: z.string(),
  periodoHasta: z.string(),
  salarioBasicoMensual: z.number(),
  lineas: z.array(lineaResultadoSchema),
  totalDevengos: z.number(),
  totalDeducciones: z.number(),
  netoEsperado: z.number(),
  advertencias: z.array(z.string()),
});

const mensajeChatSchema = z.object({
  rol: z.enum(["usuario", "asistente"]),
  texto: z.string().min(1),
});

export const chatExplicarSchema = z.object({
  resultado: resultadoNominaSchema,
  pregunta: z.string().min(1).max(1000),
  historial: z.array(mensajeChatSchema).max(20).optional(),
});
