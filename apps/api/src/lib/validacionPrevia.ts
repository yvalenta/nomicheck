// Validar ANTES de cobrar. El orden importa y este archivo existe por eso.
//
// ── El bug que arregla, y de dónde salió ───────────────────────────────────
//
// El muro se monta antes del router, así que el pago se liquidaba y RECIÉN
// DESPUÉS el handler hacía su `safeParse`. Un comprador con una coma de más en
// su JSON pagaba y recibía un 400. En x402 el pago es inmediato y final: no hay
// reembolso, no hay escrow del que sacarlo. Pagó por su propio typo.
//
// Lo encontramos leyendo el manifiesto de otro servicio del mismo rubro, que
// publica sus debilidades conocidas y nombra esta exacta: "las solicitudes
// inválidas se cobran antes de validarse". La tenían escrita; nosotros la
// teníamos y no la sabíamos.
//
// ── Por qué esto NO contradice "cobrar antes de servir" ────────────────────
//
// Esa ley nació de un incidente real —el muro sirvió sin cobrar— y sigue
// intacta. Lo que cambia es dónde cae la validación:
//
//     antes:    cobrar → validar → ejecutar
//     ahora:    validar → cobrar → ejecutar → entregar
//
// **Validar no es servir.** No revela ningún resultado, no corre el motor, no
// toca la base y no cuesta nada que valga cobrar. Es lo único que separa "el
// cliente se equivocó" de "el cliente pagó por equivocarse".
//
// ── Qué NO hace ───────────────────────────────────────────────────────────
//
// No comprueba nada que dependa del cálculo, ni de la base, ni de reglas de
// negocio: solo la forma del cuerpo contra el mismo esquema que el handler va
// a aplicar después. Si el esquema pasa acá, pasa allá — y si algún día
// dejaran de ser el mismo, el comprador volvería a pagar por un 400.
import type { Request } from "express";
import type { ZodTypeAny } from "zod";
import { batchLiquidarSchema } from "../validation/batchPublico.js";
import { batchPagoOnchainSchema } from "../validation/batchPagoOnchain.js";
import { batchRetencionSchema } from "../validation/batchRetencion.js";
import { batchVerificacionSchema } from "../validation/batchVerificacion.js";
import { comprobanteSchema } from "../validation/comprobante.js";

// La clave es la MISMA que usa `PRECIOS_USD` para cobrar: si mañana se agrega
// una ruta paga sin su esquema acá, la guarda de abajo lo grita al arrancar en
// vez de dejar un endpoint cobrando sin validar.
const ESQUEMA_POR_RUTA: Record<string, ZodTypeAny> = {
  "/liquidar": batchLiquidarSchema,
  "/retencion": batchRetencionSchema,
  "/verificar": batchVerificacionSchema,
  "/pago-onchain": batchPagoOnchainSchema,
  "/comprobante": comprobanteSchema,
};

export type ProblemaDeEntrada = {
  error: "invalid_input";
  detalle: unknown;
  aviso: string;
};

/**
 * Devuelve el problema del cuerpo, o `null` si está bien formado.
 *
 * `null` significa "seguí, cobrale". Cualquier otra cosa significa "no le
 * cobres, decile qué está mal".
 */
export function problemaDeEntrada(
  rutaDePrecio: string,
  body: unknown
): ProblemaDeEntrada | null {
  const esquema = ESQUEMA_POR_RUTA[rutaDePrecio];
  // Sin esquema conocido no se inventa un veredicto: se deja pasar y valida el
  // handler, como siempre. Fallar acá cerraría una ruta paga por una omisión
  // nuestra, que es peor que el problema que este archivo arregla.
  if (!esquema) return null;

  const r = esquema.safeParse(body);
  if (r.success) return null;

  return {
    error: "invalid_input",
    detalle: r.error.flatten(),
    aviso:
      "Rechazado ANTES de cobrar: no se liquidó ningún pago. Corregí el cuerpo " +
      "y reintentá. El esquema está en /api/batch" +
      rutaDePrecio +
      "/schema/v1.json y hay un ejemplo real en /api/batch" +
      rutaDePrecio +
      "/ejemplo.",
  };
}

/**
 * Las rutas pagas que NO tienen esquema declarado acá.
 *
 * Se comprueba al arrancar, junto con el resto de la config del muro: una ruta
 * que cobra sin validación previa es exactamente el agujero que esto cierra, y
 * descubrirlo con el primer comprador enojado sale caro.
 */
export function rutasPagasSinEsquema(rutasDePrecio: string[]): string[] {
  return rutasDePrecio.filter((r) => !ESQUEMA_POR_RUTA[r]);
}

/** El cuerpo tal como lo dejó `express.json()`. */
export function cuerpoDe(req: Request): unknown {
  return req.body;
}
