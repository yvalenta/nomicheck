import { prisma } from "../lib/prisma.js";

// Listado de la bitácora de cambios (SDD §15, pilar 1B). Filtra por
// empresa; ReciboPago no persiste empresaId directo (viene por join con
// PeriodoNomina) — el trigger deja empresaId null en esos registros y aquí
// los recuperamos por join en TS (segundo query) para no perder ese contexto.
export async function listarAuditoria(empresaId: number, limit = 100) {
  const directos = await prisma.auditoriaCambio.findMany({
    where: { OR: [{ empresaId }, { tabla: "ReciboPago" }] },
    orderBy: { creadoEn: "desc" },
    take: limit * 2, // sobre-lee para descartar ReciboPago ajenos tras el join
  });

  // Filtrar ReciboPago por empresa vía join manual (registroId → PeriodoNomina.empresaId).
  const idsRecibo = directos.filter((a) => a.tabla === "ReciboPago").map((a) => Number(a.registroId)).filter(Number.isFinite);
  let recibosOK = new Set<number>();
  if (idsRecibo.length > 0) {
    // Los recibos ya borrados no aparecen — usamos AuditoriaCambio anterior
    // (INSERT del recibo tiene periodoId en valoresNuevos, DELETE lo tiene
    // en valoresAnteriores). Estrategia simple: consultar recibos vivos
    // y aceptar los que sí existen; los ya borrados los aceptamos si su
    // valor anterior tiene periodoId apuntando a un periodo de la empresa.
    const vivos = await prisma.reciboPago.findMany({
      where: { id: { in: idsRecibo }, periodo: { empresaId } },
      select: { id: true },
    });
    recibosOK = new Set(vivos.map((r) => r.id));
    // Recibos borrados: revisar el valor anterior de cada entrada DELETE.
    const periodosEmpresa = await prisma.periodoNomina.findMany({ where: { empresaId }, select: { id: true } });
    const setPeriodos = new Set(periodosEmpresa.map((p) => p.id));
    for (const a of directos) {
      if (a.tabla !== "ReciboPago") continue;
      const rid = Number(a.registroId);
      if (recibosOK.has(rid)) continue;
      const snap = (a.valoresAnteriores ?? a.valoresNuevos) as { periodoId?: number } | null;
      if (snap?.periodoId && setPeriodos.has(snap.periodoId)) recibosOK.add(rid);
    }
  }

  const filtradas = directos.filter((a) => {
    if (a.tabla === "ReciboPago") return recibosOK.has(Number(a.registroId));
    return a.empresaId === empresaId;
  }).slice(0, limit);

  // Resolver el nombre del usuario en un solo query.
  const idsUsuario = [...new Set(filtradas.map((a) => a.usuarioId).filter((u): u is string => !!u))];
  const usuarios = idsUsuario.length > 0
    ? await prisma.usuario.findMany({ where: { id: { in: idsUsuario } }, select: { id: true, nombre: true, email: true } })
    : [];
  const mapaUsuarios = new Map(usuarios.map((u) => [u.id, u]));

  return filtradas.map((a) => ({
    id: String(a.id),
    creadoEn: a.creadoEn,
    tabla: a.tabla,
    registroId: a.registroId,
    accion: a.accion,
    usuario: a.usuarioId
      ? mapaUsuarios.get(a.usuarioId) ?? { id: a.usuarioId, nombre: "(cuenta eliminada)", email: null }
      : null,
    valoresAnteriores: a.valoresAnteriores,
    valoresNuevos: a.valoresNuevos,
  }));
}
