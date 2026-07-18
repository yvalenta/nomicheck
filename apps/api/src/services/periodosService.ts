import { prisma } from "../lib/prisma.js";
import type { editarPeriodoSchema, periodoSchema, turnosSchema } from "../validation/periodo.js";
import type { z } from "zod";

export function listarPeriodos(empresaId: number) {
  return prisma.periodoNomina.findMany({
    where: { empresaId },
    orderBy: { fechaInicio: "desc" },
  });
}

export function crearPeriodo(empresaId: number, datos: z.infer<typeof periodoSchema>) {
  return prisma.periodoNomina.create({ data: { ...datos, empresaId } });
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
  return prisma.periodoNomina.update({
    where: { id: periodoId },
    data: {
      fechaInicio: datos.fechaInicio,
      fechaFin: datos.fechaFin,
      notaEdicion: datos.nota,
      editadoEn: new Date(),
    },
  });
}

export function listarTurnos(periodoId: number) {
  return prisma.turno.findMany({ where: { periodoId }, orderBy: { fecha: "asc" } });
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
    where: { id: { in: empleadoIds }, empresaId },
  });
  if (empleadosValidos !== empleadoIds.length) {
    throw new Error("Uno o más empleados no pertenecen a esta empresa");
  }

  return prisma.$transaction([
    prisma.turno.deleteMany({ where: { periodoId } }),
    prisma.turno.createMany({ data: turnos.map((t) => ({ ...t, periodoId })) }),
  ]);
}
