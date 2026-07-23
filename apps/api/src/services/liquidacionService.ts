// Productor de la liquidación asíncrona (SDD §15, escalabilidad enterprise).
// Toda la lógica de cálculo se movió a liquidacionCalculo.ts (función pura
// reusada por el worker). Aquí queda:
//   - encolarLiquidacion: valida el borrador, encola el job y transiciona
//     el periodo a `liquidando` con jobId.
//   - obtenerEstadoLiquidacion: respuesta mínima para el polling de la UI.
//   - revertirABorrador: inalterado (borra recibos + version-check).
//   - listarRecibos: inalterado.
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { conAuditoria } from "../lib/auditoria.js";
import { ErrorConflicto } from "./empleadosService.js";
import { obtenerPeriodo } from "./periodosService.js";
import { COLA_LIQUIDACION, getBoss, type DatosJobLiquidacion } from "../lib/boss.js";

// Concurrencia optimista sobre PeriodoNomina.version: si dos analistas
// intentan liquidar/revertir el mismo periodo, el segundo update no
// matchea y Prisma lanza P2025 → ErrorConflicto → HTTP 409.
async function actualizarPeriodoConVersion(
  tx: Prisma.TransactionClient,
  periodoId: number,
  versionActual: number,
  data: Prisma.PeriodoNominaUpdateInput
) {
  try {
    return await tx.periodoNomina.update({
      where: { id: periodoId, version: versionActual },
      data: { ...data, version: { increment: 1 } },
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

/**
 * Encola la liquidación de un periodo. Guard: solo desde `borrador`.
 * Transiciona el periodo a `liquidando` con jobId y progreso=0 dentro de
 * la misma transacción de auditoría. El worker (workers/liquidacionWorker)
 * hace el trabajo pesado por lotes.
 */
export async function encolarLiquidacion(
  empresaId: number,
  periodoId: number,
  usuarioId: string | null = null
): Promise<{ jobId: string }> {
  const periodo = await obtenerPeriodo(empresaId, periodoId);
  if (periodo.estado !== "borrador") {
    throw new Error(`El periodo está en estado "${periodo.estado}" — revierte a borrador antes de encolar`);
  }

  const boss = await getBoss();
  // Encolamos ANTES de transicionar el estado: si send() falla, el periodo
  // se queda en `borrador` en vez de quedar `liquidando` huérfano sin job.
  const jobDatos: DatosJobLiquidacion = { empresaId, periodoId, usuarioId };
  const jobId = await boss.send(COLA_LIQUIDACION, jobDatos);
  if (!jobId) {
    throw new Error("pg-boss no aceptó el job — encolado devolvió null");
  }

  await conAuditoria(usuarioId, (tx) =>
    actualizarPeriodoConVersion(tx, periodoId, periodo.version, {
      estado: "liquidando",
      jobId,
      progreso: 0,
      erroresLiquidacion: Prisma.DbNull,
    })
  );

  return { jobId };
}

/** Estado mínimo para el polling desde la UI — solo lo necesario para
 * pintar la barra de progreso y saber cuándo parar. */
export async function obtenerEstadoLiquidacion(empresaId: number, periodoId: number) {
  const periodo = await prisma.periodoNomina.findFirst({
    where: { id: periodoId, empresaId },
    select: {
      id: true,
      estado: true,
      progreso: true,
      jobId: true,
      erroresLiquidacion: true,
      version: true,
    },
  });
  if (!periodo) throw new Error("Periodo no encontrado");
  return periodo;
}

export function listarRecibos(empresaId: number, periodoId?: number) {
  return prisma.reciboPago.findMany({
    where: { periodo: { empresaId }, ...(periodoId ? { periodoId } : {}) },
    include: { empleado: true, contratista: true },
    orderBy: { liquidadoEn: "desc" },
  });
}

export async function revertirABorrador(empresaId: number, periodoId: number, usuarioId: string | null = null) {
  const periodo = await obtenerPeriodo(empresaId, periodoId);
  // Permite revertir desde cualquier estado terminal — incluidos los nuevos
  // `liquidado_con_rechazos` (para corregir data y reintentar) y `fallido`
  // (para reencolar). No permite desde `liquidando` (job en vuelo) ni
  // `borrador` (nada que revertir) ni `pagado` (ya se ejecutó el pago).
  const revertibles = new Set(["liquidado", "liquidado_con_rechazos", "fallido"]);
  if (!revertibles.has(periodo.estado)) {
    throw new Error(`El periodo está en estado "${periodo.estado}" y no puede revertirse a borrador`);
  }

  await conAuditoria(usuarioId, async (tx) => {
    await tx.reciboPago.deleteMany({ where: { periodoId } });
    await actualizarPeriodoConVersion(tx, periodoId, periodo.version, {
      estado: "borrador",
      jobId: null,
      progreso: 0,
      erroresLiquidacion: Prisma.DbNull,
    });
  });
}
