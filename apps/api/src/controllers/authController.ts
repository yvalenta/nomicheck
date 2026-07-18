import type { Request, Response } from "express";
import { registroSchema, invitarSchema } from "../validation/empresa.js";
import { registrarEmpresa, invitarColaborador } from "../services/authService.js";
import { ErrorConflicto } from "../services/empleadosService.js";

export async function registro(req: Request, res: Response) {
  const parseo = registroSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const { usuario, empresa } = await registrarEmpresa(parseo.data);
    res.status(201).json({ usuario, empresa });
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo registrar" });
  }
}

export async function invitar(req: Request, res: Response) {
  const parseo = invitarSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Email inválido" });
    return;
  }
  const empleadoId = Number(req.params.id);
  try {
    const resultado = await invitarColaborador(empleadoId, parseo.data.email);
    res.status(201).json(resultado);
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo invitar" });
  }
}
