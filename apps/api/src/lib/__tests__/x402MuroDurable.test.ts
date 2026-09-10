// El adaptador de `/verificar/durable` (DX402 punto 2, Parte 3), probado de
// punta a punta: `express()` real + `server.listen(0)` + `fetch`, con
// `x402Handlers` DOBLES inyectados directo en `common.handleMiddlewareRequest`
// (nunca `createHTTPFacilitatorHandler` real — regla de la casa: nada de POST
// reales al facilitador) y el `fetch` del anchor también inyectado (stub del
// `fetch` GLOBAL, que es lo único que `fetchConTimeout` puede envolver).
//
// `calcularBatchVerificacion` SÍ corre de verdad (no se mockea el cálculo):
// lo único mockeado es `lib/prisma.js`, la fuente de datos que
// `obtenerReglasYFestivos` consulta — mismo patrón que
// `batchVerificacionService.test.ts`.
import { randomBytes } from "node:crypto";
import { generateKeyPairSync } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hexToBytes, type Address, type Hex } from "viem";
import {
  contentHash,
  parseSealed,
  unseal,
  dx402PaymentId as calcularPaymentIdSdk,
  parseEvidenceHeader,
  EvidenceSkipped,
} from "uvd-x402-sdk";
import type { common as FaremeterCommon } from "@faremeter/middleware";

const REGLAS_FIXTURE = [
  { clave: "smlmv", valor: 1_750_905, vigenteDesde: "2026-01-01", vigenteHasta: null, fuente: null },
  { clave: "auxilio_transporte", valor: 249_095, vigenteDesde: "2026-01-01", vigenteHasta: null, fuente: null },
  { clave: "auxilio_transporte_tope_smlmv", valor: 2, vigenteDesde: "1950-01-01", vigenteHasta: null, fuente: null },
  { clave: "aporte_salud_empleado", valor: 0.04, vigenteDesde: "2020-01-01", vigenteHasta: null, fuente: null },
  { clave: "aporte_pension_empleado", valor: 0.04, vigenteDesde: "2020-01-01", vigenteHasta: null, fuente: null },
  { clave: "fondo_solidaridad_umbral_smlmv", valor: 4, vigenteDesde: "2020-01-01", vigenteHasta: null, fuente: null },
  { clave: "limite_deducciones_salario", valor: 0.5, vigenteDesde: "1950-01-01", vigenteHasta: null, fuente: null },
  { clave: "divisor_hora_ordinaria", valor: 210, vigenteDesde: "2026-07-15", vigenteHasta: null, fuente: null },
];

vi.mock("../prisma.js", () => ({
  prisma: {
    reglaLegal: { findMany: vi.fn(async () => REGLAS_FIXTURE) },
    festivo: { findMany: vi.fn(async () => []) },
  },
}));

import { crearMiddlewareDurable } from "../x402MuroDurable.js";
import { AVALANCHE_MAINNET, requisitosDePago, type ConfigX402 } from "../x402Config.js";
import { verificar } from "../sobre.js";
import type { AutorizacionEip3009, CargaDePago } from "../llaveDelPagador.js";
import * as anclajeDiferidoModule from "../anclajeDiferido.js";
import { resetContadorFallosParaTest, registrarResultadoAnchor, envejecerUltimoFalloParaTest } from "../anclajeDiferido.js";
import * as batchVerificacionServiceModule from "../../services/batchVerificacionService.js";
import { obtenerSobrePublicKeyPem } from "../../services/sobreSignatureService.js";
import type { BatchVerificacionInput } from "../../validation/batchVerificacion.js";
import { usarEmisor, type LineaDeRegistro } from "../registro.js";

/** El `fetch` real, capturado ANTES de que cualquier test lo pise con
 * `vi.stubGlobal` — los stubs de abajo lo usan como fallback para las
 * llamadas del propio test contra el servidor local (`postFirmado`), que
 * viajan por el mismo `fetch` global y no deben caer en el doble del anchor. */
const fetchOriginal: typeof fetch = globalThis.fetch.bind(globalThis);

let common: typeof FaremeterCommon;
let cfg: ConfigX402;
let accept: Record<string, unknown>;
let pricing: unknown;
let sobrePublicKeyPem: string;

beforeAll(async () => {
  // Llave del sobre, generada en memoria (regla de la casa) — hace falta
  // ANTES de la primera llamada a `firmarSobre`, que es lazy pero cachea.
  const { privateKey } = generateKeyPairSync("ed25519");
  process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

  ({ common } = await import("@faremeter/middleware"));

  cfg = {
    activo: true,
    facilitatorURL: "https://facilitator.ultravioletadao.xyz",
    facilitadoresPorRed: {},
    redes: [AVALANCHE_MAINNET],
    redesInvalidas: [],
    payTo: "0x2222222222222222222222222222222222222222",
    origenPublico: "https://nomicheck.test",
  };

  // `requisitosDePago` da la forma v1 (RAW) que espera `acceptsToPricing`;
  // `relaxedRequirementsToV2` da la forma v2 que necesitan `getRequirements`
  // y `payload.accepted` — exactamente como arma `muroDurableDe` de verdad.
  const accepts = requisitosDePago(cfg, "/verificar/durable");
  expect(accepts).toHaveLength(1); // solo Avalanche — si esto cambia, el resto del archivo asume mal
  accept = common.relaxedRequirementsToV2(accepts[0]) as Record<string, unknown>;
  pricing = common.acceptsToPricing(accepts);

  sobrePublicKeyPem = obtenerSobrePublicKeyPem();
});

