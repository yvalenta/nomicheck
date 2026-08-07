import type { NextFunction, Request, Response } from "express";

import { nuevoIdDeError, registro } from "../lib/registro.js";

/**
 * La red de seguridad: lo que escapa de los try/catch de los controladores
 * termina acá, con tres garantías que antes no existían:
 *
 *   1. Se REGISTRA, estructurado y con el sha desplegado. Antes un error sin
 *      catch salía como página HTML de Express con el stack adentro — el stack
 *      de un servicio de nómina, servido al cliente.
 *   2. El cliente recibe un 500 con un `id`. Ese id es la línea del log: quien
 *      reporta "me dio abc-123" apunta al error exacto sin contar nada más.
 *   3. El body de la petición NO se toca ni se loguea: ahí vive la nómina.
 *
 * El caso especial es el JSON malformado: `express.json()` tira SyntaxError
 * con `status: 400`, y eso no es un error nuestro sino del cliente — sale como
 * 400 con mensaje claro y SIN registrarse como error (un atacante mandando
 * basura no debe poder llenar el log de errores "nuestros").
 */
export function manejadorDeErrores(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  // Si ya se empezó a responder, Express tiene que cerrar la conexión él —
  // escribir otra respuesta encima corrompería la que salió a medias.
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;

  if (err instanceof SyntaxError && status === 400) {
    res.status(400).json({ error: "JSON malformado" });
    return;
  }

  // Body más grande que el límite del parser: también es del cliente, y antes
  // salía como "Error interno" con id — un buyer con un lote legítimo grande
  // no podía distinguir "recorta el lote" de "el servidor está roto".
  if (status === 413) {
    res.status(413).json({
      error: "payload_demasiado_grande",
      mensaje: "El cuerpo excede el límite del endpoint — divide el lote en partes más chicas.",
    });
    return;
  }

  const id = nuevoIdDeError();
  // método y ruta sí; body, query y headers jamás — ver lib/registro.ts.
  registro.error("http", "error no manejado", err, {
    id,
    metodo: _req.method,
    ruta: _req.path,
  });
  res.status(500).json({ error: "Error interno", id });
}

/**
 * Los errores que Express no ve: un handler async que rechaza sin catch se
 * vuelve unhandledRejection (Express 4 no encadena promesas), y un throw fuera
 * del ciclo de una petición es uncaughtException.
 *
 * La asimetría entre los dos es deliberada:
 *   - unhandledRejection se registra y el proceso SIGUE: el estado del proceso
 *     no está corrupto, solo hay una promesa cuyo error nadie miró. Matar el
 *     proceso por eso convertiría un bug puntual en una caída del servicio —
 *     el modo de falla que routes/batchPublico.ts:123 ya documentó como "TUMBA
 *     TODO EL PROCESO".
 *   - uncaughtException se registra y el proceso MUERE (exit 1): después de
 *     una excepción síncrona sin dueño el estado sí puede estar corrupto, y
 *     seguir sirviendo cálculos de nómina desde un proceso en estado
 *     desconocido es peor que un reinicio. `restart: unless-stopped` lo
 *     levanta; el log queda como acta.
 */
export function capturarErroresDeProceso(): void {
  process.on("unhandledRejection", (razon) => {
    registro.error("proceso", "unhandledRejection — promesa rechazada sin catch", razon);
  });
  process.on("uncaughtException", (err) => {
    registro.error("proceso", "uncaughtException — el proceso se reinicia", err);
    process.exit(1);
  });
}
