import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { RespuestaPaginada } from "../lib/paginacion.js";

export interface FiltrosAuditoria {
  q?: string;                                // busca en nombre/email del autor
  tabla?: "ReciboPago" | "PeriodoNomina" | "Empleado";
  accion?: "INSERT" | "UPDATE" | "DELETE";
  desde?: string;                            // ISO YYYY-MM-DD (inclusive)
  hasta?: string;                            // ISO YYYY-MM-DD (inclusive, +23:59:59)
  page: number;
  limit: number;
  skip: number;
}

export interface EntradaAuditoria {
  id: string;
  creadoEn: Date;
  tabla: string;
  registroId: string;
  accion: string;
  usuario: { id: string; nombre: string; email: string | null } | null;
  valoresAnteriores: Prisma.JsonValue | null;
  valoresNuevos: Prisma.JsonValue | null;
}

// Filtro de empresa para ReciboPago: la tabla no tiene empresaId (viene por
// join con PeriodoNomina), así que el trigger deja empresaId=NULL en esas
// filas. Aquí acotamos por los ids de periodo de la empresa en un IN(...) —
// resuelto una vez por request, no por fila.
async function idsRecibosDeEmpresa(empresaId: number): Promise<string[]> {
  // recibos ya persistidos (INSERT/UPDATE con periodoId en valoresNuevos)
  const vivos = await prisma.reciboPago.findMany({
    where: { periodo: { empresaId } },
    select: { id: true },
  });
  // recibos ya borrados: sacamos el periodoId del valor anterior — a través
  // de un query directo a AuditoriaCambio filtrando por tabla y por join en
  // el JSON. Postgres lo permite via ->> operator.
  const idsPeriodo = await prisma.periodoNomina.findMany({ where: { empresaId }, select: { id: true } });
  const setPeriodos = new Set(idsPeriodo.map((p) => p.id));
  const borrados = await prisma.$queryRawUnsafe<{ registroId: string; pid: number }[]>(
    `SELECT "registroId", COALESCE(("valoresAnteriores"->>'periodoId')::int, ("valoresNuevos"->>'periodoId')::int) AS pid
     FROM "AuditoriaCambio" WHERE tabla = 'ReciboPago'`
  );
  const borradosOk = borrados.filter((b) => setPeriodos.has(b.pid)).map((b) => b.registroId);
  return [...new Set([...vivos.map((r) => String(r.id)), ...borradosOk])];
}

export async function listarAuditoria(empresaId: number, f: FiltrosAuditoria): Promise<RespuestaPaginada<EntradaAuditoria>> {
  // Cláusula WHERE base — union entre (empresaId directo) y (tabla=ReciboPago con id ∈ recibos de la empresa)
  const where: Prisma.AuditoriaCambioWhereInput = {};
  const clausulasEmpresa: Prisma.AuditoriaCambioWhereInput[] = [{ empresaId }];

  if (f.tabla === undefined || f.tabla === "ReciboPago") {
    const idsRecibo = await idsRecibosDeEmpresa(empresaId);
    if (idsRecibo.length > 0) {
      clausulasEmpresa.push({ tabla: "ReciboPago", registroId: { in: idsRecibo } });
    }
  }
  where.OR = clausulasEmpresa;

  if (f.tabla) where.tabla = f.tabla;
  if (f.accion) where.accion = f.accion;

  if (f.desde || f.hasta) {
    where.creadoEn = {};
    if (f.desde) where.creadoEn.gte = new Date(`${f.desde}T00:00:00Z`);
    if (f.hasta) where.creadoEn.lte = new Date(`${f.hasta}T23:59:59.999Z`);
  }

  if (f.q) {
    // Filtro por autor: nombre o email del Usuario que hizo el cambio.
    const usuarios = await prisma.usuario.findMany({
      where: {
        OR: [
          { nombre: { contains: f.q, mode: "insensitive" } },
          { email: { contains: f.q, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    where.usuarioId = { in: usuarios.map((u) => u.id) };
  }

  const [total, filas] = await Promise.all([
    prisma.auditoriaCambio.count({ where }),
    prisma.auditoriaCambio.findMany({
      where,
      orderBy: { creadoEn: "desc" },
      skip: f.skip,
      take: f.limit,
    }),
  ]);

  const idsUsuario = [...new Set(filas.map((a) => a.usuarioId).filter((u): u is string => !!u))];
  const usuarios = idsUsuario.length > 0
    ? await prisma.usuario.findMany({ where: { id: { in: idsUsuario } }, select: { id: true, nombre: true, email: true } })
    : [];
  const mapaUsuarios = new Map(usuarios.map((u) => [u.id, u]));

  const items: EntradaAuditoria[] = filas.map((a) => ({
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

  return { items, total, page: f.page, limit: f.limit };
}