afterEach(() => {
  // El cortacircuitos de `anclajeDiferido.ts` es estado de MÓDULO,
  // compartido por todo el archivo: sin este reset, un test que hace
  // fallar el anchor de verdad (p. ej. "el facilitador de anchor está
  // caído") deja el contador sucio para el que corra después, y el orden
  // de los `describe` de abajo pasaría a importar en silencio.
  resetContadorFallosParaTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Helpers de firma EIP-3009 ────────────────────────────────────────────

async function firmarCarga(
  cuenta: ReturnType<typeof privateKeyToAccount>,
  authorizationFrom: Address = cuenta.address
): Promise<CargaDePago> {
  const extra = accept.extra as { name: string; version: string };
  const autorizacion: AutorizacionEip3009 = {
    from: authorizationFrom,
    to: cfg.payTo,
    value: String(accept.amount),
    validAfter: "0",
    validBefore: "9999999999",
    nonce: `0x${randomBytes(32).toString("hex")}`,
  };
  const signature = await cuenta.signTypedData({
    domain: {
      name: extra.name,
      version: extra.version,
      chainId: 43114,
      verifyingContract: accept.asset as `0x${string}`,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: autorizacion.from as Address,
      to: autorizacion.to as Address,
      value: BigInt(autorizacion.value),
      validAfter: BigInt(autorizacion.validAfter),
      validBefore: BigInt(autorizacion.validBefore),
      nonce: autorizacion.nonce as Hex,
    },
  });
  return { signature, authorization: autorizacion };
}

// ── Helpers de datos ─────────────────────────────────────────────────────

function batchChico(): BatchVerificacionInput {
  return {
    version: "1",
    buyer: { noExternalLlm: true },
    comprobantes: [
      {
        externalId: "CMP-1",
        salarioBasicoMensual: 2_000_000,
        recibeAuxilioTransporte: true,
        periodoDesde: "2026-07-01",
        periodoHasta: "2026-07-31",
        declarado: [
          { nombre: "Salario básico", valor: 2_000_000 },
          { nombre: "Auxilio de transporte", valor: 249_095 },
        ],
      },
    ],
  };
}

/** 80 comprobantes x 50 conceptos cada uno — bastante para que el sobre
 * sellado supere el tope de 64 KiB del facilitador (el SDK midió: 47 KB de
 * texto plano entra, 48 no — `x402Config.ts`, `DURABLE_EVIDENCE_INFO`). */
function batchGrande(): BatchVerificacionInput {
  const declarado = Array.from({ length: 50 }, (_, i) => ({
    nombre: `Concepto extralegal número ${i} con un nombre bien largo para pesar más`,
    valor: 1000 + i,
  }));
  return {
    version: "1",
    buyer: { noExternalLlm: true },
    comprobantes: Array.from({ length: 80 }, (_, i) => ({
      externalId: `CMP-${i}`,
      salarioBasicoMensual: 2_000_000,
      recibeAuxilioTransporte: true,
      periodoDesde: "2026-07-01",
      periodoHasta: "2026-07-31",
      declarado,
    })),
  };
}

function decodeEvidenceHeader(valor: string): Record<string, unknown> {
  const normalizado = valor.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = normalizado + "=".repeat((4 - (normalizado.length % 4)) % 4);
  return JSON.parse(Buffer.from(relleno, "base64").toString("utf8")) as Record<string, unknown>;
}

// ── El handler-facilitador doble ─────────────────────────────────────────

type HandlerFalso = {
  capabilities: { networks: string[]; assets: string[] };
  schemes: string[];
  getRequirements: () => Promise<Record<string, unknown>[]>;
  handleVerify: (req: Record<string, unknown>, pay: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  handleSettle: (req: Record<string, unknown>, pay: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
};

function handlerFalso(
  overrides: Partial<Pick<HandlerFalso, "handleVerify" | "handleSettle" | "getRequirements">> = {}
): HandlerFalso {
  return {
    capabilities: { networks: [AVALANCHE_MAINNET.caip2], assets: [AVALANCHE_MAINNET.asset] },
    schemes: ["exact"],
    getRequirements: overrides.getRequirements ?? (async () => [accept]),
    handleVerify:
      overrides.handleVerify ??
      (async (_req, pay) => ({ isValid: true, payer: (pay.payload as CargaDePago).authorization.from })),
    handleSettle:
      overrides.handleSettle ??
      (async (req, pay) => ({
        success: true,
        transaction: `0x${randomBytes(32).toString("hex")}`,
        network: req.network,
        payer: (pay.payload as CargaDePago).authorization.from,
      })),
  };
}

// ── El servidor de test ──────────────────────────────────────────────────

let servidores: Server[] = [];

async function construirApp(handler: HandlerFalso): Promise<string> {
  const app = express();
  // Mismo límite que producción monta para `/api/batch` (`index.ts`): el
  // lote grande del test de 413 pesa más que el default de 100kb de
  // `express.json`, y eso no tiene nada que ver con el límite que se está
  // probando (el del SELLADO contra el facilitador, no el del intake).
  app.use(express.json({ limit: "5mb" }));
  const mw = crearMiddlewareDurable(cfg, common, [handler as never], pricing as never);
  app.use(mw);
  // Sin esto un error no contemplado sale como el HTML por defecto de
  // Express, y un test que falla ahí no dice NADA de la causa real.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error("error en el middleware de test:", err);
    res.status(500).json({ error: "test_internal_error", mensaje: err instanceof Error ? err.message : String(err) });
  });
  const server = await new Promise<Server>((listo) => {
    const s = app.listen(0, () => listo(s));
  });
  servidores.push(server);
  const dir = server.address();
  return `http://127.0.0.1:${typeof dir === "object" && dir ? dir.port : 0}`;
}

/**
 * El MISMO wiring que `montarMuroX402` (`x402Muro.ts`, dentro de
 * `app.use((req,res,next)=>{...})`): `m.then((muro) => muro(req,res,next))
 * .catch(...)` que contesta 424 `facilitator_error`. `construirApp` (arriba)
 * monta `mw` DIRECTO con `app.use(mw)` — a propósito: ahí lo que se prueba
 * es el `body` en sí, y ningún caso de esa suite hace que
 * `common.handleMiddlewareRequest` rechace. Reparación DX402 punto 2 ronda
 * 1 (hallazgo del refutador): esta réplica es la que prueba que el
 * rechazo SALE del middleware —`crearMiddlewareDurable` ya no lo atrapa
 * puertas adentro— y que el 424 real de `montarMuroX402` lo agarra.
 */
async function construirAppConCatch424(handler: HandlerFalso): Promise<string> {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  const mw = crearMiddlewareDurable(cfg, common, [handler as never], pricing as never);
  app.use((req, res, next) => {
    Promise.resolve(mw(req, res, next)).catch((err: unknown) => {
      if (res.headersSent) return next(err);
      res.status(424).json({
        error: "facilitator_error",
        mensaje: "El facilitador no confirmo el pago. NO se entrego el recurso.",
      });
    });
  });
  const server = await new Promise<Server>((listo) => {
    const s = app.listen(0, () => listo(s));
  });
  servidores.push(server);
  const dir = server.address();
  return `http://127.0.0.1:${typeof dir === "object" && dir ? dir.port : 0}`;
}

afterEach(async () => {
  await Promise.all(servidores.map((s) => new Promise((r) => s.close(r))));
  servidores = [];
});

async function postFirmado(
  base: string,
  batch: unknown,
  carga: CargaDePago,
  opts: { v1?: boolean } = {}
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.v1) {
    const payload = { x402Version: 1, scheme: "exact", network: accept.network, asset: accept.asset, payload: carga };
    headers["X-PAYMENT"] = btoa(JSON.stringify(payload));
  } else {
    const payload = { x402Version: 2, accepted: accept, payload: carga };
    headers["PAYMENT-SIGNATURE"] = btoa(JSON.stringify(payload));
  }
  return fetch(`${base}/api/batch/verificar/durable`, { method: "POST", headers, body: JSON.stringify(batch) });
}

/** El `fetch` global por defecto: responde el anchor con éxito. Es lo único
 * que `fetchConTimeout` puede envolver — el resto de la conversación con el
 * "facilitador" es enteramente el handler doble, sin tocar la red. */
function stubFetchAnchorExitoso(): { llamadas: Array<Record<string, unknown>> } {
  const llamadas: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: { body?: string }) => {
      const url = String(input);
      if (!url.endsWith("/dx402/anchor")) {
        return fetchOriginal(input as never, init as never);
      }
      const enviado = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      llamadas.push(enviado);
      return new Response(
        JSON.stringify({
          v: 1,
          paymentId: enviado.paymentId,
          pointer: `s3+https://facilitator.example/evidencia/${String(enviado.paymentId)}`,
          backend: enviado.backend,
          contentHash: enviado.contentHash,
          cipher: "AES-256-GCM",
          keyAlg: enviado.keyAlg,
          mode: enviado.mode,
          retention: enviado.retention,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    })
  );
  return { llamadas };
}

// ── 1) Camino feliz ───────────────────────────────────────────────────────

describe("camino feliz", () => {
  it("sirve un sobre verificable, ancla, y el header de evidencia abre con la privada del pagador", async () => {
    const { llamadas } = stubFetchAnchorExitoso();
    const privKeyHex = generatePrivateKey();
    const pagador = privateKeyToAccount(privKeyHex);
    const carga = await firmarCarga(pagador);

    const base = await construirApp(handlerFalso());
    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(200);
    const cuerpo = Buffer.from(await res.arrayBuffer());
    const sobre = JSON.parse(cuerpo.toString("utf8")) as Record<string, unknown>;
    expect(verificar(sobre, sobrePublicKeyPem)).toBe(true);

    const evidencia = decodeEvidenceHeader(res.headers.get("x-durable-evidence")!);
    expect(evidencia.contentHash).toBe(contentHash(cuerpo));
    expect(evidencia.skipped).toBeUndefined();

    expect(llamadas).toHaveLength(1);
    const enviado = llamadas[0];
    expect(enviado.network).toBe("eip155:43114");
    expect(enviado.retention).toBe("90d");
    expect(enviado.mode).toBe("direct");
    expect(enviado.backend).toBe("s3");
    expect(enviado.keyAlg).toBe("ECIES-secp256k1");
    expect(enviado.sellerSignature).toBeUndefined();

    // El sellado que recibió el "facilitador" se abre con la clave PRIVADA
    // del pagador y da EXACTAMENTE los bytes servidos.
    const sellado = Buffer.from(enviado.sealed as string, "base64");
    const abierto = unseal(
      parseSealed(sellado),
      hexToBytes(privKeyHex),
      new TextEncoder().encode(enviado.paymentId as string)
    );
    expect(Buffer.from(abierto)).toEqual(cuerpo);
  });
});

// ── 2) Orden ───────────────────────────────────────────────────────────────

describe("orden de las fases", () => {
  it("authorize corre antes de calcular, y calcular antes de capture", async () => {
    stubFetchAnchorExitoso();
    const orden: string[] = [];
    const calcularOriginal = batchVerificacionServiceModule.calcularBatchVerificacion;
    const calcularSpy = vi
      .spyOn(batchVerificacionServiceModule, "calcularBatchVerificacion")
      .mockImplementation(async (input) => {
        orden.push("calcular");
        return calcularOriginal(input);
      });

    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(
      handlerFalso({
        handleVerify: async (_req, pay) => {
          orden.push("authorize");
          return { isValid: true, payer: (pay.payload as CargaDePago).authorization.from };
        },
        handleSettle: async (req, pay) => {
          orden.push("capture");
          return {
            success: true,
            transaction: `0x${randomBytes(32).toString("hex")}`,
            network: req.network,
            payer: (pay.payload as CargaDePago).authorization.from,
          };
        },
      })
    );

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(200);
    expect(orden).toEqual(["authorize", "calcular", "capture"]);
    calcularSpy.mockRestore();
  });
});

// ── 3) Lote grande ───────────────────────────────────────────────────────

describe("lote que no entra en el tope del facilitador", () => {
  it("responde 413 too_large_for_durable y NO llama a capture", async () => {
    const settle = vi.fn(async () => ({ success: true, transaction: "0xdead", network: "eip155:43114" }));
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso({ handleSettle: settle }));

    const res = await postFirmado(base, batchGrande(), carga);

    expect(res.status).toBe(413);
    const cuerpo = (await res.json()) as { error: string };
    expect(cuerpo.error).toBe("too_large_for_durable");
    expect(settle).not.toHaveBeenCalled();
  });
});

