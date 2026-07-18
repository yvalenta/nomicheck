import type { Request, Response } from "express";
import { crearReporteSchema } from "../validation/discrepancia.js";
import {
  aceptarInvitacion,
  listarInvitaciones,
  listarMisEmpresas,
  listarRecibosPropios,
  rechazarInvitacion,
  reportarDiscrepancia,
} from "../services/colaboradorService.js";
import { ErrorConflicto } from "../services/empleadosService.js";

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

// Invitaciones / historial NO usan empleadoIdOrFail: operan sobre la CUENTA
// (req.usuario.id), no sobre el empleado activo — un colaborador libre entre
// empresas no tiene empleado activo pero sí puede tener invitaciones.
export async function misInvitaciones(req: Request, res: Response) {
  res.json(await listarInvitaciones(req.usuario!.id));
}

export async function aceptar(req: Request, res: Response) {
  try {
    const empleado = await aceptarInvitacion(req.usuario!.id, Number(req.params.id));
    res.json(empleado);
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(404).json({ error: err instanceof Error ? err.message : "No se pudo aceptar la invitación" });
  }
}

export async function rechazar(req: Request, res: Response) {
  try {
    await rechazarInvitacion(req.usuario!.id, Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "No se pudo rechazar la invitación" });
  }
}

export async function misEmpresas(req: Request, res: Response) {
  res.json(await listarMisEmpresas(req.usuario!.id));
}
