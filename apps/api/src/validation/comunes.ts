import { z } from "zod";
import { esFechaValida } from "@pv/reglas";

// Bloques compartidos entre schemas — antes duplicados por copy-paste en
// nomina.ts y periodo.ts.
export const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)")
  .refine(esFechaValida, "Fecha inexistente en el calendario");

export const horaHHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)");
