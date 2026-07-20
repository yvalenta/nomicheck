import { prisma } from "../lib/prisma.js";

// Vista de solo lectura para admin_plataforma: hoy la plataforma no tiene
// ningún panel de gestión de empresas (solo administra reglas legales y
// festivos) — este es el primer paso, listar quién usa NomiCheck y quién
// la administra, sin crear/reasignar/suspender todavía.
export async function listarEmpresasAdmin() {
  const empresas = await prisma.empresa.findMany({
    orderBy: { creadoEn: "desc" },
    include: {
      _count: { select: { empleados: true, contratistas: true } },
      usuarios: {
        where: { rol: "admin_empresa" },
        select: { nombre: true, email: true },
      },
    },
  });

  return empresas.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    nit: e.nit,
    sector: e.sector,
    creadoEn: e.creadoEn,
    colaboradores: e._count.empleados,
    contratistas: e._count.contratistas,
    admins: e.usuarios,
  }));
}
