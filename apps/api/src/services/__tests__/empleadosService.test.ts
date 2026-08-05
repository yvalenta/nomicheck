// Tests de `empleadosService.ts` — CRUD multi-tenant de empleados. Su modo de
// falla NO es una excepción: es que un id de la empresa B pase por una query
// sin `empresaId` en el where. Ya pasó una vez en este mismo recurso
// (commit 0750834: `invitarColaborador` buscaba solo por id y un admin de A
// operaba sobre empleados de B en una petición), así que el peso de esta
// suite está en los casos negativos cross-tenant.
//
// NINGUNA PRUEBA TOCA LA BASE. El corte va en el cliente (`lib/prisma.js`),
// igual que en batchPublicoService.test.ts y authService.test.ts: mockear la
// función de arriba dejaría sin cubrir justo el where que importa.
//
// El mock NO es un stub que devuelve lo que el test quiere: es una mini-base
// EN MEMORIA con filas de DOS empresas, y `findFirst`/`findMany`/`count`
// aplican el where de verdad (igualdad, null, {in}). Así, si a una query se
// le cae el filtro de tenant, la fila de la empresa B APARECE y la prueba
// se pone roja — que es exactamente cómo se ve el bug real. Un stub que
// devuelve el fixture sin mirar el where daría verde con el bug puesto.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { empleadoSchema } from "../../validation/empresa.js";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    empleado: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    reciboPago: { count: vi.fn() },
    turno: { count: vi.fn() },
    usuario: { updateMany: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import {
  actualizarEmpleado,
  crearEmpleado,
  eliminarEmpleado,
  ErrorConflicto,
  listarEmpleados,
  retirarEmpleado,
} from "../empleadosService.js";

// --- mini-base multi-tenant ------------------------------------------------

const EMPRESA_A = 1;
const EMPRESA_B = 2;

interface FilaEmpleado {
  id: number;
  empresaId: number;
  nombre: string;
  documento: string;
  sedeId: number | null;
  activo: boolean;
  eliminadoEn: Date | null;
  usuarioId: string | null;
  fechaIngreso: string;
  [k: string]: unknown;
}

/** La foto inicial: empresas A y B conviven en la misma tabla, como en la
 * base real. La fila 601 (Zoe, empresa B) existe para UNA cosa: si alguna
 * query de este servicio la alcanza operando como empresa A, hay bug. */
function semilla(): FilaEmpleado[] {
  return [
    { id: 501, empresaId: EMPRESA_A, nombre: "Ana Activa", documento: "1001", sedeId: 10, activo: true, eliminadoEn: null, usuarioId: null, fechaIngreso: "2025-01-15" },
    { id: 502, empresaId: EMPRESA_A, nombre: "Bruno Retirado", documento: "1002", sedeId: 10, activo: false, eliminadoEn: null, usuarioId: null, fechaIngreso: "2024-03-01" },
    { id: 503, empresaId: EMPRESA_A, nombre: "Carla Eliminada", documento: "1003", sedeId: 10, activo: false, eliminadoEn: new Date("2026-06-01"), usuarioId: null, fechaIngreso: "2024-06-01" },
    { id: 504, empresaId: EMPRESA_A, nombre: "Diego SinSede", documento: "1004", sedeId: null, activo: true, eliminadoEn: null, usuarioId: "uid-diego", fechaIngreso: "2025-06-01" },
    { id: 505, empresaId: EMPRESA_A, nombre: "Elena OtraSede", documento: "1005", sedeId: 11, activo: true, eliminadoEn: null, usuarioId: null, fechaIngreso: "2025-02-01" },
    { id: 601, empresaId: EMPRESA_B, nombre: "Zoe Ajena", documento: "2001", sedeId: 20, activo: true, eliminadoEn: null, usuarioId: null, fechaIngreso: "2025-01-01" },
  ];
}

let bdEmpleados: FilaEmpleado[];
// Historial por empleado — decide si "eliminar" es conflicto (409) o soft delete.
let recibosPorEmpleado: Record<number, number>;
let turnosPorEmpleado: Record<number, number>;

/** Evalúa el subconjunto de operadores de where que este servicio usa:
 * igualdad (incluye null), `{ in: [...] }`. `OR` (búsqueda por q) se ignora
 * a propósito: los tests de q afirman ARGUMENTOS, no filtrado de texto —
 * replicar `contains/insensitive` acá sería probar el mock, no el servicio. */
function cumpleWhere(fila: FilaEmpleado, where: Record<string, unknown>): boolean {
  for (const [campo, cond] of Object.entries(where)) {
    if (campo === "OR") continue;
    if (cond !== null && typeof cond === "object") {
      const abanico = (cond as { in?: unknown[] }).in;
      if (abanico !== undefined && !abanico.includes(fila[campo])) return false;
    } else if (fila[campo] !== cond) {
      return false;
    }
  }
  return true;
}

beforeEach(() => {
  vi.clearAllMocks();
  bdEmpleados = semilla();
  recibosPorEmpleado = {};
  turnosPorEmpleado = {};

  prismaMock.empleado.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdEmpleados.find((f) => cumpleWhere(f, where)) ?? null
  );
  prismaMock.empleado.findMany.mockImplementation(
    async ({ where, skip, take }: { where: Record<string, unknown>; skip?: number; take?: number }) => {
      const filas = bdEmpleados.filter((f) => cumpleWhere(f, where));
      const desde = skip ?? 0;
      return filas.slice(desde, take === undefined ? undefined : desde + take);
    }
  );
  prismaMock.empleado.count.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdEmpleados.filter((f) => cumpleWhere(f, where)).length
  );
  // update MUTA la mini-base: es lo que permite que "borrar dos veces" y
  // "lo borrado no reaparece" se prueben de verdad, no con stubs encadenados.
  prismaMock.empleado.update.mockImplementation(
    async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
      const fila = bdEmpleados.find((f) => f.id === where.id);
      if (!fila) throw new Prisma.PrismaClientKnownRequestError("No encontrado", { code: "P2025", clientVersion: "test" });
      Object.assign(fila, data);
      return { ...fila };
    }
  );
  prismaMock.empleado.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 999, ...data }));

  prismaMock.reciboPago.count.mockImplementation(
    async ({ where }: { where: { empleadoId: number } }) => recibosPorEmpleado[where.empleadoId] ?? 0
  );
  prismaMock.turno.count.mockImplementation(
    async ({ where }: { where: { empleadoId: number } }) => turnosPorEmpleado[where.empleadoId] ?? 0
  );
  prismaMock.usuario.updateMany.mockResolvedValue({ count: 1 });

  // conAuditoria (lib/auditoria.ts) envuelve todo en $transaction y setea
  // app.usuario_actual vía $executeRaw. Acá la transacción es el propio mock:
  // suficiente para que el flujo real corra entero.
  prismaMock.$executeRaw.mockResolvedValue(1);
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock) : Promise.all(arg as Promise<unknown>[])
  );
});

