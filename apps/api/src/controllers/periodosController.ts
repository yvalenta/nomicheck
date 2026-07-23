import type { Request, Response } from "express";
import { editarPeriodoSchema, empleadosPeriodoSchema, periodoSchema, turnosSchema } from "../validation/periodo.js";
import {
  crearPeriodo,
  editarEmpleadosPeriodo,
  editarPeriodo,
  listarEmpleadosIncluidos,
  listarPeriodos,
  listarTurnos,
  reemplazarTurnos,
} from "../services/periodosService.js";
import {
  encolarLiquidacion,
  listarRecibos,
  obtenerEstadoLiquidacion,
  revertirABorrador,
} from "../services/liquidacionService.js";
import { ErrorConflicto } from "../services/empleadosService.js";
import { paginacionDeQuery, stringOpt } from "../lib/paginacion.js";
import { esEstadoPeriodo } from "../lib/estados.js";

export async function listar(req: Request, res: Response) {
  const pag = paginacionDeQuery(req, 25);
  const estado = stringOpt(req.query.estado);
  res.json(await listarPeriodos(req.usuario!.empresaId!, {
    ...pag,
    estado: esEstadoPeriodo(estado) ? estado : undefined,
    desde: stringOpt(req.query.desde),
    hasta: stringOpt(req.query.hasta),
  }));
}

export async function crear(req: Request, res: Response) {
  const parseo = periodoSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  const periodo = await crearPeriodo(req.usuario!.empresaId!, parseo.data);
  res.status(201).json(periodo);
}

export async function editar(req: Request, res: Response) {
  const parseo = editarPeriodoSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const periodo = await editarPeriodo(req.usuario!.empresaId!, Number(req.params.id), parseo.data);
    res.json(periodo);
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo editar el periodo" });
  }
}

export async function empleadosIncluidos(req: Request, res: Response) {
  const filas = await listarEmpleadosIncluidos(Number(req.params.id));
  res.json(filas.map((f) => f.empleadoId));
}

export async function guardarEmpleadosIncluidos(req: Request, res: Response) {
  const parseo = empleadosPeriodoSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    const filas = await editarEmpleadosPeriodo(req.usuario!.empresaId!, Number(req.params.id), parseo.data);
    res.json(filas.map((f) => f.empleadoId));
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo guardar" });
  }
}

export async function obtenerTurnos(req: Request, res: Response) {
  res.json(await listarTurnos(Number(req.params.id)));
}

export async function guardarTurnos(req: Request, res: Response) {
  const parseo = turnosSchema.safeParse(req.body);
  if (!parseo.success) {
    res.status(400).json({ error: "Datos inválidos", detalles: parseo.error.flatten() });
    return;
  }
  try {
    await reemplazarTurnos(req.usuario!.empresaId!, Number(req.params.id), parseo.data);
    res.json({ ok: true });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo guardar" });
  }
}

// SDD §15, escalabilidad enterprise: liquidar deja de ser síncrono. Responde
// 202 con { jobId } al encolar; el frontend hace polling a /estado hasta que
// estado sea terminal (liquidado, liquidado_con_rechazos o fallido).
export async function liquidar(req: Request, res: Response) {
  try {
    const { jobId } = await encolarLiquidacion(
      req.usuario!.empresaId!,
      Number(req.params.id),
      req.usuario!.id
    );
    res.status(202).json({ jobId, estado: "liquidando" });
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo encolar la liquidación" });
  }
}

export async function estadoLiquidacion(req: Request, res: Response) {
  try {
    res.json(await obtenerEstadoLiquidacion(req.usuario!.empresaId!, Number(req.params.id)));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Periodo no encontrado" });
  }
}

export async function revertir(req: Request, res: Response) {
  try {
    await revertirABorrador(req.usuario!.empresaId!, Number(req.params.id), req.usuario!.id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo revertir el periodo" });
  }
}

export async function recibos(req: Request, res: Response) {
  const periodoId = req.query.periodoId ? Number(req.query.periodoId) : undefined;
  res.json(await listarRecibos(req.usuario!.empresaId!, periodoId));
}
