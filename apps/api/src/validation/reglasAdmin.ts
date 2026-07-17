import { z } from "zod";
import { CATALOGO_REGLAS_LEGALES } from "@pv/reglas";
import { fecha } from "./comunes.js";

const CLAVES_VALIDAS = CATALOGO_REGLAS_LEGALES.map((c) => c.clave) as [string, ...string[]];

export const nuevaReglaSchema = z.object({
  clave: z.enum(CLAVES_VALIDAS),
  valor: z.number(),
  vigenteDesde: fecha,
  fuente: z.string().optional(),
});

export const nuevoFestivoSchema = z.object({
  fecha,
  nombre: z.string().min(1),
});
