import type { Request, Response } from "express";
import { z } from "zod";
import { actualizarEmpresa, datosEmpresa } from "../services/empresaService.js";

const datosSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  // El NIT es texto libre a propósito: acepta el formato real (con dígito de
  // verificación) y también un provisional de seed — es UNIQUE en la base.
  nit: z.string().trim().min(5).max(30),
  sector: z.string().trim().min(2).max(60),
});

export async function obtenerDatos(req: Request, res: Response) {
  const empresaId = req.usuario!.empresaId;
  if (!empresaId) {
    res.status(400).json({ error: "Tu cuenta no tiene una empresa activa" });
    return;
  }
  res.json(await datosEmpresa(empresaId));
}

export async function actualizarDatos(req: Request, res: Response) {
  const empresaId = req.usuario!.empresaId;
  if (!empresaId) {
    res.status(400).json({ error: "Tu cuenta no tiene una empresa activa" });
    return;
  }
  const parseo = datosSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Nombre, NIT y sector son obligatorios (revisa los largos)" });
    return;
  }
  try {
    res.json(await actualizarEmpresa(empresaId, req.usuario!.id, parseo.data));
  } catch (e) {
    // P2002 = el índice único del NIT: otra empresa ya lo tiene.
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      res.status(409).json({ error: "Ese NIT ya está registrado en otra empresa" });
      return;
    }
    throw e;
  }
}
