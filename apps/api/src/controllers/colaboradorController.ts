import type { Request, Response } from "express";
import { crearReporteSchema } from "../validation/discrepancia.js";
import { listarRecibosPropios, reportarDiscrepancia } from "../services/colaboradorService.js";

// requiereRol("colaborador") ya garantiza req.usuario.rol, pero solo
// requiereAuth adjunta empleadoId — si el Usuario nunca quedó linkeado a
// un Empleado (dato inconsistente), 403 explícito en vez de listar vacío
// en silencio.
function empleadoIdOrFail(req: Request, res: Response): number | undefined {
  if (!req.usuario!.empleadoId) {
    res.status(403).json({ error: "Tu cuenta no está vinculada a ningún colaborador" });
    return undefined;
  }
  return req.usuario!.empleadoId;
}

export async function misRecibos(req: Request, res: Response) {
  const empleadoId = empleadoIdOrFail(req, res);
  if (empleadoId === undefined) return;
  res.json(await listarRecibosPropios(empleadoId));
}

export async function reportar(req: Request, res: Response) {
  const empleadoId = empleadoIdOrFail(req, res);
  if (empleadoId === undefined) return;

  const parseo = crearReporteSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const reporte = await reportarDiscrepancia(empleadoId, req.usuario!.id, Number(req.params.id), parseo.data);
    res.status(201).json(reporte);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "No se pudo reportar" });
  }
}
