// Tests de `contratistasService.ts` — el CRUD multi-tenant más chico del
// grupo, y por eso el más fácil de romper sin que nadie mire: no tiene
// conAuditoria, no tiene soft delete (el borrado ES físico, por diseño:
// solo se permite sin recibos), y todo su scoping son cuatro where.
//
// Mismo patrón hermético que empleadosService.test.ts: corte en
// `lib/prisma.js`, mini-base con contratistas de DOS empresas, where
// evaluado de verdad — un where sin empresaId encuentra la fila ajena y la
// prueba se pone roja.
//
// Al final va un describe de `paginacionDeQuery` (lib/paginacion.ts): los
// servicios de listado confían en skip/limit YA saneados — la defensa
// contra offsets negativos y limits absurdos vive en ese parser y en ningún
// otro lado, así que se prueba junto al consumidor más simple.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import type { z } from "zod";
import type { contratistaSchema } from "../../validation/empresa.js";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    contratista: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    reciboPago: { count: vi.fn() },
  },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import {
  actualizarContratista,
  crearContratista,
  eliminarContratista,
  listarContratistas,
} from "../contratistasService.js";
import { ErrorConflicto } from "../empleadosService.js";
import { paginacionDeQuery } from "../../lib/paginacion.js";

// --- mini-base multi-tenant ------------------------------------------------

const EMPRESA_A = 1;
const EMPRESA_B = 2;

interface FilaContratista {
  id: number;
  empresaId: number;
  nombre: string;
  documento: string;
  activo: boolean;
  [k: string]: unknown;
}

// El 401 (empresa B) existe para una sola cosa: si alguna query de este
// servicio lo alcanza operando como empresa A, hay bug.
function semilla(): FilaContratista[] {
  return [
    { id: 301, empresaId: EMPRESA_A, nombre: "Caro Consultora", documento: "3001", activo: true },
    { id: 302, empresaId: EMPRESA_A, nombre: "Dario Desactivado", documento: "3002", activo: false },
    { id: 401, empresaId: EMPRESA_B, nombre: "Waldo Ajeno", documento: "4001", activo: true },
  ];
}

let bdContratistas: FilaContratista[];
let recibosPorContratista: Record<number, number>;

function cumpleWhere(fila: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [campo, cond] of Object.entries(where)) {
    if (campo === "OR") continue; // la búsqueda por q se afirma por argumentos
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
  bdContratistas = semilla();
  recibosPorContratista = {};

  prismaMock.contratista.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdContratistas.find((f) => cumpleWhere(f, where)) ?? null
  );
  prismaMock.contratista.findMany.mockImplementation(
    async ({ where, skip, take }: { where: Record<string, unknown>; skip?: number; take?: number }) => {
      const filas = bdContratistas.filter((f) => cumpleWhere(f, where));
      const desde = skip ?? 0;
      return filas.slice(desde, take === undefined ? undefined : desde + take);
    }
  );
  prismaMock.contratista.count.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdContratistas.filter((f) => cumpleWhere(f, where)).length
  );
  prismaMock.contratista.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 999, ...data }));
  prismaMock.contratista.update.mockImplementation(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
    const fila = bdContratistas.find((f) => f.id === where.id)!;
    Object.assign(fila, data);
    return { ...fila };
  });
  prismaMock.contratista.delete.mockImplementation(async ({ where }: { where: { id: number } }) => {
    const idx = bdContratistas.findIndex((f) => f.id === where.id);
    return bdContratistas.splice(idx, 1)[0];
  });

  prismaMock.reciboPago.count.mockImplementation(
    async ({ where }: { where: { contratistaId: number } }) => recibosPorContratista[where.contratistaId] ?? 0
  );
});

function datosNuevoContratista(): z.infer<typeof contratistaSchema> {
  return { nombre: "Nueva Contratista", documento: "9001", honorariosMensuales: 3_000_000, walletAddress: null };
}

// --- listarContratistas ----------------------------------------------------

