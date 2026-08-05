// Tests de `colaboradorService.ts` — el portal del colaborador. Mundo
// multi-tenant puro: cada función recibe la identidad YA autenticada
// (empleadoId/usuarioId del token) y su modo de falla es dejar que una cuenta
// alcance recibos o invitaciones de otra. Donde hay scoping, se afirma el
// `where` capturando los argumentos del mock — la lección de `git show
// 0750834`: el scoping vive EN EL WHERE, no en un if después, y la prueba que
// no mira el where no lo protege.
//
// HALLAZGO VIGENTE (caracterizado abajo, no corregido acá): aceptar y
// rechazar invitación ESCRIBEN en `Empleado` —tabla auditada por el trigger
// inmutable— sin pasar por `conAuditoria` (lib/auditoria.ts). El trigger
// registra el cambio, pero con usuarioId = NULL: la auditoría pierde al actor
// exacto de un cambio de membresía. Todos los demás writes a Empleado
// (empleadosService) sí van por conAuditoria.
//
// Hermético: el corte va en `lib/prisma.js`, como en batchPublicoService.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    empleado: { update: vi.fn() },
    usuario: { update: vi.fn() },
  };
  return {
    txMock,
    prismaMock: {
      reciboPago: { findMany: vi.fn(), findFirst: vi.fn() },
      reporteDiscrepancia: { create: vi.fn() },
      empleado: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      usuario: { update: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import {
  aceptarInvitacion,
  listarInvitaciones,
  listarMisEmpresas,
  listarRecibosPropios,
  rechazarInvitacion,
  reportarDiscrepancia,
} from "../colaboradorService.js";
import { ErrorConflicto } from "../empleadosService.js";

const EMPLEADO_ID = 500;
const EMPRESA_B = 2;
const UID_COLAB = "11111111-1111-4111-8111-111111111111";

function empleadoFixture(over: Record<string, unknown> = {}) {
  return {
    id: EMPLEADO_ID,
    empresaId: EMPRESA_B,
    usuarioId: UID_COLAB,
    invitacionAceptadaEn: null,
    activo: true,
    fechaIngreso: new Date("2026-01-15"),
    fechaRetiro: null,
    empresa: { nombre: "Frutera del Valle", sector: "agro" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.reciboPago.findMany.mockResolvedValue([]);
  prismaMock.reciboPago.findFirst.mockResolvedValue(null);
  prismaMock.reporteDiscrepancia.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 1, ...data }));
  prismaMock.empleado.findMany.mockResolvedValue([]);
  prismaMock.empleado.findFirst.mockResolvedValue(null);
  prismaMock.empleado.update.mockImplementation(async ({ data }: { data: object }) => ({ id: EMPLEADO_ID, ...data }));
  prismaMock.usuario.update.mockResolvedValue({});
  // $transaction ejecuta el callback con el cliente transaccional falso — así
  // se puede afirmar qué se escribió DENTRO de la transacción.
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));
  txMock.empleado.update.mockImplementation(async ({ data }: { data: object }) => ({ id: EMPLEADO_ID, ...data }));
  txMock.usuario.update.mockResolvedValue({});
});

// --- listarRecibosPropios --------------------------------------------------

describe("listarRecibosPropios", () => {
  it("filtra por empleadoId EN EL WHERE — la defensa en código además de RLS", async () => {
    await listarRecibosPropios(EMPLEADO_ID);
    const args = prismaMock.reciboPago.findMany.mock.calls[0]![0];
    expect(args.where).toEqual({ empleadoId: EMPLEADO_ID });
    // Más reciente primero: el colaborador entra a ver SU último recibo.
    expect(args.orderBy).toEqual({ liquidadoEn: "desc" });
  });
});

// --- reportarDiscrepancia --------------------------------------------------

