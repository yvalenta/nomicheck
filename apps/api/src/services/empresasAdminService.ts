import { prisma } from "../lib/prisma.js";

// Vista de solo lectura para admin_plataforma: listar quién usa NomiCheck,
// quién la administra (admins con id, para poder reasignar/quitar) y si la
// empresa está activa o suspendida.
export async function listarEmpresasAdmin() {
  const empresas = await prisma.empresa.findMany({
    orderBy: { creadoEn: "desc" },
    include: {
      _count: { select: { empleados: true, contratistas: true } },
      usuarios: {
        where: { rol: "admin_empresa" },
        select: { id: true, nombre: true, email: true },
      },
    },
  });

  return empresas.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    nit: e.nit,
    sector: e.sector,
    creadoEn: e.creadoEn,
    activa: e.activa,
    colaboradores: e._count.empleados,
    contratistas: e._count.contratistas,
    admins: e.usuarios,
  }));
}

// Suspender bloquea de verdad el acceso (403 en requiereAuth, ver
// middleware/auth.ts) para admin_empresa y colaboradores de esta empresa —
// admin_plataforma no depende de empresaId así que nunca se bloquea a sí
// mismo. Reactivar es el mismo update con activa=true.
export async function cambiarEstadoEmpresa(empresaId: number, activa: boolean) {
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) throw new Error("Empresa no encontrada");
  return prisma.empresa.update({ where: { id: empresaId }, data: { activa } });
}
