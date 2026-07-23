// Unit tests puros del pipeline de pago on-chain (SDD §17). Cubren las
// primitivas del generador de lote sin BD ni RPC:
//   - Conversión COP → unidades USDC (6 decimales, redondeo half-away).
//   - Determinismo del hash del snapshot de tasa.
//   - Formato exacto del link EIP-681.
//   - Validación estricta red/token de fase 1.
//   - Estructura del Safe Transaction Builder JSON.
import { describe, expect, it } from "vitest";
import { copAUnidadesUsdc, linkEip681, safeBatchJson, unidadesAUsdc } from "../pagosService.js";
import { ErrorRedNoSoportada, resolverRedPago } from "../../lib/pagosConfig.js";
import { hashSnapshot } from "../tasaCambioService.js";

const BASE = resolverRedPago("base", "USDC");

describe("copAUnidadesUsdc", () => {
  it("convierte COP a unidades enteras de 6 decimales", () => {
    // 4.200.000 COP / 4.200 = 1000 USDC = 1_000_000_000 unidades.
    expect(copAUnidadesUsdc(4_200_000, 4_200)).toBe(1_000_000_000n);
  });

  it("redondea half-away el .5 de la unidad final (Math.round)", () => {
    // 3 COP / 2_000_000 × 1_000_000 = 1.5 unidades → 2 (redondeo half-away).
    expect(copAUnidadesUsdc(3, 2_000_000)).toBe(2n);
    // 1 COP / 2_000_000 × 1_000_000 = 0.5 unidades → 1.
    expect(copAUnidadesUsdc(1, 2_000_000)).toBe(1n);
  });

  it("rechaza tasa <= 0", () => {
    expect(() => copAUnidadesUsdc(1000, 0)).toThrow();
    expect(() => copAUnidadesUsdc(1000, -1)).toThrow();
  });

  it("unidadesAUsdc revierte a decimal con 6 dígitos", () => {
    expect(unidadesAUsdc(1_500_000n)).toBe(1.5);
  });
});

describe("hashSnapshot", () => {
  it("es determinista con los mismos insumos", () => {
    const base = {
      trm: 4200,
      fuente: "test",
      fechaTrm: "2026-07-23",
      primaPct: 0,
      tasaEfectiva: 4200,
      capturadoEn: "2026-07-23T10:00:00.000Z",
    };
    expect(hashSnapshot(base)).toBe(hashSnapshot(base));
  });

  it("cambia si cualquier campo cambia", () => {
    const base = {
      trm: 4200,
      fuente: "test",
      fechaTrm: "2026-07-23",
      primaPct: 0,
      tasaEfectiva: 4200,
      capturadoEn: "2026-07-23T10:00:00.000Z",
    };
    expect(hashSnapshot({ ...base, trm: 4201 })).not.toBe(hashSnapshot(base));
    expect(hashSnapshot({ ...base, primaPct: 0.01 })).not.toBe(hashSnapshot(base));
  });
});

describe("linkEip681", () => {
  it("respeta el formato ethereum:<token>@<chainId>/transfer?address=<destino>&uint256=<unidades>", () => {
    const link = linkEip681(BASE, "0x1111111111111111111111111111111111111111", 1_000_000n);
    expect(link).toBe(
      "ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=0x1111111111111111111111111111111111111111&uint256=1000000"
    );
  });
});

describe("resolverRedPago", () => {
  it("acepta base + USDC en fase 1", () => {
    expect(resolverRedPago("base", "USDC").chainId).toBe(8453);
  });

  it("rechaza cualquier otro par con mensaje explícito", () => {
    expect(() => resolverRedPago("polygon", "USDC")).toThrow(ErrorRedNoSoportada);
    expect(() => resolverRedPago("base", "USDT")).toThrow(ErrorRedNoSoportada);
    try {
      resolverRedPago("solana", "USDC");
    } catch (e) {
      expect((e as Error).message).toContain('{ red: "base", token: "USDC" }');
      expect((e as Error).message).toContain("SDD §17");
    }
  });
});

describe("safeBatchJson", () => {
  it("arma un batch válido para el Safe Transaction Builder", () => {
    const json = safeBatchJson(
      BASE,
      [
        { destino: "0x1111111111111111111111111111111111111111", unidades: 1_000_000n },
        { destino: "0x2222222222222222222222222222222222222222", unidades: 2_500_000n },
      ],
      "test batch"
    ) as {
      version: string;
      chainId: string;
      transactions: { to: string; contractInputsValues: { to: string; value: string } }[];
    };
    expect(json.version).toBe("1.0");
    expect(json.chainId).toBe("8453");
    expect(json.transactions).toHaveLength(2);
    expect(json.transactions[0].to).toBe(BASE.tokenAddress);
    expect(json.transactions[0].contractInputsValues.value).toBe("1000000");
    expect(json.transactions[1].contractInputsValues.to).toBe("0x2222222222222222222222222222222222222222");
  });
});
