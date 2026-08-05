import { z } from "zod";
import { CATALOGO_REGLAS_LEGALES } from "@pv/reglas";
import { fecha } from "./comunes.js";

const CLAVES_VALIDAS = CATALOGO_REGLAS_LEGALES.map((c) => c.clave) as [string, ...string[]];

export const nuevaReglaSchema = z.object({
  clave: z.enum(CLAVES_VALIDAS),
  // `nonnegative` y NO `positive`: el cero es un valor legítimo del catálogo
  // real — `pago_onchain_prima_pct` vale 0 en la semilla, y una prima del 0%
  // es una política válida, no un dato faltante. Un piso en `> 0` habría
  // roto el catálogo vigente al primer intento de editarlo.
  //
  // Lo que sí no puede pasar es el negativo: era `z.number()` a secas, así que
  // un SMLMV de -5 entraba al catálogo y el servicio invalidaba el cache para
  // servirlo de inmediato. Ninguna de las claves de este catálogo —salarios,
  // auxilios, porcentajes de aporte, divisores de jornada, topes— admite un
  // valor bajo cero; un divisor negativo, además, invierte el signo de cada
  // hora calculada.
  valor: z.number().nonnegative("El valor de una regla legal no puede ser negativo"),
  vigenteDesde: fecha,
  fuente: z.string().optional(),
});

export const nuevoFestivoSchema = z.object({
  fecha,
  nombre: z.string().min(1),
});
