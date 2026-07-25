// Tests del wrapper stateless de pago on-chain (listing 8b, RUMBO §3.4 /
// SDD §17). Mockean `obtenerReglasYFestivos` (prima/ventana) y
// `capturarTasaSnapshot` (evita la red a datos.gov.co) para ser deterministas.
// Las primitivas puras (copAUnidadesUsdc, linkEip681, safeBatchJson) ya tienen
// sus tests en pagosService.test.ts — aquí se prueba el ENSAMBLE stateless.
import { describe, expect, it, vi } from "vitest";
import type { Festivo, ReglaLegal } from "@pv/reglas";

const REGLAS: ReglaLegal[] = [
  { clave: "pago_onchain_prima_pct", valor: 0, vigenteDesde: "2026-01-01" },
  { clave: "pago_onchain_ventana_horas", valor: 6, vigenteDesde: "2026-01-01" },
];
const FESTIVOS: Festivo[] = [];

// tasaEfectiva = 4000 COP/USDC → 4.000.000 COP = 1000 USDC.
const SNAPSHOT = {
  trm: 4000,
  fuente: "TEST — TRM fija",
  fechaTrm: "2026-07-24",
  primaPct: 0,
  tasaEfectiva: 4000,
  capturadoEn: "2026-07-24T12:00:00.000Z",
  hash: "a".repeat(64),
};

vi.mock("../nominaService.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../nominaService.js")>()),
  obtenerReglasYFestivos: vi.fn(async () => ({ reglas: REGLAS, festivos: FESTIVOS })),
}));
vi.mock("../tasaCambioService.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tasaCambioService.js")>()),
  capturarTasaSnapshot: vi.fn(async () => SNAPSHOT),
}));

const { ejecutarBatchPagoOnchain, ErrorLoteSinWallets } = await import("../batchPagoOnchainService.js");
const { verificarFirma } = await import("../batchSignatureService.js");
const { ErrorRedNoSoportada } = await import("../../lib/pagosConfig.js");
import type { BatchPagoOnchainInput } from "../../validation/batchPagoOnchain.js";

const W1 = "0x1111111111111111111111111111111111111111";
const W2 = "0x2222222222222222222222222222222222222222";

function input(): BatchPagoOnchainInput {
  return {
    version: "1",
    buyer: { noExternalLlm: true },
    red: "base",
    token: "USDC",
    pagos: [
      { externalId: "C-1", montoCop: 4_000_000, walletAddress: W1 },
      { externalId: "C-2", montoCop: 2_000_000, walletAddress: W2 },
      { externalId: "C-3", montoCop: 1_000_000 }, // sin wallet → excluido
    ],
  };
}

describe("ejecutarBatchPagoOnchain", () => {
  it("arma el lote USDC en Base con conversión, links y totales correctos", async () => {
    const salida = await ejecutarBatchPagoOnchain(input());
    expect(salida.red).toBe("base");
    expect(salida.token).toBe("USDC");
    expect(salida.chainId).toBe(8453);
    expect(salida.tokenAddress).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    expect(salida.items).toHaveLength(2);
    // 4.000.000 COP / 4000 = 1000 USDC = 1_000_000_000 unidades.
    const c1 = salida.items.find((i) => i.externalId === "C-1")!;
    expect(c1.montoUsdc).toBe(1000);
    expect(c1.linkEip681).toContain("@8453/transfer?address=" + W1);
    expect(c1.linkEip681).toContain("uint256=1000000000");
    expect(salida.totalCop).toBe(6_000_000);
    expect(salida.totalUsdc).toBe(1500);
  });

  it("reporta los pagos sin wallet en excluidosSinWallet sin reventar el lote", async () => {
    const salida = await ejecutarBatchPagoOnchain(input());
    expect(salida.excluidosSinWallet).toEqual(["C-3"]);
  });

  it("congela el snapshot de tasa con hash y fija la ventana de expiración", async () => {
    const salida = await ejecutarBatchPagoOnchain(input());
    expect(salida.tasaSnapshot.hash).toBe(SNAPSHOT.hash);
    expect(salida.tasaSnapshot.tasaEfectiva).toBe(4000);
    // ventana de 6h desde ahora → expira en el futuro.
    expect(new Date(salida.expiraEn).getTime()).toBeGreaterThan(Date.now());
  });

  it("produce el Safe Transaction Builder JSON con un transfer por item", async () => {
    const salida = await ejecutarBatchPagoOnchain(input());
    const safe = salida.safeBatch as { transactions: unknown[]; chainId: string };
    expect(safe.chainId).toBe("8453");
    expect(safe.transactions).toHaveLength(2);
  });

  it("firma Ed25519 el output y verifica con la llave pública propia", async () => {
    const salida = await ejecutarBatchPagoOnchain(input());
    expect(salida.signature.algo).toBe("ed25519");
    expect(verificarFirma(salida, salida.signature)).toBe(true);
    const adulterado = { ...salida, totalUsdc: 999999 };
    expect(verificarFirma(adulterado, salida.signature)).toBe(false);
  });

  it("rechaza red/token fuera de la fase 1 con ErrorRedNoSoportada (→ 422)", async () => {
    const malo = { ...input(), red: "polygon", token: "USDT" };
    await expect(ejecutarBatchPagoOnchain(malo)).rejects.toBeInstanceOf(ErrorRedNoSoportada);
  });

  it("rechaza un lote sin ninguna wallet con ErrorLoteSinWallets (→ 422)", async () => {
    const sinWallets: BatchPagoOnchainInput = {
      version: "1",
      buyer: { noExternalLlm: true },
      red: "base",
      token: "USDC",
      pagos: [{ externalId: "X", montoCop: 1_000_000 }],
    };
    await expect(ejecutarBatchPagoOnchain(sinWallets)).rejects.toBeInstanceOf(ErrorLoteSinWallets);
  });
});
