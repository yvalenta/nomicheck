// Tests de `nomicheck_calcular`: el 402 como contrato, el pago como header y
// la constancia decodificada.
//
// El cuerpo 402 simulado es el que produccion contestó el 2026-08-11 a un POST
// sin pago (dos redes, mismo payTo). Lo demás se construye alrededor de ese
// hecho medido.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calcular } from "../lib/calcular.js";

const WALLET = "0xb345895e8B5EB66A3480641674cbEb878E0b0070";

const CUERPO_402 = {
  x402Version: 1,
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      maxAmountRequired: "20000",
      payTo: WALLET,
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
    },
    {
      scheme: "exact",
      network: "eip155:43114",
      maxAmountRequired: "20000",
      payTo: WALLET,
      asset: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
    },
  ],
  error: "",
};

const AGENT_CARD = { "x-executor": { walletAddress: WALLET } };

interface Registro {
  url: string;
  init?: RequestInit;
}

/** fetch simulado que además REGISTRA lo que se mandó, para afirmar headers. */
function simularRed(respuestas: Record<string, () => Response>, registro?: Registro[]) {
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    registro?.push({ url: String(url), init });
    const clave = Object.keys(respuestas).find((k) => String(url).includes(k));
    if (!clave) throw new Error(`el test no declaró respuesta para ${url}`);
    return respuestas[clave]();
  });
}

const json = (v: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(v), { status, headers });