describe("reportarDiscrepancia", () => {
  const datos = { tipo: "pago_de_menos" as const, detalle: "Faltó el recargo dominical" };

  it("un recibo ajeno es indistinguible de uno inexistente: el scoping va en el where", async () => {
    // La forma de 0750834: `findFirst({ id, empleadoId })`, no un findUnique
    // con if después. Con el recibo de OTRO empleado la consulta da null, el
    // reporte no se crea y la respuesta no filtra que el id era real.
    prismaMock.reciboPago.findFirst.mockResolvedValue(null);
    await expect(reportarDiscrepancia(EMPLEADO_ID, UID_COLAB, 999, datos)).rejects.toThrow("Recibo no encontrado");
    expect(prismaMock.reciboPago.findFirst).toHaveBeenCalledWith({
      where: { id: 999, empleadoId: EMPLEADO_ID },
    });
    expect(prismaMock.reporteDiscrepancia.create).not.toHaveBeenCalled();
  });

  it("el colaborador del reporte es el AUTENTICADO: ni colaboradorId ni estado se toman del payload", async () => {
    // `datos` viene validado por crearReporteSchema (solo tipo+detalle), pero
    // si el schema pasara a .passthrough() un body con colaboradorId ajeno o
    // estado:"resuelto" no puede colarse: el servicio arma el data campo por
    // campo. Un reporte que nace "resuelto" jamás llegaría a la empresa.
    prismaMock.reciboPago.findFirst.mockResolvedValue({ id: 42, empleadoId: EMPLEADO_ID });
    const sucio = { ...datos, colaboradorId: "uid-ajeno", estado: "resuelto" };
    await reportarDiscrepancia(EMPLEADO_ID, UID_COLAB, 42, sucio as unknown as typeof datos);
    expect(prismaMock.reporteDiscrepancia.create).toHaveBeenCalledWith({
      data: { reciboId: 42, colaboradorId: UID_COLAB, tipo: "pago_de_menos", detalle: "Faltó el recargo dominical" },
    });
  });
});

// --- listarInvitaciones ----------------------------------------------------

describe("listarInvitaciones", () => {
  it("solo las pendientes y activas de ESA cuenta: usuarioId + sin aceptar + activo", async () => {
    // Las tres condiciones son el significado de "invitación pendiente". Si
    // cayera `invitacionAceptadaEn: null` la campana notificaría membresías ya
    // aceptadas; si cayera `activo` aparecerían registros retirados como
    // invitación fantasma; sin `usuarioId` serían las invitaciones de todos.
    await listarInvitaciones(UID_COLAB);
    const args = prismaMock.empleado.findMany.mock.calls[0]![0];
    expect(args.where).toEqual({ usuarioId: UID_COLAB, invitacionAceptadaEn: null, activo: true });
  });
});

// --- aceptarInvitacion -----------------------------------------------------

