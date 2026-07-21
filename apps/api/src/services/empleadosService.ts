import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { empleadoSchema, empleadoUpdateSchema, retiroSchema } from "../validation/empresa.js";
import type { z } from "zod";

// Todo query filtrada por empresaId en código — RLS es la defensa adicional,
// no la única (SDD.md §05, doble capa de autorización).
// `sedes` = scoping por sede del analista_rrhh (SDD §15, pilar 1). null =
// sin scoping (admin_empresa/auditor/analista sin sedes) — ver auth.ts.
export function listarEmpleados(empresaId: number, sedes: number[] | null = null) {
  return prisma.empleado.findMany({
    where: { empresaId, ...(sedes ? { sedeId: { in: sedes } } : {}) },
    orderBy: { nombre: "asc" },
  });
}

// Verifica que un empleado exista, sea de la empresa y — si el usuario es
// un analista_rrhh con sedes — que caiga dentro de sus sedes asignadas.
// Cambio de bloque: analistas escoped no pueden tocar empleados fuera de
// su alcance.
async function empleadoAccesible(empresaId: number, empleadoId: number, sedes: number[] | null) {
  const empleado = await prisma.empleado.findFirst({ where: { id: empleadoId, empresaId } });
  if (!empleado) throw new Error("Empleado no encontrado");
  if (sedes && (empleado.sedeId === null || !sedes.includes(empleado.sedeId))) {
    throw new Error("Este colaborador está fuera de las sedes asignadas a tu usuario");
  }
  return empleado;
}

export async function crearEmpleado(empresaId: number, datos: z.infer<typeof empleadoSchema>) {
  try {
    return await prisma.empleado.create({ data: { ...datos, empresaId } });
  } catch (err) {
    // @@unique([empresaId, documento]) — incluye retirados: el documento de
    // un empleado retirado sigue reservado (su historial de nómina sigue
    // ligado a él), así que reintentar con el mismo documento debe fallar
    // como conflicto explícito, no como un 500 sin manejar.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ErrorConflicto(`Ya existe un colaborador con el documento "${datos.documento}" en tu empresa.`);
    }
    throw err;
  }
}

export async function actualizarEmpleado(
  empresaId: number,
  empleadoId: number,
  datos: z.infer<typeof empleadoUpdateSchema>,
  sedes: number[] | null = null
) {
  await empleadoAccesible(empresaId, empleadoId, sedes);
  return prisma.empleado.update({ where: { id: empleadoId }, data: datos });
}

// El borrado físico solo procede si el empleado no tiene NINGÚN historial
// de nómina (caso "creado por error"): los registros de nómina deben
// conservarse legalmente, así que con historial el camino es "retirar"
// (soft-retire). Los FK Restrict del schema son la red de seguridad final.
export class ErrorConflicto extends Error {}

export async function eliminarEmpleado(empresaId: number, empleadoId: number, sedes: number[] | null = null) {
  await empleadoAccesible(empresaId, empleadoId, sedes);

  const [recibos, turnos] = await Promise.all([
    prisma.reciboPago.count({ where: { empleadoId } }),
    prisma.turno.count({ where: { empleadoId } }),
  ]);
  if (recibos + turnos > 0) {
    throw new ErrorConflicto(
      "El empleado tiene historial de nómina (recibos o turnos registrados) y no puede eliminarse: los registros de nómina deben conservarse. Usa 'Retirar' para desactivarlo conservando el historial."
    );
  }
  return prisma.empleado.delete({ where: { id: empleadoId } });
}

// Marca el retiro: el empleado deja de aparecer en periodos futuros
// (liquidarPeriodo solo toma `activo: true`) pero queda disponible para
// liquidacionFinalService.liquidarFinal — no se borra su historial.
export async function retirarEmpleado(
  empresaId: number,
  empleadoId: number,
  datos: z.infer<typeof retiroSchema>,
  sedes: number[] | null = null
) {
  const empleado = await empleadoAccesible(empresaId, empleadoId, sedes);
  if (datos.fechaRetiro < empleado.fechaIngreso) {
    throw new Error("La fecha de retiro no puede ser anterior a la fecha de ingreso");
  }
  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.empleado.update({
      where: { id: empleadoId },
      data: { fechaRetiro: datos.fechaRetiro, activo: false },
    });
    // Si este empleado era la membresía activa de una cuenta, la cuenta queda
    // LIBRE (Usuario.empresaId = null) para poder ser invitada por otra empresa
    // — el Empleado retirado permanece con su usuarioId como historial.
    if (empleado.usuarioId) {
      await tx.usuario.updateMany({
        where: { id: empleado.usuarioId, empresaId },
        data: { empresaId: null },
      });
    }
    return actualizado;
  });
}
