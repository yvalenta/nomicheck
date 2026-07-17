import { z } from "zod";
import { fecha } from "./comunes.js";

const base = {
  salarioMensual: z.number().positive(),
  fechaTerminacion: fecha,
  conJustaCausa: z.boolean(),
};

const conTermino = z.object({
  ...base,
  tipoContrato: z.enum(["fijo", "obra_labor"]),
  fechaVencimientoPactada: fecha,
});

const indefinido = z.object({
  ...base,
  tipoContrato: z.enum(["indefinido", "tiempo_parcial"]),
  fechaIngreso: fecha,
});

export const datosIndemnizacionSchema = z.discriminatedUnion("tipoContrato", [
  conTermino.extend({ tipoContrato: z.literal("fijo") }),
  conTermino.extend({ tipoContrato: z.literal("obra_labor") }),
  indefinido.extend({ tipoContrato: z.literal("indefinido") }),
  indefinido.extend({ tipoContrato: z.literal("tiempo_parcial") }),
]);
