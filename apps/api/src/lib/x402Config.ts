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
import { EJEMPLO_RETENCION, EJEMPLO_VERIFICACION } from "./ejemplosBatch.js";

function aMicroUsdc(usd: number): string {
  return Math.round(usd * 1_000_000).toString();
}

/**
 * Dominio EIP-712 del token, que es lo que el comprador necesita para firmar el
 * `transferWithAuthorization`. Sale de la cadena (`name()` y `version()` del
 * contrato), no de la intuición: en Base mainnet el USDC se llama `"USD Coin"`
 * y en Base Sepolia se llama `"USDC"`. Copiar uno del otro produce una firma
 * con el dominio equivocado.
 */
export interface DominioEip712 {
  name: string;
  version: string;
}

export interface RedX402 {
  /** CAIP-2, que es lo que el facilitador espera en `network`. */
  caip2: string;
  /** Contrato del token. USDC nativo de Circle, nunca bridged. */
  asset: string;
  nombre: string;
  /** `name()`/`version()` del contrato de arriba, leídos de la cadena. */
  eip712: DominioEip712;
}

export const BASE_MAINNET: RedX402 = {
  caip2: "eip155:8453",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  nombre: "base",
  eip712: { name: "USD Coin", version: "2" },
};

// Base Sepolia, para probar el flujo completo sin mover dinero real.
export const BASE_SEPOLIA: RedX402 = {
  caip2: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  nombre: "base-sepolia",
  // OJO: acá dice "USDC", no "USD Coin". Medido con `eth_call` el 2026-07-31.
  eip712: { name: "USDC", version: "2" },
};

/**
 * Precio por endpoint. Se cobra POR PETICIÓN, no por servicio: el listing de
 * $2 en Execution Market era por un trabajo completo; acá cada llamada es un
 * comprobante. El catálogo del Bazaar se mueve entre $0,05 y $1,00, así que
 * arrancamos abajo — subir después es fácil, bajar quema.
 *
 * Precio de ESTRENO, decidido el 2026-07-31: por debajo del piso del catálogo a
 * propósito, para que la primera compra real cueste casi nada mientras se
 * comprueba que el riel entero funciona. La proporción 2,5× entre el
 * comprobante y los wrappers es la del diseño original.
 *
 * Solo POST. Los GET (`/schema/v1.json`, `/ejemplo`, `/publickey`,
 * `/parametros`, `/health`) quedan GRATIS a propósito: son los que permiten
 * integrar antes de pagar y verificar la firma después. Ponerles muro
 * rompería el producto — nadie puede comprobar una salida firmada si la llave
 * pública está detrás del mismo pago.
 *
 * `/liquidacion-final` TAMBIÉN queda gratis, y también a propósito. Se desplegó
 * el 2026-07-30, después de que se escribiera este muro, así que al principio su
 * ausencia acá era un olvido; el 2026-07-31 se decidió dejarla afuera y
 * convertirla en carnada de integración: es el cálculo más vistoso de los cinco
 * —cesantías, intereses, prima, vacaciones e indemnización, cada concepto desde
 * su propio corte— y probarlo sin pagar es lo que hace que alguien vuelva a
 * pagar por los otros cuatro.
 *
 * Está escrito acá, y sujetado por un test, porque un endpoint sin precio se lee
 * exactamente igual esté decidido o esté olvidado.
 */
