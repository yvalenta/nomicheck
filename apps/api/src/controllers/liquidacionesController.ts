import type { Request, Response } from "express";
import { guardarLiquidacionSchema } from "../validation/liquidacion.js";
import { guardarLiquidacion, listarLiquidaciones } from "../services/liquidacionesService.js";

// Historial personal: requiereAuth ya adjuntó req.usuario (cualquier rol con
// perfil). El scoping es por req.usuario.id — nunca se lee/escribe de otro.
export async function crear(req: Request, res: Response) {
  const parseo = guardarLiquidacionSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const liquidacion = await guardarLiquidacion(req.usuario!.id, parseo.data);
    res.status(201).json(liquidacion);
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo guardar la liquidación" });
  }
}

export async function listar(req: Request, res: Response) {
  res.json(await listarLiquidaciones(req.usuario!.id));
}
