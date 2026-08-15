// `/api/batch/pricing`: qué cuesta cada cosa, y **por qué**.
//
// ── Por qué un endpoint y no una tabla en el README ────────────────────────
//
// La idea es prestada de describe.net, que publica un `/pricing` donde cada
// tarifa viene con su defensa escrita: *"un monitor no puede pagar para
// averiguar si estás vivo"*, *"una API cuya documentación cuesta plata no la
// integra nadie"*. Leerlo deja claro dónde está la línea entre lo gratis y lo
// pagado, y —más importante— que la línea fue pensada.
//
// Nosotros teníamos el mismo razonamiento en comentarios de código y en el
// vault, o sea en ningún lugar que un comprador pueda leer. El precio estaba
// publicado; el criterio no.
//
// ── Se genera del código, como todo lo que se publica acá ──────────────────
//
// Los importes salen de `PRECIOS_USD`, la misma constante con la que el muro
// cobra. Un documento de precios escrito a mano miente el día que alguien toca
// la tabla — y de todos los documentos que este servicio publica, ese es el
// peor para mentir.
import { origenPublico } from "../lib/pagosConfig.js";
import { PRECIOS_USD, RUTAS_CON_MURO } from "../lib/x402Config.js";

// El porqué de cada ruta paga. La clave es la MISMA de `PRECIOS_USD`: si se
// agrega una ruta con precio y sin motivo, la guarda de abajo lo nombra.
const PORQUE_SE_COBRA: Record<string, string> = {
  "/verificar":
    "Recalcula cada línea legal de forma independiente al comprobante y la contrasta " +
    "con la norma que la rige. Es el trabajo, y por eso es lo que se cobra — pero a " +
    "precio fijo: JAMÁS según lo que se encuentre. Un verificador que gana más cuando " +
    "halla más no es un verificador, es alguien con un incentivo.",
  "/liquidar":
    "Liquidación de nómina completa por lote. Cobra por cómputo, no por hallazgo.",
  "/retencion":
    "Retención en la fuente: depuración, tabla y UVT vigentes por empleado.",
  "/pago-onchain":
    "Verifica un pago on-chain contra la cadena y lo cruza con el comprobante.",
  "/comprobante":
    "Cuesta más que el resto porque cruza tres capas y hace una llamada RPC a la " +
    "cadena. El precio sigue al costo real, no a lo que el dato vale para quien lo pide.",
};

// Lo gratis, y por qué lo es. Esta lista es la que hace honesta a la otra:
// sin ella, "tenemos endpoints gratis" es una frase de marketing.
const GRATIS: { ruta: string; porque: string }[] = [
  {
    ruta: "/verificar/prechequeo",
    porque:
      "LA PROMESA QUE ESTE SERVICIO NO PUEDE ROMPER: si tu comprobante está limpio, " +
      "te enterás gratis y no pagás nunca. Corre el mismo motor que el informe y dice " +
      "cuántos comprobantes traen algo y cuánto pesa —nunca qué línea ni qué norma—. " +
      "Cobrar por descubrir si hay un problema convertiría al verificador en alguien " +
      "interesado en que lo haya.",
  },
  {
    ruta: "/health",
    porque:
      "Un monitor no puede pagar para averiguar si el servicio está vivo. Y es la " +
      "respuesta que más se necesita justo cuando algo anda mal.",
  },
  {
    ruta: "/pricing",
    porque:
      "Cobrar la lista de precios haría que averiguar cuánto cuesta algo costara algo.",
  },
  {
    ruta: "/quickstart",
    porque:
      "Es la puerta: qué es, qué es gratis, cómo se paga y qué NO hace. Una puerta " +
      "con peaje no la cruza nadie.",
  },
  {
    ruta: "/openapi.json y /schema/v1.json",
    porque:
      "El contrato es el manual de uso, no el producto. Una API cuya documentación " +
      "cuesta plata no la integra nadie.",
  },
  {
    ruta: "/ejemplo",
    porque:
      "Un input real con su output exacto, para que el cliente se pruebe contra algo " +
      "antes de gastar. Sin esto, la primera compra es a ciegas.",
  },
  {
    ruta: "/publickey",
    porque:
      "La llave con la que se comprueba TODO lo que emitimos. Cobrarla sería cobrar " +
      "por la posibilidad de auditarnos, que es exactamente lo contrario de lo que " +
      "este servicio dice ser.",
  },
  {
    ruta: "/parametros",
    porque:
      "Los valores legales vigentes son públicos: los publica el Estado, no nosotros. " +
      "Cobrar por repetirlos sería cobrar por un dato ajeno.",
  },
];

export function construirPricing() {
  const base = origenPublico();

  return {
    pricingVersion: "nomicheck-pricing/v1",
    canonical: `${base}/api/batch/pricing`,
    moneda: "USDC",
    redes: ["base", "avalanche"],
    comoSePaga:
      "x402: el endpoint responde 402 con el reto, el cliente firma una autorización " +
      "EIP-3009 y reintenta con el header X-PAYMENT. Sin cuenta, sin API key, sin " +
      "registro. El pago es inmediato y final.",

    // La regla que ordena toda la tabla, dicha antes que los números.
    reglaDeIncentivos:
      "El precio es el mismo con un hallazgo o con veinte. JAMÁS se cobra según lo " +
      "que se encuentra: el pre-chequeo dice gratis si hay algo, y el informe cuesta " +
      "lo mismo en cualquier caso.",

    // Y la que se aprendió pagando: validar es gratis, siempre.
    validarNoSeCobra:
      "Un cuerpo mal formado se rechaza con 400 ANTES de liquidar el pago. En x402 el " +
      "pago es final, así que cobrar por un typo del cliente sería quedarse con plata " +
      "por un error que ni siquiera llegó a costarnos cómputo.",

    gratis: GRATIS.map((g) => ({
      ruta: `/api/batch${g.ruta}`,
      precioUsd: 0,
      porque: g.porque,
    })),

    pagado: RUTAS_CON_MURO.map((ruta) => ({
      ruta: `/api/batch${ruta}`,
      precioUsd: PRECIOS_USD[ruta],
      metodo: "POST",
      porque: PORQUE_SE_COBRA[ruta] ?? "(sin motivo declarado — es una omisión, no un secreto)",
    })),
  };
}

/**
 * Rutas que cobran sin motivo publicado. Vacío = todas lo declaran.
 *
 * Un precio sin defensa escrita es el que nadie revisa: se pone una vez y se
 * queda. Esto lo vigila una prueba, no una intención.
 */
export function rutasPagasSinPorque(): string[] {
  return RUTAS_CON_MURO.filter((r) => !PORQUE_SE_COBRA[r]);
}
