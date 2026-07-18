import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { guardarLiquidacionSchema } from "../validation/liquidacion.js";
import type { z } from "zod";

// Historial personal de liquidaciones guardadas (flujo delayed auth). Cada
// liquidación es un snapshot del ResultadoNomina, propiedad del usuario que la
// guardó — nunca se recalcula (igual que ReciboPago).
export async function guardarLiquidacion(
  usuarioId: string,
  datos: z.infer<typeof guardarLiquidacionSchema>
) {
  const { resultado, netoRecibido } = datos;
  return prisma.liquidacion.create({
    data: {
      usuarioId,
      resultado: resultado as Prisma.InputJsonValue, // JSONB — snapshot completo
      netoEsperado: resultado.netoEsperado,
      netoRecibido: netoRecibido ?? null,
      periodoDesde: resultado.periodoDesde ?? null,
      periodoHasta: resultado.periodoHasta ?? null,
    },
    select: { id: true, creadoEn: true },
  });
}

export function listarLiquidaciones(usuarioId: string) {
  return prisma.liquidacion.findMany({
    where: { usuarioId },
    orderBy: { creadoEn: "desc" },
  });
}
