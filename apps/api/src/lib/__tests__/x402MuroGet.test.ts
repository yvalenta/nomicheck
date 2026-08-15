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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarMuroX402 } from "../x402Muro.js";

/** Wallet limpia de prueba — `payTo` solo recibe, nunca firma. */
const PAY_TO = "0x1111111111111111111111111111111111111111";

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.X402_ACTIVO = "true";
  process.env.X402_PAY_TO = PAY_TO;
  process.env.X402_RED = "base";
  process.env.X402_FACILITATOR = "https://facilitator.ultravioletadao.xyz";
  process.env.NOMICHECK_PUBLIC_ORIGIN = "https://nomicheck.ynt.codes";

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
  delete process.env.X402_PAY_TO;
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

  it("vale para las cinco rutas y para las variantes /csv", async () => {
    for (const r of [
      "/liquidar",
      "/retencion",
      "/verificar",
      "/pago-onchain",
      "/comprobante",
      "/verificar/csv",
    ]) {
      expect((await fetch(`${base}/api/batch${r}`)).status).toBe(402);
    }
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
});
