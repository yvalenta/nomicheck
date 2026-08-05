import { randomUUID } from "node:crypto";

/**
 * Registro estructurado de errores — sin dependencias y sin SaaS, a propósito.
 *
 * Hasta el 2026-08-05 la API tenía exactamente cuatro `console.error` sueltos:
 * ni manejador de errores de Express, ni handlers de proceso, ni forma de
 * correlacionar un error con el deploy que lo introdujo. Un error que escapaba
 * de un try/catch de controlador salía como HTML de Express o como un proceso
 * caído, y `docker logs` era arqueología.
 *
 * POR QUÉ NO SENTRY (ni ningún colector externo). No es austeridad: es la tesis
 * del producto. Los cuerpos de las peticiones llevan nómina — salarios,
 * deducciones, identificadores — y el sobre firmado promete
 * `procesadoPorLlmExterno: false` y `persistidoEnBd: false` sobre esos datos.
 * Un SDK de error-tracking captura por defecto request bodies, headers y
 * variables locales, y los manda a un tercero en EE. UU. La promesa de habeas
 * data no distingue entre "se lo mandé a un LLM" y "se lo mandé a un SaaS de
 * observabilidad": datos que salieron, salieron. Lo que sí se puede sin romper
 * nada: JSON estructurado a stdout, que Docker ya rota, y que se lee con
 * `docker logs nomicheck-api | grep '"nivel":"error"'`.
 *
 * QUÉ LLEVA CADA LÍNEA — y qué NO, que es la parte diseñada:
 *   - `sha`: el commit desplegado (GIT_SHA la inyecta deploy.sh vía Compose).
 *     Correlacionar un error con su deploy pasa de arqueología a un grep.
 *   - `id`: el mismo UUID que recibe el cliente en el 500. Quien reporta "me
 *     dio error abc-123" apunta a la línea exacta del log.
 *   - método y ruta, PERO NUNCA el body, el query ni los headers: ahí vive la
 *     nómina. Un log que copia el body es una base de datos que nadie declaró.
 */

const SHA = (process.env.GIT_SHA ?? "").slice(0, 7) || null;

type Nivel = "info" | "warn" | "error";

export interface LineaDeRegistro {
  ts: string;
  nivel: Nivel;
  origen: string;
  mensaje: string;
  sha: string | null;
  [extra: string]: unknown;
}

/** Serializa un error sin confiar en que sea un Error: los `throw "texto"` y
 * los rechazos con objetos planos existen, y el registro es el peor lugar para
 * reventar por uno. */
export function serializarError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      tipo: err.name,
      mensaje: err.message,
      // El stack completo: va a stdout local, no a un tercero, así que acá no
      // hay nada que recortar.
      stack: err.stack ?? null,
      ...(err.cause !== undefined ? { causa: serializarError(err.cause) } : {}),
    };
  }
  return { tipo: typeof err, mensaje: String(err) };
}

export function linea(nivel: Nivel, origen: string, mensaje: string, extra: Record<string, unknown> = {}): LineaDeRegistro {
  return { ts: new Date().toISOString(), nivel, origen, mensaje, sha: SHA, ...extra };
}

// Inyectable para las pruebas: capturan líneas sin parsear stdout.
let emitir: (l: LineaDeRegistro) => void = (l) => {
  const texto = JSON.stringify(l);
  // eslint-disable-next-line no-console
  if (l.nivel === "error") console.error(texto);
  // eslint-disable-next-line no-console
  else console.log(texto);
};

export function usarEmisor(fn: typeof emitir): void {
  emitir = fn;
}

export const registro = {
  info: (origen: string, mensaje: string, extra: Record<string, unknown> = {}) => emitir(linea("info", origen, mensaje, extra)),
  warn: (origen: string, mensaje: string, extra: Record<string, unknown> = {}) => emitir(linea("warn", origen, mensaje, extra)),
  error: (origen: string, mensaje: string, err?: unknown, extra: Record<string, unknown> = {}) =>
    emitir(linea("error", origen, mensaje, { ...(err !== undefined ? { error: serializarError(err) } : {}), ...extra })),
};

export function nuevoIdDeError(): string {
  return randomUUID();
}