// ── 4) authorize falla ──────────────────────────────────────────────────

describe("authorize falla", () => {
  it("responde 402 y ni calcula ni cobra", async () => {
    const calcularSpy = vi.spyOn(batchVerificacionServiceModule, "calcularBatchVerificacion");
    const settle = vi.fn();
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(
      handlerFalso({
        handleVerify: async () => ({ isValid: false, invalidReason: "insufficient_funds" }),
        handleSettle: settle,
      })
    );

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(402);
    expect(calcularSpy).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
    calcularSpy.mockRestore();
  });
});

// ── 5) capture falla ──────────────────────────────────────────────────────

describe("capture falla", () => {
  it("responde el error de faremeter, sin tocar el anchor", async () => {
    const { llamadas } = stubFetchAnchorExitoso();
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(
      handlerFalso({ handleSettle: async () => ({ success: false, errorReason: "settle_failed" }) })
    );

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(402);
    expect(res.headers.get("x-durable-evidence")).toBeNull();
    expect(llamadas).toHaveLength(0);
  });
});

// ── 6) Anchor caído ─────────────────────────────────────────────────────

describe("el facilitador de anchor está caído", () => {
  it("reintenta una vez inline, agenda un reintento diferido y responde igual", async () => {
    let llamadasAnchor = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: { body?: string }) => {
        const url = String(input);
        if (!url.endsWith("/dx402/anchor")) return fetchOriginal(input as never, init as never);
        llamadasAnchor += 1;
        return new Response(JSON.stringify({ error: "facilitator_unreachable" }), { status: 503 });
      })
    );
    const programarSpy = vi.spyOn(anclajeDiferidoModule, "programarAnclaje").mockImplementation(() => {});

    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso());

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(200);
    // El intento inicial + el reintento inmediato, ambos DENTRO de la misma
    // respuesta — el pago ya cobró y no puede quedar esperando al reintento
    // diferido para contestar.
    expect(llamadasAnchor).toBe(2);
    const evidencia = decodeEvidenceHeader(res.headers.get("x-durable-evidence")!);
    expect(evidencia.skipped).toBe("anchor_failed");
    expect(programarSpy).toHaveBeenCalledTimes(1);
    expect(typeof programarSpy.mock.calls[0][0]).toBe("string");
  });
});