function datosNuevoEmpleado(): z.infer<typeof empleadoSchema> {
  return {
    nombre: "Nueva Persona",
    documento: "9009",
    salarioBase: 2_000_000,
    tipoNomina: "fijo",
    auxilioTransporte: true,
    fechaIngreso: "2026-08-01",
    tipoContrato: "indefinido",
    claseRiesgoArl: 1,
    sedeId: null,
  };
}

// --- listarEmpleados -------------------------------------------------------

describe("listarEmpleados", () => {
  it("solo devuelve empleados de la empresa, y los eliminados (soft) no aparecen", async () => {
    // La aserción funcional que mata los dos mutantes que más importan: sin
    // `empresaId` en el where aparecería Zoe (601, empresa B); sin
    // `eliminadoEn: null` aparecería Carla (503, borrada por error).
    const res = await listarEmpleados(EMPRESA_A);
    const ids = res.items.map((e: { id: number }) => e.id);
    expect(ids).toEqual(expect.arrayContaining([501, 502, 504, 505]));
    expect(ids).not.toContain(601); // tenant ajeno
    expect(ids).not.toContain(503); // soft-deleted
    expect(res.total).toBe(4);
  });

  it("count y findMany usan EL MISMO where — el total no puede contar filas que la página no muestra", async () => {
    await listarEmpleados(EMPRESA_A, null, { activo: true, page: 1, limit: 25, skip: 0 });
    const whereCount = prismaMock.empleado.count.mock.calls[0]![0].where;
    const whereMany = prismaMock.empleado.findMany.mock.calls[0]![0].where;
    expect(whereCount).toEqual(whereMany);
    expect(whereCount).toEqual({ empresaId: EMPRESA_A, eliminadoEn: null, activo: true });
  });

  it("sin filtros, el where es EXACTAMENTE {empresaId, eliminadoEn: null} — nada más se cuela", async () => {
    // toEqual estricto: si alguien agrega una cláusula por defecto (o quita
    // una de estas dos), esto se pone rojo. Son las dos cláusulas de
    // seguridad del listado; el resto son filtros opcionales.
    await listarEmpleados(EMPRESA_A);
    expect(prismaMock.empleado.findMany.mock.calls[0]![0].where).toEqual({ empresaId: EMPRESA_A, eliminadoEn: null });
  });

  it("q vacío ('' es falsy) no agrega OR — cadena vacía significa 'sin búsqueda', no 'coincidir con todo'", async () => {
    await listarEmpleados(EMPRESA_A, null, { q: "", page: 1, limit: 25, skip: 0 });
    expect(prismaMock.empleado.findMany.mock.calls[0]![0].where.OR).toBeUndefined();
  });

  it("q arma el OR por nombre/documento SIN perder el tenant en el proceso", async () => {
    await listarEmpleados(EMPRESA_A, null, { q: "ana", page: 1, limit: 25, skip: 0 });
    const where = prismaMock.empleado.findMany.mock.calls[0]![0].where;
    expect(where.empresaId).toBe(EMPRESA_A);
    expect(where.OR).toEqual([
      { nombre: { contains: "ana", mode: "insensitive" } },
      { documento: { contains: "ana", mode: "insensitive" } },
    ]);
  });

  it("el scoping por sedes del analista entra como {in: sedes}, y el empleado sin sede queda fuera", async () => {
    // Diego (504) tiene sedeId null: `{in: [10]}` no lo incluye. Un analista
    // scoped no ve a los sin-sede — consistente con empleadoAccesible, que
    // también los rechaza para escritura.
    const res = await listarEmpleados(EMPRESA_A, [10]);
    const ids = res.items.map((e: { id: number }) => e.id);
    expect(ids).toEqual(expect.arrayContaining([501, 502]));
    expect(ids).not.toContain(504);
    expect(ids).not.toContain(505);
  });

  it("HALLAZGO PINNEADO: el filtro ?sedeId= PISA el scoping por sedes del analista", async () => {
    // `where.sedeId = {in: sedes}` y después `where.sedeId = f.sedeId` — la
    // segunda asignación SOBREESCRIBE la primera, y el controlador
    // (empleadosController.listar) pasa req.query.sedeId crudo. Un
    // analista_rrhh limitado a la sede 10 pide ?sedeId=11 y ve la sede 11
    // entera (misma empresa, sede fuera de su alcance — SDD §15 pilar 1).
    //
    // Esta prueba PINNEA el comportamiento actual a propósito: si se pone
    // roja es porque alguien cerró el bypass (p. ej. intersectando el filtro
    // con las sedes del usuario) — actualizala y borrá el hallazgo del
    // reporte. NO la "arregles" para que siga verde.
    const res = await listarEmpleados(EMPRESA_A, [10], { sedeId: 11, page: 1, limit: 25, skip: 0 });
    expect(prismaMock.empleado.findMany.mock.calls[0]![0].where.sedeId).toBe(11); // el {in:[10]} quedó pisado
    expect(res.items.map((e: { id: number }) => e.id)).toContain(505); // Elena, sede 11: fuera del alcance del analista
  });

  it("paginación: skip/take van a la query y page/limit vuelven de eco; página fuera de rango da items vacíos con el total real", async () => {
    const res = await listarEmpleados(EMPRESA_A, null, { page: 99, limit: 25, skip: 2450 });
    const args = prismaMock.empleado.findMany.mock.calls[0]![0];
    expect(args.skip).toBe(2450);
    expect(args.take).toBe(25);
    // items vacíos + total real NO es un error: el cliente calcula
    // pageCount = ceil(total/limit) y corrige la página (lib/paginacion.ts).
    expect(res.items).toEqual([]);
    expect(res.total).toBe(4);
    expect(res.page).toBe(99);
    expect(res.limit).toBe(25);
  });
});

