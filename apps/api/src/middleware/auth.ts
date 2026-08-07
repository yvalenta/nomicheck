import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { prisma } from "../lib/prisma.js";

export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  rol: string;
  empresaId: number | null;
  /** Solo poblado para rol "colaborador" — Empleado.usuarioId → este Usuario. */
  empleadoId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

// Valida el JWT de Supabase Auth en cada request protegido y adjunta el
// perfil de dominio (Usuario) — nunca confía en el rol declarado por el
// cliente (SDD.md §08).
export async function requiereAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Falta el header Authorization" });
    return;
  }

  // `getClaims` verifica la firma del JWT LOCALMENTE contra el JWKS del
  // proyecto (ES256, cacheado por el cliente) — antes cada request protegido
  // pagaba una ida HTTP a Supabase Auth (`getUser`) solo para validar el
  // token. Si el token viniera firmado con la llave simétrica legacy, el SDK
  // cae solo al camino remoto, así que no hay tokens que antes pasaran y
  // ahora no. El trade-off real: una sesión revocada sigue siendo válida
  // hasta que expire el access token (~1h) — aceptable porque suspender
  // empresas (el único kill-switch del producto) se chequea abajo contra la
  // BD en cada request, igual que siempre.
  const { data, error } = await supabaseAdmin.auth.getClaims(token);
  const usuarioId = data?.claims.sub;
  if (error || !usuarioId) {
    res.status(401).json({ error: "Sesión inválida o expirada" });
    return;
  }

  // Las dos consultas solo dependen del id del token — en paralelo, un solo
  // round-trip a la base en vez de dos encadenados.
  //
  // usuarioId ya no es único (una cuenta puede tener varios Empleado:
  // historial + invitaciones pendientes). El empleado "actual" es el activo
  // y aceptado.
  const [perfil, empleadoActivo] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: usuarioId } }),
    prisma.empleado.findFirst({
      where: { usuarioId, activo: true, invitacionAceptadaEn: { not: null } },
      select: { id: true },
    }),
  ]);
  if (!perfil) {
    res.status(403).json({ error: "El usuario no tiene un perfil en NomiCheck" });
    return;
  }

  // Suspender una empresa (admin_plataforma) bloquea de verdad el acceso de
  // su admin_empresa y colaboradores — admin_plataforma nunca tiene
  // empresaId, así que jamás se bloquea a sí mismo (SDD.md §03 Módulo D).
  if (perfil.empresaId) {
    const empresa = await prisma.empresa.findUnique({
      where: { id: perfil.empresaId },
      select: { activa: true },
    });
    if (empresa && !empresa.activa) {
      res.status(403).json({ error: "Esta empresa está suspendida — contacta al soporte de NomiCheck." });
      return;
    }
  }

  req.usuario = {
    id: perfil.id,
    nombre: perfil.nombre,
    rol: perfil.rol,
    empresaId: perfil.empresaId,
    empleadoId: empleadoActivo?.id ?? null,
  };
  next();
}

export function requiereRol(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      res.status(403).json({ error: "No tienes permiso para esta acción" });
      return;
    }
    next();
  };
}

// SDD §15, pilar 1 — roles granulares dentro de una empresa.
// admin_empresa: todo. analista_rrhh: opera sobre su(s) sede(s) o toda la
// empresa si no le asignaron ninguna. auditor: SOLO lectura, cualquier
// escritura → 403 vía requiereEmpresaEdicion.
export const ROLES_EMPRESA = ["admin_empresa", "analista_rrhh", "auditor"] as const;
export const ROLES_EMPRESA_EDICION = ["admin_empresa", "analista_rrhh"] as const;

export const requiereEmpresaLectura = requiereRol(...ROLES_EMPRESA);
export const requiereEmpresaEdicion = requiereRol(...ROLES_EMPRESA_EDICION);

/** Sedes visibles para el usuario cuando se trata de un analista_rrhh. Null
 * = sin scoping (admin_empresa, auditor, o analista sin sedes asignadas —
 * por convención vacío = ve toda la empresa, útil en empresas chicas). */
export async function sedesDelUsuario(usuario: UsuarioAutenticado): Promise<number[] | null> {
  if (usuario.rol !== "analista_rrhh") return null;
  const filas = await prisma.usuarioSede.findMany({
    where: { usuarioId: usuario.id },
    select: { sedeId: true },
  });
  if (filas.length === 0) return null;
  return filas.map((f) => f.sedeId);
}