// ── 6b) El anchor responde 2xx con un cuerpo que NO es un objeto ──────────
//
// `anchorEvidence` (uvd-x402-sdk) hace `(await res.json()) as Record<...>`
// sin comprobar la forma: un `null`/`123`/`[]`/`"ok"` es JSON válido y pasa
// TAL CUAL. Reparación DX402 punto 2 ronda 2 (hallazgo del refutador): antes
// de `normalizarResultadoAnchor`, un `null` hacía explotar
// `registrarResultadoAnchor` con un TypeError DESPUÉS de `capture()` -- el
// pago ya liquidado terminaba en un 424 "NO se entregó el recurso" (falso: sí
// se entregó), y un `123`/`[]`/`"ok"` se colaba como éxito sin haber anclado
// nada. Los dos casos degradan ahora al mismo camino que un anchor caído
// (test de arriba): 200 con el sobre, header `skipped:"anchor_failed"`,
// reintento diferido agendado.
describe("el anchor responde 2xx con un cuerpo que no es un objeto", () => {
  it.each([
    ["null", "null"],
    ["un número", "123"],
    ["un array vacío", "[]"],
    ["un string", '"ok"'],
  ])("%s se degrada a skipped anchor_failed -- nunca un 424 sobre un pago ya cobrado", async (_nombre, cuerpoCrudo) => {
    let llamadasAnchor = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: { body?: string }) => {
        const url = String(input);
        if (!url.endsWith("/dx402/anchor")) return fetchOriginal(input as never, init as never);
        llamadasAnchor += 1;
        return new Response(cuerpoCrudo, { status: 200, headers: { "content-type": "application/json" } });
      })
    );
    const programarSpy = vi.spyOn(anclajeDiferidoModule, "programarAnclaje").mockImplementation(() => {});
    const settle = vi.fn(
      async (req: Record<string, unknown>, pay: Record<string, unknown>) => ({
        success: true,
        transaction: `0x${randomBytes(32).toString("hex")}`,
        network: req.network,
        payer: (pay.payload as CargaDePago).authorization.from,
      })
    );

    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso({ handleSettle: settle }));

    const res = await postFirmado(base, batchChico(), carga);

    // El pago YA se cobró -- nunca puede volver un 424 que diga "no se
    // entregó el recurso" sobre un recurso que sí se sirvió.
    expect(settle).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    const evidencia = decodeEvidenceHeader(res.headers.get("x-durable-evidence")!);
    expect(evidencia.skipped).toBe("anchor_failed");
    expect(llamadasAnchor).toBe(2); // el reintento inmediato degrada igual
    expect(programarSpy).toHaveBeenCalledTimes(1);
  });
});

// ── 6c) El anchor responde 2xx con un `{}` -- objeto válido, sin forma de
// evidencia. Camino de código DISTINTO al de 6b: acá `normalizarResultadoAnchor`
// deja pasar el objeto tal cual (es un objeto de verdad), y es
// `esExitoOYaAnclado` quien tiene que exigir la FORMA (`pointer`) en vez de
// la mera ausencia de `skipped`. Reparación DX402 punto 2 ronda 2 (hallazgo
// del refutador): antes, este `{}` contaba como éxito -- se reseteaba el
// cortacircuitos, no se agendaba reintento, y se le servía al comprador un
// header que el SDK REAL del comprador (`parseEvidenceHeader`) rechaza como
// malformado.
describe("el anchor responde 2xx con `{}` -- objeto válido sin pointer/contentHash/paymentId", () => {
  it("se degrada a skipped anchor_failed, con reintento -- el SDK del comprador rechazaría el éxito falso", async () => {
    let llamadasAnchor = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: { body?: string }) => {
        const url = String(input);
        if (!url.endsWith("/dx402/anchor")) return fetchOriginal(input as never, init as never);
        llamadasAnchor += 1;
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      })
    );
    const programarSpy = vi.spyOn(anclajeDiferidoModule, "programarAnclaje").mockImplementation(() => {});

    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso());

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(200);
    const encabezado = res.headers.get("x-durable-evidence")!;
    const evidencia = decodeEvidenceHeader(encabezado);
    expect(evidencia.skipped).toBe("anchor_failed");
    expect(llamadasAnchor).toBe(2);
    expect(programarSpy).toHaveBeenCalledTimes(1);
    // La prueba directa del hallazgo: si esto SÍ contara como éxito, el
    // header no llevaría `skipped` y el SDK real del comprador reventaría
    // tratando de leerlo como evidencia. Con la reparación, el header dice
    // `skipped` y `parseEvidenceHeader` lo toma por lo que es -- un anclaje
    // saltado, no una evidencia malformada.
    expect(() => parseEvidenceHeader(encabezado)).toThrow(EvidenceSkipped);
  });
});

// ── 7) Firma de otra cuenta ────────────────────────────────────────────────

describe("la firma no es de quien dice pagar", () => {
  it("responde 422 no_payer_key sin cobrar", async () => {
    const settle = vi.fn();
    const firmante = privateKeyToAccount(generatePrivateKey());
    const otraCuenta = privateKeyToAccount(generatePrivateKey());
    // `authorization.from` declara a `otraCuenta`, pero firma `firmante`.
    const carga = await firmarCarga(firmante, otraCuenta.address);
    const base = await construirApp(handlerFalso({ handleSettle: settle }));

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(422);
    const cuerpo = (await res.json()) as { error: string };
    expect(cuerpo.error).toBe("no_payer_key");
    expect(settle).not.toHaveBeenCalled();
  });
});