// --- crearEmpleado ---------------------------------------------------------

describe("crearEmpleado", () => {
  it("estampa el empresaId de la SESIÓN, aunque el body traiga otro", async () => {
    // El spread es `{...datos, empresaId}` — el parámetro va DESPUÉS y gana.
    // Si alguien invierte el orden, un body con empresaId ajeno crearía el
    // empleado en otra empresa. El schema hoy no deja pasar empresaId, pero
    // esta prueba no depende de que eso siga siendo cierto.
    const datosConTenantAjeno = { ...datosNuevoEmpleado(), empresaId: EMPRESA_B } as z.infer<typeof empleadoSchema>;
    await crearEmpleado(EMPRESA_A, datosConTenantAjeno, "uid-admin");
    expect(prismaMock.empleado.create.mock.calls[0]![0].data.empresaId).toBe(EMPRESA_A);
  });

  it("corre bajo conAuditoria: set_config recibe el usuarioId del autor (y '' cuando es null)", async () => {
    // Sin esto, el trigger fn_auditar_cambio registra autor NULL y el rastro
    // de auditoría queda huérfano (lib/auditoria.ts).
    await crearEmpleado(EMPRESA_A, datosNuevoEmpleado(), "uid-admin");
    expect(prismaMock.$executeRaw.mock.calls[0]![1]).toBe("uid-admin");
    vi.clearAllMocks();
    prismaMock.$executeRaw.mockResolvedValue(1);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock));
    prismaMock.empleado.create.mockResolvedValue({ id: 1000 });
    await crearEmpleado(EMPRESA_A, datosNuevoEmpleado(), null);
    expect(prismaMock.$executeRaw.mock.calls[0]![1]).toBe("");
  });

  it("documento duplicado (P2002) se traduce a ErrorConflicto nombrando el documento", async () => {
    prismaMock.empleado.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" })
    );
    const promesa = crearEmpleado(EMPRESA_A, datosNuevoEmpleado(), "uid-admin");
    await expect(promesa).rejects.toBeInstanceOf(ErrorConflicto);
    await expect(crearEmpleado(EMPRESA_A, datosNuevoEmpleado(), "uid-admin")).resolves.toBeTruthy();
  });

  it("otros errores de Prisma NO se disfrazan de conflicto — se propagan tal cual", async () => {
    // P2003 = FK inválida (p. ej. sedeId inexistente). Convertir todo a 409
    // "documento duplicado" mandaría al usuario a arreglar lo que no es.
    const fkRota = new Prisma.PrismaClientKnownRequestError("FK", { code: "P2003", clientVersion: "test" });
    prismaMock.empleado.create.mockRejectedValueOnce(fkRota);
    await expect(crearEmpleado(EMPRESA_A, datosNuevoEmpleado(), null)).rejects.toBe(fkRota);
  });
});

