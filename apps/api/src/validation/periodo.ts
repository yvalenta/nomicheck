import { z } from "zod";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");
const horaHHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)");

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
