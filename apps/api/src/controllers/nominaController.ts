import type { Request, Response } from "express";
import { datosNominaSchema } from "../validation/nomina.js";
import { calcularNomina } from "../services/nominaService.js";

export async function calcular(req: Request, res: Response) {
  const parseo = datosNominaSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }

  try {
    const resultado = await calcularNomina(parseo.data);
    res.json(resultado);
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Error de cálculo" });
  }
}
