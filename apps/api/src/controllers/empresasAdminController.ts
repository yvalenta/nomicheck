import type { Request, Response } from "express";
import { listarEmpresasAdmin } from "../services/empresasAdminService.js";

export async function listar(_req: Request, res: Response) {
  res.json(await listarEmpresasAdmin());
}
