import type { Request, Response } from "express";
import { calcularCostosEmpresa } from "../services/costosService.js";

export async function costos(req: Request, res: Response) {
  // Default exonerado=true: la empresa pequeña contribuyente de renta es el
  // caso típico (Ley 1607 de 2012, art. 25); el toggle de la UI manda
  // ?exonerado=false para entidades no contribuyentes.
  const exonerado = req.query.exonerado !== "false";
  try {
    res.json(await calcularCostosEmpresa(req.usuario!.empresaId!, exonerado));
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Error de cálculo" });
  }
}