// ── 8) POST sin pago ──────────────────────────────────────────────────────

describe("POST sin pago", () => {
  it("responde 402 con la declaración durable-evidence completa, en header y cuerpo", async () => {
    const base = await construirApp(handlerFalso());

    const res = await fetch(`${base}/api/batch/verificar/durable`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batchChico()),
    });

    expect(res.status).toBe(402);

    const encabezado = res.headers.get("payment-required");
    expect(encabezado).toBeTruthy();
    const decodificado = decodeEvidenceHeader(encabezado!) as {
      extensions?: { "durable-evidence": { info: { acceptIndexes: number[] }; schema: unknown } };
      accepts: Array<{ extra?: { extensions?: Record<string, unknown> } }>;
    };
    expect(decodificado.extensions?.["durable-evidence"].info.acceptIndexes).toEqual([0]);
    expect(decodificado.extensions?.["durable-evidence"].schema).toBeDefined();
    expect(decodificado.accepts[0].extra?.extensions).toBeDefined();

    // El cuerpo (SIEMPRE v1) no tiene `extensions` de nivel superior, pero sí
    // el merge por accept.
    const cuerpo = (await res.json()) as { accepts: Array<{ extra?: { extensions?: Record<string, unknown> } }> };
    expect(cuerpo.accepts[0].extra?.extensions?.["durable-evidence"]).toBeDefined();
  });
});

// ── 9) Comprador v1 ────────────────────────────────────────────────────────

describe("comprador v1 (X-PAYMENT)", () => {
  it("sigue el mismo camino feliz que v2", async () => {
    stubFetchAnchorExitoso();
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso());

    const res = await postFirmado(base, batchChico(), carga, { v1: true });

    expect(res.status).toBe(200);
    const cuerpo = Buffer.from(await res.arrayBuffer());
    const sobre = JSON.parse(cuerpo.toString("utf8")) as Record<string, unknown>;
    expect(verificar(sobre, sobrePublicKeyPem)).toBe(true);
    expect(res.headers.get("x-durable-evidence")).toBeTruthy();
  });
});

// ── 10) /verificar plano no cambia ─────────────────────────────────────────
//
// No es solo que `muroDe` sea privada: exportarla no alcanzaría. Comprobado
// (reparación DX402 punto 2, ítem 4) con un caso mínimo — una función A que
// llama a una función B del MISMO módulo, ambas exportadas — que
// `vi.spyOn(modulo, "B").mockReturnValue(...)` NO intercepta la llamada
// interna que A le hace a B: Vitest/Vite solo redirige llamadas que pasan
// por el objeto del módulo (`modulo.B()`), y `montarMuroX402` llama a
// `muroDe`/`muroDurableDe` como identificador local, no así. Espiar de
// verdad exigiría reescribir `montarMuroX402` para invocar el dispatcher a
// través de un objeto inyectado — un cambio de arquitectura que ni el brief
// pidió ni se justifica solo para este test. Decisión cerrada, no abierta.
//
// Lo que sí se puede afirmar sin tocar red ni exportar nada nuevo: montada
// con `createMiddleware` de `@faremeter/middleware/express` —la MISMA
// función que usa `muroDe` por debajo— contra el MISMO handler doble, una
// ruta plana nunca agrega `X-Durable-Evidence` ni sella nada, porque su
// `body` es el de una sola fase (`capture()` y listo) que `express.js` arma
// — nunca el de tres fases que este archivo construye a mano. Es la
// diferencia de comportamiento que le importa a la Parte 3, no una prueba de
// que `montarMuroX402` elige bien (esa la cubre la lectura de `x402Muro.ts`,
// línea 489: `precio === "/verificar/durable" ? muroDurableDe(...) :
// muroDe(...)`).
describe("una ruta plana (no durable) no cambia", () => {
  it("con el flujo estándar de faremeter (el mismo que usa muroDe) no hay X-Durable-Evidence", async () => {
    const { createMiddleware } = await import("@faremeter/middleware/express");
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);

    const app = express();
    app.use(express.json());
    const mw = await createMiddleware({
      x402Handlers: [handlerFalso() as never],
      pricing: pricing as never,
      supportedVersions: { x402v1: true, x402v2: true },
    } as never);
    app.use(mw as express.RequestHandler);
    app.post("/api/batch/verificar", (_req, res) => void res.json({ servido: true }));

    const server = await new Promise<Server>((listo) => {
      const s = app.listen(0, () => listo(s));
    });
    servidores.push(server);
    const dir = server.address();
    const base = `http://127.0.0.1:${typeof dir === "object" && dir ? dir.port : 0}`;

    const payload = { x402Version: 2, accepted: accept, payload: carga };
    const res = await fetch(`${base}/api/batch/verificar`, {
      method: "POST",
      headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": btoa(JSON.stringify(payload)) },
      body: JSON.stringify(batchChico()),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-durable-evidence")).toBeNull();
    expect((await res.json()) as unknown).toEqual({ servido: true });
  });
});

// ── Reparación DX402 punto 2, ronda 1 — hallazgos del refutador ────────────

// 11) El settle que revienta (no solo success:false) tiene que dar 424, no 500.
describe("el facilitador revienta liquidando (handleSettle lanza, no solo success:false)", () => {
  it("responde 424 facilitator_error -- lo mismo que la ruta plana, nunca un 500 opaco", async () => {
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirAppConCatch424(
      handlerFalso({
        handleSettle: async () => {
          throw new Error("facilitator 502: <html>bad gateway</html>");
        },
      })
    );

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(424);
    const cuerpo = (await res.json()) as { error: string };
    expect(cuerpo.error).toBe("facilitator_error");
  });
});

// 12) El presupuesto de tiempo del anchor inmediato no puede volver a ser 8s x 2.
describe("presupuesto de tiempo del reintento inmediato de anchor", () => {
  it("usa un timeout chico -- dos intentos consecutivos no pueden sumar 16s", async () => {
    stubFetchAnchorExitoso();
    const fetchConTimeoutSpy = vi.spyOn(anclajeDiferidoModule, "fetchConTimeout");
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso());

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(200);
    expect(fetchConTimeoutSpy).toHaveBeenCalledTimes(1);
    const ms = fetchConTimeoutSpy.mock.calls[0]?.[0] as number;
    // <=4000ms: dos intentos consecutivos quedan <=8s, muy por debajo de los
    // 16s medidos antes de esta reparación y del timeout de 10s de muchos
    // clientes/agentes.
    expect(ms).toBeLessThanOrEqual(4000);
  });
});

