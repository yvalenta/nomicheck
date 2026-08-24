// Tests de `nomicheck_info`, la herramienta que responde "qué hay y a quién
// le estaría pagando" sin gastar un centavo.
//
// Las tres respuestas simuladas no son inventadas: son las que produccion dio
// el 2026-08-11 (openapi.json, el 402 de la sonda y el agent card del apex),
// recortadas a lo que el resumen lee. Así el test afirma el contrato REAL, y
// si el servidor cambia la forma, actualizar estos consts es re-medir, no
// re-imaginar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { armarInfo } from "../lib/info.js";

const WALLET = "0xb345895e8B5EB66A3480641674cbEb878E0b0070";

// Recorte del openapi.json real: dos productos con muro, uno gratis, dos GETs.
const OPENAPI = {
  info: { title: "NomiCheck — motor de nómina colombiana verificable" },
  paths: {
    "/retencion": {
      post: {
        operationId: "withholding-tax",
        summary: "Calcular retención en la fuente por salarios",
        "x-x402": {
          cobra: true,
          precioUsd: 0.02,
          redes: [
            { red: "eip155:8453", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", nombre: "base" },
            { red: "eip155:43114", asset: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", nombre: "avalanche" },
          ],
        },
      },
    },
    "/retencion/csv": { post: { operationId: "withholding-tax-csv" } },
    "/liquidacion-final": {
      post: {
        operationId: "final-settlement",
        summary: "Liquidar un contrato terminado",
        "x-x402": { cobra: false, precioUsd: null, redes: null },
      },
    },
    "/pago-onchain": {
      post: {
        operationId: "usdc-contractor-payout",
        summary: "Armar un lote de pago en USDC sobre Base",
        "x-x402": { cobra: true, precioUsd: 0.02, redes: [] },
      },
    },
    "/publickey": { get: { operationId: "public-key", summary: "Llave pública Ed25519" } },
    "/health": { get: { operationId: "health", summary: "Estado del wrapper" } },
  },
};

// El 402 real de la sonda, con las dos redes y el payTo en cada entrada.
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

const AGENT_CARD = { name: "NomiCheck", "x-executor": { walletAddress: WALLET } };

type Ruta = Record<string, (init?: RequestInit) => Response | Promise<Response>>;

/** fetch de mentira ruteado por URL; lo no declarado revienta con la URL. El
 * `init` se le pasa al handler para que un test pueda mirar el MÉTODO: la
 * sonda del payTo estuvo ciega en producción con esta suite verde porque el
 * mock contestaba 402 a un POST que el mundo real ya respondía con 400. */
function simularRed(rutas: Ruta) {
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const clave = Object.keys(rutas).find((k) => String(url).includes(k));
    if (!clave) throw new Error(`el test no declaró respuesta para ${url}`);
    return rutas[clave](init);
  });
}

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });

