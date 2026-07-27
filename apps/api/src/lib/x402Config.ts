// Muro de pago x402 para los wrappers públicos.
//
// x402 es pedir-pagar-responder sobre HTTP: el cliente adjunta una
// autorización EIP-3009 firmada, el facilitador la verifica y la liquida
// on-chain en ~2 s. No hay escrow, no hay árbitro, no hay ventana de
// revisión — a diferencia de Execution Market, el pago es INMEDIATO Y FINAL.
//
// Consecuencia de diseño, y es la razón por la que estos endpoints firman su
// salida: si el pago no se puede disputar, lo único que protege al comprador
// es poder verificar la respuesta por su cuenta. Ver docs del sobre.
//
// APAGADO POR DEFECTO. Sin `X402_ACTIVO=true` esto no monta nada y los
// wrappers siguen siendo gratuitos exactamente como hoy. Así el código puede
// desplegarse sin cambiar el comportamiento de producción, y el muro se
// enciende con una variable de entorno cuando se decida.

/** Precio en unidades mínimas del token (USDC tiene 6 decimales). */
function aMicroUsdc(usd: number): string {
  return Math.round(usd * 1_000_000).toString();
}

export interface RedX402 {
  /** CAIP-2, que es lo que el facilitador espera en `network`. */
  caip2: string;
  /** Contrato del token. USDC nativo de Circle, nunca bridged. */
  asset: string;
  nombre: string;
}

export const BASE_MAINNET: RedX402 = {
  caip2: "eip155:8453",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  nombre: "base",
};

// Base Sepolia, para probar el flujo completo sin mover dinero real.
export const BASE_SEPOLIA: RedX402 = {
  caip2: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  nombre: "base-sepolia",
};

/**
 * Precio por endpoint. Se cobra POR PETICIÓN, no por servicio: el listing de
 * $2 en Execution Market era por un trabajo completo; acá cada llamada es un
 * comprobante. El catálogo del Bazaar se mueve entre $0,05 y $1,00, así que
 * arrancamos abajo — subir después es fácil, bajar quema.
 *
 * Solo POST. Los GET (`/schema/v1.json`, `/ejemplo`, `/publickey`,
 * `/parametros`, `/health`) quedan GRATIS a propósito: son los que permiten
 * integrar antes de pagar y verificar la firma después. Ponerles muro
 * rompería el producto — nadie puede comprobar una salida firmada si la llave
 * pública está detrás del mismo pago.
 */
export const PRECIOS_USD: Record<string, number> = {
  "/liquidar": 0.1,
  "/retencion": 0.1,
  "/verificar": 0.1,
  "/pago-onchain": 0.1,
  "/comprobante": 0.25, // cruza tres capas y hace una llamada RPC
};

/**
 * La wallet del executor de Execution Market, cuya clave privada estuvo
 * expuesta y cuya rotación sigue pendiente.
 *
 * NO puede ser `X402_PAY_TO`. Y la buena noticia es que no hace falta que lo
 * sea: `payTo` es una dirección que RECIBE: el `transferWithAuthorization` del
 * comprador manda el USDC ahí y nadie firma nada desde este servidor. Una
 * dirección de cobro no necesita su clave privada acá — solo la necesita quien
 * después quiera mover los fondos.
 *
 * Por eso encender el muro NO depende de rotar: basta una dirección nueva cuya
 * clave nunca haya tocado esta máquina. Mandar los cobros a la dirección
 * comprometida sí sería grave, porque en x402 el pago es directo y final: quien
 * tenga la clave se lleva el saldo y no hay escrow del que rescatarlo.
 */
export const WALLET_COMPROMETIDA = "0x5bdad1d8641d8fd71efaddf38a2e0b9854ad05b8";

/**
 * Descripción publicada en el 402 y en el catálogo del Bazaar.
 *
 * ASCII a propósito, y no por gusto: el middleware serializa la respuesta v2
 * con `btoa`, que solo habla Latin-1. Un guion largo (U+2014) en la
 * descripción tira `InvalidCharacterError` y el endpoint contesta 500 en vez
 * de 402 — probado contra el facilitador real. Los acentos no revientan pero
 * salen mal decodificados del otro lado, así que el catálogo va en inglés,
 * que además es el idioma del resto del Bazaar. `soloAscii` lo sujeta.
 */
