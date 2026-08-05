import { conAuditoria } from "../lib/auditoria.js";
import { acotadoAparte } from "../lib/alcance.js";
import { prisma } from "../lib/prisma.js";
import { ErrorConflicto } from "./empleadosService.js";
import type { crearReporteSchema } from "../validation/discrepancia.js";
import type { z } from "zod";

// Portal colaborador (Fase 7, SDD §11): un colaborador solo ve SUS propios
// recibos — filtro por empleadoId en código (defensa adicional a RLS).
export function listarRecibosPropios(empleadoId: number) {
  return prisma.reciboPago.findMany({
    // El dueño acá es la persona, no la empresa: `empleadoId` sale del Empleado
    // ligado a la sesión (`middleware/auth.ts`), no de la petición. Anclar por
    // empresa además sería mentir sobre quién manda en este endpoint.
    where: acotadoAparte({ empleadoId }, "empleadoId de la sesión del colaborador, no de la petición"),
    // empleado + empresa del periodo: solo para el encabezado del comprobante
    // imprimible (ComprobanteNomina) — no afecta el cálculo ni el scoping.
    include: {
      periodo: { include: { empresa: { select: { nombre: true } } } },
      empleado: { select: { nombre: true, documento: true } },
      reportes: true,
    },
    orderBy: { liquidadoEn: "desc" },
  });
}

export async function reportarDiscrepancia(
  empleadoId: number,
  colaboradorId: string,
  reciboId: number,
  datos: z.infer<typeof crearReporteSchema>
) {
  const recibo = await prisma.reciboPago.findFirst({
    where: acotadoAparte({ id: reciboId, empleadoId }, "empleadoId de la sesión del colaborador"),
  });
  if (!recibo) throw new Error("Recibo no encontrado");
  return prisma.reporteDiscrepancia.create({
    data: { reciboId, colaboradorId, tipo: datos.tipo, detalle: datos.detalle },
  });
}

// Invitaciones pendientes de la cuenta: Empleado ligado a ella pero aún sin
// aceptar (invitacionAceptadaEn = null). Es la "notificación" in-app.
export function listarInvitaciones(usuarioId: string) {
  return prisma.empleado.findMany({
    where: { usuarioId, invitacionAceptadaEn: null, activo: true },
    include: { empresa: { select: { nombre: true, sector: true } } },
    orderBy: { creadoEn: "desc" },
  });
}

// El colaborador acepta unirse: valida que la invitación sea suya y esté
// pendiente, y que no tenga ya otra empresa activa (backstop de la regla
// "una empresa activa a la vez", reforzada por el índice único parcial).
export async function aceptarInvitacion(usuarioId: string, empleadoId: number) {
  const empleado = await prisma.empleado.findFirst({
    where: { id: empleadoId, usuarioId, invitacionAceptadaEn: null, activo: true },
  });
  if (!empleado) throw new Error("Invitación no encontrada");

  const yaActiva = await prisma.empleado.findFirst({
    where: { usuarioId, activo: true, invitacionAceptadaEn: { not: null } },
  });
  if (yaActiva) {
    throw new ErrorConflicto("Ya perteneces a una empresa activa. Debes retirarte de ella antes de unirte a otra.");
  }

  // `conAuditoria` y no `prisma.$transaction` pelado: `Empleado` está vigilado
  // por el trigger inmutable (SDD §15, pilar 1B), que lee el autor de
  // `app.usuario_actual`. Sin el wrapper el cambio SÍ se registra, pero con
  // `usuarioId = NULL` — o sea que quedaba constancia de que alguien aceptó la
  // invitación y ninguna de quién. Una auditoría inmutable que no puede nombrar
  // al actor es media auditoría, y la mitad que falta es justo la que se le
  // pide cuando hace falta.
  //
  // El actor acá es la propia persona: acepta su invitación.
  return conAuditoria(usuarioId, async (tx) => {
    const actualizado = await tx.empleado.update({
      where: { id: empleadoId },
      data: { invitacionAceptadaEn: new Date() },
    });
    await tx.usuario.update({ where: { id: usuarioId }, data: { empresaId: empleado.empresaId } });
    return actualizado;
  });
}

// Rechaza la invitación: desliga el Empleado (usuarioId = null), la empresa lo
// vuelve a ver como "sin cuenta" y puede reinvitar a otra persona.
export async function rechazarInvitacion(usuarioId: string, empleadoId: number) {
  const empleado = await prisma.empleado.findFirst({
    where: { id: empleadoId, usuarioId, invitacionAceptadaEn: null, activo: true },
  });
  if (!empleado) throw new Error("Invitación no encontrada");
  // Mismo motivo que en `aceptarInvitacion`: sin el wrapper, el trigger deja
  // constancia del rechazo sin decir quién rechazó. Y acá duele más, porque el
  // update pone `usuarioId = null` — después del cambio, la fila ya no dice a
  // quién estaba ligada: si el rastro no guarda al actor, la información se
  // pierde del todo.
  return conAuditoria(usuarioId, (tx) =>
    tx.empleado.update({ where: { id: empleadoId }, data: { usuarioId: null } })
  );
}

// Historial de empresas de la cuenta: todos los Empleado ligados a ella
// (activos, pendientes y retirados), con un estado derivado para la UI.
export async function listarMisEmpresas(usuarioId: string) {
  const empleados = await prisma.empleado.findMany({
    where: { usuarioId },
    include: { empresa: { select: { nombre: true, sector: true } } },
    orderBy: { fechaIngreso: "desc" },
  });
  return empleados.map((e) => ({
    empleadoId: e.id,
    empresa: e.empresa.nombre,
    sector: e.empresa.sector,
    fechaIngreso: e.fechaIngreso,
    fechaRetiro: e.fechaRetiro,
    estado: !e.activo ? "retirada" : e.invitacionAceptadaEn ? "activa" : "pendiente",
  }));
}
