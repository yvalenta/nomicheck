import type { Request, Response } from "express";
import { empleadoSchema, empleadoUpdateSchema, retiroSchema } from "../validation/empresa.js";
import {
  actualizarEmpleado,
  crearEmpleado,
  eliminarEmpleado,
  ErrorConflicto,
  listarEmpleados,
  retirarEmpleado,
} from "../services/empleadosService.js";
import { liquidarFinal } from "../services/liquidacionFinalService.js";
import { sedesDelUsuario } from "../middleware/auth.js";

export async function listar(req: Request, res: Response) {
  const sedes = await sedesDelUsuario(req.usuario!);
  const empleados = await listarEmpleados(req.usuario!.empresaId!, sedes);
  res.json(empleados);
}

export async function crear(req: Request, res: Response) {
  const parseo = empleadoSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const empleado = await crearEmpleado(req.usuario!.empresaId!, parseo.data);
    res.status(201).json(empleado);
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo crear el colaborador" });
  }
}

export async function actualizar(req: Request, res: Response) {
  const parseo = empleadoUpdateSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const sedes = await sedesDelUsuario(req.usuario!);
    const empleado = await actualizarEmpleado(req.usuario!.empresaId!, Number(req.params.id), parseo.data, sedes);
    res.json(empleado);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "No encontrado" });
  }
}

export async function eliminar(req: Request, res: Response) {
  try {
    const sedes = await sedesDelUsuario(req.usuario!);
    await eliminarEmpleado(req.usuario!.empresaId!, Number(req.params.id), sedes);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(404).json({ error: err instanceof Error ? err.message : "No encontrado" });
  }
}

export async function retirar(req: Request, res: Response) {
  const parseo = retiroSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const sedes = await sedesDelUsuario(req.usuario!);
    const empleado = await retirarEmpleado(req.usuario!.empresaId!, Number(req.params.id), parseo.data, sedes);
    res.json(empleado);
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo retirar" });
  }
}

export async function liquidacionFinal(req: Request, res: Response) {
  try {
    const recibo = await liquidarFinal(req.usuario!.empresaId!, Number(req.params.id));
    res.json(recibo);
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo liquidar" });
  }
}
