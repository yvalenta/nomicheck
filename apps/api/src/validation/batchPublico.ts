// Contrato de intake/export del wrapper stateless de NomiCheck para
// Execution Market (listings 5, 6, 8a, 8b). Es el CONTRATO PÚBLICO —
// cualquier cambio incompatible sube la versión (`version: "1"` → "2");
// los cambios aditivos se hacen dentro de v1.
//
// Diseño (RUMBO §2.2, gap 5.1 de execution_market/docs/04):
// - Un batch = una empresa + un periodo + N empleados/contratistas.
// - Cero persistencia: entra JSON, sale JSON. No usa Prisma.
// - PII se purga por diseño: el request se procesa y descarta; el output
//   no incluye datos que el buyer no envió (Ley 1581/2012).
// - `noExternalLlm: true` respeta el flag del AI_USAGE — no se llama IA.
//
// Se reusan las validaciones ya existentes de `empresa.ts`/`nomina.ts` en
// vez de duplicarlas — el motor puro (`@pv/reglas`) es la fuente de verdad
// de qué campos son válidos.
import { z } from "zod";
import { fecha, horaHHmm } from "./comunes.js";

const walletEvm = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Wallet EVM inválida");

const tipoContrato = z.enum([
  "indefinido",
  "fijo",
  "obra_labor",
  "tiempo_parcial",
  "aprendizaje_sena_lectiva",
  "aprendizaje_sena_practica",
]);

const empleadoBatch = z.object({
  externalId: z.string().min(1),
  nombre: z.string().min(1),
  documento: z.string().min(1),
  salarioBase: z.number().positive(),
  tipoNomina: z.enum(["turnos", "fijo"]),
  tipoContrato: tipoContrato.default("indefinido"),
  auxilioTransporte: z.boolean().default(false),
  fechaIngreso: fecha.optional(),
  claseRiesgoArl: z.number().int().min(1).max(5).default(1),
});

const contratistaBatch = z.object({
  externalId: z.string().min(1),
  nombre: z.string().min(1),
  documento: z.string().min(1),
  honorariosMensuales: z.number().positive(),
  walletAddress: walletEvm.optional(),
});

const turnoBatch = z.object({
  empleadoExternalId: z.string().min(1),
  fecha,
  horaInicio: horaHHmm,
  horaFin: horaHHmm,
});

export const batchLiquidarSchema = z.object({
  version: z.literal("1"),
  buyer: z.object({
    executorId: z.string().min(1).optional(),
    wallet: walletEvm.optional(),
    noExternalLlm: z.boolean().default(true),
  }),
  empresa: z.object({
    nombre: z.string().min(1),
    nit: z.string().min(1),
    sector: z.string().min(1),
  }),
  periodo: z.object({
    fechaInicio: fecha,
    fechaFin: fecha,
  }),
  empleados: z.array(empleadoBatch).default([]),
  contratistas: z.array(contratistaBatch).default([]),
  turnos: z.array(turnoBatch).default([]),
});

export type BatchLiquidarInput = z.infer<typeof batchLiquidarSchema>;

// Contrato de salida — replica la forma canónica de ReciboPago del SDD §07
// pero con `externalId` en vez de FKs de BD (el buyer no tiene ids de
// NomiCheck).
export interface LineaBatch {
  concepto: string;
  tipo: "devengo" | "deduccion" | "provision";
  valor: number;
  referenciaLegal?: string;
  horas?: number;
  base?: number;
  recargoPct?: number;
}

export interface ReciboBatch {
  externalId: string;
  nombre: string;
  documento: string;
  tipo: "empleado" | "contratista";
  lineas: LineaBatch[];
  advertencias: string[];
  qaIssues?: unknown[];
  totalDevengado: number;
  totalDeducido: number;
  neto: number;
}

export interface RechazoBatch {
  externalId: string;
  nombre: string;
  documento: string;
  issues: unknown[];
}

export interface BatchLiquidarOutput {
  version: "1";
  generadoEn: string;
  reglasVerificadasAl: string;
  disclaimer: string;
  empresa: BatchLiquidarInput["empresa"];
  periodo: BatchLiquidarInput["periodo"];
  recibos: ReciboBatch[];
  rechazos: RechazoBatch[];
}
