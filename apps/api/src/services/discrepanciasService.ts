import { prisma } from "../lib/prisma.js";
import type { responderReporteSchema } from "../validation/discrepancia.js";
import type { z } from "zod";

// Lado empresa (Fase 7): ver y responder los reportes de discrepancia de
// sus propios recibos — filtro por empresaId vía la cadena recibo→periodo.
export function listarDiscrepancias(empresaId: number) {
  return prisma.reporteDiscrepancia.findMany({
    where: { recibo: { periodo: { empresaId } } },
    include: { recibo: { include: { empleado: true, contratista: true } }, colaborador: true },
    orderBy: { creadoEn: "desc" },
  });
}

export async function responderDiscrepancia(
  empresaId: number,
  reporteId: number,
  datos: z.infer<typeof responderReporteSchema>
) {
  const reporte = await prisma.reporteDiscrepancia.findFirst({
    where: { id: reporteId, recibo: { periodo: { empresaId } } },
  });
  if (!reporte) throw new Error("Reporte no encontrado");
  return prisma.reporteDiscrepancia.update({
    where: { id: reporteId },
    data: { estado: datos.estado, respuestaEmpresa: datos.respuestaEmpresa },
  });
}