// --- actualizarEmpleado ----------------------------------------------------

describe("actualizarEmpleado", () => {
  it("actualiza un empleado propio (el acceso va por where {id, empresaId, eliminadoEn: null})", async () => {
    await actualizarEmpleado(EMPRESA_A, 501, { nombre: "Ana Renombrada" }, null, "uid-admin");
    // El scoping va EN el where del acceso, no en un if después — misma
    // decisión que el fix 0750834: un empleado ajeno debe ser
    // indistinguible de uno inexistente.
    expect(prismaMock.empleado.findFirst.mock.calls[0]![0].where).toEqual({ id: 501, empresaId: EMPRESA_A, eliminadoEn: null });
    expect(prismaMock.empleado.update).toHaveBeenCalledWith({ where: { id: 501 }, data: { nombre: "Ana Renombrada" } });
  });

  it("CROSS-TENANT: el id de otra empresa ni se encuentra ni se actualiza — y la respuesta no revela que existía", async () => {
    // 601 EXISTE en la mini-base (empresa B). Si el where perdiera el
    // empresaId, el mock lo encontraría, el update correría y esta prueba
    // se pondría roja — la forma exacta del bug de invitarColaborador.
    await expect(actualizarEmpleado(EMPRESA_A, 601, { nombre: "Zoe Robada" }, null, "uid-admin"))
      .rejects.toThrow("Empleado no encontrado");
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("un empleado eliminado (soft) tampoco es alcanzable para update", async () => {
    await expect(actualizarEmpleado(EMPRESA_A, 503, { nombre: "Carla Zombie" }, null, null))
      .rejects.toThrow("Empleado no encontrado");
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("analista con sedes: un empleado de otra sede queda fuera de su alcance de escritura", async () => {
    await expect(actualizarEmpleado(EMPRESA_A, 505, { activo: false }, [10], "uid-analista"))
      .rejects.toThrow("fuera de las sedes asignadas");
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("analista con sedes: el empleado SIN sede también queda fuera (sedeId null no pertenece a ninguna)", async () => {
    await expect(actualizarEmpleado(EMPRESA_A, 504, { activo: false }, [10], "uid-analista"))
      .rejects.toThrow("fuera de las sedes asignadas");
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("sedes=null (admin_empresa/auditor) no restringe por sede", async () => {
    await expect(actualizarEmpleado(EMPRESA_A, 505, { nombre: "Elena OK" }, null, null)).resolves.toBeTruthy();
  });
});

// --- eliminarEmpleado (soft delete) ---------------------------------------

describe("eliminarEmpleado", () => {
  it("sin historial: soft delete — update con eliminadoEn + activo:false, NUNCA delete físico", async () => {
    await eliminarEmpleado(EMPRESA_A, 501, null, "uid-admin");
    const { where, data } = prismaMock.empleado.update.mock.calls[0]![0];
    expect(where).toEqual({ id: 501 });
    expect(data.eliminadoEn).toBeInstanceOf(Date);
    expect(data.activo).toBe(false);
    // El registro debe sobrevivir en la tabla (recibos/turnos históricos lo
    // referencian). Si alguien "optimiza" a DELETE, esto lo delata.
    expect(prismaMock.empleado.delete).not.toHaveBeenCalled();
  });

  it("lo borrado no reaparece: tras eliminar, el listado ya no lo incluye", async () => {
    // Funcional de punta a punta sobre la mini-base: el update marcó
    // eliminadoEn y el listado filtra eliminadoEn: null. Si cualquiera de
    // las dos mitades se rompe, esto se pone rojo.
    await eliminarEmpleado(EMPRESA_A, 501, null, null);
    const res = await listarEmpleados(EMPRESA_A);
    expect(res.items.map((e: { id: number }) => e.id)).not.toContain(501);
    expect(res.total).toBe(3);
  });

  it("borrar dos veces no revienta: la segunda falla igual que un inexistente, sin segundo update", async () => {
    // El doble-click del usuario o el retry del frontend no deben producir
    // un 500 ni re-marcar nada: el primer soft delete sacó la fila del
    // alcance de empleadoAccesible (eliminadoEn ya no es null).
    await eliminarEmpleado(EMPRESA_A, 501, null, null);
    await expect(eliminarEmpleado(EMPRESA_A, 501, null, null)).rejects.toThrow("Empleado no encontrado");
    expect(prismaMock.empleado.update).toHaveBeenCalledTimes(1);
  });

  it("con recibos en el historial: ErrorConflicto que direcciona a 'Retirar', sin marcar nada", async () => {
    recibosPorEmpleado[502] = 3;
    await expect(eliminarEmpleado(EMPRESA_A, 502, null, null)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("con turnos (aunque no haya recibos) también es conflicto — el historial de nómina se conserva", async () => {
    turnosPorEmpleado[505] = 2;
    await expect(eliminarEmpleado(EMPRESA_A, 505, null, null)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("CROSS-TENANT: eliminar con id ajeno falla como inexistente y NI SIQUIERA consulta el historial", async () => {
    // Que no se consulten los counts importa: la diferencia de
    // comportamiento (409 con historial vs 404 sin él) revelaría a la
    // empresa A si un id de B existe y tiene nómina.
    await expect(eliminarEmpleado(EMPRESA_A, 601, null, null)).rejects.toThrow("Empleado no encontrado");
    expect(prismaMock.reciboPago.count).not.toHaveBeenCalled();
    expect(prismaMock.turno.count).not.toHaveBeenCalled();
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });
});

// --- retirarEmpleado -------------------------------------------------------

describe("retirarEmpleado", () => {
  it("marca fechaRetiro y activo:false — el empleado sale de periodos futuros pero conserva el historial", async () => {
    await retirarEmpleado(EMPRESA_A, 501, { fechaRetiro: "2026-07-31" }, null, "uid-admin");
    expect(prismaMock.empleado.update).toHaveBeenCalledWith({
      where: { id: 501 },
      data: { fechaRetiro: "2026-07-31", activo: false },
    });
  });

  it("rechaza fechaRetiro anterior a fechaIngreso (las fechas son YYYY-MM-DD, comparación lexicográfica)", async () => {
    // 501 ingresó el 2025-01-15.
    await expect(retirarEmpleado(EMPRESA_A, 501, { fechaRetiro: "2024-12-31" }, null, null))
      .rejects.toThrow("no puede ser anterior a la fecha de ingreso");
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("si el empleado tenía cuenta, la libera — y el where del updateMany LLEVA el empresaId", async () => {
    // Diego (504) tiene usuarioId. La cuenta queda libre (empresaId: null)
    // para que otra empresa pueda invitarla. El `empresaId` en el where es
    // la red de seguridad: si la cuenta ya migró a otra empresa, este
    // updateMany no debe tocarla — sin ese filtro, retirar en A podría
    // desvincular a un usuario que ya trabaja en B.
    await retirarEmpleado(EMPRESA_A, 504, { fechaRetiro: "2026-07-31" }, null, "uid-admin");
    expect(prismaMock.usuario.updateMany).toHaveBeenCalledWith({
      where: { id: "uid-diego", empresaId: EMPRESA_A },
      data: { empresaId: null },
    });
  });

  it("sin cuenta vinculada no toca la tabla de usuarios", async () => {
    await retirarEmpleado(EMPRESA_A, 501, { fechaRetiro: "2026-07-31" }, null, null);
    expect(prismaMock.usuario.updateMany).not.toHaveBeenCalled();
  });

  it("CROSS-TENANT: retirar con id ajeno falla como inexistente, sin escrituras", async () => {
    await expect(retirarEmpleado(EMPRESA_A, 601, { fechaRetiro: "2026-07-31" }, null, null))
      .rejects.toThrow("Empleado no encontrado");
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
    expect(prismaMock.usuario.updateMany).not.toHaveBeenCalled();
  });
});
