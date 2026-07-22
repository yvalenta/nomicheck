import type { Request, Response } from "express";
import { listarAuditoria } from "../services/auditoriaService.js";
import { paginacionDeQuery, stringOpt } from "../lib/paginacion.js";

const TABLAS = new Set(["ReciboPago", "PeriodoNomina", "Empleado"]);
const ACCIONES = new Set(["INSERT", "UPDATE", "DELETE"]);

export async function listar(req: Request, res: Response) {
  const pag = paginacionDeQuery(req, 25);
  const tabla = stringOpt(req.query.tabla);
  const accion = stringOpt(req.query.accion);
  res.json(
    await listarAuditoria(req.usuario!.empresaId!, {
      ...pag,
      q: stringOpt(req.query.q),
      tabla: tabla && TABLAS.has(tabla) ? (tabla as "ReciboPago" | "PeriodoNomina" | "Empleado") : undefined,
      accion: accion && ACCIONES.has(accion) ? (accion as "INSERT" | "UPDATE" | "DELETE") : undefined,
      desde: stringOpt(req.query.desde),
      hasta: stringOpt(req.query.hasta),
    })
  );
}
