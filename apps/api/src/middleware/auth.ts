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

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Sesión inválida o expirada" });
    return;
  }

  const perfil = await prisma.usuario.findUnique({ where: { id: data.user.id }, include: { empleado: true } });
  if (!perfil) {
    res.status(403).json({ error: "El usuario no tiene un perfil en NomiCheck" });
    return;
  }

  req.usuario = {
    id: perfil.id,
    nombre: perfil.nombre,
    rol: perfil.rol,
    empresaId: perfil.empresaId,
    empleadoId: perfil.empleado?.id ?? null,
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
