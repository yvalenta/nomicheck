import type { Request, Response } from "express";
import { calcularIndemnizacion } from "@pv/reglas";
import { datosIndemnizacionSchema } from "../validation/indemnizacion.js";
import { obtenerReglasYFestivos } from "../services/nominaService.js";

export async function calcular(req: Request, res: Response) {
  const parseo = datosIndemnizacionSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }

  try {
    const { reglas } = await obtenerReglasYFestivos();
    const resultado = calcularIndemnizacion(parseo.data, reglas);
    res.json(resultado);
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Error de cálculo" });
  }
}
