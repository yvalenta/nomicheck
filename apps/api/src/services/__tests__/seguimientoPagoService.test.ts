// Tests de la máquina de estados del seguimiento de pago. Se itera el
// generador directamente — sin servidor, sin socket, sin esperar 2 s reales.
// Ese es el motivo de que `seguirPago` sea un generador y no un handler.
import { beforeEach, describe, expect, it, vi } from "vitest";

let esperarMock: (args: { confirmations: number }) => Promise<unknown>;

vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: vi.fn(() => ({
    waitForTransactionReceipt: vi.fn((args: { confirmations: number }) => esperarMock(args)),
  })),
}));

const { seguirPago, TIMEOUT_MAXIMO_MS, CONFIRMACIONES_MAXIMAS } = await import(
  "../seguimientoPagoService.js"
);
const { resolverRedPago } = await import("../../lib/pagosConfig.js");
import type { EventoSeguimiento } from "../seguimientoPagoService.js";

const RED = resolverRedPago("base", "USDC");
const TX = `0x${"d".repeat(64)}`;

function recibo(status: "success" | "reverted" = "success") {
  return { status, blockNumber: 49_148_400n };
}

async function recolectar(gen: AsyncGenerator<EventoSeguimiento>): Promise<EventoSeguimiento[]> {
  const out: EventoSeguimiento[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

beforeEach(() => {
  esperarMock = async () => recibo();
});

describe("seguirPago", () => {
  it("recorre buscando → minado → confirmado", async () => {
    const eventos = await recolectar(seguirPago(RED, TX));

    expect(eventos.map((e) => e.fase)).toEqual(["buscando", "minado", "confirmado"]);
    expect(eventos[0]).toMatchObject({ txHash: TX, red: "base", chainId: 8453 });
    expect(eventos[1]).toMatchObject({ bloque: "49148400" });
    expect(eventos[2]).toMatchObject({ puedeEmitirComprobante: true, confirmaciones: 2 });
  });

  it("corta en revertido y no dice que se puede emitir constancia", async () => {
    esperarMock = async () => recibo("reverted");
    const eventos = await recolectar(seguirPago(RED, TX));

    expect(eventos.map((e) => e.fase)).toEqual(["buscando", "revertido"]);
    expect(JSON.stringify(eventos)).not.toContain("puedeEmitirComprobante");
  });

  it("informa expirado sin afirmar que el pago falló", async () => {
    esperarMock = async () => {
      throw new Error("Timed out while waiting for transaction");
    };
    const eventos = await recolectar(seguirPago(RED, TX, { timeoutMs: 10 }));

    expect(eventos.map((e) => e.fase)).toEqual(["buscando", "expirado"]);
    const exp = eventos[1] as Extract<EventoSeguimiento, { fase: "expirado" }>;
    // Distinguir "no la vi" de "falló" es la diferencia entre que el empleador
    // espere tranquilo o vuelva a pagar por miedo, duplicando la transferencia.
    expect(exp.motivo).toContain("no se duplica");
  });

  it("si alcanza 1 confirmación pero no las pedidas, reporta lo que hay", async () => {
    esperarMock = async ({ confirmations }) => {
      if (confirmations === 1) return recibo();
      throw new Error("Timed out");
    };
    const eventos = await recolectar(seguirPago(RED, TX, { confirmaciones: 4 }));

    // No se pierde el hecho de que ya está minada; simplemente no se afirma
    // más certeza de la que hay.
    expect(eventos.map((e) => e.fase)).toEqual(["buscando", "minado", "minado"]);
    expect(eventos.every((e) => e.fase !== "confirmado")).toBe(true);
  });

  it("con 1 confirmación no hace la segunda espera", async () => {
    const vistas: number[] = [];
    esperarMock = async ({ confirmations }) => {
      vistas.push(confirmations);
      return recibo();
    };
    const eventos = await recolectar(seguirPago(RED, TX, { confirmaciones: 1 }));

    expect(vistas).toEqual([1]);
    expect(eventos.map((e) => e.fase)).toEqual(["buscando", "minado", "confirmado"]);
  });

  it("limita confirmaciones y timeout a sus topes", async () => {
    const vistas: number[] = [];
    let timeoutVisto = 0;
    esperarMock = async (args) => {
      const a = args as { confirmations: number; timeout: number };
      vistas.push(a.confirmations);
      timeoutVisto ||= a.timeout;
      return recibo();
    };

    await recolectar(seguirPago(RED, TX, { confirmaciones: 999, timeoutMs: 9_999_999 }));

    expect(Math.max(...vistas)).toBe(CONFIRMACIONES_MAXIMAS);
    expect(timeoutVisto).toBe(TIMEOUT_MAXIMO_MS);
  });

  it("deja de emitir cuando el cliente aborta", async () => {
    const ctrl = new AbortController();
    esperarMock = () => new Promise(() => {}); // nunca resuelve
    const gen = seguirPago(RED, TX, { senal: ctrl.signal });

    expect((await gen.next()).value).toMatchObject({ fase: "buscando" });
    ctrl.abort();
    // Sin el aborto esto quedaría colgado hasta el timeout de 120 s.
    expect(await gen.next()).toEqual({ done: true, value: undefined });
  });

  it("no consulta la cadena si la señal ya venía abortada", async () => {
    const llamadas = vi.fn(async () => recibo());
    esperarMock = llamadas;
    const eventos = await recolectar(seguirPago(RED, TX, { senal: AbortSignal.abort() }));

    expect(eventos.map((e) => e.fase)).toEqual(["buscando"]);
    expect(llamadas).not.toHaveBeenCalled();
  });
});
