import { prisma } from "../lib/prisma.js";
import type { contratistaSchema, contratistaUpdateSchema } from "../validation/empresa.js";
import type { z } from "zod";
import { ErrorConflicto } from "./empleadosService.js";

// Mismo patrón que empleadosService.ts — todo query filtrado por empresaId
// en código (RLS es la defensa adicional, SDD.md §05).
export function listarContratistas(empresaId: number) {
  return prisma.contratista.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } });
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
