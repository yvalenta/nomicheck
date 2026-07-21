import type { Request, Response } from "express";
import { listarAuditoria } from "../services/auditoriaService.js";

export async function listar(req: Request, res: Response) {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  res.json(await listarAuditoria(req.usuario!.empresaId!, limit));
}
