import type { Request, Response } from "express";
import { empleadoSchema, empleadoUpdateSchema } from "../validation/empresa.js";
import { actualizarEmpleado, crearEmpleado, listarEmpleados } from "../services/empleadosService.js";

export async function listar(req: Request, res: Response) {
  const empleados = await listarEmpleados(req.usuario!.empresaId!);
  res.json(empleados);
}

export async function crear(req: Request, res: Response) {
  const parseo = empleadoSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  const empleado = await crearEmpleado(req.usuario!.empresaId!, parseo.data);
  res.status(201).json(empleado);
}

export async function actualizar(req: Request, res: Response) {
  const parseo = empleadoUpdateSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const empleado = await actualizarEmpleado(req.usuario!.empresaId!, Number(req.params.id), parseo.data);
    res.json(empleado);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "No encontrado" });
  }
}
