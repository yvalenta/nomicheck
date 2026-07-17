import { z } from "zod";
import { fecha, horaHHmm } from "./comunes.js";

export const periodoSchema = z
  .object({ fechaInicio: fecha, fechaFin: fecha })
  .refine((p) => p.fechaInicio <= p.fechaFin, { message: "fechaInicio debe ser anterior a fechaFin" });

export const turnoSchema = z.object({
  empleadoId: z.number().int().positive(),
  fecha,
  horaInicio: horaHHmm,
  horaFin: horaHHmm,
});

// El PUT reemplaza todos los turnos del periodo de una vez (la grilla se
// edita completa en la SPA, más simple que diffear altas/bajas).
export const turnosSchema = z.array(turnoSchema);