describe("listarContratistas", () => {
  it("solo devuelve contratistas de la empresa — el de la empresa B no aparece", async () => {
    const res = await listarContratistas(EMPRESA_A);
    const ids = res.items.map((c: { id: number }) => c.id);
    expect(ids).toEqual(expect.arrayContaining([301, 302]));
    expect(ids).not.toContain(401);
    expect(res.total).toBe(2);
  });

  it("sin filtros el where es EXACTAMENTE {empresaId} — no hay eliminadoEn acá porque el borrado es físico", async () => {
    await listarContratistas(EMPRESA_A);
    expect(prismaMock.contratista.findMany.mock.calls[0]![0].where).toEqual({ empresaId: EMPRESA_A });
    expect(prismaMock.contratista.count.mock.calls[0]![0].where).toEqual({ empresaId: EMPRESA_A });
  });

  it("filtro activo recorta sin perder el tenant", async () => {
    const res = await listarContratistas(EMPRESA_A, { activo: true, page: 1, limit: 25, skip: 0 });
    expect(prismaMock.contratista.findMany.mock.calls[0]![0].where).toEqual({ empresaId: EMPRESA_A, activo: true });
    expect(res.items.map((c: { id: number }) => c.id)).toEqual([301]);
  });

  it("q arma el OR nombre/documento manteniendo el empresaId; q vacío no agrega OR", async () => {
    await listarContratistas(EMPRESA_A, { q: "caro", page: 1, limit: 25, skip: 0 });
    const where = prismaMock.contratista.findMany.mock.calls[0]![0].where;
    expect(where.empresaId).toBe(EMPRESA_A);
    expect(where.OR).toEqual([
      { nombre: { contains: "caro", mode: "insensitive" } },
      { documento: { contains: "caro", mode: "insensitive" } },
    ]);
    vi.clearAllMocks();
    prismaMock.contratista.count.mockResolvedValue(0);
    prismaMock.contratista.findMany.mockResolvedValue([]);
    await listarContratistas(EMPRESA_A, { q: "", page: 1, limit: 25, skip: 0 });
    expect(prismaMock.contratista.findMany.mock.calls[0]![0].where.OR).toBeUndefined();
  });

  it("paginación: skip/take a la query, page/limit de eco; página fuera de rango = items vacíos + total real", async () => {
    const res = await listarContratistas(EMPRESA_A, { page: 40, limit: 50, skip: 1950 });
    const args = prismaMock.contratista.findMany.mock.calls[0]![0];
    expect(args.skip).toBe(1950);
    expect(args.take).toBe(50);
    expect(res.items).toEqual([]);
    expect(res.total).toBe(2);
    expect(res.page).toBe(40);
    expect(res.limit).toBe(50);
  });
});

// --- crearContratista ------------------------------------------------------

describe("crearContratista", () => {
  it("estampa el empresaId de la SESIÓN, aunque el body traiga otro", async () => {
    // `{...datos, empresaId}`: el parámetro va después y gana. Si alguien
    // invierte el spread, un body con empresaId ajeno crearía el
    // contratista en otra empresa.
    const datosConTenantAjeno = { ...datosNuevoContratista(), empresaId: EMPRESA_B } as z.infer<typeof contratistaSchema>;
    await crearContratista(EMPRESA_A, datosConTenantAjeno);
    expect(prismaMock.contratista.create.mock.calls[0]![0].data.empresaId).toBe(EMPRESA_A);
  });
});

// --- eliminarContratista ---------------------------------------------------

