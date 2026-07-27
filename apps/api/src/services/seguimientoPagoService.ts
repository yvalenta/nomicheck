// Seguimiento en vivo de una transacción de pago, para que el empleador no
// mire una rueda girando sin saber qué pasa (~2,0 s por bloque en Base).
//
// Se expone como GENERADOR ASÍNCRONO, no como handler HTTP: así la máquina de
// estados se prueba iterándola, sin levantar un servidor ni abrir un socket.
// La ruta solo traduce cada evento a una trama SSE — el transporte no sabe de
// dominio y el dominio no sabe de transporte.
//
// Por qué SSE y no WebSocket ni gRPC (decisión registrada en docs/12):
//   - el flujo es de UNA sola dirección y termina solo; un socket bidireccional
//     sería infraestructura de más para nada
//   - `EventSource` es nativo del navegador y reconecta solo
//   - es HTTP plano: cruza Cloudflare sin proxy extra, y un proxy extra sería
//     otro punto único de falla, justo lo que venimos quitando
//
// SIGUE SIENDO SIN ESTADO: lo único que recuerda el progreso es la conexión
// abierta. Si se cae, no se pierde nada ni queda basura que limpiar — el
// cliente vuelve a preguntar y la cadena responde lo mismo. La verdad está en
// la cadena, no en la memoria de este proceso.
import { createPublicClient, http } from "viem";
import type { RedPago } from "../lib/pagosConfig.js";

export type EventoSeguimiento =
  /** Aceptamos el txHash y empezamos a mirar la cadena. */
  | { fase: "buscando"; txHash: string; red: string; chainId: number }
  /** Ya entró en un bloque. Todavía puede reorganizarse. */
  | { fase: "minado"; bloque: string; confirmaciones: number }
  /** Alcanzó las confirmaciones pedidas y no está revertida. */
  | { fase: "confirmado"; bloque: string; confirmaciones: number; puedeEmitirComprobante: true }
  /** La tx se ejecutó pero falló: no transfirió nada. Estado terminal. */
  | { fase: "revertido"; bloque: string; motivo: string }
  /** Se acabó la ventana sin verla minada. NO significa que fracasó. */
  | { fase: "expirado"; esperadoSegundos: number; motivo: string };

/** Tope duro de la ventana. Cloudflare corta conexiones ociosas cerca de los
 *  100 s; con latidos cada 15 s no llegamos a ocioso, pero igual se cierra
 *  sola para no dejar conexiones colgadas si el cliente desapareció sin avisar. */
export const TIMEOUT_MAXIMO_MS = 120_000;
export const CONFIRMACIONES_MAXIMAS = 5;

export interface OpcionesSeguimiento {
  /** Confirmaciones antes de dar el pago por bueno. Se limita a
   *  CONFIRMACIONES_MAXIMAS: en un L2 de 2 s, pedir 50 sería esperar minutos
   *  para una garantía que igual depende de la liquidación en L1. */
  confirmaciones?: number;
  timeoutMs?: number;
  /** Se dispara cuando el cliente cierra la pestaña: corta la espera en vez
   *  de dejar un generador consultando el RPC contra nadie. */
  senal?: AbortSignal;
}

class AbortadoError extends Error {}

/** Corre `promesa` pero se rinde si la señal aborta. Sin esto, cerrar la
 *  pestaña dejaría la espera de viem viva hasta su propio timeout. */
// Recibe una FÁBRICA, no una promesa ya creada: así la consulta al RPC no
// llega a construirse si la señal ya venía abortada. Con una promesa como
// argumento, la llamada se ejecutaría al evaluar el argumento y solo después
// se descartaría el resultado — gasto inútil contra un cliente que ya se fue.
function conAborto<T>(crear: () => Promise<T>, senal?: AbortSignal): Promise<T> {
  if (senal?.aborted) return Promise.reject(new AbortadoError());
  if (!senal) return crear();
  const promesa = crear();
  return new Promise<T>((resolve, reject) => {
    const alAbortar = () => reject(new AbortadoError());
    senal.addEventListener("abort", alAbortar, { once: true });
    promesa.then(resolve, reject).finally(() => senal.removeEventListener("abort", alAbortar));
  });
}

export async function* seguirPago(
  red: RedPago,
  txHash: string,
  opciones: OpcionesSeguimiento = {}
): AsyncGenerator<EventoSeguimiento> {
  const confirmaciones = Math.min(Math.max(opciones.confirmaciones ?? 2, 1), CONFIRMACIONES_MAXIMAS);
  const timeoutMs = Math.min(opciones.timeoutMs ?? TIMEOUT_MAXIMO_MS, TIMEOUT_MAXIMO_MS);
  const { senal } = opciones;

  yield { fase: "buscando", txHash, red: red.red, chainId: red.chainId };

  const cliente = createPublicClient({ transport: http(red.rpcUrl) });
  const arranque = Date.now();

  // Primer tramo: que entre en un bloque. Es el que de verdad se espera.
  let receipt;
  try {
    receipt = await conAborto(
      () =>
        cliente.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
          confirmations: 1,
          timeout: timeoutMs,
        }),
      senal
    );
  } catch (err) {
    if (err instanceof AbortadoError) return;
    yield {
      fase: "expirado",
      esperadoSegundos: Math.round((Date.now() - arranque) / 1000),
      motivo:
        "No se vio la transacción en un bloque dentro de la ventana. Puede seguir pendiente " +
        "con comisión baja, o no haberse enviado nunca. Volver a consultar con el mismo txHash " +
        "es seguro: no se duplica ningún pago.",
    };
    return;
  }

  if (receipt.status !== "success") {
    yield {
      fase: "revertido",
      bloque: receipt.blockNumber.toString(),
      motivo:
        "La transacción se ejecutó pero falló — no transfirió fondos. Suele ser saldo o " +
        "aprobación insuficiente. No se emite constancia porque no hubo pago.",
    };
    return;
  }

  yield { fase: "minado", bloque: receipt.blockNumber.toString(), confirmaciones: 1 };

  // Segundo tramo: solo si se pidió más de una confirmación.
  if (confirmaciones > 1) {
    const restante = timeoutMs - (Date.now() - arranque);
    if (restante > 0) {
      try {
        await conAborto(
          () =>
            cliente.waitForTransactionReceipt({
              hash: txHash as `0x${string}`,
              confirmations: confirmaciones,
              timeout: restante,
            }),
          senal
        );
      } catch (err) {
        if (err instanceof AbortadoError) return;
        // Quedarse corto de confirmaciones no invalida nada: ya está minada.
        // Se informa con las que hay y el cliente decide si le alcanza.
        yield {
          fase: "minado",
          bloque: receipt.blockNumber.toString(),
          confirmaciones: 1,
        };
        return;
      }
    }
  }

  yield {
    fase: "confirmado",
    bloque: receipt.blockNumber.toString(),
    confirmaciones,
    puedeEmitirComprobante: true,
  };
}