export const PRECIOS_USD: Record<string, number> = {
  "/liquidar": 0.02,
  "/retencion": 0.02,
  "/verificar": 0.02,
  "/pago-onchain": 0.02,
  "/comprobante": 0.05, // cruza tres capas y hace una llamada RPC
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
 * Las rarezas de cada facilitador, que no son opcionales ni cosméticas: con la
 * combinación equivocada NINGÚN pago liquida, y el 402 se sigue viendo perfecto
 * desde acá. Todo esto está medido endpoint por endpoint el 2026-08-03.
 *
 * `traduceAV1` y `sintetizaAccepts` son remiendos con fecha de vencimiento: se
 * quitan el día que el facilitador de turno se arregle. `autenticaCdp` no — es
 * el contrato de CDP.
 */
export interface PerfilFacilitador {
  url: string;
  /** El `/settle` solo deserializa v1 aunque `/accepts` conteste v2. */
  traduceAV1: boolean;
  /** No existe `/accepts`: hay que responderlo nosotros. */
  sintetizaAccepts: boolean;
  /** Cada petición va firmada con un JWT Ed25519. */
  autenticaCdp: boolean;
  /** `x402Version` que el facilitador exige en el nivel superior del cuerpo. */
  versionEnCuerpo: 1 | 2;
}

/**
 * El perfil sale del host, no de una variable aparte: así no se pueden
 * desincronizar la URL y sus rarezas.
 *
 * **El default es el estándar**, sin remiendos. Un facilitador nuevo se trata
 * como v2 correcto hasta que se demuestre lo contrario; las excepciones se
 * nombran una por una. Al revés —"todo lo desconocido habla v1"— un facilitador
 * nuevo heredaría los defectos de Ultravioleta sin que nadie lo decidiera.
 */
export function perfilFacilitador(url: string): PerfilFacilitador {
  const host = ((): string => {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  })();

  if (host === "api.cdp.coinbase.com") {
    // CDP habla v2 con CAIP-2 y pide `x402Version: 2` arriba, que faremeter no
    // manda. No expone `/accepts`.
    return { url, traduceAV1: false, sintetizaAccepts: true, autenticaCdp: true, versionEnCuerpo: 2 };
  }
  if (host === "facilitator.ultravioletadao.xyz") {
    return { url, traduceAV1: true, sintetizaAccepts: false, autenticaCdp: false, versionEnCuerpo: 1 };
  }
  return { url, traduceAV1: false, sintetizaAccepts: false, autenticaCdp: false, versionEnCuerpo: 2 };
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
    // Sin esto NADIE PUEDE PAGAR, y el fallo es del otro lado: el comprador
    // arma el dominio EIP-712 con lo que encuentre acá, y si no encuentra nada
    // adivina. Nosotros seguimos viendo un 402 impecable.
    //
    // El facilitador de Ultravioleta NO lo agrega —medido contra `/accepts`, su
    // `extra` trae solo la lista `tokens`— pero sí FUSIONA el que le mandemos.
    // Todo el catálogo que leen los clientes publica estos dos campos.
    extra: {
      ...cfg.red.eip712,
      assetTransferMethod: "eip3009",
    },
  };
}

/**
 * Extensión `bazaar`: lo que hace que un recurso ENTRE al catálogo de Coinbase.
 *
 * No hay endpoint de registro. Un recurso se cataloga cuando el facilitador de
 * CDP **liquida un pago** para él y encuentra esta declaración; la aceptación
 * vuelve en el header `EXTENSION-RESPONSES`. O sea que la primera venta real es
 * el acto que nos lista, y no se puede comprobar antes.
 *
 * Va **solo para las rutas cuyo ejemplo servimos de verdad**. Las otras
 * quedarían con un contrato inventado por nadie, y publicarle a un agente una
 * forma que el endpoint rechaza es cobrarle un 400: paga primero y descubre
 * después. Cuando `/liquidar`, `/pago-onchain` y `/comprobante` tengan su
 * `/ejemplo`, entran acá y no antes.
 *
 * El ejemplo NO se copia: sale de `ejemplosBatch.ts`, el mismo que sirve
 * `GET /<ruta>/ejemplo`. CDP valida el ejemplo contra el schema de forma
 * ESTRICTA, así que dos copias divergentes = extensión rechazada.
 */
const EJEMPLOS_BAZAAR: Record<string, unknown> = {
  "/verificar": EJEMPLO_VERIFICACION,
  "/retencion": EJEMPLO_RETENCION,
};

export function extensionBazaar(ruta: string): Record<string, unknown> | undefined {
  const ejemplo = EJEMPLOS_BAZAAR[ruta];
  if (ejemplo === undefined) return undefined;

  return {
    discoverable: true,
    info: {
      input: { type: "http", method: "POST", bodyType: "json", body: ejemplo },
      output: { type: "json" },
    },
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        input: {
          type: "object",
          // `additionalProperties: false` es lo que hace que el schema sirva de
          // contrato: sin eso un agente puede mandar cualquier cosa y creer que
          // la declaramos.
          additionalProperties: false,
          required: ["type", "method", "body"],
          properties: {
            type: { type: "string", enum: ["http"] },
            method: { type: "string", enum: ["POST"] },
            bodyType: { type: "string", enum: ["json"] },
            body: {
              type: "object",
              required: ["version"],
              properties: {
                version: { type: "string", enum: ["1"] },
                buyer: {
                  type: "object",
                  properties: { noExternalLlm: { type: "boolean" } },
                },
              },
            },
          },
        },
      },
    },
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
