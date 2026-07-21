import type { Request, Response } from "express";
import { z } from "zod";
import {
  asignarStaff,
  crearSede,
  eliminarSede,
  ErrorAsignacionStaff,
  ErrorConflictoSede,
  listarSedes,
  listarStaff,
  quitarStaff,
} from "../services/sedesService.js";

const nombreSchema = z.object({ nombre: z.string().min(1).max(60) });
const staffSchema = z.object({
  email: z.string().email(),
  rol: z.enum(["analista_rrhh", "auditor"]),
  sedeIds: z.array(z.number().int().positive()).default([]),
});

export async function listar(req: Request, res: Response) {
  res.json(await listarSedes(req.usuario!.empresaId!));
}

export async function crear(req: Request, res: Response) {
  const parseo = nombreSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    res.status(201).json(await crearSede(req.usuario!.empresaId!, parseo.data.nombre));
  } catch (err) {
    if (err instanceof ErrorConflictoSede) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo crear la sede" });
  }
}

export async function eliminar(req: Request, res: Response) {
  try {
    await eliminarSede(req.usuario!.empresaId!, Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Sede no encontrada" });
  }
}

export async function listarStaffCtrl(req: Request, res: Response) {
  res.json(await listarStaff(req.usuario!.empresaId!));
}

export async function asignarStaffCtrl(req: Request, res: Response) {
  const parseo = staffSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    res.json(await asignarStaff(req.usuario!.empresaId!, parseo.data));
  } catch (err) {
    if (err instanceof ErrorAsignacionStaff) {
      res.status(422).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo asignar" });
  }
}

export async function quitarStaffCtrl(req: Request, res: Response) {
  try {
    await quitarStaff(req.usuario!.empresaId!, String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "No encontrado" });
  }
}
