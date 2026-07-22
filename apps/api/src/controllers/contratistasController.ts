import type { Request, Response } from "express";
import { contratistaSchema, contratistaUpdateSchema } from "../validation/empresa.js";
import {
  actualizarContratista,
  crearContratista,
  eliminarContratista,
  listarContratistas,
} from "../services/contratistasService.js";
import { ErrorConflicto } from "../services/empleadosService.js";
import { booleanoOpt, paginacionDeQuery, stringOpt } from "../lib/paginacion.js";

export async function listar(req: Request, res: Response) {
  const pag = paginacionDeQuery(req, 25);
  res.json(await listarContratistas(req.usuario!.empresaId!, {
    ...pag,
    q: stringOpt(req.query.q),
    activo: booleanoOpt(req.query.activo),
  }));
}

export async function crear(req: Request, res: Response) {
  const parseo = contratistaSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  const contratista = await crearContratista(req.usuario!.empresaId!, parseo.data);
  res.status(201).json(contratista);
}

export async function eliminar(req: Request, res: Response) {
  try {
    await eliminarContratista(req.usuario!.empresaId!, Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(404).json({ error: err instanceof Error ? err.message : "No encontrado" });
  }
}

export async function actualizar(req: Request, res: Response) {
  const parseo = contratistaUpdateSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const contratista = await actualizarContratista(req.usuario!.empresaId!, Number(req.params.id), parseo.data);
    res.json(contratista);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "No encontrado" });
  }
}
