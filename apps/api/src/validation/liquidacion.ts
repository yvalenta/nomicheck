import { z } from "zod";

// Registro de una cuenta individual (persona que verifica su propia nómina y
// quiere guardar su historial). A diferencia del registro de empresa, no crea
// ninguna Empresa — solo la cuenta.
export const registroIndividualSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  nombre: z.string().min(1),
});

// Payload para guardar una liquidación. `resultado` es un snapshot del
// ResultadoNomina del motor: no revalidamos toda su forma (la produjo nuestro
// propio backend en /nomina/calcular), pero exigimos los campos que
// denormalizamos para poder listar el historial sin parsear el JSON.
export const guardarLiquidacionSchema = z.object({
  resultado: z
    .object({
      netoEsperado: z.number(),
      periodoDesde: z.string().optional(),
      periodoHasta: z.string().optional(),
    })
    .passthrough(),
  netoRecibido: z.number().optional(),
});
