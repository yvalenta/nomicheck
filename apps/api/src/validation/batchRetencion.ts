// Contrato de intake/export del wrapper stateless de RETENCIÓN EN LA FUENTE
// para Execution Market (listing 6). Es el CONTRATO PÚBLICO — cualquier
// cambio incompatible sube la versión (`version: "1"` → "2"); los cambios
// aditivos se hacen dentro de v1.
//
// Diseño (RUMBO §2.2 / gap 5.1 de execution_market/docs/04):
// - Un batch = N personas, cada una con SOLO los parámetros numéricos que la
//   retención necesita. NO se pide nombre ni documento — la versión más
//   blindada de la promesa de privacidad: entra aritmética anónima, sale
//   aritmética anónima (Ley 1581/2012). El buyer remapea `externalId` de su
//   lado.
// - Cero persistencia: entra JSON, sale JSON. No usa Prisma.
// - `noExternalLlm: true` respeta el flag del AI_USAGE — el cálculo es
//   determinístico (E.T. art. 383/388), nunca llama IA.
//
// La forma de cada persona replica `datosRetencionSchema` (validation/
// calculadoras.ts) — misma fuente de verdad del motor (`@pv/reglas`) —, más
// el `externalId` del buyer.
import { z } from "zod";
import type { DatosRetencionFuente, ResultadoRetencionFuente } from "@pv/reglas";
import type { FirmaOutput, HabeasDataConstancia } from "./batchPublico.js";

const walletEvm = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Wallet EVM inválida");

const personaRetencion = z.object({
  externalId: z.string().min(1),
  ingresoLaboralMensual: z.number().positive(),
  declaraRenta: z.boolean().default(false),
  // Solo cuentan si declaraRenta=true — comparten el tope combinado del
  // E.T. art. 126-1 (ver calcularRetencionFuente).
  aportesVoluntariosAfc: z.number().min(0).optional(),
  aportesVoluntariosPensionObligatoria: z.number().min(0).optional(),
  tieneDependientes: z.boolean().default(false),
  // Deducible sin importar declaraRenta (E.T. art. 387, par. 1).
  medicinaPrepagadaMensual: z.number().min(0).optional(),
});

export const batchRetencionSchema = z.object({
  version: z.literal("1"),
  buyer: z.object({
    executorId: z.string().min(1).optional(),
    wallet: walletEvm.optional(),
    noExternalLlm: z.boolean().default(true),
  }),
  // Tope de 500 personas por batch: un order del marketplace es una unidad de
  // trabajo acotada; lotes mayores se parten. Evita también un input abusivo
  // que monopolice el proceso CPU-bound del wrapper.
  personas: z.array(personaRetencion).min(1).max(500),
});

export type BatchRetencionInput = z.infer<typeof batchRetencionSchema>;

// El resultado por persona es el del motor (`ResultadoRetencionFuente`) más
// el `externalId` del buyer y la referencia legal del concepto. Se declara
// como intersección para no re-listar cada campo del motor (y no divergir si
// el motor agrega uno).
export type ResultadoRetencionBatch = ResultadoRetencionFuente & {
  externalId: string;
  referenciaLegal: string;
};

// Espejo tipado de `DatosRetencionFuente` con `externalId` — documenta que el
// input por persona es exactamente lo que el motor consume, ni un campo más.
export type _PersonaRetencion = DatosRetencionFuente & { externalId: string };

export interface BatchRetencionOutput {
  version: "1";
  generadoEn: string;
  reglasVerificadasAl: string;
  reglasHash: string;
  disclaimer: string;
  habeasData: HabeasDataConstancia;
  resultados: ResultadoRetencionBatch[];
  signature: FirmaOutput;
}
