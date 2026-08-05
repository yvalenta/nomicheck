// Tests de `discrepanciasService.ts` — el lado EMPRESA de los reportes de
// discrepancia (Fase 7). Multi-tenant por cadena: un reporte pertenece a la
// empresa vía recibo→periodo→empresaId, y esa cadena tiene que estar EN EL
// WHERE de cada consulta (la forma de `git show 0750834`) — no en un if
// después, que deja ventana y depende de que cada llamador se acuerde.
//
// Estados (schema.prisma): nace "abierto" (default de la columna); la empresa
// responde moviéndolo a "en_revision" o "resuelto" (responderReporteSchema).
// La única transición prohibida —volver a "abierto"— la prohíbe el schema de
// entrada, no este servicio: acá NO hay máquina de estados (caracterizado
// abajo).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    reporteDiscrepancia: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import { listarDiscrepancias, responderDiscrepancia } from "../discrepanciasService.js";

const EMPRESA_A = 1;

function reporteFixture(over: Record<string, unknown> = {}) {
  return {
    id: 10,
    reciboId: 42,
    colaboradorId: "11111111-1111-4111-8111-111111111111",
    tipo: "pago_de_menos",
    detalle: "Faltó el recargo dominical del 6 de julio",
    estado: "abierto",
    respuestaEmpresa: null,
    creadoEn: new Date("2026-08-01"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.reporteDiscrepancia.findMany.mockResolvedValue([]);
  prismaMock.reporteDiscrepancia.findFirst.mockResolvedValue(null);
  prismaMock.reporteDiscrepancia.update.mockImplementation(async ({ data }: { data: object }) => ({
    ...reporteFixture(),
    ...data,
  }));
});

// --- listarDiscrepancias ---------------------------------------------------

describe("listarDiscrepancias", () => {
  it("scoping por empresa vía recibo→periodo EN EL WHERE, más reciente primero", async () => {
    await listarDiscrepancias(EMPRESA_A);
    const args = prismaMock.reporteDiscrepancia.findMany.mock.calls[0]![0];
    // La cadena completa: sin cualquiera de los tres niveles, el listado
    // mezcla reportes de todas las empresas.
    expect(args.where).toEqual({ recibo: { periodo: { empresaId: EMPRESA_A } } });
    expect(args.orderBy).toEqual({ creadoEn: "desc" });
  });
});

// --- responderDiscrepancia -------------------------------------------------

describe("responderDiscrepancia", () => {
  const respuesta = { estado: "en_revision" as const, respuestaEmpresa: "Estamos revisando el turno del 6 de julio" };

  it("un reporte de OTRA empresa es indistinguible de uno inexistente: sin update y sin filtrar que el id era real", async () => {
    prismaMock.reporteDiscrepancia.findFirst.mockResolvedValue(null);
    await expect(responderDiscrepancia(EMPRESA_A, 10, respuesta)).rejects.toThrow("Reporte no encontrado");
    // El scoping va en el where — id + cadena de empresa, nada menos.
    expect(prismaMock.reporteDiscrepancia.findFirst).toHaveBeenCalledWith({
      where: { id: 10, recibo: { periodo: { empresaId: EMPRESA_A } } },
    });
    expect(prismaMock.reporteDiscrepancia.update).not.toHaveBeenCalled();
  });

  it("responder escribe SOLO estado y respuestaEmpresa: el reporte del colaborador no se reescribe", async () => {
    // El detalle y el tipo son la voz del colaborador en un flujo de reclamo;
    // si la empresa pudiera editarlos al responder, la discrepancia "se
    // arregla" reescribiendo el reclamo. El data se arma campo por campo, y
    // un payload gordo no puede colar nada.
    prismaMock.reporteDiscrepancia.findFirst.mockResolvedValue(reporteFixture());
    const sucio = { ...respuesta, detalle: "reescrito por la empresa", tipo: "pago_de_mas", colaboradorId: "otro" };
    await responderDiscrepancia(EMPRESA_A, 10, sucio as unknown as typeof respuesta);
    expect(prismaMock.reporteDiscrepancia.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { estado: "en_revision", respuestaEmpresa: "Estamos revisando el turno del 6 de julio" },
    });
  });

  it("abierto → resuelto directo es válido: no hay paso obligado por en_revision", async () => {
    prismaMock.reporteDiscrepancia.findFirst.mockResolvedValue(reporteFixture({ estado: "abierto" }));
    const r = await responderDiscrepancia(EMPRESA_A, 10, { estado: "resuelto", respuestaEmpresa: "Se pagó el ajuste" });
    expect(r.estado).toBe("resuelto");
  });

  it("CARACTERIZACIÓN: sin máquina de estados — un reporte 'resuelto' puede volver a 'en_revision' (reabrir)", async () => {
    // Hoy el servicio acepta cualquiera de los dos estados del schema sin
    // mirar el actual. Reabrir un resuelto es defendible (apareció evidencia
    // nueva); lo que NO puede pasar —volver a "abierto" y borrar la
    // respuesta— lo impide responderReporteSchema, no este código. Si algún
    // día se agrega una máquina de estados, esta prueba debe fallar primero.
    prismaMock.reporteDiscrepancia.findFirst.mockResolvedValue(reporteFixture({ estado: "resuelto", respuestaEmpresa: "listo" }));
    await responderDiscrepancia(EMPRESA_A, 10, { estado: "en_revision", respuestaEmpresa: "reabierto: llegó evidencia nueva" });
    expect(prismaMock.reporteDiscrepancia.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "en_revision" }) })
    );
  });
});
