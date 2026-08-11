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

/**
 * Avalanche Fuji — la testnet de la casa de Ultravioleta, donde vive el multisig
 * del DAO y de donde van a venir sus agentes. Se agrega en TESTNET primero: si
 * anunciamos una red con el dominio EIP-712 equivocado, el comprador firma, el
 * facilitador rechaza, y el error aparece del lado del comprador — que no sabe
 * cuál de los dos está mal. Mismo modo de falla que ya nos mordió con ERC-8128.
 *
 * El dominio NO se copió de otra red: se leyó de la cadena y se VERIFICÓ
 * recomputando el `DOMAIN_SEPARATOR` (2026-08-10, RPC público de Fuji):
 *
 *   name()      "USD Coin"        version()  "2"
 *   on-chain    0xfe9fa105a0e9629446730e544caa6b8d05d8d4fc93451750dc50e2ddd6d374b3
 *   recomputado con esos valores + chainId 43113 + este contrato → IDÉNTICO
 *
 * Y la comprobación valió: Base Sepolia dice `"USDC"` donde Fuji dice
 * `"USD Coin"`. Copiar el dominio de una testnet a otra habría roto la firma
 * sin que nada lo avisara hasta el primer pago.
 */
export const AVALANCHE_FUJI: RedX402 = {
  caip2: "eip155:43113",
  // El USDC que el facilitador de Ultravioleta declara en `/supported` para
  // esta red — comprobado contra su endpoint, no elegido por nosotros.
  asset: "0x5425890298aed601595a70AB815c96711a31Bc65",
  nombre: "avalanche-fuji",
  eip712: { name: "USD Coin", version: "2" },
};

/**
 * Avalanche C-Chain — la chain madre de Ultravioleta, donde vive el multisig del
 * DAO. Es la red que hace que sus agentes puedan pagarnos sin puentear nada.
 *
 * Mismo tratamiento que Fuji: el dominio se leyó de la cadena y se VERIFICÓ
 * recomputando el `DOMAIN_SEPARATOR` (2026-08-10, RPC público de Avalanche):
 *
 *   name()   "USD Coin"   version()  "2"   decimals()  6   symbol()  "USDC"
 *   on-chain     0xbbea200329a938bc3438984a49cb0732e66d66d7bd59c127abacc1710e77f7b3
 *   recomputado con esos valores + chainId 43114 + este contrato → IDÉNTICO
 *
 * La dirección es el USDC NATIVO de Circle en Avalanche, no el bridged
 * (`USDC.e`, 0xA7D7...). Son dos contratos distintos con el mismo símbolo, y
 * anunciar el equivocado hace que el comprador firme sobre un token que el
 * facilitador no liquida.
 */
