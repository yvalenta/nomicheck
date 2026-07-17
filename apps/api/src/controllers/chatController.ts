import type { Request, Response } from "express";
import { chatExplicarSchema } from "../validation/chat.js";
import { explicarResultado } from "../services/chatService.js";

export async function explicar(req: Request, res: Response) {
  const parseo = chatExplicarSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const respuesta = await explicarResultado(parseo.data.resultado, parseo.data.pregunta, parseo.data.historial);
    res.json({ respuesta });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo generar la respuesta" });
  }
}
