// `nomicheck_calcular` — el POST real, con el muro x402 tratado como contrato
// y no como error.
//
// Un cliente HTTP genérico ve el 402 y reporta "falló". Acá el 402 es la MITAD
// BUENA del protocolo: trae el `accepts` completo — red, token, monto, payTo y
// el dominio EIP-712 con el que se firma — y esta herramienta lo devuelve
// estructurado para que el caller elija red, firme EIP-3009 y reintente con
// `x_payment`. Aplanarlo a un mensaje de error sería esconder exactamente la
// información que el pago necesita.
import {
  AGENT_CARD_URL,
  baseUrl,
  campo,
  mismaDireccion,
  pedirJson,
  type RutaCalculo,
} from "./base.js";

export interface Resultado402 {
  status: 402;
  pagoRequerido: true;
  /** El array `accepts` tal cual lo anunció el servidor, sin resumir. */
  accepts: unknown[];
  crucePayTo: {
    walletAgentCard: string | null;
    coinciden: boolean | null;
    detalle: string;
  };
  nota: string;
}

export interface ResultadoOk {
  status: number;
  resultado: unknown;
  /** El header `X-PAYMENT-RESPONSE` decodificado (base64 → JSON), si vino. */
  xPaymentResponse: unknown;
}

export interface ResultadoFallo {
  status: number;
  error: unknown;
}

export type ResultadoCalculo = Resultado402 | ResultadoOk | ResultadoFallo;

const NOTA_402 =
  "Pago requerido. Elegí UNA entrada de `accepts`, firmá un `transferWithAuthorization` " +
  "(EIP-3009) usando el dominio EIP-712 que viene en su `extra` — `name` y `version` " +
  "cambian ENTRE redes, copiar el de otra entrada produce una firma que el token " +
  "rechaza sin decir por qué — y reintentá esta misma llamada pasando la autorización " +
  "serializada en `x_payment`. Antes de firmar, confirmá que `crucePayTo.coinciden` " +
  "sea true, o hacé el cruce vos con `nomicheck_info`.";

/**
 * El mismo cruce payTo↔agent card de `nomicheck_info`, repetido acá adrede:
 * este es el momento en que el caller tiene la oferta EN LA MANO y está a una
 * firma de pagar. Un cruce que vive solo en la herramienta de info protege al
 * que se acordó de llamarla. Eso sí, TOLERANTE a fallo: el apex caído no puede
 * bloquear un 402 legítimo — se reporta "sin cruzar", que no es "coinciden".
 */
async function cruzarAccepts(accepts: unknown[]): Promise<Resultado402["crucePayTo"]> {
  const payTos = [...new Set(accepts.map((a) => String(campo(a, "payTo") ?? "")).filter(Boolean))];
  let wallet: string | null = null;
  try {
    const card = await pedirJson(AGENT_CARD_URL);
    const w = campo(campo(card, "x-executor"), "walletAddress");
    wallet = typeof w === "string" ? w : null;
  } catch {
    wallet = null;
  }
  const coinciden =
    payTos.length === 0
      ? null
      : payTos
          .map((p) => mismaDireccion(p, wallet))
          .reduce<boolean | null>((acc, v) => (acc === false || v === false ? false : acc === null || v === null ? null : true), true);

  return {
    walletAgentCard: wallet,
    coinciden,
    detalle:
      coinciden === true
        ? "El payTo de la oferta es el walletAddress del agent card."
        : coinciden === false
          ? "PELIGRO: el payTo NO es la wallet del agent card. No firmes este pago."
          : "No se pudo cruzar (agent card no disponible o accepts sin payTo). Verificalo antes de firmar.",
  };
}

/**
 * El header `X-PAYMENT-RESPONSE` viaja como base64 de un JSON (así lo
 * serializa el middleware x402). Se decodifica acá porque el caller de un MCP
 * es un modelo: pasarle el base64 crudo es invitarlo a "decodificarlo" de
 * memoria, y una liquidación on-chain alucinada es peor que ninguna.
 */
function decodificarXPaymentResponse(header: string | null): unknown {
  if (header === null) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    // Ilegible ≠ ausente: el caller pagó y le deben una constancia, así que el
    // crudo se conserva para que pueda reclamarla con evidencia.
    return { advertencia: "X-PAYMENT-RESPONSE vino pero no decodifica como base64(JSON)", crudo: header };
  }
}

export async function calcular(
  ruta: RutaCalculo,
  body: Record<string, unknown>,
  xPayment?: string,
): Promise<ResultadoCalculo> {
  const url = `${baseUrl()}/api/batch/${ruta}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(xPayment !== undefined ? { "X-PAYMENT": xPayment } : {}),
    },
    body: JSON.stringify(body),
  });

  // El cuerpo se lee como texto primero: un 502 de un proxy trae HTML, y un
  // `r.json()` directo convertiría "el gateway se cayó" en "SyntaxError", que
  // manda a depurar al lado equivocado del cable.
  const texto = await r.text();
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    cuerpo = texto;
  }

  if (r.status === 402) {
    const accepts = campo(cuerpo, "accepts");
    const lista = Array.isArray(accepts) ? accepts : [];
    return {
      status: 402,
      pagoRequerido: true,
      accepts: lista,
      crucePayTo: await cruzarAccepts(lista),
      nota: NOTA_402,
    };
  }

  if (r.ok) {
    return {
      status: r.status,
      resultado: cuerpo,
      xPaymentResponse: decodificarXPaymentResponse(r.headers.get("x-payment-response")),
    };
  }

  return { status: r.status, error: cuerpo };
}
