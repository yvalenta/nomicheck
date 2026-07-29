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

/**
 * País cuya legislación se aplica. Hoy solo Colombia.
 *
 * Entra al contrato AHORA, con un único valor válido, para que agregar un
 * segundo país después sea aditivo y no rompa a nadie: quien integre hoy
 * escribe `pais: "CO"` (o lo omite) y su request sigue siendo válido cuando
 * exista "PE". Sin este campo, sumar un país obligaría a la v2 del contrato.
 *
 * Fuera de Colombia el modelo esperado es prestación de servicios /
 * freelance: sin recargos, sin horas extra, sin prestaciones sociales — lo
 * que el motor ya resuelve con `CalculadoraServicios`. La complejidad del
 * CST (jornada 42 h, recargo dominical, festivos) es propia de "CO".
 */
const pais = z.enum(["CO"]).default("CO");

/** Idioma de las ETIQUETAS del recibo. No traduce `referenciaLegal`: una cita
 *  legal es nombre propio ("Ley 2466 de 2025" no se busca como "Law 2466"). */
const locale = z.enum(["es", "en"]).default("es");

export const batchLiquidarSchema = z.object({
  version: z.literal("1"),
  pais,
  locale,
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
  /** Identificador estable del concepto — comparar contra esto, nunca contra
   *  `concepto`, que es una etiqueta traducible. */
  codigo: string;
  /** Código propio del buyer, solo en líneas que él declaró. */
  codigoDeclarado?: string;
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

export interface HabeasDataConstancia {
  norma: string;
  procesado: true;
  descartado: true;
  persistidoEnBd: false;
  procesadoPorLlmExterno: false;
}

export interface FirmaOutput {
  algo: "ed25519";
  valor: string;
  publicKeyId: string;
  cubreCampos: "todos_menos_signature";
  canonical: "sorted_keys_utf8_json";
}

export interface BatchLiquidarOutput {
  version: "1";
  /** País cuya legislación se aplicó. Eco del request. */
  pais: "CO";
  /** Moneda de TODOS los importes del payload. La deriva el país, no el
   *  buyer: no se puede pedir una nómina colombiana denominada en otra cosa. */
  moneda: "COP";
  /** Idioma de las etiquetas de `lineas[].concepto`. */
  locale: "es" | "en";
  generadoEn: string;
  reglasVerificadasAl: string;
  reglasHash: string;
  disclaimer: string;
  habeasData: HabeasDataConstancia;
  empresa: BatchLiquidarInput["empresa"];
  periodo: BatchLiquidarInput["periodo"];
  recibos: ReciboBatch[];
  rechazos: RechazoBatch[];
  signature: FirmaOutput;
}