// 13) `transaction` ausente/vacía en el settle: nunca un paymentId inventado.
describe("settle sin transaction valida (ausente o vacía)", () => {
  it("NO ancla con un id inventado -- sirve el sobre igual, con skip explícito", async () => {
    const { llamadas } = stubFetchAnchorExitoso();
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(
      handlerFalso({
        handleSettle: async (req, pay) => ({
          success: true,
          transaction: "",
          network: req.network,
          payer: (pay.payload as CargaDePago).authorization.from,
        }),
      })
    );

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(200);
    // El pago YA se cobró (capture() corrió) -- lo que no puede pasar es
    // anclar con keccak256(network) constante, así que el anchor ni se llama.
    expect(llamadas).toHaveLength(0);
    const evidencia = decodeEvidenceHeader(res.headers.get("x-durable-evidence")!);
    expect(evidencia.skipped).toBe("anchor_failed");
    expect(evidencia.error).toBe("settle_sin_txhash");
  });
});

// 14) El txHash del settle se normaliza a minúsculas antes de derivar el paymentId.
describe("normalización del txHash a minúsculas", () => {
  it("un tx en MAYÚSCULAS ancla con el mismo paymentId que testigo re-deriva (minúsculas)", async () => {
    const { llamadas } = stubFetchAnchorExitoso();
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const txMayusculas = `0x${randomBytes(32).toString("hex").toUpperCase()}`;
    const base = await construirApp(
      handlerFalso({
        handleSettle: async (req, pay) => ({
          success: true,
          transaction: txMayusculas,
          network: req.network,
          payer: (pay.payload as CargaDePago).authorization.from,
        }),
      })
    );

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(200);
    expect(llamadas).toHaveLength(1);
    const esperado = calcularPaymentIdSdk(AVALANCHE_MAINNET.caip2, txMayusculas.toLowerCase());
    expect(llamadas[0].paymentId).toBe(esperado);
    expect(llamadas[0].txHash).toBe(txMayusculas.toLowerCase());
  });
});

// 15) Un 409 already_anchored en el reintento inmediato es éxito, no skip mentiroso.
describe("el facilitador ya tenía la evidencia anclada (409 already_anchored en el reintento)", () => {
  it("no encola un reintento diferido inútil, y el header no dice anchor_failed", async () => {
    let llamadasAnchor = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: { body?: string }) => {
        const url = String(input);
        if (!url.endsWith("/dx402/anchor")) return fetchOriginal(input as never, init as never);
        llamadasAnchor += 1;
        if (llamadasAnchor === 1) {
          return new Response(JSON.stringify({ error: "facilitator_unreachable" }), { status: 503 });
        }
        return new Response(JSON.stringify({ error: "dx402_already_anchored" }), { status: 409 });
      })
    );
    const programarSpy = vi.spyOn(anclajeDiferidoModule, "programarAnclaje").mockImplementation(() => {});

    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso());

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(200);
    expect(llamadasAnchor).toBe(2);
    const evidencia = decodeEvidenceHeader(res.headers.get("x-durable-evidence")!);
    expect(evidencia.skipped).not.toBe("anchor_failed");
    expect(evidencia.skipped).toBe("already_anchored");
    expect(evidencia.paymentId).toBeDefined();
    expect(evidencia.contentHash).toBeDefined();
    expect(programarSpy).not.toHaveBeenCalled();
  });
});

// 16) Un número declarado fuera del rango canonicalizable da 400, no 500 -- y no cobra.
describe("un valor declarado fuera del rango que sobre.ts puede canonicalizar", () => {
  it("responde 400 invalid_input, sin cobrar -- no el 500 interno de antes", async () => {
    const settle = vi.fn();
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso({ handleSettle: settle }));

    const batch = batchChico();
    batch.comprobantes[0].declarado[0].valor = 1e300; // fuera de 2^53-1

    const res = await postFirmado(base, batch, carga);

    expect(res.status).toBe(400);
    const cuerpo = (await res.json()) as { error: string };
    expect(cuerpo.error).toBe("invalid_input");
    expect(settle).not.toHaveBeenCalled();
  });
});

// 17) El facilitador "enriquece" con una red que esta ruta no vende: se filtra.
describe("el facilitador enriquece el 402 con una red ajena a esta ruta", () => {
  it("el accept de la red ajena NO se publica -- durable-evidence solo sobre Avalanche", async () => {
    const acceptAjeno = { ...accept, network: "eip155:8453" };
    const base = await construirApp(handlerFalso({ getRequirements: async () => [acceptAjeno, accept] }));

    const res = await fetch(`${base}/api/batch/verificar/durable`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batchChico()),
    });

    expect(res.status).toBe(402);
    const cuerpo = (await res.json()) as { accepts: Array<{ network: string }> };
    expect(cuerpo.accepts).toHaveLength(1);
    expect(cuerpo.accepts[0].network).toBe(accept.network);
  });
});

