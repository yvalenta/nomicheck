import type { Request, Response } from "express";
import { calcularLiquidacionPilaPeriodo } from "../services/pilaService.js";

export async function pilaPeriodo(req: Request, res: Response) {
  const periodoId = Number(req.params.id);
  const exonerado = req.query.exonerado !== "false";
  try {
    res.json(await calcularLiquidacionPilaPeriodo(req.usuario!.empresaId!, periodoId, exonerado));
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Error de cálculo" });
  }
}