describe("aceptarInvitacion", () => {
  it("la invitación de OTRA cuenta (o ya aceptada, o inactiva) no existe: sin escrituras", async () => {
    prismaMock.empleado.findFirst.mockResolvedValue(null);
    await expect(aceptarInvitacion(UID_COLAB, EMPLEADO_ID)).rejects.toThrow("Invitación no encontrada");
    // El scoping completo va en el primer where — id solo no alcanza.
    expect(prismaMock.empleado.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: EMPLEADO_ID, usuarioId: UID_COLAB, invitacionAceptadaEn: null, activo: true },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("con otra empresa activa: 409 y NADA se escribe (backstop de 'una empresa a la vez')", async () => {
    prismaMock.empleado.findFirst
      .mockResolvedValueOnce(empleadoFixture())
      .mockResolvedValueOnce({ id: 900, empresaId: 3 }); // membresía activa en otra empresa
    await expect(aceptarInvitacion(UID_COLAB, EMPLEADO_ID)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.empleado.update).not.toHaveBeenCalled();
    expect(txMock.usuario.update).not.toHaveBeenCalled();
  });

  it("la consulta de membresía activa exige cuenta + activo + invitación aceptada", async () => {
    // Si se cayera `invitacionAceptadaEn: { not: null }`, la PROPIA invitación
    // pendiente contaría como membresía y nadie podría aceptar nunca; si se
    // cayera `activo`, un retiro viejo bloquearía unirse a la nueva empresa.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture()).mockResolvedValueOnce(null);
    await aceptarInvitacion(UID_COLAB, EMPLEADO_ID);
    expect(prismaMock.empleado.findFirst).toHaveBeenNthCalledWith(2, {
      where: { usuarioId: UID_COLAB, activo: true, invitacionAceptadaEn: { not: null } },
    });
  });

  it("acepta: marca la invitación y mueve la cuenta a la empresa DEL EMPLEADO VALIDADO, en la misma transacción", async () => {
    // El empresaId que se escribe en Usuario sale del registro que pasó el
    // where scoped — no de un parámetro del caller. Y las dos escrituras van
    // juntas: una cuenta con empresaId de una empresa donde su Empleado sigue
    // "pendiente" sería el estado intermedio que la transacción prohíbe.
    prismaMock.empleado.findFirst
      .mockResolvedValueOnce(empleadoFixture({ empresaId: EMPRESA_B }))
      .mockResolvedValueOnce(null);
    await aceptarInvitacion(UID_COLAB, EMPLEADO_ID);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.empleado.update).toHaveBeenCalledWith({
      where: { id: EMPLEADO_ID },
      data: { invitacionAceptadaEn: expect.any(Date) },
    });
    expect(txMock.usuario.update).toHaveBeenCalledWith({
      where: { id: UID_COLAB },
      data: { empresaId: EMPRESA_B },
    });
  });

  it("HALLAZGO VIGENTE: la aceptación escribe en Empleado SIN conAuditoria — el trigger registra el cambio sin actor", async () => {
    // `Empleado` es tabla auditada (trigger auditoria_Empleado). El actor solo
    // llega a la auditoría si el write corre dentro de `conAuditoria(usuarioId,
    // ...)`, que setea `app.usuario_actual` en la transacción. Acá se usa
    // `prisma.$transaction` pelado, así que la fila de auditoría de este
    // cambio de membresía queda con usuarioId = NULL: quién aceptó no se
    // puede reconstruir desde la auditoría inmutable. Esta prueba CARACTERIZA
    // el comportamiento de hoy; cuando se arregle (envolver en conAuditoria),
    // debe fallar y reescribirse.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture()).mockResolvedValueOnce(null);
    await aceptarInvitacion(UID_COLAB, EMPLEADO_ID);
    // La transacción se abre directo sobre prisma, sin set_config del actor.
    expect(prismaMock.$transaction.mock.calls[0]![0]).toBeInstanceOf(Function);
    expect((txMock as unknown as Record<string, unknown>).$executeRaw).toBeUndefined();
  });
});

// --- rechazarInvitacion ----------------------------------------------------

describe("rechazarInvitacion", () => {
  it("no se puede rechazar la invitación de otro: where scoped y sin update", async () => {
    prismaMock.empleado.findFirst.mockResolvedValue(null);
    await expect(rechazarInvitacion(UID_COLAB, EMPLEADO_ID)).rejects.toThrow("Invitación no encontrada");
    expect(prismaMock.empleado.findFirst).toHaveBeenCalledWith({
      where: { id: EMPLEADO_ID, usuarioId: UID_COLAB, invitacionAceptadaEn: null, activo: true },
    });
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("rechazar DESLIGA (usuarioId null), no borra ni desactiva el Empleado", async () => {
    // El registro laboral es de la empresa: rechazar la invitación devuelve el
    // Empleado al estado "sin cuenta" para que puedan reinvitar a otra
    // persona. Si además lo desactivara, el rechazo de un tercero borraría
    // nómina activa.
    prismaMock.empleado.findFirst.mockResolvedValue(empleadoFixture());
    await rechazarInvitacion(UID_COLAB, EMPLEADO_ID);
    expect(prismaMock.empleado.update).toHaveBeenCalledWith({
      where: { id: EMPLEADO_ID },
      data: { usuarioId: null },
    });
  });
});

// --- listarMisEmpresas -----------------------------------------------------

describe("listarMisEmpresas", () => {
  it("lista SOLO los Empleado de esa cuenta y deriva el estado: retirada gana sobre aceptada", async () => {
    // "retirada" tiene que ganar aunque la invitación haya estado aceptada —
    // si el orden de los ternarios se invirtiera, un retiro seguiría
    // mostrándose como "activa" y el colaborador creería que aún pertenece.
    prismaMock.empleado.findMany.mockResolvedValue([
      empleadoFixture({ id: 1, activo: false, invitacionAceptadaEn: new Date("2025-01-01"), fechaRetiro: new Date("2026-01-01") }),
      empleadoFixture({ id: 2, activo: true, invitacionAceptadaEn: new Date("2026-02-01") }),
      empleadoFixture({ id: 3, activo: true, invitacionAceptadaEn: null }),
    ]);
    const r = await listarMisEmpresas(UID_COLAB);
    expect(prismaMock.empleado.findMany.mock.calls[0]![0].where).toEqual({ usuarioId: UID_COLAB });
    expect(r.map((e) => e.estado)).toEqual(["retirada", "activa", "pendiente"]);
    // La forma para la UI conserva empresa y fechas del registro.
    expect(r[0]).toMatchObject({
      empleadoId: 1,
      empresa: "Frutera del Valle",
      sector: "agro",
      fechaRetiro: new Date("2026-01-01"),
    });
  });
});
