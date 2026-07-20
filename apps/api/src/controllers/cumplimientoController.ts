import type { Request, Response } from "express";
import { calcularSemaforoCumplimiento } from "../services/cumplimientoService.js";

export async function cumplimiento(req: Request, res: Response) {
  try {
    res.json(await calcularSemaforoCumplimiento(req.usuario!.empresaId!));
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Error de cálculo" });
  }
}
