import { prisma } from "../lib/prisma.js";
import type { empleadoSchema, empleadoUpdateSchema, retiroSchema } from "../validation/empresa.js";
import type { z } from "zod";

// Todo query filtrada por empresaId en código — RLS es la defensa adicional,
// no la única (SDD.md §05, doble capa de autorización).
export function listarEmpleados(empresaId: number) {
  return prisma.empleado.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } });
}

export function crearEmpleado(empresaId: number, datos: z.infer<typeof empleadoSchema>) {
  return prisma.empleado.create({ data: { ...datos, empresaId } });
}

export async function actualizarEmpleado(
  empresaId: number,
  empleadoId: number,
  datos: z.infer<typeof empleadoUpdateSchema>
) {
  const empleado = await prisma.empleado.findFirst({ where: { id: empleadoId, empresaId } });
  if (!empleado) throw new Error("Empleado no encontrado");
  return prisma.empleado.update({ where: { id: empleadoId }, data: datos });
}

// Marca el retiro: el empleado deja de aparecer en periodos futuros
// (liquidarPeriodo solo toma `activo: true`) pero queda disponible para
// liquidacionFinalService.liquidarFinal — no se borra su historial.
export async function retirarEmpleado(
  empresaId: number,
  empleadoId: number,
  datos: z.infer<typeof retiroSchema>
) {
  const empleado = await prisma.empleado.findFirst({ where: { id: empleadoId, empresaId } });
  if (!empleado) throw new Error("Empleado no encontrado");
  if (datos.fechaRetiro < empleado.fechaIngreso) {
    throw new Error("La fecha de retiro no puede ser anterior a la fecha de ingreso");
  }
  return prisma.empleado.update({
    where: { id: empleadoId },
    data: { fechaRetiro: datos.fechaRetiro, activo: false },
  });
}