// 17b) El filtro no mira solo la red: un eco con la red CORRECTA pero OTRO
// payTo (o asset) tampoco es propio y tampoco se publica. Reparación DX402
// punto 2 ronda 2 (hallazgo del refutador): antes, `conAcceptsFiltrados`
// solo comparaba `network`, así que un accept con el payTo de un tercero
// pasaba el filtro igual -- un comprador que confiara en el 402 firmaría un
// `transferWithAuthorization` hacia ESE tercero, y nomicheck serviría el
// sobre y ancharía un recibo que de todos modos declara `payee: cfg.payTo`
// (mentira: la plata nunca llegó ahí).
describe("el facilitador ecoa un accept con la red correcta pero otro payTo o asset", () => {
  it("un accept con OTRO payTo no se publica -- solo el propio sobrevive", async () => {
    const acceptOtroPayTo = { ...accept, payTo: "0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef" };
    const base = await construirApp(handlerFalso({ getRequirements: async () => [acceptOtroPayTo, accept] }));

    const res = await fetch(`${base}/api/batch/verificar/durable`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batchChico()),
    });

    expect(res.status).toBe(402);
    const cuerpo = (await res.json()) as { accepts: Array<{ payTo: string }> };
    expect(cuerpo.accepts).toHaveLength(1);
    expect(cuerpo.accepts[0].payTo.toLowerCase()).toBe(cfg.payTo.toLowerCase());
  });

  it("un accept con OTRO asset (misma red) no se publica -- solo el propio sobrevive", async () => {
    const acceptOtroAsset = { ...accept, asset: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a600" };
    const base = await construirApp(handlerFalso({ getRequirements: async () => [acceptOtroAsset, accept] }));

    const res = await fetch(`${base}/api/batch/verificar/durable`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batchChico()),
    });

    expect(res.status).toBe(402);
    const cuerpo = (await res.json()) as { accepts: Array<{ asset: string }> };
    expect(cuerpo.accepts).toHaveLength(1);
    expect(cuerpo.accepts[0].asset.toLowerCase()).toBe((accept.asset as string).toLowerCase());
  });

  it("si el único accept que el facilitador ecoa tiene otro payTo, el 402 queda sin ofertas ni extensions", async () => {
    const acceptOtroPayTo = { ...accept, payTo: "0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef" };
    const base = await construirApp(handlerFalso({ getRequirements: async () => [acceptOtroPayTo] }));

    const res = await fetch(`${base}/api/batch/verificar/durable`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batchChico()),
    });

    expect(res.status).toBe(402);
    const cuerpo = (await res.json()) as { accepts: unknown[] };
    expect(cuerpo.accepts).toHaveLength(0);
    // `acceptIndexes:[0]` fijo apuntaría a un accept que no existe -- con
    // `accepts` vacío, `extensions` se omite entero (reparación DX402 punto
    // 2 ronda 2, hallazgo del refutador).
    const encabezado = res.headers.get("payment-required");
    expect(encabezado).toBeTruthy();
    const decodificado = decodeEvidenceHeader(encabezado!) as { extensions?: unknown };
    expect(decodificado.extensions).toBeUndefined();
  });
});

// 18) El sobre durable NO es byte a byte el mismo documento que /verificar
// plano: documentado con un test, no descubierto en producción.
describe("diferencia entre /verificar plano y /verificar/durable para el mismo dato extralegal", () => {
  it("el sobre OMITE valorCalculado/delta en vez de null -- divergencia declarada, no accidental", async () => {
    stubFetchAnchorExitoso();
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const batch: BatchVerificacionInput = {
      version: "1",
      buyer: { noExternalLlm: true },
      comprobantes: [
        {
          externalId: "CMP-1",
          salarioBasicoMensual: 2_000_000,
          recibeAuxilioTransporte: true,
          periodoDesde: "2026-07-01",
          periodoHasta: "2026-07-31",
          declarado: [{ nombre: "Bono de productividad", valor: 500_000 }],
        },
      ],
    };

    // Lo que /verificar plano firmaría para este mismo dato: valorCalculado
    // y delta están PRESENTES, en null (LineaVerificada los declara
    // `number | null`, batchVerificacion.ts).
    const plano = await batchVerificacionServiceModule.calcularBatchVerificacion(batch);
    const lineaPlano = plano.resultados[0].lineas.find((l) => l.claveConcepto === "extralegal");
    expect(lineaPlano).toHaveProperty("valorCalculado", null);
    expect(lineaPlano).toHaveProperty("delta", null);

    // Lo que /verificar/durable SIRVE de verdad, en el sobre: `sinNulos`
    // corre antes de `firmarSobre` (`sobre.ts#firmar` rechaza cualquier
    // null) -- así que las mismas dos claves quedan AUSENTES, no en null.
    const base = await construirApp(handlerFalso());
    const res = await postFirmado(base, batch, carga);
    const cuerpoDurable = JSON.parse(Buffer.from(await res.arrayBuffer()).toString("utf8")) as {
      resultados: Array<{ lineas: Array<Record<string, unknown>> }>;
    };
    const lineaDurable = cuerpoDurable.resultados[0].lineas.find((l) => l.claveConcepto === "extralegal");

    expect(lineaDurable).not.toHaveProperty("valorCalculado");
    expect(lineaDurable).not.toHaveProperty("delta");
  });
});

// 19) El facilitador no hace eco de extra.name/version en el accept fresco
// que arma para la POST -- el dominio EIP-712 tiene que salir de
// AVALANCHE_MAINNET.eip712, no de ese eco.
describe("el facilitador no hace eco de extra.name/version", () => {
  it("igual recupera la llave del pagador -- el dominio sale de la tabla propia, no del eco", async () => {
    stubFetchAnchorExitoso();
    const pagador = privateKeyToAccount(generatePrivateKey());
    // Firma contra el dominio REAL (extra.name/version del `accept` global,
    // que es AVALANCHE_MAINNET.eip712) -- lo mismo que firmaría un
    // comprador real, sin ver nunca el accept "sin eco" de abajo.
    const carga = await firmarCarga(pagador);

    const extraSinEco = { ...(accept.extra as Record<string, unknown>) };
    delete extraSinEco.name;
    delete extraSinEco.version;
    const acceptSinEco = { ...accept, extra: extraSinEco };

    const base = await construirApp(handlerFalso({ getRequirements: async () => [acceptSinEco] }));
    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(200);
  });
});