export const AVALANCHE_MAINNET: RedX402 = {
  caip2: "eip155:43114",
  asset: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  nombre: "avalanche",
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
 * Las redes que se pueden anunciar, por el nombre que usa `X402_RED`.
 *
 * El nombre de la clave es el mismo `nombre` de la red, y no por casualidad: es
 * el que el facilitador de Ultravioleta espera en v1, así que tener dos listas
 * sería justo el lugar donde desincronizarse. `redPorNombre` lo sujeta.
 */
export const REDES_X402: Record<string, RedX402> = {
  base: BASE_MAINNET,
  avalanche: AVALANCHE_MAINNET,
  "base-sepolia": BASE_SEPOLIA,
  "avalanche-fuji": AVALANCHE_FUJI,
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

/**
 * Las redes que el facilitador de CDP puede liquidar, MEDIDO contra su
 * documentación el 2026-08-11 (docs.cdp.coinbase.com/x402/network-support):
 * Base, Base Sepolia, Polygon, Arbitrum, World y Solana. Avalanche NO está.
 *
 * Es una lista escrita a mano sobre un hecho ajeno, y eso tiene costo — puede
 * quedarse vieja. Se acepta el costo porque el modo de falla contrario es peor
 * y es INVISIBLE: anunciar en `accepts` una red que el facilitador rechaza no
 * da error de arranque ni de 402 — da compradores que firman, settles que
 * mueren, y una pérdida que se lee como "nadie quiso comprar". Si CDP agrega
 * una red, esta lista se actualiza midiendo, no suponiendo.
 */
export const REDES_QUE_CDP_LIQUIDA = new Set([
  "eip155:8453",
  "eip155:84532",
  "eip155:137",
  "eip155:42161",
  "eip155:480",
  "eip155:4801",
]);

export interface ConfigX402 {
  activo: boolean;
  facilitatorURL: string;
  /**
   * Facilitador por nombre de red, cuando una red NO va por el default.
   * Sale de `X402_FACILITATOR_<NOMBRE>` (el nombre de la red en mayúsculas,
   * `-` → `_`): `X402_FACILITATOR_AVALANCHE=https://facilitator.ultravioletadao.xyz`.
   *
   * Existe porque producción cobra Base por CDP —ahí vive el catálogo del
   * Bazaar— y CDP no liquida Avalanche. Un solo facilitador para todas las
   * redes obligaría a elegir entre el catálogo y la chain de Ultravioleta.
   */
  facilitadoresPorRed: Record<string, string>;
  /**
   * Las redes en las que se acepta pago, en el orden en que se anuncian. Nunca
   * vacío: sin `X402_RED` queda `[BASE_MAINNET]`, que es el comportamiento que
   * había cuando esto era un solo campo.
   *
   * El comprador elige UNA del `accepts` y paga en esa. El orden importa poco
   * para un cliente correcto, pero los que no miran la lista toman la primera.
   */
  redes: RedX402[];
  /** Nombres de `X402_RED` que no corresponden a ninguna red conocida. */
  redesInvalidas: string[];
  /** Wallet que cobra. En x402 el pago es directo: no hay escrow del que rescatarlo. */
  payTo: string;
  origenPublico: string;
}

/**
 * `X402_RED` acepta una lista separada por comas: `base,avalanche`.
 *
 * Los nombres desconocidos NO se descartan en silencio — se guardan y
 * `problemasDeConfig` los convierte en un fallo de arranque. Un typo que hace
 * que el muro anuncie una red menos es invisible desde acá: el 402 se sigue
 * viendo perfecto, solo que sin la red por la que alguien iba a pagar.
 */
export function leerConfigX402(): ConfigX402 {
  const pedidas = (process.env.X402_RED ?? "base")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  const redes: RedX402[] = [];
  const redesInvalidas: string[] = [];
  for (const nombre of pedidas) {
    const red = REDES_X402[nombre];
    if (red === undefined) {
      redesInvalidas.push(nombre);
    } else if (!redes.some((r) => r.caip2 === red.caip2)) {
      // Repetir una red duplicaría su entrada en `accepts`, y un comprador que
      // ve la misma red dos veces no tiene forma de saber cuál es la buena.
      redes.push(red);
    }
  }

  const definitivas = redes.length > 0 ? redes : [BASE_MAINNET];

  // `X402_FACILITATOR_AVALANCHE`, `X402_FACILITATOR_BASE_SEPOLIA`, etc. Solo se
  // leen las de redes configuradas: una variable huérfana de una red que no se
  // anuncia no debe cambiar nada en silencio.
  const facilitadoresPorRed: Record<string, string> = {};
  for (const red of definitivas) {
    const valor = process.env[`X402_FACILITATOR_${red.nombre.toUpperCase().replace(/-/g, "_")}`];
    if (valor !== undefined && valor.length > 0) facilitadoresPorRed[red.nombre] = valor;
  }

  return {
    activo: process.env.X402_ACTIVO === "true",
    facilitatorURL:
      process.env.X402_FACILITATOR ?? "https://facilitator.ultravioletadao.xyz",
    facilitadoresPorRed,
    redes: definitivas,
    redesInvalidas,
    payTo: process.env.X402_PAY_TO ?? "",
    origenPublico: (
      process.env.NOMICHECK_PUBLIC_ORIGIN ?? "https://nomicheck.ynt.codes"
    ).replace(/\/+$/, ""),
  };
}

/** El facilitador que liquida una red concreta: su override, o el default. */
export function facilitadorDe(cfg: ConfigX402, red: RedX402): string {
  return cfg.facilitadoresPorRed[red.nombre] ?? cfg.facilitatorURL;
}

/**
 * La red que corresponde a un CAIP-2, entre las configuradas.
 *
 * Existe por el punto más delicado del multired: cuando el facilitador habla v1
 * hay que traducirle el CAIP-2 a su nombre de red, y esa traducción tiene que
 * salir de lo que el COMPRADOR declaró haber pagado, no de una red fija. Con una
 * sola red daba igual; con dos, resolver mal significa decirle al facilitador
 * "esto se pagó en Base" sobre un pago hecho en Avalanche.
 */
export function redPorCaip2(cfg: ConfigX402, caip2: unknown): RedX402 | undefined {
  if (typeof caip2 !== "string") return undefined;
  return cfg.redes.find((r) => r.caip2 === caip2 || r.nombre === caip2);
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
export function requisitoDePago(cfg: ConfigX402, ruta: string, red: RedX402) {
  const usd = PRECIOS_USD[ruta];
  if (usd === undefined) throw new Error(`x402: no hay precio definido para ${ruta}`);

  return {
    scheme: "exact" as const,
    network: red.caip2,
    asset: red.asset,
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
    //
    // Con multired esto se vuelve MÁS crítico, no menos: `name` cambia entre
    // redes —Base Sepolia dice "USDC" donde las otras tres dicen "USD Coin"— y
    // entra al dominio EIP-712. Un `extra` copiado entre entradas produce una
    // firma que el token rechaza, sin error de configuración de por medio.
    extra: {
      ...red.eip712,
      assetTransferMethod: "eip3009",
    },
  };
}

/**
 * El `accepts` completo: una entrada por red configurada.
 *
 * Devuelve un array porque eso es lo que x402 anuncia — el comprador elige una.
 * Antes devolvía un objeto solo y quien llamaba lo envolvía en `[...]`, que
 * escondía la decisión de cuántas redes hay en el sitio equivocado.
 */
export function requisitosDePago(cfg: ConfigX402, ruta: string) {
  return cfg.redes.map((red) => requisitoDePago(cfg, ruta, red));
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
  if (cfg.redesInvalidas.length > 0) {
    // Se revienta en vez de anunciar una red menos: un typo en `X402_RED` deja
    // un 402 impecable al que simplemente le falta la red por la que alguien
    // iba a pagar, y eso no se nota desde acá jamás.
    p.push(
      `X402_RED nombra redes desconocidas: ${cfg.redesInvalidas.join(", ")}. ` +
        `Las conocidas son: ${Object.keys(REDES_X402).join(", ")}`,
    );
  }
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
  for (const [nombre, url] of Object.entries(cfg.facilitadoresPorRed)) {
    if (!/^https:\/\//.test(url)) {
      p.push(`X402_FACILITATOR_${nombre.toUpperCase().replace(/-/g, "_")} debe ser https`);
    }
  }
  // La guarda que motivó los facilitadores por red: una red ruteada a CDP que
  // CDP no liquida no falla acá — falla cuando un comprador ya firmó, y desde
  // este lado se ve como "nadie quiso comprar". Reventar al arrancar nombrando
  // el arreglo es la única versión visible de ese error.
  for (const red of cfg.redes) {
    const url = facilitadorDe(cfg, red);
    const host = ((): string => {
      try {
        return new URL(url).host;
      } catch {
        return "";
      }
    })();
    if (host === "api.cdp.coinbase.com" && !REDES_QUE_CDP_LIQUIDA.has(red.caip2)) {
      p.push(
        `la red ${red.nombre} (${red.caip2}) está ruteada al facilitador de CDP, que no la ` +
          `liquida (medido 2026-08-11). Declarale un facilitador propio: ` +
          `X402_FACILITATOR_${red.nombre.toUpperCase().replace(/-/g, "_")}=https://...`,
      );
    }
  }
  return p;
}
