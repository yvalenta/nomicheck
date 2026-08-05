// Tests de `periodosService.ts` — periodos de nómina multi-tenant, con dos
// mecanismos que fallan en silencio si nadie los mira:
//
//   1. El scoping por empresa: `obtenerPeriodo` es LA puerta de todas las
//      ediciones. Si su where pierde el empresaId, la empresa A edita
//      periodos de la B (la forma exacta del bug 0750834 en empleados).
//   2. La concurrencia optimista: `editarPeriodo` escribe con
//      where {id, version} y traduce P2025 a ErrorConflicto. Sin el version
//      en el where, dos ediciones concurrentes se pisan sin que nadie lo
//      note — nunca hay excepción, solo datos perdidos.
//
// Mismo patrón hermético que empleadosService.test.ts: el corte va en
// `lib/prisma.js` y el mock es una mini-base con filas de DOS empresas que
// evalúa el where de verdad. Un where sin tenant ENCUENTRA la fila ajena y
// pone la prueba en rojo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    periodoNomina: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    periodoNominaEmpleado: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    empleado: { findMany: vi.fn(), count: vi.fn() },
    turno: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import {
  crearPeriodo,
  editarEmpleadosPeriodo,
  editarPeriodo,
  listarEmpleadosIncluidos,
  listarPeriodos,
  listarTurnos,
  obtenerPeriodo,
  reemplazarTurnos,
} from "../periodosService.js";
import { ErrorConflicto } from "../empleadosService.js";
import { ESTADOS_PERIODO } from "../../lib/estados.js";

// --- mini-base multi-tenant ------------------------------------------------

const EMPRESA_A = 1;
const EMPRESA_B = 2;

interface FilaPeriodo {
  id: number;
  empresaId: number;
  estado: string;
  version: number;
  fechaInicio: string;
  fechaFin: string;
  [k: string]: unknown;
}

/** El periodo 81 (empresa B) existe para una sola cosa: si alguna query de
 * este servicio lo alcanza operando como empresa A, hay bug. */
function semillaPeriodos(): FilaPeriodo[] {
  return [
    { id: 71, empresaId: EMPRESA_A, estado: "borrador", version: 4, fechaInicio: "2026-07-01", fechaFin: "2026-07-15" },
    { id: 72, empresaId: EMPRESA_A, estado: "liquidado", version: 9, fechaInicio: "2026-06-16", fechaFin: "2026-06-30" },
    { id: 81, empresaId: EMPRESA_B, estado: "borrador", version: 0, fechaInicio: "2026-07-01", fechaFin: "2026-07-15" },
  ];
}

interface FilaEmpleado {
  id: number;
  empresaId: number;
  activo: boolean;
  eliminadoEn: Date | null;
  [k: string]: unknown;
}

// 501/502 son de A (502 inactivo), 503 es de A pero eliminado (soft),
// 601 es de B — el id con el que se intenta el cruce de tenant.
function semillaEmpleados(): FilaEmpleado[] {
  return [
    { id: 501, empresaId: EMPRESA_A, activo: true, eliminadoEn: null },
    { id: 502, empresaId: EMPRESA_A, activo: false, eliminadoEn: null },
    { id: 503, empresaId: EMPRESA_A, activo: false, eliminadoEn: new Date("2026-06-01") },
    { id: 601, empresaId: EMPRESA_B, activo: true, eliminadoEn: null },
  ];
}

let bdPeriodos: FilaPeriodo[];
let bdEmpleados: FilaEmpleado[];

/** Operadores que este servicio usa en sus where: igualdad (incluye null),
 * {in}, {gte}, {lte}. Nada más — si el servicio empieza a usar otro, el
 * test que lo necesite lo agregará. */
function cumpleWhere(fila: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [campo, cond] of Object.entries(where)) {
    const valor = fila[campo] as never;
    if (cond !== null && typeof cond === "object") {
      const c = cond as { in?: unknown[]; gte?: never; lte?: never };
      if (c.in !== undefined && !c.in.includes(valor)) return false;
      if (c.gte !== undefined && valor < c.gte) return false;
      if (c.lte !== undefined && valor > c.lte) return false;
    } else if (valor !== cond) {
      return false;
    }
  }
  return true;
}