// 20) El cortacircuitos de fallos consecutivos corta ANTES de cobrar.
describe("cortacircuitos de anclaje (fallos consecutivos sostenidos)", () => {
  it("responde 424 durable_evidence_unavailable y no cobra, cuando el anclaje viene fallando", async () => {
    const disponibleSpy = vi.spyOn(anclajeDiferidoModule, "anclajeDisponible").mockReturnValue(false);
    const settle = vi.fn();
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso({ handleSettle: settle }));

    const res = await postFirmado(base, batchChico(), carga);

    // 424, no 503 -- Cloudflare se come el cuerpo de los 502/503/504 en este
    // despliegue (medido, comentario de `montarMuroX402` en `x402Muro.ts`), y
    // el cuerpo de este error es justo lo que le dice al comprador qué hacer
    // (reparación DX402 punto 2 ronda 2, hallazgo del refutador).
    expect(res.status).toBe(424);
    const cuerpo = (await res.json()) as { error: string };
    expect(cuerpo.error).toBe("durable_evidence_unavailable");
    expect(settle).not.toHaveBeenCalled();
    disponibleSpy.mockRestore();
  });

  // Reparación DX402 punto 2 ronda 2 (hallazgo de DOS refutadores
  // independientes): antes de este fix, una vez abierto el corte nunca se
  // volvía a cerrar -- `anclajeDisponible()` cortaba ANTES de `capture()`,
  // así que nunca se volvía a llamar `anchorEvidence` de una venta nueva, y
  // el único lugar que resetea el contador (`registrarResultadoAnchor`)
  // quedaba inalcanzable. Sin este test, una regresión de esa reparación
  // pasaría desapercibida: el test de arriba solo prueba que el corte SE
  // ABRE, nunca que se vuelve a cerrar.
  it("tras agotar el umbral y pasar la ventana de gracia, con el facilitador sano, la ruta vuelve a vender", async () => {
    // Abre el corte con 5 fallos consecutivos -- el mismo umbral que
    // `x402MuroDurable.ts` consulta antes de cobrar.
    for (let i = 0; i < 5; i++) {
      registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", status: 503 });
    }
    expect(anclajeDiferidoModule.anclajeDisponible()).toBe(false);

    // Sin envejecer el reloj, el corte sigue abierto aunque el facilitador
    // ya esté sano -- confirma que el medio-abierto no deja pasar de
    // inmediato, solo pasada la ventana de gracia.
    const { llamadas } = stubFetchAnchorExitoso();
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const settle = vi.fn(
      async (req: Record<string, unknown>, pay: Record<string, unknown>) => ({
        success: true,
        transaction: `0x${randomBytes(32).toString("hex")}`,
        network: req.network,
        payer: (pay.payload as CargaDePago).authorization.from,
      })
    );
    const base = await construirApp(handlerFalso({ handleSettle: settle }));

    const todaviaCerrado = await postFirmado(base, batchChico(), carga);
    expect(todaviaCerrado.status).toBe(424);
    expect(settle).not.toHaveBeenCalled();

    // Pasa la ventana de gracia (300s) sin fakear el reloj global.
    envejecerUltimoFalloParaTest(300_000);
    expect(anclajeDiferidoModule.anclajeDisponible()).toBe(true);

    const carga2 = await firmarCarga(pagador);
    const res = await postFirmado(base, batchChico(), carga2);

    expect(res.status).toBe(200);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(llamadas.length).toBeGreaterThan(0);
    const evidencia = decodeEvidenceHeader(res.headers.get("x-durable-evidence")!);
    expect(evidencia.skipped).toBeUndefined();
    // El anclaje real que sí prendió cierra el corte del todo, no solo para
    // esta venta.
    expect(anclajeDiferidoModule.anclajeDisponible()).toBe(true);
  });
});

// 21) El sobre declara dónde queda su propio ciphertext, no solo que NomiCheck
// no persiste -- lo que el comprador compró es justo esa retención externa.
describe("habeasData del sobre declara la retención externa del facilitador", () => {
  it("trae habeasData.retencionExterna (90d, revocable) -- /verificar plano no la tiene", async () => {
    stubFetchAnchorExitoso();
    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso());

    const res = await postFirmado(base, batchChico(), carga);
    const cuerpo = JSON.parse(Buffer.from(await res.arrayBuffer()).toString("utf8")) as {
      habeasData: { retencionExterna?: { donde: string; plazo: string; revocable: boolean } };
    };

    expect(cuerpo.habeasData.retencionExterna).toEqual({
      donde: "facilitador DX402 (cifrado, solo lo abre el pagador)",
      plazo: "90d",
      revocable: true,
    });

    // /verificar plano NO tiene esta clave: construirHabeasData() la
    // comparten seis rutas más que no hospedan nada en un tercero.
    const plano = await batchVerificacionServiceModule.calcularBatchVerificacion(batchChico());
    expect(plano.habeasData).not.toHaveProperty("retencionExterna");
  });
});

// 22) El sobre firma `habeasData.retencionExterna` (backend "s3", retención
// "90d") ANTES de cobrar y ya no se puede corregir después. Reparación DX402
// punto 2 ronda 2 (hallazgo del refutador): el SDK avisa que el `backend`
// devuelto es "Declared, not measured" -- desde x402-rs 2.3.0 el facilitador
// registra el store que DE VERDAD tomó los bytes, que puede ser distinto del
// pedido (medido: `facilitator.ultravioletadao.xyz` declara `ipfs` como
// backend primario en `/dx402/stats`, no `s3`). Sin comparar el resultado
// real contra lo firmado, esa divergencia no deja ninguna señal.
describe("el backend/retención real del anchor diverge de lo que el sobre firmó", () => {
  afterEach(() => {
    // No dejar el emisor de test puesto para los archivos que corren
    // después -- mismo motivo que `resetContadorFallosParaTest` en el
    // `afterEach` de arriba: es estado de MÓDULO compartido.
    usarEmisor(() => {});
  });

  it("logea un error por cada campo cuando el facilitador ancla en otro backend/retención", async () => {
    const llamadas: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: { body?: string }) => {
        const url = String(input);
        if (!url.endsWith("/dx402/anchor")) return fetchOriginal(input as never, init as never);
        const enviado = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        llamadas.push(enviado);
        // El facilitador declara backend/retention DISTINTOS de los que se
        // pidieron -- un 200 legítimo (`esExitoOYaAnclado` da true), pero
        // que diverge de `DURABLE_EVIDENCE_INFO` (lo que el sobre ya firmó).
        return new Response(
          JSON.stringify({
            v: 1,
            paymentId: enviado.paymentId,
            pointer: `ipfs://bafk${String(enviado.paymentId)}`,
            backend: "ipfs",
            contentHash: enviado.contentHash,
            cipher: "AES-256-GCM",
            keyAlg: enviado.keyAlg,
            mode: enviado.mode,
            retention: "1y",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );
    const lineas: LineaDeRegistro[] = [];
    usarEmisor((l) => lineas.push(l));

    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso());

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(200);
    expect(llamadas).toHaveLength(1);
    const backendLog = lineas.find((l) => l.mensaje === "el backend real del anchor difiere del que el sobre firmó");
    expect(backendLog).toMatchObject({ nivel: "error", firmado: "s3", real: "ipfs" });
    const retencionLog = lineas.find(
      (l) => l.mensaje === "la retención real del anchor difiere de la que el sobre firmó"
    );
    expect(retencionLog).toMatchObject({ nivel: "error", firmada: "90d", real: "1y" });
  });

  it("no logea nada cuando el backend/retención real coinciden con lo firmado", async () => {
    stubFetchAnchorExitoso();
    const lineas: LineaDeRegistro[] = [];
    usarEmisor((l) => lineas.push(l));

    const pagador = privateKeyToAccount(generatePrivateKey());
    const carga = await firmarCarga(pagador);
    const base = await construirApp(handlerFalso());

    const res = await postFirmado(base, batchChico(), carga);

    expect(res.status).toBe(200);
    expect(lineas.some((l) => l.mensaje.includes("difiere"))).toBe(false);
  });
});
