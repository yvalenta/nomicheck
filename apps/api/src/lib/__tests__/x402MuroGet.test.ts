// El muro montado de verdad, contra un servidor que escucha.
//
// `x402Muro.test.ts` prueba las piezas; esto prueba el RUTEO, que es donde vivía
// el bug: el desafío de descubrimiento podía estar impecable y no contestar
// nunca, porque el `app.use` filtraba por método antes que por ruta.
//
// Se levanta Express real y se pega con `fetch` en vez de agregar supertest:
// este repo prefiere no sumar dependencias para una prueba que el runtime ya
// puede hacer sola.
import express from "express";
import type { Server } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarMuroX402 } from "../x402Muro.js";

/** Wallet limpia de prueba — `payTo` solo recibe, nunca firma. */
const PAY_TO = "0x1111111111111111111111111111111111111111";

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.X402_ACTIVO = "true";
  // `/verificar/durable` solo se monta con la flag (2026-09-10): estas
  // pruebas son las del muro COMPLETO, con ella encendida. La flag apagada
  // se prueba en `x402MuroDx402Apagado.test.ts`.
  process.env.DX402_ACTIVO = "true";
  process.env.X402_PAY_TO = PAY_TO;
  // Avalanche entra acá y no solo Base porque `/verificar/durable` (DX402
  // punto 2) está en `PRECIOS_USD` sin condición: con el muro activo,
  // `problemasDeConfig` revienta al arrancar si esa ruta no tiene Avalanche
  // en `X402_RED` (ver `x402Config.test.ts`, "requisitos de red por ruta").
  // El facilitador de Ultravioleta —ya el default de abajo— es el que ancla.
  process.env.X402_RED = "base,avalanche";
  process.env.X402_FACILITATOR = "https://facilitator.ultravioletadao.xyz";
  process.env.NOMICHECK_PUBLIC_ORIGIN = "https://nomicheck.ynt.codes";
  // Llave del SOBRE (DX402 punto 2): generada en memoria, nunca de archivo
  // ni de red (regla de la casa) — `/verificar/durable` está en
  // `RUTAS_CON_MURO` sin condición, así que `montarMuroX402` revienta al
  // arrancar sin esto (`sobreSignatureService.ts#sobreConfigurado`).
  const { privateKey } = generateKeyPairSync("ed25519");
  process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM = privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();

  const app = express();
  app.use(express.json());
  montarMuroX402(app);

  // Aguas abajo del muro: lo gratis que ya existía, para poder afirmar que el
  // desafío no se lo comió. Si estas dos dejaran de contestar 200, integrar
  // antes de pagar —que es como se prueba la firma— se habría roto.
  app.get("/api/batch/verificar/ejemplo", (_q, r) => void r.json({ input: {} }));
  app.get("/api/batch/publickey", (_q, r) => void r.json({ llave: "…" }));
  app.post("/api/batch/verificar", (_q, r) => void r.json({ servido: true }));

  await new Promise<void>((listo) => {
    server = app.listen(0, () => listo());
  });
  const dir = server.address();
  base = `http://127.0.0.1:${typeof dir === "object" && dir ? dir.port : 0}`;
});

afterAll(() => {
  server?.close();
  delete process.env.X402_ACTIVO;
  delete process.env.DX402_ACTIVO;
  delete process.env.X402_PAY_TO;
  delete process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM;
});