beforeEach(() => {
  vi.clearAllMocks();
  bdPeriodos = semillaPeriodos();
  bdEmpleados = semillaEmpleados();

  prismaMock.periodoNomina.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdPeriodos.find((f) => cumpleWhere(f, where)) ?? null
  );
  prismaMock.periodoNomina.findMany.mockImplementation(
    async ({ where, skip, take }: { where: Record<string, unknown>; skip?: number; take?: number }) => {
      const filas = bdPeriodos.filter((f) => cumpleWhere(f, where));
      const desde = skip ?? 0;
      return filas.slice(desde, take === undefined ? undefined : desde + take);
    }
  );
  prismaMock.periodoNomina.count.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdPeriodos.filter((f) => cumpleWhere(f, where)).length
  );
  prismaMock.periodoNomina.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 700, ...data }));
  // update fiel a Prisma: si el where (id + version, si viene) no matchea
  // NINGUNA fila, lanza P2025 — así la concurrencia optimista se prueba con
  // el mecanismo real y no con un rejectedValueOnce a dedo.
  prismaMock.periodoNomina.update.mockImplementation(
    async ({ where, data }: { where: { id: number; version?: number }; data: Record<string, unknown> }) => {
      const fila = bdPeriodos.find((f) => f.id === where.id && (where.version === undefined || f.version === where.version));
      if (!fila) {
        throw new Prisma.PrismaClientKnownRequestError("Record to update not found", { code: "P2025", clientVersion: "test" });
      }
      const { version, ...resto } = data as { version?: { increment: number } };
      Object.assign(fila, resto);
      if (version?.increment) fila.version += version.increment;
      return { ...fila };
    }
  );

  prismaMock.empleado.findMany.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) =>
      bdEmpleados.filter((f) => cumpleWhere(f, where)).map((f) => ({ id: f.id }))
  );
  prismaMock.empleado.count.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdEmpleados.filter((f) => cumpleWhere(f, where)).length
  );

  prismaMock.periodoNominaEmpleado.findMany.mockResolvedValue([{ empleadoId: 501 }]);
  prismaMock.periodoNominaEmpleado.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.periodoNominaEmpleado.createMany.mockResolvedValue({ count: 0 });
  prismaMock.turno.findMany.mockResolvedValue([]);
  prismaMock.turno.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.turno.createMany.mockResolvedValue({ count: 0 });

  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock)
  );
});

// --- listarPeriodos --------------------------------------------------------

describe("listarPeriodos", () => {
  it("solo lista periodos de la empresa — el de la empresa B no aparece", async () => {
    const res = await listarPeriodos(EMPRESA_A);
    const ids = res.items.map((p: { id: number }) => p.id);
    expect(ids).toEqual(expect.arrayContaining([71, 72]));
    expect(ids).not.toContain(81);
    expect(res.total).toBe(2);
  });

  it("sin filtros el where es EXACTAMENTE {empresaId}, en count y findMany por igual", async () => {
    await listarPeriodos(EMPRESA_A);
    expect(prismaMock.periodoNomina.count.mock.calls[0]![0].where).toEqual({ empresaId: EMPRESA_A });
    expect(prismaMock.periodoNomina.findMany.mock.calls[0]![0].where).toEqual({ empresaId: EMPRESA_A });
  });

  it("estado/desde/hasta recortan sin perder el tenant", async () => {
    const res = await listarPeriodos(EMPRESA_A, {
      estado: "borrador",
      desde: "2026-07-01",
      hasta: "2026-07-31",
      page: 1,
      limit: 25,
      skip: 0,
    });
    expect(prismaMock.periodoNomina.findMany.mock.calls[0]![0].where).toEqual({
      empresaId: EMPRESA_A,
      estado: "borrador",
      fechaInicio: { gte: "2026-07-01" },
      fechaFin: { lte: "2026-07-31" },
    });
    // Funcional sobre la mini-base: solo el 71 (borrador de julio) cabe.
    expect(res.items.map((p: { id: number }) => p.id)).toEqual([71]);
  });

  it("página fuera de rango: items vacíos con total real, no un error", async () => {
    const res = await listarPeriodos(EMPRESA_A, { page: 50, limit: 25, skip: 1225 });
    expect(res.items).toEqual([]);
    expect(res.total).toBe(2);
    expect(res.page).toBe(50);
  });
});

// --- obtenerPeriodo --------------------------------------------------------

