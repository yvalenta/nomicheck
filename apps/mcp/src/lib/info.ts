// `nomicheck_info` — el resumen que un agente necesita ANTES de pagar.
//
// Junta tres lecturas y un cruce:
//
//   1. `openapi.json`     qué productos hay, qué cuesta cada uno (`x-x402`) y
//                         en qué redes se acepta pago (`redes`).
//   2. una sonda 402      el `payTo` REAL que produccion anuncia hoy.
//   3. el agent card      el `walletAddress` publicado como identidad.
//
// El cruce (2)↔(3) es el corazón de la herramienta, y existe por un modo de
// falla concreto: en x402 el pago es inmediato y final — sin escrow ni
// disputa. Un atacante que logre cambiar el `payTo` del 402 no rompe NADA
// visible: el servicio sigue verde, las firmas siguen verificando, y la plata
// de cada orden se va a otra parte. La única defensa del comprador es cruzar
// la oferta contra un ancla publicada en OTRO origen antes de firmar. Ese
// incidente ya está descrito como tal en la operación de NomiCheck; acá el
// cruce viene hecho para que ningún caller tenga que acordarse de hacerlo.
import {
  AGENT_CARD_URL,
  baseUrl,
  campo,
  mismaDireccion,
  pedirJson,
} from "./base.js";

export interface ProductoInfo {
  ruta: string;
  operationId: string | null;
  resumen: string | null;
  cobra: boolean;
  precioUsd: number | null;
  salidaCsv: boolean;
}

export interface RedInfo {
  red: string;
  asset: string;
  nombre: string;
}

export interface CrucePayTo {
  payToOferta: string | null;
  fuentePayTo: string | null;
  walletAgentCard: string | null;
  /** `null` = no se pudo medir (muro apagado o agent card caído), no "falló". */
  coinciden: boolean | null;
  veredicto: string;
}

export interface ResumenInfo {
  titulo: string | null;
  baseUrl: string;
  productos: ProductoInfo[];
  consultasGratis: { ruta: string; resumen: string | null }[];
  redes: RedInfo[];
  cruce: CrucePayTo;
  advertencia: string;
}

const ADVERTENCIA =
  "Antes de firmar un pago x402, cruzá SIEMPRE el `payTo` del `accepts` contra " +
  `el \`x-executor.walletAddress\` del agent card (${AGENT_CARD_URL}). ` +
  "El pago es directo y final: si el payTo fue sustituido, nada más se ve roto.";

/**
 * La sonda: un POST sin pago a `/retencion`, que con el muro encendido
 * contesta 402 ANTES de validar el body — por eso `{}` alcanza y no cuesta
 * nada. Es la única forma de leer el `payTo` que producción anuncia HOY: el
 * OpenAPI publica precios y redes en `x-x402`, pero no la wallet (medido el
 * 2026-08-11), y un payTo copiado a un documento estático sería justo la
 * clase de constante a mano que se desincroniza sin que nadie la relea.
 */
async function sondearPayTo(): Promise<{ payTo: string | null; fuente: string | null }> {
  const url = `${baseUrl()}/api/batch/retencion`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (r.status !== 402) {
    // Muro apagado: el POST llega al validador y contesta 400 por el `{}`.
    // No es un error de la sonda — es el dato "hoy no se cobra".
    return { payTo: null, fuente: null };
  }
  const cuerpo: unknown = await r.json();
  const accepts = campo(cuerpo, "accepts");
  if (!Array.isArray(accepts)) return { payTo: null, fuente: null };

  // Todas las entradas del accepts real llevan el mismo payTo. Si algún día
  // difieren, reportar solo la primera escondería justo la anomalía que este
  // cruce existe para mostrar — se devuelven todas, separadas.
  const payTos = [...new Set(accepts.map((a) => String(campo(a, "payTo") ?? "")).filter(Boolean))];
  return {
    payTo: payTos.length > 0 ? payTos.join(", ") : null,
    fuente: `402 de POST ${url} (sonda sin pago)`,
  };
}

/** El `walletAddress` del agent card, o `null` si el apex no respondió. */
async function walletDelAgentCard(): Promise<string | null> {
  try {
    const card = await pedirJson(AGENT_CARD_URL);
    const wallet = campo(campo(card, "x-executor"), "walletAddress");
    return typeof wallet === "string" ? wallet : null;
  } catch {
    // El ancla caída NO debe tumbar el resumen entero: se reporta como "no se
    // pudo cruzar", que es información distinta de "coinciden" y de "difieren".
    return null;
  }
}

export async function armarInfo(): Promise<ResumenInfo> {
  const base = baseUrl();
  const openapi = await pedirJson(`${base}/api/batch/openapi.json`);
  const paths = campo(openapi, "paths");
  const rutas = typeof paths === "object" && paths !== null ? (paths as Record<string, unknown>) : {};

  const productos: ProductoInfo[] = [];
  const consultasGratis: { ruta: string; resumen: string | null }[] = [];
  let redes: RedInfo[] = [];

  for (const [ruta, ops] of Object.entries(rutas)) {
    const post = campo(ops, "post");
    const get = campo(ops, "get");

    if (post !== undefined && !ruta.endsWith("/csv")) {
      // Las gemelas `/csv` no son productos aparte: mismo input, mismo precio,
      // otra serialización. Listarlas como productos duplicaría el catálogo y
      // un agente contaría diez donde hay cinco.
      const x402 = campo(post, "x-x402");
      productos.push({
        ruta,
        operationId: typeof campo(post, "operationId") === "string" ? (campo(post, "operationId") as string) : null,
        resumen: typeof campo(post, "summary") === "string" ? (campo(post, "summary") as string) : null,
        cobra: campo(x402, "cobra") === true,
        precioUsd: typeof campo(x402, "precioUsd") === "number" ? (campo(x402, "precioUsd") as number) : null,
        salidaCsv: campo(rutas[`${ruta}/csv`], "post") !== undefined,
      });
      if (redes.length === 0 && Array.isArray(campo(x402, "redes"))) {
        redes = campo(x402, "redes") as RedInfo[];
      }
    }

    if (get !== undefined) {
      consultasGratis.push({
        ruta,
        resumen: typeof campo(get, "summary") === "string" ? (campo(get, "summary") as string) : null,
      });
    }
  }

  const [sonda, wallet] = await Promise.all([sondearPayTo(), walletDelAgentCard()]);
  const coinciden = mismaDireccion(sonda.payTo, wallet);

  const veredicto =
    coinciden === true
      ? "OK: el payTo de la oferta 402 es el walletAddress del agent card."
      : coinciden === false
        ? "PELIGRO: el payTo del 402 NO es la wallet del agent card. NO firmes ningún pago — " +
          "en x402 no hay escrow ni disputa, y la plata iría a esa otra dirección."
        : sonda.payTo === null
          ? "El muro x402 está apagado (la sonda no recibió 402): hoy los POST responden sin pagar."
          : "No se pudo leer el agent card, así que el cruce quedó SIN HACER. Verificalo vos antes de firmar.";

  return {
    titulo: typeof campo(campo(openapi, "info"), "title") === "string"
      ? (campo(campo(openapi, "info"), "title") as string)
      : null,
    baseUrl: base,
    productos,
    consultasGratis,
    redes,
    cruce: {
      payToOferta: sonda.payTo,
      fuentePayTo: sonda.fuente,
      walletAgentCard: wallet,
      coinciden,
      veredicto,
    },
    advertencia: ADVERTENCIA,
  };
}
