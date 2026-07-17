import { z } from "zod";

export const crearReporteSchema = z.object({
  tipo: z.enum(["pago_de_mas", "pago_de_menos", "concepto_faltante"]),
  detalle: z.string().min(1),
});

export const responderReporteSchema = z.object({
  estado: z.enum(["en_revision", "resuelto"]),
  respuestaEmpresa: z.string().min(1),
});
