import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// CRUD de sedes (SDD §15, pilar 1). Solo admin_empresa lo puede tocar.
// Todo scoped por empresaId en código — RLS es defensa adicional (SDD §05).

export function listarSedes(empresaId: number) {
  return prisma.sede.findMany({
    where: { empresaId },
    orderBy: { nombre: "asc" },
    include: { _count: { select: { empleados: true, analistas: true } } },
  });
}

export class ErrorConflictoSede extends Error {}

export async function crearSede(empresaId: number, nombre: string) {
  try {
    return await prisma.sede.create({ data: { empresaId, nombre } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ErrorConflictoSede(`Ya existe una sede llamada "${nombre}" en tu empresa.`);
    }
    throw err;
  }
}

export async function eliminarSede(empresaId: number, sedeId: number) {
  const sede = await prisma.sede.findFirst({ where: { id: sedeId, empresaId } });
  if (!sede) throw new Error("Sede no encontrada");
  // Deja los empleados sin sede en vez de bloquear el borrado — sin sede es
  // válido (empresa chica). La eliminación no se propaga a recibos porque
  // Empleado.sedeId no lo referencia (el snapshot ya está persistido).
  await prisma.$transaction(async (tx) => {
    await tx.empleado.updateMany({ where: { sedeId, empresaId }, data: { sedeId: null } });
    await tx.usuarioSede.deleteMany({ where: { sedeId } });
    await tx.sede.delete({ where: { id: sedeId } });
  });
}

// Asignación de staff empresarial a una empresa + sedes (SDD §15, pilar 1).
// Contrato: la cuenta destino DEBE existir en Supabase (se registró por su
// cuenta vía /login). El admin no crea usuarios — solo los liga a su empresa
// con un rol y opcionalmente restringe su alcance por sedes.
export class ErrorAsignacionStaff extends Error {}

export async function asignarStaff(
  empresaId: number,
  datos: { email: string; rol: "analista_rrhh" | "auditor"; sedeIds: number[] }
) {
  const usuario = await prisma.usuario.findUnique({ where: { email: datos.email.toLowerCase() } });
  if (!usuario) {
    throw new ErrorAsignacionStaff(
      `No hay una cuenta registrada con "${datos.email}". Pide a la persona que se registre primero vía /login.`
    );
  }
  if (usuario.empresaId !== null && usuario.empresaId !== empresaId) {
    throw new ErrorAsignacionStaff(
      `La cuenta "${datos.email}" ya está vinculada a otra empresa — no se puede reasignar desde aquí.`
    );
  }
  if (datos.sedeIds.length > 0) {
    const sedes = await prisma.sede.count({ where: { id: { in: datos.sedeIds }, empresaId } });
    if (sedes !== datos.sedeIds.length) {
      throw new ErrorAsignacionStaff("Alguna de las sedes seleccionadas no pertenece a tu empresa.");
    }
  }
  return prisma.$transaction(async (tx) => {
    const perfil = await tx.usuario.update({
      where: { id: usuario.id },
      data: { rol: datos.rol, empresaId },
    });
    await tx.usuarioSede.deleteMany({ where: { usuarioId: usuario.id } });
    if (datos.sedeIds.length > 0) {
      await tx.usuarioSede.createMany({
        data: datos.sedeIds.map((sedeId) => ({ usuarioId: usuario.id, sedeId })),
      });
    }
    return perfil;
  });
}

// Lista el staff empresarial (analistas/auditores) con sus sedes asignadas.
export async function listarStaff(empresaId: number) {
  const staff = await prisma.usuario.findMany({
    where: { empresaId, rol: { in: ["analista_rrhh", "auditor"] } },
    select: {
      id: true,
      email: true,
      nombre: true,
      rol: true,
      sedesAsignadas: { select: { sedeId: true } },
    },
    orderBy: { nombre: "asc" },
  });
  return staff.map((s) => ({ ...s, sedeIds: s.sedesAsignadas.map((a) => a.sedeId) }));
}

export async function quitarStaff(empresaId: number, usuarioId: string) {
  const usuario = await prisma.usuario.findFirst({
    where: { id: usuarioId, empresaId, rol: { in: ["analista_rrhh", "auditor"] } },
  });
  if (!usuario) throw new Error("Usuario staff no encontrado en tu empresa");
  await prisma.$transaction(async (tx) => {
    await tx.usuarioSede.deleteMany({ where: { usuarioId } });
    await tx.usuario.update({ where: { id: usuarioId }, data: { empresaId: null, rol: "individual" } });
  });
}
