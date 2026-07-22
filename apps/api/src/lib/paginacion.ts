import type { Request } from "express";

/** Shape uniforme de respuesta paginada para los listados de la app empresa
 * (SDD §15). El cliente calcula pageCount = ceil(total / limit) — no lo
 * mandamos redundante. `items` conserva el tipo del recurso listado. */
export interface RespuestaPaginada<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface OpcionesPaginacion {
  page: number;
  limit: number;
  skip: number;
}

/** Parse defensivo de ?page=&limit= — clamp de limit para no permitir que
 * el cliente pida 100.000 filas. page arranca en 1 (más natural en URLs). */
export function paginacionDeQuery(req: Request, limitDefault = 25, limitMax = 200): OpcionesPaginacion {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const limit = Math.min(limitMax, Math.max(1, Math.floor(Number(req.query.limit) || limitDefault)));
  return { page, limit, skip: (page - 1) * limit };
}

/** Interpretación permisiva de un valor string a booleano — para filtros
 * tipo ?activo=true / ?activo=1 / omitido = no filtrar. */
export function booleanoOpt(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).toLowerCase();
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  return undefined;
}

export function stringOpt(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}
