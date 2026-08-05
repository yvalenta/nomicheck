import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ErrorConflicto } from "./empleadosService.js";
import type { EstadoPeriodo } from "../lib/estados.js";
import type { editarPeriodoSchema, empleadosPeriodoSchema, periodoSchema, turnosSchema } from "../validation/periodo.js";
import type { z } from "zod";
import type { RespuestaPaginada } from "../lib/paginacion.js";

export interface FiltrosPeriodos {
  estado?: EstadoPeriodo;
  desde?: string;   // recorta por fechaInicio ≥ desde
  hasta?: string;   // recorta por fechaFin ≤ hasta
  page: number;
  limit: number;
  skip: number;
}

export async function listarPeriodos(
  empresaId: number,
  f: FiltrosPeriodos = { page: 1, limit: 25, skip: 0 }
): Promise<RespuestaPaginada<Awaited<ReturnType<typeof prisma.periodoNomina.findFirst>>>> {
  const where: Prisma.PeriodoNominaWhereInput = { empresaId };
  if (f.estado) where.estado = f.estado;
  if (f.desde) where.fechaInicio = { gte: f.desde };
  if (f.hasta) where.fechaFin = { lte: f.hasta };
  const [total, items] = await Promise.all([
    prisma.periodoNomina.count({ where }),
    prisma.periodoNomina.findMany({ where, orderBy: { fechaInicio: "desc" }, skip: f.skip, take: f.limit }),
  ]);
  return { items, total, page: f.page, limit: f.limit };
}

// Se autopuebla con los empleados activos de la empresa al momento de crear
// el periodo — mismo comportamiento implícito que tenía liquidarPeriodo antes
// de existir esta selección explícita. La empresa ajusta la lista después
// (editarEmpleadosPeriodo) mientras el periodo siga en borrador.
export async function crearPeriodo(empresaId: number, datos: z.infer<typeof periodoSchema>) {
  const activos = await prisma.empleado.findMany({ where: { empresaId, activo: true }, select: { id: true } });
  return prisma.periodoNomina.create({
    data: {
      ...datos,
      empresaId,
      empleadosIncluidos: { create: activos.map((e) => ({ empleadoId: e.id })) },
    },
  });
}

// Recibe `empresaId` y valida pertenencia ANTES de leer, igual que el resto de
// las operaciones del periodo. No lo hacía: filtraba solo por `periodoId`, así
// que un usuario de la empresa A con el id de un periodo de B leía quiénes
// participan de esa nómina. Es la misma forma del agujero de
// `invitarColaborador` (0750834): la lista de participantes de un periodo NO es
// dato de un id, es dato de una empresa.
//
// El `obtenerPeriodo` de arriba sigue: distingue "no es tuyo" (404) de "es tuyo
// y está vacío" (lista vacía), cosa que el filtro solo no puede hacer. Pero el
// ancla ya no vive en él — va en el `where`, donde no se puede quitar por
// accidente al refactorizar la línea de arriba.
export async function listarEmpleadosIncluidos(empresaId: number, periodoId: number) {
  await obtenerPeriodo(empresaId, periodoId); // lanza si no es de esta empresa
  return prisma.periodoNominaEmpleado.findMany({
    where: { periodoId, periodo: { empresaId } },
    select: { empleadoId: true },
  });
}

// Reemplaza qué empleados quedan incluidos en el periodo — SOLO en borrador
// (mismo criterio que editar fechas/turnos: un periodo liquidado ya generó
// recibos, cambiar quién participa después rompería esa foto). Valida que
// todos pertenezcan a la empresa, igual que reemplazarTurnos.
export async function editarEmpleadosPeriodo(
  empresaId: number,
  periodoId: number,
  empleadoIds: z.infer<typeof empleadosPeriodoSchema>
) {
  const periodo = await obtenerPeriodo(empresaId, periodoId);
  if (periodo.estado !== "borrador") {
    throw new Error(`El periodo está en estado "${periodo.estado}" — solo se ajustan colaboradores en borrador`);
  }

  const ids = [...new Set(empleadoIds)];
  const validos = await prisma.empleado.count({ where: { id: { in: ids }, empresaId, eliminadoEn: null } });
  if (validos !== ids.length) {
    throw new Error("Uno o más empleados no pertenecen a esta empresa");
  }

  await prisma.$transaction([
    prisma.periodoNominaEmpleado.deleteMany({ where: { periodoId, periodo: { empresaId } } }),
    prisma.periodoNominaEmpleado.createMany({ data: ids.map((empleadoId) => ({ periodoId, empleadoId })) }),
  ]);
  return listarEmpleadosIncluidos(empresaId, periodoId);
}

