import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

// La UI del wizard los usa para pre-marcar festivos como descanso; el motor
// vuelve a aplicarlos server-side en el cálculo (la UI es solo presentación).
export async function listarFestivos(_req: Request, res: Response) {
  const festivos = await prisma.festivo.findMany({ orderBy: { fecha: "asc" } });
  res.json(festivos.map((f) => ({ fecha: f.fecha, nombre: f.nombre })));
}
