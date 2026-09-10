// La flag `DX402_ACTIVO` apagada (default), contra un servidor que escucha y
// con el ROUTER REAL de /api/batch montado aguas abajo del muro: lo que un
// comprador ve en un deploy de `main` sin la llave del sobre.
//
// La lente del refutador para esta flag: ¿apagada de verdad no cobra ni
// publica NADA de DX402? El muro no puede contestar 402 por /verificar/durable
// (sería anunciar un precio por una ruta que no existe), el router no puede
// servir la llave del sobre (503 diría "existe pero está rota"), y todo lo
// demás tiene que seguir cobrando igual. `x402MuroGet.test.ts` es el espejo
// con la flag encendida.
import express from "express";
import type { Server } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { montarMuroX402 } from "../x402Muro.js";
import { batchPublicoRouter } from "../../routes/batchPublico.js";

const PAY_TO = "0x1111111111111111111111111111111111111111";

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.X402_ACTIVO = "true";
  delete process.env.DX402_ACTIVO;
  process.env.X402_PAY_TO = PAY_TO;
  // Solo Base, a propósito: es la config de producción de hoy, la que sin la
  // flag reventaba el arranque por falta de Avalanche.
  process.env.X402_RED = "base";
  process.env.X402_FACILITATOR = "https://facilitator.ultravioletadao.xyz";
  process.env.NOMICHECK_PUBLIC_ORIGIN = "https://nomicheck.ynt.codes";
  // Con llave del sobre PRESENTE, para que el 404 de abajo sea por la flag y
  // no por la llave — es la diferencia que el test tiene que poder ver.
  const { privateKey } = generateKeyPairSync("ed25519");
  process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM = privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();

  const app = express();
  app.use(express.json());
  montarMuroX402(app);
  app.use("/api/batch", batchPublicoRouter);

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
  delete process.env.X402_RED;
  delete process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM;
});

describe("DX402_ACTIVO apagada, muro encendido", () => {
  it("POST /verificar/durable da 404, no 402: la ruta no existe, no es que cueste", async () => {
    const res = await fetch(`${base}/api/batch/verificar/durable`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: "1", items: [] }),
    });
    expect(res.status).toBe(404);
  });

  it("GET /verificar/durable tampoco contesta el desafío de descubrimiento", async () => {
    const res = await fetch(`${base}/api/batch/verificar/durable`);
    expect(res.status).toBe(404);
    expect(res.headers.get("payment-required")).toBeNull();
  });

  it("GET /verificar/durable/sobre-publickey da 404 aunque la llave esté configurada", async () => {
    const res = await fetch(`${base}/api/batch/verificar/durable/sobre-publickey`);
    expect(res.status).toBe(404);
    const cuerpo = (await res.json()) as { error: string; mensaje: string };
    expect(cuerpo.error).toBe("not_found");
    expect(cuerpo.mensaje).toContain("DX402_ACTIVO");
    // Y no filtra la llave ni su id: un deploy que no vende sobres no la publica.
    expect(JSON.stringify(cuerpo)).not.toContain("publicKey");
  });

  it("las demás rutas pagas siguen cobrando: el muro entero no se apagó", async () => {
    for (const r of ["/verificar", "/verificar/csv", "/liquidar", "/comprobante"]) {
      expect((await fetch(`${base}/api/batch${r}`)).status).toBe(402);
    }
  });

  it("lo gratis sigue gratis: la llave del batch se sirve", async () => {
    // 200 o 503 (sin NOMICHECK_BATCH_SIGNING_KEY_PEM el batch firma con una
    // llave efímera, o no) — lo que NO puede ser es 402 ni 404.
    const res = await fetch(`${base}/api/batch/publickey`);
    expect([200, 503]).toContain(res.status);
  });
});