export async function obtenerPeriodo(empresaId: number, periodoId: number) {
  const periodo = await prisma.periodoNomina.findFirst({ where: { id: periodoId, empresaId } });
  if (!periodo) throw new Error("Periodo no encontrado");
  return periodo;
}

// Editar las fechas de un periodo — SOLO en borrador (uno liquidado se
// revierte primero, vía revertirABorrador, para no dejar recibos con
// fechas que ya no coinciden con el periodo). La nota queda como rastro de
// auditoría: por qué se corrigió, visible en el detalle del periodo.
export async function editarPeriodo(
  empresaId: number,
  periodoId: number,
  datos: z.infer<typeof editarPeriodoSchema>
) {
  const periodo = await obtenerPeriodo(empresaId, periodoId);
  if (periodo.estado !== "borrador") {
    throw new Error(`El periodo está en estado "${periodo.estado}" — revierte a borrador antes de editar las fechas`);
  }
  try {
    return await prisma.periodoNomina.update({
      where: { id: periodoId, version: periodo.version },
      data: {
        fechaInicio: datos.fechaInicio,
        fechaFin: datos.fechaFin,
        notaEdicion: datos.nota,
        editadoEn: new Date(),
        version: { increment: 1 },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new ErrorConflicto(
        "Otro usuario modificó este periodo mientras trabajabas en él. Actualiza la página y vuelve a intentarlo."
      );
    }
    throw err;
  }
}

// Mismo arreglo y mismo motivo que `listarEmpleadosIncluidos`: los turnos
// llevan fechas, horas y `empleadoId`s de la nomina ajena. Sin la validacion de
// pertenencia, `GET .../periodos/:id/turnos` con un id de otra empresa los
// devolvia enteros.
export async function listarTurnos(empresaId: number, periodoId: number) {
  await obtenerPeriodo(empresaId, periodoId); // lanza si no es de esta empresa
  return prisma.turno.findMany({
    where: { periodoId, periodo: { empresaId } },
    orderBy: { fecha: "asc" },
  });
}

// Reemplaza todos los turnos del periodo — solo permitido en estado
// "borrador" (SDD.md §07 PeriodoNomina). Los empleados deben pertenecer a
// la misma empresa que el periodo, verificado explícitamente en el service
// (no solo por RLS) para no confiar en IDs que el cliente pueda inventar.
export async function reemplazarTurnos(
  empresaId: number,
  periodoId: number,
  turnos: z.infer<typeof turnosSchema>
) {
  const periodo = await obtenerPeriodo(empresaId, periodoId);
  if (periodo.estado !== "borrador") {
    throw new Error(`El periodo está en estado "${periodo.estado}" — solo se editan turnos en borrador`);
  }

  const empleadoIds = [...new Set(turnos.map((t) => t.empleadoId))];
  const empleadosValidos = await prisma.empleado.count({
    where: { id: { in: empleadoIds }, empresaId, eliminadoEn: null },
  });
  if (empleadosValidos !== empleadoIds.length) {
    throw new Error("Uno o más empleados no pertenecen a esta empresa");
  }

  return prisma.$transaction([
    prisma.turno.deleteMany({ where: { periodoId, periodo: { empresaId } } }),
    prisma.turno.createMany({ data: turnos.map((t) => ({ ...t, periodoId })) }),
  ]);
}
