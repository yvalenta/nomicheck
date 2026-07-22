import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { contratistaSchema, contratistaUpdateSchema } from "../validation/empresa.js";
import type { z } from "zod";
import { ErrorConflicto } from "./empleadosService.js";
import type { RespuestaPaginada } from "../lib/paginacion.js";

export interface FiltrosContratistas {
  q?: string;
  activo?: boolean;
  page: number;
  limit: number;
  skip: number;
}

// Mismo patrón que empleadosService.ts — todo query filtrado por empresaId
// en código (RLS es la defensa adicional, SDD.md §05).
export async function listarContratistas(
  empresaId: number,
  f: FiltrosContratistas = { page: 1, limit: 25, skip: 0 }
): Promise<RespuestaPaginada<Awaited<ReturnType<typeof prisma.contratista.findFirst>>>> {
  const where: Prisma.ContratistaWhereInput = { empresaId };
  if (f.activo !== undefined) where.activo = f.activo;
  if (f.q) {
    where.OR = [
      { nombre: { contains: f.q, mode: "insensitive" } },
      { documento: { contains: f.q, mode: "insensitive" } },
    ];
  }
  const [total, items] = await Promise.all([
    prisma.contratista.count({ where }),
    prisma.contratista.findMany({ where, orderBy: { nombre: "asc" }, skip: f.skip, take: f.limit }),
  ]);
  return { items, total, page: f.page, limit: f.limit };
}

export function crearContratista(empresaId: number, datos: z.infer<typeof contratistaSchema>) {
  return prisma.contratista.create({ data: { ...datos, empresaId } });
}

// Mismo criterio de borrado que empleadosService.eliminarEmpleado: solo
// sin historial de recibos (caso "creado por error"); con historial, el
// camino es desactivarlo (activo=false) conservando los registros.
export async function eliminarContratista(empresaId: number, contratistaId: number) {
  const contratista = await prisma.contratista.findFirst({ where: { id: contratistaId, empresaId } });
  if (!contratista) throw new Error("Contratista no encontrado");

  const recibos = await prisma.reciboPago.count({ where: { contratistaId } });
  if (recibos > 0) {
    throw new ErrorConflicto(
      "El contratista tiene recibos registrados y no puede eliminarse: los registros de pago deben conservarse. Desactívalo (activo=false) para conservar el historial."
    );
  }
  return prisma.contratista.delete({ where: { id: contratistaId } });
}

export async function actualizarContratista(
  empresaId: number,
  contratistaId: number,
  datos: z.infer<typeof contratistaUpdateSchema>
) {
  const contratista = await prisma.contratista.findFirst({ where: { id: contratistaId, empresaId } });
  if (!contratista) throw new Error("Contratista no encontrado");
  return prisma.contratista.update({ where: { id: contratistaId }, data: datos });
}
