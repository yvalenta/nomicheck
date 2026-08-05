// Tests de `liquidacionesService.ts` — el historial personal de liquidaciones
// (flujo delayed auth). El servicio es casi un passthrough de Prisma, pero las
// tres decisiones que SÍ toma son de dinero: qué campo se denormaliza como
// `netoEsperado` (viene del snapshot, no del usuario), qué pasa cuando
// `netoRecibido` no vino (null, no 0 — un 0 diría "me pagaron cero pesos"), y
// que el historial listado sea SOLO el del dueño. Un fallo acá no revienta:
// guarda un número plausible en la fila equivocada o de la fuente equivocada.
//
// Ninguna prueba toca la base: el corte va en `lib/prisma.js`, igual que en
// authService.test.ts, para que la suite pase con `env -u DATABASE_URL`.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    liquidacion: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import { guardarLiquidacion, listarLiquidaciones } from "../liquidacionesService.js";

// Snapshot mínimo válido según guardarLiquidacionSchema. `passthrough` permite
// campos extra — el servicio debe persistirlo COMPLETO, no solo lo denormalizado.
function resultadoBase(over: Record<string, unknown> = {}) {
  return {
    netoEsperado: 2_089_095,
    periodoDesde: "2026-07-01",
    periodoHasta: "2026-07-30",
    lineas: [{ concepto: "Salario", valorCalculado: 2_000_000 }],
    ...over,
  };
}

beforeEach(() => {
  prismaMock.liquidacion.create.mockReset().mockResolvedValue({ id: 1, creadoEn: new Date() });
  prismaMock.liquidacion.findMany.mockReset().mockResolvedValue([]);
});

describe("guardarLiquidacion — denormalización del snapshot", () => {
  it("el netoEsperado sale del snapshot del motor, nunca del netoRecibido que declara el usuario", async () => {
    // Si estos dos se cruzaran, el historial mostraría como "esperado" lo que
    // el usuario DICE que le pagaron — exactamente el dato que se quiere auditar.
    await guardarLiquidacion("user-1", {
      resultado: resultadoBase({ netoEsperado: 2_089_095 }),
      netoRecibido: 1_500_000,
    });
    const data = prismaMock.liquidacion.create.mock.calls[0][0].data;
    expect(data.netoEsperado).toBe(2_089_095);
    expect(data.netoRecibido).toBe(1_500_000);
  });

  it("netoRecibido ausente se guarda como null, no como 0 ni undefined", async () => {
    // null = "no declaró cuánto recibió". 0 = "declaró que recibió cero pesos".
    // Confundirlos convierte una omisión en una discrepancia del 100%.
    await guardarLiquidacion("user-1", { resultado: resultadoBase() });
    const data = prismaMock.liquidacion.create.mock.calls[0][0].data;
    expect(data.netoRecibido).toBeNull();
  });

  it("un netoRecibido de 0 declarado se conserva como 0 (?? no lo pisa)", async () => {
    // `??` solo coalesce null/undefined — si alguien lo cambiara por `||`,
    // el cero legítimo ("no me pagaron nada") desaparecería del historial.
    await guardarLiquidacion("user-1", { resultado: resultadoBase(), netoRecibido: 0 });
    const data = prismaMock.liquidacion.create.mock.calls[0][0].data;
    expect(data.netoRecibido).toBe(0);
  });

  it("un netoEsperado de 0 en el snapshot se denormaliza como 0", async () => {
    // Periodo sin devengos (licencia no remunerada completa) es un caso real.
    await guardarLiquidacion("user-1", { resultado: resultadoBase({ netoEsperado: 0 }) });
    const data = prismaMock.liquidacion.create.mock.calls[0][0].data;
    expect(data.netoEsperado).toBe(0);
  });

  it("fechas de periodo ausentes quedan null — no strings vacíos ni undefined", async () => {
    const resultado = resultadoBase();
    delete (resultado as Record<string, unknown>).periodoDesde;
    delete (resultado as Record<string, unknown>).periodoHasta;
    await guardarLiquidacion("user-1", { resultado });
    const data = prismaMock.liquidacion.create.mock.calls[0][0].data;
    expect(data.periodoDesde).toBeNull();
    expect(data.periodoHasta).toBeNull();
  });

  it("la liquidación queda atada al usuario que la guardó y persiste el snapshot completo", async () => {
    const resultado = resultadoBase();
    await guardarLiquidacion("user-abc", { resultado });
    const data = prismaMock.liquidacion.create.mock.calls[0][0].data;
    expect(data.usuarioId).toBe("user-abc");
    // El snapshot va entero (JSONB) — el historial nunca recalcula.
    expect(data.resultado).toEqual(resultado);
  });
});

describe("listarLiquidaciones — aislamiento por dueño", () => {
  it("filtra por usuarioId: el historial de A jamás incluye filas de B", async () => {
    await listarLiquidaciones("user-a");
    const args = prismaMock.liquidacion.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ usuarioId: "user-a" });
  });

  it("ordena por creadoEn descendente — lo más reciente primero", async () => {
    await listarLiquidaciones("user-a");
    const args = prismaMock.liquidacion.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ creadoEn: "desc" });
  });
});