beforeEach(() => vi.stubEnv("NOMICHECK_BASE_URL", "https://nomicheck.test"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("calcular sin pago: el 402 estructurado", () => {
  it("devuelve el `accepts` COMPLETO, no un resumen — ahí viven el dominio EIP-712 y el payTo", async () => {
    simularRed({
      "/api/batch/retencion": () => json(CUERPO_402, 402),
      "ynt.codes/.well-known/agent-card.json": () => json(AGENT_CARD),
    });

    const r = await calcular("retencion", { version: "1" });
    expect(r).toMatchObject({ status: 402, pagoRequerido: true });
    if (!("accepts" in r)) throw new Error("esperaba un Resultado402");
    expect(r.accepts).toHaveLength(2);
    // Sin el `extra` nadie puede firmar: el comprador arma el dominio EIP-712
    // con lo que encuentre ahí, y si no encuentra nada, adivina.
    expect(r.accepts[0]).toMatchObject({ extra: { name: "USD Coin", version: "2" } });
    expect(r.nota).toContain("EIP-3009");
    expect(r.nota).toContain("x_payment");
  });

  it("trae el cruce payTo↔agent card hecho en el momento de la oferta", async () => {
    simularRed({
      "/api/batch/retencion": () => json(CUERPO_402, 402),
      "ynt.codes/.well-known/agent-card.json": () => json(AGENT_CARD),
    });

    const r = await calcular("retencion", { version: "1" });
    if (!("crucePayTo" in r)) throw new Error("esperaba un Resultado402");
    expect(r.crucePayTo.coinciden).toBe(true);
    expect(r.crucePayTo.walletAgentCard).toBe(WALLET);
  });

  it("el apex caído NO bloquea el 402 legítimo: la oferta vuelve, el cruce queda declarado sin hacer", async () => {
    simularRed({
      "/api/batch/retencion": () => json(CUERPO_402, 402),
      "ynt.codes/.well-known/agent-card.json": () => json("boom", 500),
    });

    const r = await calcular("retencion", { version: "1" });
    if (!("crucePayTo" in r)) throw new Error("esperaba un Resultado402");
    expect(r.accepts).toHaveLength(2);
    expect(r.crucePayTo.coinciden).toBeNull();
    expect(r.crucePayTo.detalle).toContain("Verify it before signing");
  });

  it("un payTo ajeno en la oferta sale marcado PELIGRO en el mismo 402", async () => {
    const secuestrado = JSON.parse(JSON.stringify(CUERPO_402)) as typeof CUERPO_402;
    secuestrado.accepts[0].payTo = "0x000000000000000000000000000000000000dEaD";
    simularRed({
      "/api/batch/retencion": () => json(secuestrado, 402),
      "ynt.codes/.well-known/agent-card.json": () => json(AGENT_CARD),
    });

    const r = await calcular("retencion", { version: "1" });
    if (!("crucePayTo" in r)) throw new Error("esperaba un Resultado402");
    expect(r.crucePayTo.coinciden).toBe(false);
    expect(r.crucePayTo.detalle).toContain("DANGER");
  });
});

describe("calcular con pago", () => {
  it("manda el body como JSON y la autorización en el header X-PAYMENT", async () => {
    const registro: Registro[] = [];
    simularRed({ "/api/batch/verificar": () => json({ resultados: [] }) }, registro);

    await calcular("verificar", { version: "1" }, "AUTORIZACION-FIRMADA");
    const post = registro[0];
    expect(post.url).toBe("https://nomicheck.test/api/batch/verificar");
    const headers = post.init?.headers as Record<string, string>;
    expect(headers["X-PAYMENT"]).toBe("AUTORIZACION-FIRMADA");
    expect(headers["content-type"]).toBe("application/json");
    expect(post.init?.body).toBe(JSON.stringify({ version: "1" }));
  });

  it("sin `x_payment` el header NO viaja: un header vacío también es un header", async () => {
    const registro: Registro[] = [];
    simularRed({ "/api/batch/verificar": () => json(CUERPO_402, 402), "ynt.codes": () => json(AGENT_CARD) }, registro);

    await calcular("verificar", { version: "1" });
    const headers = registro[0].init?.headers as Record<string, string>;
    expect("X-PAYMENT" in headers).toBe(false);
  });

  it("decodifica X-PAYMENT-RESPONSE (base64 → JSON): la constancia de la liquidación on-chain", async () => {
    const constancia = { success: true, transaction: "0xabc", network: "eip155:8453" };
    simularRed({
      "/api/batch/retencion": () =>
        json({ resultados: [{ retencionFuente: 0 }] }, 200, {
          "X-PAYMENT-RESPONSE": Buffer.from(JSON.stringify(constancia), "utf8").toString("base64"),
        }),
    });

    const r = await calcular("retencion", { version: "1" }, "AUTORIZACION");
    if (!("xPaymentResponse" in r)) throw new Error("esperaba un ResultadoOk");
    expect(r.status).toBe(200);
    // Decodificada ACÁ y no por el modelo que llama: una constancia on-chain
    // "decodificada" de memoria es peor que ninguna.
    expect(r.xPaymentResponse).toEqual(constancia);
    expect(r.resultado).toMatchObject({ resultados: [{ retencionFuente: 0 }] });
  });

  it("una X-PAYMENT-RESPONSE ilegible conserva el crudo: el caller pagó y le deben la constancia", async () => {
    simularRed({
      "/api/batch/retencion": () => json({ ok: true }, 200, { "X-PAYMENT-RESPONSE": "%%%no-es-base64-json%%%" }),
    });

    const r = await calcular("retencion", { version: "1" }, "AUTORIZACION");
    if (!("xPaymentResponse" in r)) throw new Error("esperaba un ResultadoOk");
    expect(r.xPaymentResponse).toMatchObject({ crudo: "%%%no-es-base64-json%%%" });
  });

  it("un 200 sin la constancia reporta null, sin inventarla", async () => {
    simularRed({ "/api/batch/retencion": () => json({ ok: true }) });

    const r = await calcular("retencion", { version: "1" }, "AUTORIZACION");
    if (!("xPaymentResponse" in r)) throw new Error("esperaba un ResultadoOk");
    expect(r.xPaymentResponse).toBeNull();
  });
});

describe("calcular cuando el servidor dice que no", () => {
  it("un 400 vuelve con el detalle del validador, que es lo que el caller necesita corregir", async () => {
    const detalle = { error: "invalid_input", detalle: { fieldErrors: { version: ["Required"] } } };
    simularRed({ "/api/batch/liquidar": () => json(detalle, 400) });

    const r = await calcular("liquidar", {});
    expect(r).toMatchObject({ status: 400, error: detalle });
  });

  it("un cuerpo que no es JSON (el HTML de un proxy caído) se entrega como texto, no como SyntaxError", async () => {
    simularRed({
      "/api/batch/liquidar": () => new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    });

    const r = await calcular("liquidar", { version: "1" });
    expect(r).toMatchObject({ status: 502, error: "<html>502 Bad Gateway</html>" });
  });
});