beforeEach(() => vi.stubEnv("NOMICHECK_BASE_URL", "https://nomicheck.test"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("armarInfo", () => {
  it("resume productos, precios y redes del x-x402, sin contar las gemelas /csv dos veces", async () => {
    simularRed({
      "/api/batch/openapi.json": () => json(OPENAPI),
      "/api/batch/retencion": () => json(CUERPO_402, 402),
      "ynt.codes/.well-known/agent-card.json": () => json(AGENT_CARD),
    });

    const r = await armarInfo();
    expect(r.titulo).toContain("NomiCheck");
    // /retencion/csv NO es un cuarto producto: es la otra serialización del
    // segundo. Contarla aparte infla el catálogo que un agente va a citar.
    expect(r.productos.map((p) => p.ruta).sort()).toEqual([
      "/liquidacion-final",
      "/pago-onchain",
      "/retencion",
    ]);
    const retencion = r.productos.find((p) => p.ruta === "/retencion");
    expect(retencion).toMatchObject({ cobra: true, precioUsd: 0.02, salidaCsv: true });
    // El gratis lo es de verdad y lo dice en número, no en prosa.
    expect(r.productos.find((p) => p.ruta === "/liquidacion-final")).toMatchObject({
      cobra: false,
      precioUsd: null,
      salidaCsv: false,
    });
    expect(r.redes.map((x) => x.nombre)).toEqual(["base", "avalanche"]);
    expect(r.consultasGratis.map((c) => c.ruta).sort()).toEqual(["/health", "/publickey"]);
  });

  it("el cruce payTo↔agent card viene HECHO y coincide con la wallet publicada", async () => {
    simularRed({
      "/api/batch/openapi.json": () => json(OPENAPI),
      "/api/batch/retencion": () => json(CUERPO_402, 402),
      "ynt.codes/.well-known/agent-card.json": () => json(AGENT_CARD),
    });

    const r = await armarInfo();
    expect(r.cruce.coinciden).toBe(true);
    expect(r.cruce.payToOferta).toBe(WALLET);
    expect(r.cruce.walletAgentCard).toBe(WALLET);
    expect(r.cruce.fuentePayTo).toContain("sonda sin pago");
  });

  it("un payTo sustituido se declara PELIGRO, aunque todo lo demás se vea sano", async () => {
    // El incidente que el cruce existe para cazar: el 402 impecable cuya
    // plata va a otra parte. Nada más falla — ni firma, ni schema, ni health.
    const secuestrado = JSON.parse(JSON.stringify(CUERPO_402)) as typeof CUERPO_402;
    for (const a of secuestrado.accepts) a.payTo = "0x000000000000000000000000000000000000dEaD";
    simularRed({
      "/api/batch/openapi.json": () => json(OPENAPI),
      "/api/batch/retencion": () => json(secuestrado, 402),
      "ynt.codes/.well-known/agent-card.json": () => json(AGENT_CARD),
    });

    const r = await armarInfo();
    expect(r.cruce.coinciden).toBe(false);
    expect(r.cruce.veredicto).toContain("PELIGRO");
    expect(r.cruce.veredicto).toContain("NO firmes");
  });

  it("compara direcciones sin distinguir mayúsculas: EIP-55 escribe la misma wallet de dos formas", async () => {
    const minusculas = JSON.parse(JSON.stringify(CUERPO_402)) as typeof CUERPO_402;
    for (const a of minusculas.accepts) a.payTo = WALLET.toLowerCase();
    simularRed({
      "/api/batch/openapi.json": () => json(OPENAPI),
      "/api/batch/retencion": () => json(minusculas, 402),
      "ynt.codes/.well-known/agent-card.json": () => json(AGENT_CARD),
    });

    const r = await armarInfo();
    // Un `===` crudo diría "no coinciden" sobre la MISMA dirección, y una
    // falsa alarma acá entrena a ignorar la alarma que sí importa.
    expect(r.cruce.coinciden).toBe(true);
  });

  it("con el muro apagado no hay payTo que cruzar, y el resumen lo dice en vez de fingir un fallo", async () => {
    simularRed({
      "/api/batch/openapi.json": () => json(OPENAPI),
      // Muro apagado: el GET de una ruta paga lo sirve EL MURO (d95cd19), así
      // que sin muro esa ruta GET no existe y el catch-all del API sale 404.
      "/api/batch/retencion": () => json({ error: "not_found" }, 404),
      "ynt.codes/.well-known/agent-card.json": () => json(AGENT_CARD),
    });

    const r = await armarInfo();
    expect(r.cruce.payToOferta).toBeNull();
    expect(r.cruce.coinciden).toBeNull();
    expect(r.cruce.veredicto).toContain("apagado");
  });

  it("la sonda pregunta con GET: un POST {} recibe el 400 del rechazo previo y leería «apagado» con el muro cobrando", async () => {
    // El bug real del 2026-08-15→23, fijado para que no vuelva: el rechazo
    // previo hizo que POST {} → 400 sin tocar el muro, y esta herramienta
    // reportó cruce null en producción mientras el 402 salía perfecto al GET.
    let metodo: string | undefined = "nunca-llamado";
    simularRed({
      "/api/batch/openapi.json": () => json(OPENAPI),
      "/api/batch/retencion": (init) => {
        metodo = init?.method;
        return json(CUERPO_402, 402);
      },
      "ynt.codes/.well-known/agent-card.json": () => json(AGENT_CARD),
    });

    const r = await armarInfo();
    // `fetch(url)` sin init: el método es GET por omisión, no un POST.
    expect(metodo).toBeUndefined();
    expect(r.cruce.coinciden).toBe(true);
    expect(r.cruce.fuentePayTo).toContain("GET");
  });

  it("el apex caído deja el cruce SIN HACER — que no es lo mismo que coincidir", async () => {
    simularRed({
      "/api/batch/openapi.json": () => json(OPENAPI),
      "/api/batch/retencion": () => json(CUERPO_402, 402),
      "ynt.codes/.well-known/agent-card.json": () => json("gateway timeout", 504),
    });

    const r = await armarInfo();
    expect(r.cruce.coinciden).toBeNull();
    expect(r.cruce.veredicto).toContain("SIN HACER");
    // El payTo medido se conserva: el caller puede cruzarlo a mano.
    expect(r.cruce.payToOferta).toBe(WALLET);
  });

  it("si el accepts anuncia DOS payTo distintos, se reportan los dos en vez de esconder la anomalía", async () => {
    const raro = JSON.parse(JSON.stringify(CUERPO_402)) as typeof CUERPO_402;
    raro.accepts[1].payTo = "0x000000000000000000000000000000000000dEaD";
    simularRed({
      "/api/batch/openapi.json": () => json(OPENAPI),
      "/api/batch/retencion": () => json(raro, 402),
      "ynt.codes/.well-known/agent-card.json": () => json(AGENT_CARD),
    });

    const r = await armarInfo();
    expect(r.cruce.payToOferta).toContain(WALLET);
    expect(r.cruce.payToOferta).toContain("0x000000000000000000000000000000000000dEaD");
    expect(r.cruce.coinciden).toBe(false);
  });
});
