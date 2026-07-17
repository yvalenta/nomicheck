import type { Request, Response } from "express";
import { nuevaReglaSchema, nuevoFestivoSchema } from "../validation/reglasAdmin.js";
import {
  crearFestivo,
  crearVigenciaRegla,
  eliminarFestivo,
  listarFestivosAdmin,
  listarReglasAgrupadas,
} from "../services/reglasAdminService.js";

export async function listarReglas(_req: Request, res: Response) {
  res.json(await listarReglasAgrupadas());
}

export async function crearRegla(req: Request, res: Response) {
  const parseo = nuevaReglaSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    res.status(201).json(await crearVigenciaRegla(parseo.data));
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo crear la vigencia" });
  }
}

export async function listarFestivosAdminHandler(_req: Request, res: Response) {
  res.json(await listarFestivosAdmin());
}

export async function crearFestivoHandler(req: Request, res: Response) {
  const parseo = nuevoFestivoSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  res.status(201).json(await crearFestivo(parseo.data));
}

export async function eliminarFestivoHandler(req: Request, res: Response) {
  await eliminarFestivo(Number(req.params.id));
  res.status(204).send();
}
