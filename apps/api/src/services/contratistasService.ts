import { prisma } from "../lib/prisma.js";
import type { contratistaSchema, contratistaUpdateSchema } from "../validation/empresa.js";
import type { z } from "zod";

// Mismo patrón que empleadosService.ts — todo query filtrado por empresaId
// en código (RLS es la defensa adicional, SDD.md §05).
export function listarContratistas(empresaId: number) {
  return prisma.contratista.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } });
}

export function crearContratista(empresaId: number, datos: z.infer<typeof contratistaSchema>) {
  return prisma.contratista.create({ data: { ...datos, empresaId } });
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
