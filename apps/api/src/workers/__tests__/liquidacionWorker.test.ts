// Tests del worker de liquidación, del lado de la EVIDENCIA.
//
// El worker ya calculaba nómina antes de esta suite, y el motor tiene sus
// pruebas en `packages/reglas`. Lo que cambió el 2026-08-16 es que este archivo
// pasó a ser **el único lugar donde nace una evidencia facturable**: cada cierre
// terminal escribe la fila que después se le cobra a la empresa.
//
// Eso mueve el riesgo. Antes, un error acá producía una liquidación mal
// calculada —caro, pero visible—. Ahora puede producir dos cosas peores porque
// son silenciosas:
//
//   - **cobrar de más**: contar recibos de otra empresa, o registrar evidencia
//     de un periodo que fallo
//   - **no poder cobrar**: un camino de cierre que no deja evidencia, y nadie
//     se entera hasta que la cuenta llega en cero
//
// Y una tercera, que sería la peor de todas: **que el medidor de facturación
// tumbe una nómina ya calculada.**
//
// Nada de acá toca BD ni pg-boss: se cortan `lib/prisma.js`, `lib/auditoria.js`
// y los servicios, igual que en `liquidacionService.test.ts`.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, registrarEvidenciaMock, registroErrorMock } = vi.hoisted(() => {
  const txMock = {
    periodoNomina: { update: vi.fn() },
    reciboPago: { createMany: vi.fn() },
  };
  return {
    txMock,
    prismaMock: {
      periodoNomina: { findFirst: vi.fn(), update: vi.fn() },
      empleado: { findMany: vi.fn() },
      contratista: { findMany: vi.fn() },
      turno: { findMany: vi.fn() },
      reciboPago: { findMany: vi.fn(), count: vi.fn() },
    },
    registrarEvidenciaMock: vi.fn(),
    registroErrorMock: vi.fn(),
  };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../../lib/auditoria.js", () => ({
  conAuditoria: (_u: string | null, fn: (tx: unknown) => Promise<unknown>) => fn(txMock),
}));
vi.mock("../../lib/boss.js", () => ({ COLA_LIQUIDACION: "liquidar-nomina" }));
vi.mock("../../services/nominaService.js", () => ({
  obtenerReglasYFestivos: async () => ({ reglas: [], festivos: [] }),
}));
vi.mock("../../services/evidenciaCierreService.js", () => ({
  registrarEvidenciaCierre: (...a: unknown[]) => registrarEvidenciaMock(...a),
}));
vi.mock("../../lib/registro.js", () => ({
  registro: { error: (...a: unknown[]) => registroErrorMock(...a), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@pv/reglas", () => ({ crearResolutorReglas: () => ({}) }));
vi.mock("../../services/liquidacionCalculo.js", () => ({
  calcularReciboLote: (_p: number, _f: unknown, lote: { id: number }[]) => ({
    recibos: lote.map((e) => ({ empleadoId: e.id })),
    rechazos: [],
  }),
  calcularRecibosContratistas: () => [],
}));

import { ejecutarJobLiquidacion } from "../liquidacionWorker.js";

const PERIODO = {
  id: 7,
  empresaId: 3,
  fechaInicio: "2026-08-01",
  fechaFin: "2026-08-15",
  estado: "liquidando",
  version: 1,
  erroresLiquidacion: null,
};

/** Deja el mock listo para un periodo con `n` empleados pendientes. */
function escenario(n: number, periodo: Partial<typeof PERIODO> = {}) {
  prismaMock.periodoNomina.findFirst.mockResolvedValue({ ...PERIODO, ...periodo });
  prismaMock.empleado.findMany.mockResolvedValue(
    Array.from({ length: n }, (_, i) => ({ id: i + 1, nombre: `E${i + 1}` })),
  );
  prismaMock.contratista.findMany.mockResolvedValue([]);
  prismaMock.turno.findMany.mockResolvedValue([]);
  prismaMock.reciboPago.findMany.mockResolvedValue([]);
  prismaMock.reciboPago.count.mockResolvedValue(n);
}

beforeEach(() => vi.clearAllMocks());

describe("cada cierre deja su evidencia", () => {
  it("un cierre limpio registra evidencia con lo que de verdad se liquidó", async () => {
    escenario(12);
    await ejecutarJobLiquidacion({ empresaId: 3, periodoId: 7, usuarioId: "u1" });

    expect(registrarEvidenciaMock).toHaveBeenCalledTimes(1);
    expect(registrarEvidenciaMock.mock.calls[0][1]).toMatchObject({
      empresaId: 3,
      periodoId: 7,
      estadoCierre: "liquidado",
      conEvidencia: 12,
      fechaInicio: "2026-08-01",
      fechaFin: "2026-08-15",
    });
  });

  it("el conteo de recibos va ANCLADO a la empresa", async () => {
    // Sin el ancla, `count({ where: { periodoId } })` contaría los recibos de
    // cualquier empresa que compartiera id de periodo: una fuga entre inquilinos
    // que además INFLA la factura, y que ninguna prueba de nómina vería.
    escenario(4);
    await ejecutarJobLiquidacion({ empresaId: 3, periodoId: 7, usuarioId: null });

    expect(prismaMock.reciboPago.count).toHaveBeenCalledWith({
      where: { periodoId: 7, periodo: { empresaId: 3 } },
    });
  });

  it("el camino de REINTENTO —todo ya liquidado— también deja evidencia", async () => {
    // Pasa cuando un intento anterior alcanzó a crear los recibos y murió antes
    // de marcar terminal. Sin esto, ese cierre queda sin nada que facturar y la
    // empresa usa el producto gratis sin que nadie lo note.
    escenario(0);
    prismaMock.empleado.findMany.mockResolvedValue([]);
    await ejecutarJobLiquidacion({ empresaId: 3, periodoId: 7, usuarioId: null });

    expect(registrarEvidenciaMock).toHaveBeenCalledTimes(1);
    expect(registrarEvidenciaMock.mock.calls[0][1]).toMatchObject({
      periodoId: 7,
      estadoCierre: "liquidado",
    });
  });

  it("un periodo que no está `liquidando` no se reprocesa ni deja evidencia", async () => {
    escenario(5, { estado: "borrador" });
    await ejecutarJobLiquidacion({ empresaId: 3, periodoId: 7, usuarioId: null });
    expect(registrarEvidenciaMock).not.toHaveBeenCalled();
  });
});

describe("la evidencia NUNCA tumba el cierre", () => {
  it("si la evidencia falla, el periodo igual queda liquidado", async () => {
    // La regla que hace aceptable todo lo demás: un medidor de facturación con
    // un mal día no puede tirar abajo una nómina ya calculada. Lo que se pierde
    // es la evidencia — o sea algo que NO se le va a cobrar a nadie.
    escenario(9);
    registrarEvidenciaMock.mockRejectedValue(new Error("la llave de firma no está"));

    await expect(
      ejecutarJobLiquidacion({ empresaId: 3, periodoId: 7, usuarioId: null }),
    ).resolves.toBeUndefined();

    // El periodo se marcó terminal igual.
    const terminales = txMock.periodoNomina.update.mock.calls.filter(
      (c) => c[0]?.data?.estado === "liquidado",
    );
    expect(terminales.length).toBeGreaterThan(0);
  });

  it("y el fallo queda registrado, no se traga en silencio", async () => {
    escenario(9);
    registrarEvidenciaMock.mockRejectedValue(new Error("boom"));
    await ejecutarJobLiquidacion({ empresaId: 3, periodoId: 7, usuarioId: null });

    expect(registroErrorMock).toHaveBeenCalledTimes(1);
    const [origen, mensaje, , extra] = registroErrorMock.mock.calls[0];
    expect(origen).toBe("liquidacionWorker");
    expect(mensaje).toContain("SIN evidencia firmada");
    // Con el periodo y la empresa, para poder ir a buscarlo.
    expect(extra).toMatchObject({ periodoId: 7, empresaId: 3 });
  });
});

describe("un periodo que falla no se factura", () => {
  it("una excepción de cálculo deja `fallido` y NO registra evidencia", async () => {
    escenario(6);
    // El fallo ocurre al persistir el lote, o sea después de haber empezado.
    txMock.reciboPago.createMany.mockRejectedValueOnce(new Error("base caída"));

    await expect(
      ejecutarJobLiquidacion({ empresaId: 3, periodoId: 7, usuarioId: null }),
    ).rejects.toThrow("base caída");

    expect(registrarEvidenciaMock).not.toHaveBeenCalled();
    const fallidos = txMock.periodoNomina.update.mock.calls.filter(
      (c) => c[0]?.data?.estado === "fallido",
    );
    expect(fallidos).toHaveLength(1);
  });
});
