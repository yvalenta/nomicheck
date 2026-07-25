// Pipeline stateless del wrapper de PAGO ON-CHAIN (listing 8b, RUMBO §3.4 /
// execution_market/docs/04 §5.4). Gemelo sin BD de `generarBatchPago`:
// reusa sus MISMAS primitivas puras (`copAUnidadesUsdc`, `unidadesAUsdc`,
// `linkEip681`, `safeBatchJson`) y el snapshot de TRM (`capturarTasaSnapshot`),
// pero NO crea `BatchPago`/`PagoItem` en Prisma — entra JSON, sale JSON.
//
// El resultado se firma Ed25519 y trae el snapshot de tasa con su hash, que
// un buyer audita en GET /api/tasa/verify?hash= (SDD §17). No-custodial: el
// servidor no firma la transacción; solo arma los artefactos que el buyer
// firma desde su wallet.
import { crearResolutorReglas } from "@pv/reglas";
import {
  copAUnidadesUsdc,
  linkEip681,
  safeBatchJson,
  unidadesAUsdc,
} from "./pagosService.js";
import { obtenerReglasYFestivos } from "./nominaService.js";
import { hashCatalogo, REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";
import { capturarTasaSnapshot } from "./tasaCambioService.js";
import { firmarPayload } from "./batchSignatureService.js";
import { construirHabeasData } from "./batchPublicoService.js";
import { disclaimerBatch, resolverRedPago } from "../lib/pagosConfig.js";
import type {
  BatchPagoOnchainInput,
  BatchPagoOnchainOutput,
  ItemPagoOnchain,
} from "../validation/batchPagoOnchain.js";

// Ningún pago tenía wallet — el lote quedaría vacío. Es error del buyer
// (input incompleto), no del servidor: se mapea a 422.
export class ErrorLoteSinWallets extends Error {
  constructor() {
    super(
      "Ningún pago trae wallet destino válida — incluye `walletAddress` (0x + 40 hex) " +
        "en al menos un item para generar el lote."
    );
    this.name = "ErrorLoteSinWallets";
  }
}

export async function ejecutarBatchPagoOnchain(
  input: BatchPagoOnchainInput
): Promise<BatchPagoOnchainOutput> {
  // Validación estricta fase 1 — cualquier otro par red/token revienta con
  // ErrorRedNoSoportada (única fuente de verdad, no se duplica el enum).
  const red = resolverRedPago(input.red, input.token);

  const { reglas, festivos } = await obtenerReglasYFestivos();
  const resolutor = crearResolutorReglas(reglas);
  const reglasHash = hashCatalogo(reglas, festivos);
  const hoy = new Date().toISOString().slice(0, 10);
  const primaPct = resolutor.en("pago_onchain_prima_pct", hoy);
  const ventanaHoras = resolutor.en("pago_onchain_ventana_horas", hoy);

  const snapshot = await capturarTasaSnapshot(primaPct);

  const excluidosSinWallet = input.pagos
    .filter((p) => !p.walletAddress)
    .map((p) => p.externalId);
  const pagables = input.pagos.filter(
    (p): p is typeof p & { walletAddress: string } => Boolean(p.walletAddress)
  );
  if (pagables.length === 0) throw new ErrorLoteSinWallets();

  const items = pagables.map((p) => {
    const unidades = copAUnidadesUsdc(p.montoCop, snapshot.tasaEfectiva);
    return {
      externalId: p.externalId,
      destinoWallet: p.walletAddress,
      montoCop: p.montoCop,
      unidades,
      montoUsdc: unidadesAUsdc(unidades),
    };
  });

  const totalCop = items.reduce((s, i) => s + i.montoCop, 0);
  const totalUsdc = unidadesAUsdc(items.reduce((s, i) => s + i.unidades, 0n));
  const expiraEn = new Date(Date.now() + ventanaHoras * 60 * 60 * 1000).toISOString();
  const disclaimer = disclaimerBatch(snapshot.hash);

  const itemsSalida: ItemPagoOnchain[] = items.map((i) => ({
    externalId: i.externalId,
    destinoWallet: i.destinoWallet,
    montoCop: i.montoCop,
    montoUsdc: i.montoUsdc,
    linkEip681: linkEip681(red, i.destinoWallet, i.unidades),
  }));

  const sinFirma = {
    version: "1" as const,
    generadoEn: new Date().toISOString(),
    reglasVerificadasAl: REGLAS_VERIFICADAS_AL,
    reglasHash,
    disclaimer,
    habeasData: construirHabeasData(),
    red: red.red,
    token: red.token,
    tokenAddress: red.tokenAddress,
    chainId: red.chainId,
    tasaSnapshot: snapshot,
    totalCop,
    totalUsdc,
    expiraEn,
    items: itemsSalida,
    excluidosSinWallet,
    safeBatch: safeBatchJson(
      red,
      items.map((i) => ({ destino: i.destinoWallet, unidades: i.unidades })),
      disclaimer
    ),
  };
  return { ...sinFirma, signature: firmarPayload(sinFirma) };
}
