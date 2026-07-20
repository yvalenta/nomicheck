import type { Request, Response } from "express";
import { cambiarEstadoEmpresa, listarEmpresasAdmin } from "../services/empresasAdminService.js";
import { cambiarEstadoEmpresaSchema, crearEmpresaAdminSchema, reasignarAdminSchema } from "../validation/empresa.js";
import { crearEmpresaConAdmin, quitarAdminEmpresa, reasignarAdminEmpresa } from "../services/authService.js";
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

export async function reasignarAdmin(req: Request, res: Response) {
  const empresaId = Number(req.params.id);
  const parseo = reasignarAdminSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const usuario = await reasignarAdminEmpresa(empresaId, parseo.data);
    res.status(201).json({ usuario });
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo reasignar el admin" });
  }
}

export async function quitarAdmin(req: Request, res: Response) {
  const empresaId = Number(req.params.id);
  const usuarioId = String(req.params.usuarioId);
  try {
    await quitarAdminEmpresa(empresaId, usuarioId);
    res.status(204).end();
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo quitar el admin" });
  }
}

export async function cambiarEstado(req: Request, res: Response) {
  const empresaId = Number(req.params.id);
  const parseo = cambiarEstadoEmpresaSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const empresa = await cambiarEstadoEmpresa(empresaId, parseo.data.activa);
    res.json({ empresa });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo cambiar el estado" });
  }
}
