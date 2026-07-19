import { z } from "zod";
import { fecha, horaHHmm } from "./comunes.js";

export const periodoSchema = z
  .object({ fechaInicio: fecha, fechaFin: fecha })
  .refine((p) => p.fechaInicio <= p.fechaFin, { message: "fechaInicio debe ser anterior a fechaFin" });

// Editar fechas de un periodo ya creado exige la nota (rastro de auditoría
// de por qué se corrigió) — no es un campo opcional como en el alta.
export const editarPeriodoSchema = z
  .object({ fechaInicio: fecha, fechaFin: fecha, nota: z.string().min(1, "Escribe el motivo de la edición") })
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

// El PUT reemplaza qué empleados quedan incluidos en el periodo, mismo
// patrón de "reemplazo completo" que turnosSchema.
export const empleadosPeriodoSchema = z.array(z.number().int().positive());