describe("obtenerPeriodo", () => {
  it("encuentra el periodo propio con where {id, empresaId}", async () => {
    const periodo = await obtenerPeriodo(EMPRESA_A, 71);
    expect(periodo.id).toBe(71);
    expect(prismaMock.periodoNomina.findFirst.mock.calls[0]![0].where).toEqual({ id: 71, empresaId: EMPRESA_A });
  });

  it("CROSS-TENANT: el periodo de otra empresa es indistinguible de uno inexistente", async () => {
    // El 81 EXISTE (empresa B). obtenerPeriodo es la puerta de editarPeriodo,
    // editarEmpleadosPeriodo y reemplazarTurnos: si este where pierde el
    // empresaId, TODAS esas ediciones quedan cross-tenant de una vez.
    await expect(obtenerPeriodo(EMPRESA_A, 81)).rejects.toThrow("Periodo no encontrado");
  });
});

// --- crearPeriodo ----------------------------------------------------------

describe("crearPeriodo", () => {
  it("autopuebla SOLO con los empleados activos DE la empresa — ni ajenos ni inactivos", async () => {
    // Si el findMany de activos perdiera el empresaId, el 601 (empresa B)
    // entraría al periodo de A y su nómina se liquidaría (y filtraría) acá.
    // El 502 (inactivo) tampoco entra: retirado no participa de periodos
    // nuevos. El 503 (eliminado) queda fuera por activo:false — eliminar
    // siempre marca ambos campos (empleadosService.eliminarEmpleado).
    await crearPeriodo(EMPRESA_A, { fechaInicio: "2026-08-01", fechaFin: "2026-08-15" });
    expect(prismaMock.empleado.findMany.mock.calls[0]![0].where).toEqual({ empresaId: EMPRESA_A, activo: true });
    const data = prismaMock.periodoNomina.create.mock.calls[0]![0].data;
    expect(data.empleadosIncluidos.create).toEqual([{ empleadoId: 501 }]);
  });

  it("estampa el empresaId de la sesión en el periodo creado", async () => {
    await crearPeriodo(EMPRESA_A, { fechaInicio: "2026-08-01", fechaFin: "2026-08-15" });
    expect(prismaMock.periodoNomina.create.mock.calls[0]![0].data.empresaId).toBe(EMPRESA_A);
  });
});

// --- editarPeriodo (concurrencia optimista + máquina de estados) -----------

const DATOS_EDICION = { fechaInicio: "2026-07-02", fechaFin: "2026-07-16", nota: "corrección de fechas" };

describe("editarPeriodo", () => {
  it("edita un borrador: el where del update lleva {id, version LEÍDA} y el data incrementa version", async () => {
    // El version en el WHERE es toda la concurrencia optimista que hay: el
    // update solo pega si nadie escribió desde que leímos. Sin él, el update
    // matchea por id y pisa en silencio.
    const res = await editarPeriodo(EMPRESA_A, 71, DATOS_EDICION);
    const { where, data } = prismaMock.periodoNomina.update.mock.calls[0]![0];
    expect(where).toEqual({ id: 71, version: 4 });
    expect(data.version).toEqual({ increment: 1 });
    expect(data.notaEdicion).toBe("corrección de fechas");
    expect(data.editadoEn).toBeInstanceOf(Date);
    expect(res.version).toBe(5);
  });

  it("CONCURRENCIA: una edición con versión vieja falla con ErrorConflicto NOMBRADO, no pisa en silencio", async () => {
    // Simula la carrera real: este usuario leyó version 3, otro ya escribió
    // y la fila va en 4. El update {id, version: 3} no matchea nada → P2025
    // → ErrorConflicto (el controlador lo vuelve 409 con "Actualiza la
    // página"). Lo importante es el NOMBRE: un Error genérico se volvería
    // 422 y el usuario reintentaría pisando al otro.
    prismaMock.periodoNomina.findFirst.mockResolvedValueOnce({ ...bdPeriodos[0]!, version: 3 });
    const promesa = editarPeriodo(EMPRESA_A, 71, DATOS_EDICION);
    await expect(promesa).rejects.toBeInstanceOf(ErrorConflicto);
    // Y la fila quedó como la dejó el OTRO usuario: fechas intactas.
    expect(bdPeriodos[0]!.fechaInicio).toBe("2026-07-01");
  });

  it("otros errores del update NO se disfrazan de conflicto de concurrencia", async () => {
    const caida = new Prisma.PrismaClientKnownRequestError("connection lost", { code: "P1017", clientVersion: "test" });
    prismaMock.periodoNomina.update.mockRejectedValueOnce(caida);
    await expect(editarPeriodo(EMPRESA_A, 71, DATOS_EDICION)).rejects.toBe(caida);
  });

  it.each(ESTADOS_PERIODO.filter((e) => e !== "borrador"))(
    "máquina de estados: en '%s' no se editan fechas — se exige revertir a borrador primero",
    async (estado) => {
      // Un periodo liquidado ya generó recibos con estas fechas; editarlas
      // por fuera de revertirABorrador dejaría recibos huérfanos de su
      // periodo. La transición válida es liquidado → borrador → editar.
      bdPeriodos[0]!.estado = estado;
      await expect(editarPeriodo(EMPRESA_A, 71, DATOS_EDICION)).rejects.toThrow(`estado "${estado}"`);
      expect(prismaMock.periodoNomina.update).not.toHaveBeenCalled();
    }
  );

  it("CROSS-TENANT: editar el periodo de otra empresa falla como inexistente, sin update", async () => {
    await expect(editarPeriodo(EMPRESA_A, 81, DATOS_EDICION)).rejects.toThrow("Periodo no encontrado");
    expect(prismaMock.periodoNomina.update).not.toHaveBeenCalled();
  });
});

