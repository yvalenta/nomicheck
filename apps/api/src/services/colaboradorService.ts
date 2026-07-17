import { prisma } from "../lib/prisma.js";
import type { crearReporteSchema } from "../validation/discrepancia.js";
import type { z } from "zod";

// Portal colaborador (Fase 7, SDD §11): un colaborador solo ve SUS propios
// recibos — filtro por empleadoId en código (defensa adicional a RLS).
export function listarRecibosPropios(empleadoId: number) {
  return prisma.reciboPago.findMany({
    where: { empleadoId },
    include: { periodo: true, reportes: true },
    orderBy: { liquidadoEn: "desc" },
  });
}

export async function reportarDiscrepancia(
  empleadoId: number,
  colaboradorId: string,
  reciboId: number,
  datos: z.infer<typeof crearReporteSchema>
) {
  const recibo = await prisma.reciboPago.findFirst({ where: { id: reciboId, empleadoId } });
  if (!recibo) throw new Error("Recibo no encontrado");
  return prisma.reporteDiscrepancia.create({
    data: { reciboId, colaboradorId, tipo: datos.tipo, detalle: datos.detalle },
  });
}
