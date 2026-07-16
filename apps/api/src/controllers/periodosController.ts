import type { Request, Response } from "express";
import { periodoSchema, turnosSchema } from "../validation/periodo.js";
import {
  crearPeriodo,
  listarPeriodos,
  listarTurnos,
  reemplazarTurnos,
} from "../services/periodosService.js";
import { liquidarPeriodo, listarRecibos } from "../services/liquidacionService.js";

export async function listar(req: Request, res: Response) {
  res.json(await listarPeriodos(req.usuario!.empresaId!));
}

export async function crear(req: Request, res: Response) {
  const parseo = periodoSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  const periodo = await crearPeriodo(req.usuario!.empresaId!, parseo.data);
  res.status(201).json(periodo);
}

export async function obtenerTurnos(req: Request, res: Response) {
  res.json(await listarTurnos(Number(req.params.id)));
}

export async function guardarTurnos(req: Request, res: Response) {
  const parseo = turnosSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    await reemplazarTurnos(req.usuario!.empresaId!, Number(req.params.id), parseo.data);
    res.json({ ok: true });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo guardar" });
  }
}

export async function liquidar(req: Request, res: Response) {
  try {
    const recibos = await liquidarPeriodo(req.usuario!.empresaId!, Number(req.params.id));
    res.json(recibos);
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo liquidar" });
  }
}

export async function recibos(req: Request, res: Response) {
  const periodoId = req.query.periodoId ? Number(req.query.periodoId) : undefined;
  res.json(await listarRecibos(req.usuario!.empresaId!, periodoId));
}
