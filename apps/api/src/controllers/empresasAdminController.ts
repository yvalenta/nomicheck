import type { Request, Response } from "express";
import { listarEmpresasAdmin } from "../services/empresasAdminService.js";
import { crearEmpresaAdminSchema } from "../validation/empresa.js";
import { crearEmpresaConAdmin } from "../services/authService.js";
import { ErrorConflicto } from "../services/empleadosService.js";

export async function listar(_req: Request, res: Response) {
  res.json(await listarEmpresasAdmin());
}

export async function crear(req: Request, res: Response) {
  const parseo = crearEmpresaAdminSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const { empresa, usuario } = await crearEmpresaConAdmin(parseo.data);
    res.status(201).json({ empresa, usuario });
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo crear la empresa" });
  }
}