// --- editarEmpleadosPeriodo ------------------------------------------------

describe("editarEmpleadosPeriodo", () => {
  it("reemplaza la lista en una transacción: deleteMany + createMany viajan JUNTOS", async () => {
    await editarEmpleadosPeriodo(EMPRESA_A, 71, [501]);
    // Las dos operaciones van en el MISMO $transaction (array): si el
    // create falla, el delete se revierte y el periodo no queda vacío.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect((prismaMock.$transaction.mock.calls[0]![0] as unknown[]).length).toBe(2);
    expect(prismaMock.periodoNominaEmpleado.deleteMany).toHaveBeenCalledWith({ where: { periodoId: 71 } });
    expect(prismaMock.periodoNominaEmpleado.createMany).toHaveBeenCalledWith({
      data: [{ periodoId: 71, empleadoId: 501 }],
    });
  });

  it("CROSS-TENANT: UN empleadoId de otra empresa tumba TODO el reemplazo, sin borrar nada", async () => {
    // El 601 existe y está activo — pero es de B. La validación cuenta
    // cuántos de los ids pedidos son de A y no eliminados; si el count
    // perdiera el empresaId contaría 2 y el reemplazo pasaría: la nómina
    // del empleado de B se liquidaría dentro del periodo de A.
    await expect(editarEmpleadosPeriodo(EMPRESA_A, 71, [501, 601])).rejects.toThrow("no pertenecen a esta empresa");
    expect(prismaMock.periodoNominaEmpleado.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.periodoNominaEmpleado.createMany).not.toHaveBeenCalled();
  });

  it("un empleado eliminado (soft) tampoco puede incluirse — el count exige eliminadoEn: null", async () => {
    await expect(editarEmpleadosPeriodo(EMPRESA_A, 71, [501, 503])).rejects.toThrow("no pertenecen a esta empresa");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("ids duplicados se deduplican ANTES de validar y de crear", async () => {
    // Sin el Set, [501, 501] contaría 1 válido contra 2 pedidos y
    // rechazaría una lista legítima; o peor, crearía la fila dos veces.
    await editarEmpleadosPeriodo(EMPRESA_A, 71, [501, 501]);
    expect(prismaMock.empleado.count.mock.calls[0]![0].where.id).toEqual({ in: [501] });
    expect(prismaMock.periodoNominaEmpleado.createMany.mock.calls[0]![0].data).toEqual([
      { periodoId: 71, empleadoId: 501 },
    ]);
  });

  it("solo en borrador: un periodo liquidado no cambia de participantes", async () => {
    await expect(editarEmpleadosPeriodo(EMPRESA_A, 72, [501])).rejects.toThrow('estado "liquidado"');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("CROSS-TENANT: el periodo de otra empresa no se alcanza ni para leer su lista por esta vía", async () => {
    await expect(editarEmpleadosPeriodo(EMPRESA_A, 81, [501])).rejects.toThrow("Periodo no encontrado");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

// --- reemplazarTurnos ------------------------------------------------------

const TURNO_501 = { empleadoId: 501, fecha: "2026-07-03", horaInicio: "08:00", horaFin: "17:00" };

describe("reemplazarTurnos", () => {
  it("reemplaza los turnos del periodo estampando periodoId, delete + create juntos en la transacción", async () => {
    await reemplazarTurnos(EMPRESA_A, 71, [TURNO_501]);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.turno.deleteMany).toHaveBeenCalledWith({ where: { periodoId: 71 } });
    expect(prismaMock.turno.createMany).toHaveBeenCalledWith({ data: [{ ...TURNO_501, periodoId: 71 }] });
  });

  it("CROSS-TENANT: un turno con empleadoId de otra empresa tumba todo el reemplazo", async () => {
    await expect(
      reemplazarTurnos(EMPRESA_A, 71, [TURNO_501, { ...TURNO_501, empleadoId: 601 }])
    ).rejects.toThrow("no pertenecen a esta empresa");
    expect(prismaMock.turno.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.turno.createMany).not.toHaveBeenCalled();
  });

  it("varios turnos del mismo empleado lo validan UNA vez (dedup) y todos se crean", async () => {
    const turno2 = { ...TURNO_501, fecha: "2026-07-04" };
    await reemplazarTurnos(EMPRESA_A, 71, [TURNO_501, turno2]);
    expect(prismaMock.empleado.count.mock.calls[0]![0].where.id).toEqual({ in: [501] });
    expect(prismaMock.turno.createMany.mock.calls[0]![0].data).toHaveLength(2);
  });

  it("solo en borrador: los turnos de un periodo liquidado son la foto de sus recibos", async () => {
    await expect(reemplazarTurnos(EMPRESA_A, 72, [TURNO_501])).rejects.toThrow('estado "liquidado"');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("CROSS-TENANT: el periodo de otra empresa falla como inexistente antes de tocar turnos", async () => {
    await expect(reemplazarTurnos(EMPRESA_A, 81, [TURNO_501])).rejects.toThrow("Periodo no encontrado");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

// --- HALLAZGO: las dos lecturas sin tenant ---------------------------------

describe("las dos lecturas de periodo validan pertenencia antes de leer", () => {
  // Estas pruebas nacieron PINNEANDO un agujero real, y hoy afirman que está
  // cerrado. Vale la pena que quede el rastro:
  //
  // `listarTurnos` y `listarEmpleadosIncluidos` consultaban SOLO por periodoId
  // y el controlador las llamaba con el param crudo, mientras TODAS las demás
  // operaciones del mismo archivo pasaban `req.usuario!.empresaId!`. Un
  // usuario de la empresa A, con el id de un periodo de B, leía los turnos
  // (fechas, horas, empleadoIds) y la lista de participantes de esa nómina.
  //
  // Es la misma forma del bug 0750834: la operación olvidada de un archivo
  // donde el resto sí filtra. Por eso el patrón que se prueba no es "el where
  // lleva empresaId" —el where del `findMany` sigue siendo `{periodoId}`, y
  // está bien— sino que **se valida la pertenencia ANTES**, vía
  // `obtenerPeriodo`, que es donde vive esa regla.

  // El periodo 81 es de EMPRESA_B; el 71, de EMPRESA_A. El caso que importa es
  // exactamente ese: operar como A con el id de un periodo de B.
  it("listarTurnos de un periodo AJENO lanza, y NO llega a leer los turnos", async () => {
    await expect(listarTurnos(EMPRESA_A, 81)).rejects.toThrow("Periodo no encontrado");
    expect(prismaMock.turno.findMany).not.toHaveBeenCalled();
  });

  it("listarEmpleadosIncluidos de un periodo AJENO lanza, y NO llega a leer", async () => {
    await expect(listarEmpleadosIncluidos(EMPRESA_A, 81)).rejects.toThrow("Periodo no encontrado");
    expect(prismaMock.periodoNominaEmpleado.findMany).not.toHaveBeenCalled();
  });

  it("con la empresa dueña, ambas leen normalmente", async () => {
    await listarTurnos(EMPRESA_A, 71);
    await listarEmpleadosIncluidos(EMPRESA_A, 71);
    expect(prismaMock.turno.findMany.mock.calls[0]![0].where).toEqual({ periodoId: 71 });
    expect(prismaMock.periodoNominaEmpleado.findMany.mock.calls[0]![0].where).toEqual({ periodoId: 71 });
  });
});