describe("GET a una ruta paga", () => {
  it("contesta 402 y no 404 — que es el bug entero", async () => {
    const res = await fetch(`${base}/api/batch/verificar`);
    expect(res.status).toBe(402);
  });

  it("el 402 trae un `accepts` con el que de verdad se puede armar un pago", async () => {
    const d = (await (await fetch(`${base}/api/batch/verificar`)).json()) as {
      accepts: { network: string; payTo: string; maxAmountRequired: string; extra: unknown }[];
    };
    const a = d.accepts[0];
    expect(a.network).toBe("eip155:8453");
    expect(a.payTo).toBe(PAY_TO);
    expect(a.maxAmountRequired).toBe("20000");
    // Sin `extra` el comprador arma mal el dominio EIP-712 y NADIE puede pagar,
    // mientras nosotros seguimos viendo un 402 impecable.
    expect(a.extra).toMatchObject({ name: "USD Coin", assetTransferMethod: "eip3009" });
  });

  it("manda a POST por cabecera además de por texto", async () => {
    const res = await fetch(`${base}/api/batch/verificar`);
    expect(res.headers.get("allow")).toBe("POST");
  });

  it("vale para las seis rutas y para las variantes /csv", async () => {
    for (const r of [
      "/liquidar",
      "/retencion",
      "/verificar",
      "/pago-onchain",
      "/comprobante",
      "/verificar/csv",
      "/verificar/durable",
    ]) {
      expect((await fetch(`${base}/api/batch${r}`)).status).toBe(402);
    }
  });

  it("/verificar/durable/csv NO existe: un sobre no es un CSV", async () => {
    expect((await fetch(`${base}/api/batch/verificar/durable/csv`)).status).not.toBe(402);
  });

  // DX402 punto 2: el 402 de la ruta durable trae, ADEMÁS de `accepts`, la
  // declaración de nivel superior `extensions["durable-evidence"]` (informe
  // `declaracion` §1) — y cada accept lleva su propia copia en
  // `extra.extensions` (la forma v0.2/fallback, informe `declaracion` §2).
  it("el 402 de /verificar/durable trae la declaración durable-evidence completa", async () => {
    const d = (await (await fetch(`${base}/api/batch/verificar/durable`)).json()) as {
      accepts: { network: string; extra: { extensions?: Record<string, unknown> } }[];
      extensions?: {
        "durable-evidence": { info: Record<string, unknown>; schema: unknown };
      };
    };
    // Solo Avalanche: la ruta durable no hereda Base aunque X402_RED lo anuncie.
    expect(d.accepts).toHaveLength(1);
    expect(d.accepts[0].network).toBe("eip155:43114");
    expect(d.extensions?.["durable-evidence"].info).toMatchObject({
      mode: "direct",
      backend: "s3",
      retention: "90d",
      acceptIndexes: [0],
    });
    expect(d.accepts[0].extra.extensions).toEqual({
      "durable-evidence": {
        mode: "direct",
        backend: "s3",
        retention: "90d",
        maxBodyBytes: 47000,
        paidBy: "seller",
      },
    });
  });

  it("el 402 de /verificar (no durable) NO trae extensions de nivel superior", async () => {
    const d = (await (await fetch(`${base}/api/batch/verificar`)).json()) as {
      extensions?: unknown;
    };
    expect(d.extensions).toBeUndefined();
  });

  // Reparación DX402 punto 2 ronda 2 (hallazgo del refutador): la forma
  // CANÓNICA de `extensions` vive en el header v2 `PAYMENT-REQUIRED`, hermana
  // de `accepts` -- no solo en el cuerpo v1 de este GET (que no tiene ese
  // campo). El facilitador y los crawlers de catálogo, que son quienes hacen
  // este GET, son justo quienes leerían ese header.
  it("el 402 de /verificar/durable trae PAYMENT-REQUIRED (v2) con la misma declaración", async () => {
    const res = await fetch(`${base}/api/batch/verificar/durable`);
    const crudo = res.headers.get("payment-required");
    expect(crudo).toBeTruthy();
    const decodificado = JSON.parse(Buffer.from(crudo!, "base64").toString("utf8")) as {
      x402Version: number;
      resource: { url: string };
      accepts: { network: string; amount: string; payTo: string }[];
      extensions?: { "durable-evidence": { info: Record<string, unknown>; schema: unknown } };
    };
    expect(decodificado.x402Version).toBe(2);
    expect(decodificado.resource.url).toBe("https://nomicheck.ynt.codes/api/batch/verificar/durable");
    expect(decodificado.accepts).toHaveLength(1);
    // Forma v2: `amount`, no `maxAmountRequired` (el cuerpo v1 usa el otro).
    expect(decodificado.accepts[0]).toMatchObject({ network: "eip155:43114", amount: "20000", payTo: PAY_TO });
    expect(decodificado.extensions?.["durable-evidence"].info).toMatchObject({
      mode: "direct",
      backend: "s3",
      retention: "90d",
      acceptIndexes: [0],
    });
  });

  it("el 402 de /verificar (no durable) NO trae PAYMENT-REQUIRED -- nada que declarar", async () => {
    const res = await fetch(`${base}/api/batch/verificar`);
    expect(res.headers.get("payment-required")).toBeNull();
  });
});

describe("lo que NO puede cambiar", () => {
  it("los GET gratis siguen gratis: el desafío no se los comió", async () => {
    // Es la regresión que importa. Si el filtro agarrara por prefijo en vez de
    // por ruta exacta, `/ejemplo` y `/publickey` empezarían a pedir plata — y
    // son justamente los que permiten integrar y verificar SIN pagar.
    expect((await fetch(`${base}/api/batch/verificar/ejemplo`)).status).toBe(200);
    expect((await fetch(`${base}/api/batch/publickey`)).status).toBe(200);
  });

  it("un POST sin pagar sigue topándose con el muro, no con el desafío", async () => {
    const res = await fetch(`${base}/api/batch/verificar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comprobantes: "esto no es una lista" }),
    });
    // 400 = lo rechazó la validación previa ANTES de cobrar. Lo que se afirma es
    // que el GET no abrió una puerta lateral: el POST no contesta 200.
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_input");
  });

  it("un pago que llega por GET NO se liquida", async () => {
    // La ley `cobrar-antes-de-servir` en su forma más cruda: por GET no hay
    // cuerpo que procesar, así que aceptar el pago sería cobrar por algo que no
    // se puede entregar — y en x402 eso no tiene vuelta atrás.
    const res = await fetch(`${base}/api/batch/verificar`, {
      headers: { "x-payment": "eyJhbGciOiJIUzI1NiJ9.e30" },
    });
    expect(res.status).toBe(405);
    const b = (await res.json()) as { error: string; mensaje: string };
    expect(b.error).toBe("wrong_method");
    expect(b.mensaje).toMatch(/NO se liquidó/);
  });

  it("un pago v2 (PAYMENT-SIGNATURE) por GET tampoco se liquida -- mismo 405", async () => {
    // La guarda miraba solo `x-payment` (v1): un pago v2 por GET recibía otro
    // 402 y el cliente reintentaba firmando, nunca el 405 que explica qué
    // pasó (refutador `protocolo`, ronda 3).
    const res = await fetch(`${base}/api/batch/verificar`, {
      headers: { "payment-signature": "eyJhbGciOiJIUzI1NiJ9.e30" },
    });
    expect(res.status).toBe(405);
    expect(((await res.json()) as { error: string }).error).toBe("wrong_method");
  });
});
