// Tests de `liquidacionService.ts` — el productor de la liquidación asíncrona
// (SDD §15). Acá no se calcula un peso: se decide CUÁNDO se puede calcular y
// quién gana cuando dos analistas tocan el mismo periodo. El modo de falla es
// de estado, no de excepción: encolar un periodo ya liquidado duplicaría
// recibos; revertir un periodo pagado borraría los recibos de un pago ya
// ejecutado; y perder el version-check haría que el último en guardar pise al
// primero sin que nadie lo note.
//
// Ninguna prueba toca BD ni pg-boss: se cortan `lib/prisma.js`, `lib/boss.js`,
// `lib/auditoria.js` y `periodosService` para que la suite pase con
// `env -u DATABASE_URL` (pg-boss explota sin esa variable justamente).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock, txMock, obtenerPeriodoMock, bossSendMock } = vi.hoisted(() => {
  const txMock = {
    periodoNomina: { update: vi.fn() },
    reciboPago: { deleteMany: vi.fn() },
  };
  return {
    txMock,
    prismaMock: {
      periodoNomina: { findFirst: vi.fn() },
      reciboPago: { findMany: vi.fn() },
    },
    obtenerPeriodoMock: vi.fn(),
    bossSendMock: vi.fn(),
  };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));
// conAuditoria real abre una transacción con SET LOCAL — acá solo interesa que
// el servicio ejecute su cuerpo con un tx; el tx es el mock de arriba.
vi.mock("../../lib/auditoria.js", () => ({
  conAuditoria: (_usuarioId: string | null, fn: (tx: unknown) => Promise<unknown>) => fn(txMock),
}));
vi.mock("../../lib/boss.js", () => ({
  COLA_LIQUIDACION: "liquidar-nomina",
  getBoss: async () => ({ send: bossSendMock }),
}));
vi.mock("../periodosService.js", () => ({
  obtenerPeriodo: (...args: unknown[]) => obtenerPeriodoMock(...args),
}));

import {
  actualizarPeriodoConVersion,
  encolarLiquidacion,
  listarRecibos,
  obtenerEstadoLiquidacion,
  revertirABorrador,
} from "../liquidacionService.js";
import { ErrorConflicto } from "../empleadosService.js";

function periodoFixture(over: Record<string, unknown> = {}) {
  return { id: 55, empresaId: 1, estado: "borrador", version: 3, ...over };
}

// El error exacto que Prisma lanza cuando el update con version no matchea
// ninguna fila (otro analista ya incrementó la version).
function errorP2025() {
  return new Prisma.PrismaClientKnownRequestError("Record to update not found.", {
    code: "P2025",
    clientVersion: "test",
  });
}

beforeEach(() => {
  txMock.periodoNomina.update.mockReset().mockResolvedValue(periodoFixture());
  txMock.reciboPago.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  prismaMock.periodoNomina.findFirst.mockReset().mockResolvedValue(periodoFixture());
  prismaMock.reciboPago.findMany.mockReset().mockResolvedValue([]);
  obtenerPeriodoMock.mockReset().mockResolvedValue(periodoFixture());
  bossSendMock.mockReset().mockResolvedValue("job-abc");
});

describe("actualizarPeriodoConVersion — concurrencia optimista", () => {
  it("condiciona el update a la version actual e incrementa en el mismo update", async () => {
    // El where con version ES el candado: sin él, dos liquidaciones
    // simultáneas escriben ambas y la segunda pisa a la primera en silencio.
    await actualizarPeriodoConVersion(
      txMock as unknown as Prisma.TransactionClient,
      55,
      3,
      { estado: "liquidando" }
    );
    const args = txMock.periodoNomina.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: 55, version: 3 });
    expect(args.data.version).toEqual({ increment: 1 });
    expect(args.data.estado).toBe("liquidando");
  });

  it("P2025 (nadie matcheó la version) se traduce a ErrorConflicto → HTTP 409", async () => {
    txMock.periodoNomina.update.mockRejectedValue(errorP2025());
    await expect(
      actualizarPeriodoConVersion(txMock as unknown as Prisma.TransactionClient, 55, 3, {})
    ).rejects.toThrow(ErrorConflicto);
  });

  it("cualquier otro error de Prisma sube tal cual — no todo es conflicto", async () => {
    // Disfrazar una caída de conexión de 409 haría que el analista "reintente"
    // contra una base caída creyendo que fue culpa de un colega.
    const caida = new Error("Can't reach database server");
    txMock.periodoNomina.update.mockRejectedValue(caida);
    await expect(
      actualizarPeriodoConVersion(txMock as unknown as Prisma.TransactionClient, 55, 3, {})
    ).rejects.toBe(caida);
  });
});

