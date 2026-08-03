// Tests de la traducción v2 -> v1 hacia el facilitador.
//
// Lo que protegen no es un formato: es el único modo de falla que este muro
// tiene y que NO se ve desde acá. El comprador firma bien, el 402 se ve
// impecable, y la liquidación muere del lado del facilitador — así que la
// pérdida se lee como "nadie quiso comprar" en vez de como un error.
//
// Medido el 2026-08-03 contra `facilitator.ultravioletadao.xyz` v1.66.1: sus
// `/settle` y `/verify` rechazan exactamente los tres campos que se afirman
// abajo, mientras su `/accepts` acepta los de v2. faremeter 0.22.0 —la última
// publicada— manda v2 siempre.
import { describe, expect, it } from "vitest";
import { BASE_MAINNET, BASE_SEPOLIA } from "../x402Config.js";
import { aFormatoV1 } from "../x402Muro.js";

/** Lo que faremeter 0.22.0 manda de verdad, copiado de la corrida real. */
const CUERPO_V2 = {
  paymentRequirements: {
    scheme: "exact",
    network: "eip155:8453",
    amount: "20000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0xb345895e8B5EB66A3480641674cbEb878E0b0070",
    maxTimeoutSeconds: 30,
    extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
  },
  paymentPayload: {
    x402Version: 2,
    accepted: { scheme: "exact", network: "eip155:8453", amount: "20000" },
    payload: {
      signature: `0x${"11".repeat(65)}`,
      authorization: {
        from: "0x8f6d22499439eb466fe12e31a98eaba0bfcf142a",
        to: "0xb345895e8B5EB66A3480641674cbEb878E0b0070",
        value: "20000",
        validAfter: "0",
        validBefore: "9999999999",
        nonce: `0x${"22".repeat(32)}`,
      },
    },
    resource: {
      url: "https://nomicheck.ynt.codes/api/batch/verificar",
      description: "NomiCheck batch verification.",
    },
  },
};

type Traducido = {
  x402Version: number;
  paymentRequirements: Record<string, unknown>;
  paymentPayload: Record<string, unknown>;
};

const traducir = (red = BASE_MAINNET) => aFormatoV1(CUERPO_V2, red) as Traducido;

describe("aFormatoV1", () => {
  it("manda el nombre v1 de la red, no el CAIP-2", () => {
    // `unknown variant 'eip155:8453', expected one of ... 'base' ...`
    const t = traducir();
    expect(t.paymentRequirements.network).toBe("base");
    expect(t.paymentPayload.network).toBe("base");
    expect(JSON.stringify(t)).not.toContain("eip155:");
  });

  it("renombra `amount` a `maxAmountRequired` conservando el monto", () => {
    // `missing field maxAmountRequired`
    const t = traducir();
    expect(t.paymentRequirements.maxAmountRequired).toBe("20000");
    expect(t.paymentRequirements.amount).toBeUndefined();
  });

  it("pone `x402Version` arriba del todo", () => {
    // `missing field x402Version`
    expect(traducir().x402Version).toBe(1);
  });

  it("no toca la firma ni la autorización", () => {
    // La firma cubre el `transferWithAuthorization`, no el sobre. Si esta
    // prueba falla, el facilitador rechazaría pagos legítimos por firma
    // inválida y el comprador no tendría forma de saber por qué.
    expect(traducir().paymentPayload.payload).toEqual(CUERPO_V2.paymentPayload.payload);
  });

  it("aplana el recurso a los tres campos sueltos de v1", () => {
    const req = traducir().paymentRequirements;
    expect(req.resource).toBe("https://nomicheck.ynt.codes/api/batch/verificar");
    expect(req.description).toBe("NomiCheck batch verification.");
    expect(req.mimeType).toBe("application/json");
  });

  it("descarta `accepted`, que v1 no conoce", () => {
    expect(traducir().paymentPayload.accepted).toBeUndefined();
  });

  it("usa el nombre de la red configurada, no uno escrito a mano", () => {
    // Si esto se hardcodeara a "base", encender el muro en Sepolia liquidaría
    // —o intentaría liquidar— contra mainnet.
    expect(traducir(BASE_SEPOLIA).paymentRequirements.network).toBe("base-sepolia");
  });

  it("no inventa una descripción cuando el recurso no la trae", () => {
    const sinDesc = {
      ...CUERPO_V2,
      paymentPayload: { ...CUERPO_V2.paymentPayload, resource: { url: "https://x/y" } },
    };
    const t = aFormatoV1(sinDesc, BASE_MAINNET) as Traducido;
    expect(t.paymentRequirements.description).toBe("");
  });
});
