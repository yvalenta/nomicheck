import { prisma } from "../lib/prisma.js";

// Vista de solo lectura para admin_plataforma: listar quién usa NomiCheck,
// quién la administra (admins con id, para poder reasignar/quitar) y si la
// empresa está activa o suspendida.
//
// LOS ADMINS SALEN DE `membresias`, NO DE `usuarios`. La relación `usuarios`
// es la del PUNTERO (`Usuario.empresaId` = la empresa activa de esa sesión) y
// `Usuario.rol` es el rol de CUENTA: los dos son globales, y desde que la
// pertenencia es N:M los dos mienten sobre quién administra qué. Con el filtro
// viejo la lista se equivocaba en los dos sentidos a la vez:
//
//   · Falso negativo — la admin de la empresa 3 que en este momento está
//     parada en la 9 (su otra empresa) no aparecía en 3: el panel decía
//     "Sin admin_empresa asignado" sobre una empresa que SÍ tiene admin, y el
//     admin_plataforma no tenía por dónde quitarla ni reasignarla.
//   · Falso positivo — quien tiene el puntero en la 9 con rol de cuenta
//     `admin_empresa` (porque es admin en la 3, de donde el puntero se movió
//     sin sincronizar el rol) aparecía como admin FANTASMA de la 9, aunque
//     ahí su membresía sea de `auditor`. Y el botón de papelera que se le
//     dibuja al lado siempre falla con 422, porque `quitarAdminEmpresa` sí
//     pregunta por la membresía del par: la pantalla ofrece una acción que la
//     API tiene prohibida.
//
// Preguntarle a la membresía alinea las tres cosas —lo que se ve, lo que el
// botón promete y lo que la baja valida— con la misma fuente que usa el rol
// efectivo de cada request (`requiereAuth`).
export async function listarEmpresasAdmin() {
  const empresas = await prisma.empresa.findMany({
    orderBy: { creadoEn: "desc" },
    include: {
      _count: { select: { empleados: true, contratistas: true } },
      membresias: {
        where: { rol: "admin_empresa" },
        // Del miembro solo id/nombre/email: el panel de plataforma no necesita
        // nada más, y todo lo que se seleccione de más viaja al navegador.
        select: { usuario: { select: { id: true, nombre: true, email: true } } },
        // Orden estable para que dos cargas de la misma pantalla no muestren a
        // los admins en distinto orden (la reasignación deja uno solo, pero el
        // backfill pudo dejar varios).
        orderBy: { usuario: { nombre: "asc" } },
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
    admins: e.membresias.map((m) => m.usuario),
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
