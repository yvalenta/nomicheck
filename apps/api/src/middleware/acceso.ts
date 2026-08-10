import type { NextFunction, Request, Response } from "express";
import { registro } from "../lib/registro.js";

/**
 * Una línea por petición terminada. Es la capa que faltaba para poder
 * responder preguntas que hoy no tienen respuesta.
 *
 * ── Por qué hacía falta ────────────────────────────────────────────────────
 *
 * Hasta el 2026-08-10 la API tenía cinco llamadas a `registro` en total, todas
 * de error o de arranque. Eso alcanza para saber que algo se rompió y no para
 * nada más: cuántas peticiones servimos, con qué latencia, qué proporción
 * falla, o si un comprador que dice "me falló" tuvo un 400 suyo o un 500
 * nuestro. Se midió intentando averiguar qué host estaba atendiendo durante un
 * ensayo de failover y terminando en `docker stats`, contando bytes de red.
 *
 * Importa más desde que el muro x402 cobra: un comprador paga antes de que se
 * ejecute el handler, así que su fallo es plata, y sin registro por petición no
 * hay a qué hacerle grep.
 *
 * ── Qué lleva, y qué NO ────────────────────────────────────────────────────
 *
 * Lo mismo que ya declara `lib/registro.ts`, sin excepciones: método, ruta,
 * estado, duración y el sha desplegado. **Nunca el body, el query ni los
 * headers** — ahí vive la nómina, y un log que copia el body es una base de
 * datos que nadie declaró. Hay pruebas que lo afirman en las dos direcciones.
 *
 * `patron` es la ruta con sus parámetros SIN resolver (`/empleados/:id`), y es
 * lo que sirve para agregar: contar por `/empleados/:id` responde algo; contar
 * por `/empleados/1`, `/empleados/2`… no responde nada. Además deja el
 * identificador concreto fuera de la línea agregable.
 *
 * ── Por qué se registra al TERMINAR y no al entrar ─────────────────────────
 *
 * Al entrar no se sabe ni el estado ni la duración, que es todo lo que se
 * quiere. `res.on("finish")` corre cuando la respuesta salió; `res.on("close")`
 * cubre al cliente que corta antes —un timeout del comprador, por ejemplo—, que
 * si no quedaría invisible justo cuando más interesa.
 */

/**
 * Rutas que no se registran: son ruido, no señal.
 *
 * Decide sobre `originalUrl` y NO sobre `req.path`. La diferencia no es
 * estética: Express **reescribe `req.url` al despachar a un router**, así que
 * `req.path` es completo cuando entra el middleware y relativo cuando corre el
 * `finish`. Usarlo funcionaba solo por estar montado antes que todo router —
 * moverlo una línea más abajo lo habría dejado sin filtrar nada, en silencio.
 */
function registrable(req: Request): boolean {
  const ruta = rutaSinQuery(req);
  // Solo la API. El contenedor también sirve el front compilado, y una línea
  // por cada .js y .css convertiría el log en un lugar donde nadie busca.
  if (!ruta.startsWith("/api")) return false;
  return !esSondaInterna(req, ruta);
}

/**
 * Las sondas de salud propias, que pegan cada 15 s para siempre — 5.760 líneas
 * por día que nadie va a leer y que ahogan todo lo demás.
 *
 * **No alcanza con filtrar las rutas de salud**, y se vio en producción: un
 * comprador SÍ consulta `/api/batch/health` antes de pagar —es lo que le da el
 * `reglasHash` y el `publicKeyId` sin gastar un centavo, y la spec del sobre se
 * lo recomienda—, así que descartarla a secas borra justo la señal de alguien
 * evaluándonos.
 *
 * Se distinguen por DÓNDE ENTRAN. Todo lo externo llega por el túnel de
 * Cloudflare, que escribe `CF-Connecting-IP`; el healthcheck del contenedor
 * pega a `localhost` y no la trae. Es la misma cabecera en la que ya confía el
 * rate limit, y por el mismo motivo: el origen no es alcanzable de otra forma.
 */
function esSondaInterna(req: Request, ruta: string): boolean {
  if (!ruta.endsWith("/health")) return false;
  return !req.headers["cf-connecting-ip"];
}

/**
 * La ruta completa, sin el query string.
 *
 * `req.path` NO sirve: dentro de un router montado viene sin el prefijo, así
 * que `/api/batch/health` se registra como `/health` — ambiguo e inútil para
 * agregar. La ruta completa está en `req.originalUrl`, **que incluye el
 * query**, o sea que el arreglo obvio introduce exactamente lo que este archivo
 * existe para evitar: `?token=…` en el log.
 *
 * Por eso se corta en el primer `?` y nunca se toca `req.query`. La prueba que
 * lo cubre pone un secreto en el query del `originalUrl` falso, no solo en
 * `req.query` — si no, estaría probando que no filtramos algo que nunca
 * miramos.
 */
function rutaSinQuery(req: Request): string {
  return (req.originalUrl ?? req.path).split("?")[0];
}

export function registrarAcceso(req: Request, res: Response, next: NextFunction) {
  if (!registrable(req)) return next();

  const inicio = process.hrtime.bigint();
  let yaRegistrado = false;

  const registrar = (cerroElCliente: boolean) => {
    // `finish` y `close` pueden dispararse los dos en la misma petición.
    if (yaRegistrado) return;
    yaRegistrado = true;

    const ms = Number((process.hrtime.bigint() - inicio) / 1_000_000n);
    // `req.route` solo existe si alguna ruta coincidió; en un 404 no hay patrón
    // y eso es informativo por sí mismo.
    const patron = req.route?.path ? `${req.baseUrl}${req.route.path}` : null;

    registro.info("http", "peticion", {
      metodo: req.method,
      ruta: rutaSinQuery(req),
      patron,
      estado: res.statusCode,
      ms,
      ...(cerroElCliente ? { cortadaPorElCliente: true } : {}),
    });
  };

  res.on("finish", () => registrar(false));
  res.on("close", () => registrar(!res.writableFinished));
  next();
}