describe("encolarLiquidacion — guard de estado", () => {
  it.each(["liquidando", "liquidado", "liquidado_con_rechazos", "pagado", "fallido"])(
    "desde %s NO se encola: liquidar dos veces duplica recibos",
    async (estado) => {
      obtenerPeriodoMock.mockResolvedValue(periodoFixture({ estado }));
      await expect(encolarLiquidacion(1, 55)).rejects.toThrow(`El periodo está en estado "${estado}"`);
      expect(bossSendMock).not.toHaveBeenCalled();
      expect(txMock.periodoNomina.update).not.toHaveBeenCalled();
    }
  );

  it("desde borrador encola y transiciona a liquidando con jobId y progreso 0", async () => {
    const { jobId } = await encolarLiquidacion(1, 55, "user-1");
    expect(jobId).toBe("job-abc");
    expect(bossSendMock).toHaveBeenCalledWith("liquidar-nomina", {
      empresaId: 1,
      periodoId: 55,
      usuarioId: "user-1",
    });
    const args = txMock.periodoNomina.update.mock.calls[0][0];
    expect(args.data.estado).toBe("liquidando");
    expect(args.data.jobId).toBe("job-abc");
    expect(args.data.progreso).toBe(0);
    // Limpia los errores de la corrida anterior — un error viejo pintado
    // sobre una liquidación nueva confunde el polling de la UI.
    expect(args.data.erroresLiquidacion).toBe(Prisma.DbNull);
  });

  it("si encolar falla, el periodo se queda en borrador (el estado se toca DESPUÉS del send)", async () => {
    // Orden deliberado del servicio: al revés quedaría un periodo `liquidando`
    // huérfano, sin job que lo avance ni forma de revertirlo desde la UI.
    bossSendMock.mockRejectedValue(new Error("pg-boss caído"));
    await expect(encolarLiquidacion(1, 55)).rejects.toThrow("pg-boss caído");
    expect(txMock.periodoNomina.update).not.toHaveBeenCalled();
  });

  it("si pg-boss devuelve jobId null, lanza y NO transiciona", async () => {
    // send() puede devolver null (p. ej. throttling con singletonKey): un
    // periodo `liquidando` sin jobId sería imposible de monitorear.
    bossSendMock.mockResolvedValue(null);
    await expect(encolarLiquidacion(1, 55)).rejects.toThrow("pg-boss no aceptó el job");
    expect(txMock.periodoNomina.update).not.toHaveBeenCalled();
  });
});

describe("revertirABorrador — qué se puede deshacer", () => {
  it.each(["liquidado", "liquidado_con_rechazos", "fallido"])(
    "desde %s revierte: borra recibos y resetea el periodo",
    async (estado) => {
      obtenerPeriodoMock.mockResolvedValue(periodoFixture({ estado, version: 7 }));
      await revertirABorrador(1, 55, "user-1");
      expect(txMock.reciboPago.deleteMany).toHaveBeenCalledWith({ where: { periodoId: 55 } });
      const args = txMock.periodoNomina.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: 55, version: 7 });
      expect(args.data).toMatchObject({ estado: "borrador", jobId: null, progreso: 0 });
    }
  );

  it.each(["borrador", "liquidando", "pagado"])(
    "desde %s NO revierte ni borra un solo recibo",
    async (estado) => {
      // `pagado` es el caso de plata: revertirlo borraría los recibos de un
      // pago YA ejecutado — el dinero salió y el soporte desaparecería.
      // `liquidando` tiene un job en vuelo que escribiría sobre el borrador.
      obtenerPeriodoMock.mockResolvedValue(periodoFixture({ estado }));
      await expect(revertirABorrador(1, 55)).rejects.toThrow(
        `El periodo está en estado "${estado}" y no puede revertirse a borrador`
      );
      expect(txMock.reciboPago.deleteMany).not.toHaveBeenCalled();
      expect(txMock.periodoNomina.update).not.toHaveBeenCalled();
    }
  );

  it("si otro analista movió el periodo (P2025), el conflicto sube como ErrorConflicto", async () => {
    obtenerPeriodoMock.mockResolvedValue(periodoFixture({ estado: "liquidado" }));
    txMock.periodoNomina.update.mockRejectedValue(errorP2025());
    await expect(revertirABorrador(1, 55)).rejects.toThrow(ErrorConflicto);
  });
});

describe("obtenerEstadoLiquidacion / listarRecibos — alcance por empresa", () => {
  it("el polling filtra por { id, empresaId }: el progreso de otra empresa no se ve", async () => {
    await obtenerEstadoLiquidacion(9, 55);
    expect(prismaMock.periodoNomina.findFirst.mock.calls[0][0].where).toEqual({
      id: 55,
      empresaId: 9,
    });
  });

  it("periodo inexistente en el polling lanza, no devuelve undefined silencioso", async () => {
    prismaMock.periodoNomina.findFirst.mockResolvedValue(null);
    await expect(obtenerEstadoLiquidacion(1, 999)).rejects.toThrow("Periodo no encontrado");
  });

  it("listarRecibos siempre ancla el where a la empresa, con o sin periodo", async () => {
    // La fuga acá no es un error: es la nómina de la empresa B en la pantalla
    // de la A — por eso el filtro de empresa va en el where SIEMPRE.
    await listarRecibos(9);
    expect(prismaMock.reciboPago.findMany.mock.calls[0][0].where).toEqual({
      periodo: { empresaId: 9 },
    });

    await listarRecibos(9, 55);
    expect(prismaMock.reciboPago.findMany.mock.calls[1][0].where).toEqual({
      periodo: { empresaId: 9 },
      periodoId: 55,
    });
  });
});
