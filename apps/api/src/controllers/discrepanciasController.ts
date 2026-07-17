import type { Request, Response } from "express";
import { responderReporteSchema } from "../validation/discrepancia.js";
import { listarDiscrepancias, responderDiscrepancia } from "../services/discrepanciasService.js";

export async function listar(req: Request, res: Response) {
  res.json(await listarDiscrepancias(req.usuario!.empresaId!));
}

export async function responder(req: Request, res: Response) {
  const parseo = responderReporteSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const reporte = await responderDiscrepancia(req.usuario!.empresaId!, Number(req.params.id), parseo.data);
    res.json(reporte);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "No encontrado" });
  }
}
