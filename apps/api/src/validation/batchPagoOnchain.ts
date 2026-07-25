// Contrato de intake/export del wrapper stateless de PAGO ON-CHAIN
// (listing 8b) para Execution Market. CONTRATO PÚBLICO — cambio incompatible
// sube `version`; los aditivos van dentro de v1.
//
// Diseño (execution_market/docs/04 §5.4 "wrapper stateless de marketplace"):
// - Entra la lista de netos a pagar (COP) + wallet destino por contratista;
//   sale el lote listo para firmar: links EIP-681 por item + Safe Transaction
//   Builder JSON, con el snapshot de TRM congelado y hasheado.
// - Reusa el MISMO motor on-chain de `pagosService` (copAUnidadesUsdc,
//   linkEip681, safeBatchJson) — no duplica la aritmética de unidades.
// - Stateless de verdad: no crea BatchPago ni PagoItem en Prisma. La versión
//   con BD (POST /empresa/periodos/:id/batch-pago) sigue existiendo para el
//   modo empresa; este wrapper es su gemelo sin persistencia para el buyer
//   del marketplace, que no es tenant.
// - No-custodial: el servidor JAMÁS firma. Devuelve artefactos; el buyer (o
//   el empleador que él representa) firma desde su propia wallet.
//
// Fase 1: SOLO { red: "base", token: "USDC" nativo }. `resolverRedPago` es la
// única fuente de verdad de qué par se acepta — por eso aquí red/token son
// strings permisivos y la validación estricta (ErrorRedNoSoportada) ocurre en
// el servicio, no se duplica el enum.
import { z } from "zod";
import type { TasaSnapshot } from "../services/tasaCambioService.js";
import type { FirmaOutput, HabeasDataConstancia } from "./batchPublico.js";

const walletEvm = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Wallet EVM inválida");

const pagoItem = z.object({
  externalId: z.string().min(1),
  // Neto a pagar en COP (típicamente el `neto` que devolvió /api/batch/liquidar
  // para ese contratista). Debe ser positivo — no se generan transfers de 0.
  montoCop: z.number().positive(),
  // Wallet destino. Opcional en el input para que el buyer pueda mandar la
  // lista completa; los que no traen wallet salen reportados en
  // `excluidosSinWallet` en vez de reventar todo el lote.
  walletAddress: walletEvm.optional(),
});

export const batchPagoOnchainSchema = z.object({
  version: z.literal("1"),
  buyer: z.object({
    executorId: z.string().min(1).optional(),
    wallet: walletEvm.optional(),
    noExternalLlm: z.boolean().default(true),
  }),
  red: z.string().default("base"),
  token: z.string().default("USDC"),
  pagos: z.array(pagoItem).min(1).max(500),
});

export type BatchPagoOnchainInput = z.infer<typeof batchPagoOnchainSchema>;

export interface ItemPagoOnchain {
  externalId: string;
  destinoWallet: string;
  montoCop: number;
  montoUsdc: number;
  /** Link EIP-681 — abre la wallet con el transfer USDC prellenado. */
  linkEip681: string;
}

export interface BatchPagoOnchainOutput {
  version: "1";
  generadoEn: string;
  reglasVerificadasAl: string;
  reglasHash: string;
  disclaimer: string;
  habeasData: HabeasDataConstancia;
  red: string;
  token: string;
  tokenAddress: string;
  chainId: number;
  /** Tasa congelada + hash sha256 — auditable en GET /api/tasa/verify?hash=. */
  tasaSnapshot: TasaSnapshot;
  totalCop: number;
  totalUsdc: number;
  /** ISO — vencida la ventana la tasa ya no vale y hay que regenerar el lote. */
  expiraEn: string;
  items: ItemPagoOnchain[];
  /** externalIds que llegaron sin wallet válida — quedaron fuera del lote. */
  excluidosSinWallet: string[];
  /** Safe Transaction Builder JSON — todo el lote en una sola tx multifirma. */
  safeBatch: object;
  signature: FirmaOutput;
}