export const DESCRIPCIONES: Record<string, string> = {
  "/liquidar":
    "NomiCheck payroll liquidation (Colombia). Ed25519-signed output with the legal-rules hash and the date they were verified.",
  "/retencion":
    "NomiCheck withholding-tax calculation (Colombia, E.T. art. 383/392). Ed25519-signed output with the legal-rules hash and the date they were verified.",
  "/verificar":
    "NomiCheck batch verification. Ed25519-signed output with the legal-rules hash and the date they were verified.",
  "/pago-onchain":
    "NomiCheck on-chain payment batch (EIP-681 links + Safe batch). Ed25519-signed output with the legal-rules hash and the date they were verified.",
  "/comprobante":
    "NomiCheck payment receipt: cross-checks the liquidation, the frozen FX snapshot and the on-chain transfer. Ed25519-signed output with the legal-rules hash and the date they were verified.",
};

/** Lo que `btoa` puede serializar sin romperse. */
export function soloAscii(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7E]*$/.test(s);
}

export interface ConfigX402 {
  activo: boolean;
  facilitatorURL: string;
  red: RedX402;
  /** Wallet que cobra. En x402 el pago es directo: no hay escrow del que rescatarlo. */
  payTo: string;
  origenPublico: string;
}

export function leerConfigX402(): ConfigX402 {
  const red = process.env.X402_RED === "base-sepolia" ? BASE_SEPOLIA : BASE_MAINNET;
  return {
    activo: process.env.X402_ACTIVO === "true",
    facilitatorURL:
      process.env.X402_FACILITATOR ?? "https://facilitator.ultravioletadao.xyz",
    red,
    payTo: process.env.X402_PAY_TO ?? "",
    origenPublico: (
      process.env.NOMICHECK_PUBLIC_ORIGIN ?? "https://nomicheck.ynt.codes"
    ).replace(/\/+$/, ""),
  };
}

/**
 * Construye el `accepts` que el middleware publica en la respuesta 402.
 * Es también, campo por campo, lo que hay que mandarle a
 * `POST /discovery/register` del facilitador para aparecer en el Bazaar.
 */
export function requisitosDePago(cfg: ConfigX402, ruta: string) {
  const usd = PRECIOS_USD[ruta];
  if (usd === undefined) throw new Error(`x402: no hay precio definido para ${ruta}`);

  return {
    scheme: "exact" as const,
    network: cfg.red.caip2,
    asset: cfg.red.asset,
    maxAmountRequired: aMicroUsdc(usd),
    payTo: cfg.payTo,
    resource: `${cfg.origenPublico}/api/batch${ruta}`,
    description: DESCRIPCIONES[ruta],
    mimeType: "application/json",
    maxTimeoutSeconds: 30,
  };
}

/** Rutas con muro, en el orden en que se montan. */
export const RUTAS_CON_MURO = Object.keys(PRECIOS_USD);

/**
 * Motivos por los que la configuración no está lista. Vacío = lista.
 * Se comprueba al arrancar y no en la primera petición: un muro de pago mal
 * configurado que falla recién cuando llega un comprador es peor que uno que
 * no arranca.
 */
export function problemasDeConfig(cfg: ConfigX402): string[] {
  const p: string[] = [];
  if (!cfg.activo) return p;
  if (!/^0x[0-9a-fA-F]{40}$/.test(cfg.payTo)) {
    p.push("X402_PAY_TO no es una dirección EVM válida");
  } else if (cfg.payTo.toLowerCase() === WALLET_COMPROMETIDA) {
    // Comparación en minúsculas: EIP-55 es checksum de mayúsculas, así que la
    // misma dirección se escribe de dos formas y un `===` crudo deja pasar una.
    p.push(
      "X402_PAY_TO es la wallet del executor, cuya clave está expuesta y sin rotar. " +
        "Usá una dirección de cobro nueva: payTo solo recibe, su clave privada " +
        "no hace falta en este servidor.",
    );
  }
  if (!/^https:\/\//.test(cfg.facilitatorURL)) {
    p.push("X402_FACILITATOR debe ser https");
  }
  return p;
}