describe("eliminarContratista", () => {
  it("sin recibos: borra físico (caso 'creado por error' — no hay nada que conservar)", async () => {
    await eliminarContratista(EMPRESA_A, 301);
    expect(prismaMock.contratista.delete).toHaveBeenCalledWith({ where: { id: 301 } });
    // Y desaparece del listado de la mini-base.
    const res = await listarContratistas(EMPRESA_A);
    expect(res.items.map((c: { id: number }) => c.id)).not.toContain(301);
  });

  it("con recibos: ErrorConflicto que direcciona a desactivar — los registros de pago se conservan", async () => {
    recibosPorContratista[302] = 5;
    await expect(eliminarContratista(EMPRESA_A, 302)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.contratista.delete).not.toHaveBeenCalled();
  });

  it("CROSS-TENANT: el id de otra empresa falla como inexistente SIN consultar recibos ni borrar", async () => {
    // El 401 EXISTE (empresa B). El acceso va por where {id, empresaId}: si
    // pierde el tenant, este delete es FÍSICO e irreversible sobre datos de
    // B. Que tampoco se consulten los recibos evita el canal lateral (409
    // vs 404 revelaría si el id ajeno existe y tiene pagos).
    await expect(eliminarContratista(EMPRESA_A, 401)).rejects.toThrow("Contratista no encontrado");
    expect(prismaMock.reciboPago.count).not.toHaveBeenCalled();
    expect(prismaMock.contratista.delete).not.toHaveBeenCalled();
  });

  it("borrar dos veces no revienta: la segunda es 'no encontrado' (la fila ya no está)", async () => {
    await eliminarContratista(EMPRESA_A, 301);
    await expect(eliminarContratista(EMPRESA_A, 301)).rejects.toThrow("Contratista no encontrado");
    expect(prismaMock.contratista.delete).toHaveBeenCalledTimes(1);
  });
});

// --- actualizarContratista -------------------------------------------------

describe("actualizarContratista", () => {
  it("actualiza uno propio: acceso por {id, empresaId}, update por id", async () => {
    await actualizarContratista(EMPRESA_A, 301, { activo: false });
    expect(prismaMock.contratista.findFirst.mock.calls[0]![0].where).toEqual({ id: 301, empresaId: EMPRESA_A });
    expect(prismaMock.contratista.update).toHaveBeenCalledWith({ where: { id: 301 }, data: { activo: false } });
  });

  it("CROSS-TENANT: actualizar con id ajeno falla como inexistente, sin update", async () => {
    await expect(actualizarContratista(EMPRESA_A, 401, { activo: false })).rejects.toThrow("Contratista no encontrado");
    expect(prismaMock.contratista.update).not.toHaveBeenCalled();
  });
});

// --- paginacionDeQuery (lib/paginacion.ts) ---------------------------------

// Los listados de este grupo pasan skip/take a Prisma TAL CUAL — un skip
// negativo revienta en la base, un limit de 100.000 la tumba de a poco. La
// única línea de defensa es este parser en el borde del controlador; si sus
// clamps se relajan, todos los listados quedan expuestos a la vez.
function reqCon(query: Record<string, string>): Request {
  return { query } as unknown as Request;
}

describe("paginacionDeQuery", () => {
  it("page negativa o no numérica clampa a 1 — el skip nunca es negativo", () => {
    expect(paginacionDeQuery(reqCon({ page: "-3" }))).toEqual({ page: 1, limit: 25, skip: 0 });
    expect(paginacionDeQuery(reqCon({ page: "abc" }))).toEqual({ page: 1, limit: 25, skip: 0 });
  });

  it("limit se clampa al máximo (200) — el cliente no elige el tamaño de la barrida", () => {
    expect(paginacionDeQuery(reqCon({ limit: "100000" })).limit).toBe(200);
  });

  it("limit negativo clampa a 1; limit 0 y no-numérico caen al DEFAULT (0 es falsy, no 'cero filas')", () => {
    expect(paginacionDeQuery(reqCon({ limit: "-5" })).limit).toBe(1);
    expect(paginacionDeQuery(reqCon({ limit: "0" })).limit).toBe(25);
    expect(paginacionDeQuery(reqCon({ limit: "abc" })).limit).toBe(25);
  });

  it("page decimal se trunca y el skip se deriva de page y limit ya saneados", () => {
    expect(paginacionDeQuery(reqCon({ page: "3.9", limit: "10" }))).toEqual({ page: 3, limit: 10, skip: 20 });
  });
});
