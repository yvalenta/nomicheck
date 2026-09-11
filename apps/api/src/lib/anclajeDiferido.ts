// Cola de reintentos en memoria para el anclaje de `/verificar/durable` (DX402
// punto 2, Parte 3 — implementar:adaptador).
//
// POR QUÉ EXISTE: el pipeline de esa ruta cobra ANTES de anclar (decisión 4
// del brief: authorize → calcular+sobre+medir → capture → anchor →
// responder). Si el anchor falla DESPUÉS de `capture()`, el pago ya es
// irreversible y el sobre ya se sirvió con `skipped:"anchor_failed"` en su
// header — no hay nada que deshacer ni que re-cobrar. Lo único que queda por
// hacer es reintentar anclar la MISMA evidencia en segundo plano, sin
// bloquear la respuesta que el comprador ya recibió.
//
// EN MEMORIA, SIN DISCO NI BASE DE DATOS, a propósito: el sobre que sirve
// esta ruta promete (spec del sobre) que NomiCheck no persiste — escribir
// esta cola a disco o a Prisma sería falsear esa promesa por la puerta de
// atrás. Un reinicio del proceso pierde los reintentos pendientes, y eso es
// aceptable: el anchor es EVIDENCIA ADICIONAL sobre un pago que ya liquidó,
// no el pago en sí. El comprador se queda con el sobre firmado que ya tiene;
// solo falta que también quede hospedado.
import { anchorEvidence, contentHash, type AnchorOptions } from "uvd-x402-sdk";
import { registro } from "./registro.js";

/** Tope de tareas en cola — sin esto un facilitador caído de forma sostenida
 * acumula reintentos sin límite y la cola se vuelve una fuga de memoria. */
const TOPE_COLA = 50;

/** [30s, 120s, 300s]: tres intentos con espera creciente, no reintento
 * infinito. Un facilitador caído por más de ~7,5 minutos no se resuelve
 * reintentando cada vez más rápido. */
const ESPERAS_MS = [30_000, 120_000, 300_000];

interface TareaAnclaje {
  body: Uint8Array;
  opts: AnchorOptions;
  intento: number;
}

const cola = new Map<string, TareaAnclaje>();

/** El mismo default que `anchorEvidence` del SDK cuando `opts.facilitator` falta. */
const FACILITADOR_POR_DEFECTO = "https://facilitator.ultravioletadao.xyz";

/** El reloj que agenda los reintentos — inyectable para que un test no tenga
 * que esperar minutos reales. Referencia el `setTimeout` GLOBAL en cada
 * llamada (no lo cachea al importar el módulo), así que `vi.useFakeTimers()`
 * lo intercepta igual que si fuera inyectado a mano. */
export interface RelojDeReintentos {
  setTimeout: (fn: () => void, ms: number) => { unref?: () => void };
}

const relojReal: RelojDeReintentos = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
};

/** `fetch` con timeout — sin esto un facilitador que cuelga la conexión deja
 * la respuesta del comprador esperando indefinidamente, y esa respuesta ya
 * está pagada: colgarse acá es peor que fallar rápido y reintentar después. */
export function fetchConTimeout(ms: number): typeof fetch {
  return (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
}

/**
 * `anchorEvidence` (uvd-x402-sdk, `dx402.ts:1147-1149`) hace
 * `(await res.json()) as Record<string, unknown>` SIN comprobar la forma: un
 * facilitador que responda 2xx con `null`, `123`, `[]`, `"ok"` o un `{}`
 * vacío (JSON válido, forma inesperada de un proxy, un despliegue raro, o
 * una versión futura) pasa TAL CUAL. Todo lo que toca ese resultado en este
 * archivo y en `x402MuroDurable.ts` asume UNO de dos caminos conocidos: o
 * trae `skipped` (string, el motivo de por qué no ancló), o trae `pointer`
 * (string, la evidencia real) — sin normalizar antes de la primera lectura:
 * (a) un `null` hace explotar `registrarResultadoAnchor` con un `TypeError`
 * DESPUÉS de `capture()` (el pago ya liquidó, y el `TypeError` termina en un
 * 424 que dice "no se entregó el recurso" sobre un recurso que sí se
 * cobró); (b) un `123`/`[]`/`"ok"` se cuela como éxito por la mera ausencia
 * de `skipped`; y (c) un `{}` —un objeto de verdad, así que ni (a) ni la
 * comprobación de "no es objeto" lo agarran— no tiene NINGUNO de los dos
 * caminos: `esExitoOYaAnclado` ya lo trata como fallo (exige `pointer`), pero
 * sin este segundo caso el header que se le sirve al comprador queda
 * `evidenceHeader({})` —sin `skipped` NI `pointer`— que el SDK del comprador
 * (`parseEvidenceHeader`) rechaza como malformado en vez de leerlo como "no
 * ancló, reintentá" (reparación DX402 punto 2 ronda 2, hallazgos del
 * refutador). Se llama en la ÚNICA entrada de cada función que recibe un
 * resultado crudo del SDK — nunca en un resultado ya normalizado.
 */
export function normalizarResultadoAnchor(r: unknown): Record<string, unknown> {
  if (typeof r !== "object" || r === null || Array.isArray(r)) {
    return { v: 1, skipped: "anchor_failed", error: "respuesta_no_objeto" };
  }
  const obj = r as Record<string, unknown>;
  if (typeof obj.skipped === "string") return obj; // ya declara su propio motivo
  if (typeof obj.pointer === "string" && obj.pointer.length > 0) return obj; // éxito real
  return { v: 1, skipped: "anchor_failed", error: "respuesta_sin_forma_de_evidencia" };
}

/**
 * Un 409 del facilitador cuenta como éxito cuando el motivo es
 * `already_anchored`: significa que la evidencia YA quedó anclada por un
 * intento anterior (el inmediato de `x402MuroDurable.ts`, u otro reintento de
 * esta misma cola) y el facilitador está rechazando un duplicado, no
 * reportando un fallo real.
 *
 * Exportada (reparación DX402 punto 2, ronda 1): el reintento INMEDIATO de
 * `x402MuroDurable.ts` usaba su propio criterio, más simple
 * (`skipped === "anchor_failed"`), que trataba ese mismo 409 como fallo —
 * encolaba un reintento diferido inútil y le servía al comprador un header
 * `skipped:"anchor_failed"` para una evidencia que en realidad SÍ quedó
 * anclada. Un solo criterio compartido es lo que evita que las dos rutas
 * (inmediata y diferida) diverjan en qué cuenta como éxito.
 *
 * ÉXITO REAL exige la forma mínima que el SDK del COMPRADOR exige para leer
 * el header (`parseEvidenceHeader`, `dx402.ts:175`: `paymentId`, `pointer` y
 * `contentHash` truthy) — no la mera AUSENCIA de `skipped`. Antes, un 2xx sin
 * forma de `AnchoredEvidence` (un `{}` vacío, un proxy que recorta el cuerpo,
 * una versión futura del facilitador que renombre campos) contaba como éxito
 * sin haber anclado nada: se servía un `X-Durable-Evidence` que
 * `parseEvidenceHeader` rechaza como malformado, sin reintento y sin ninguna
 * alarma, y el cortacircuitos se reseteaba igual (reparación DX402 punto 2
 * ronda 2, hallazgos del refutador — el `{}` de un lado, el `123`/`[]`/`"ok"`
 * de `normalizarResultadoAnchor` del otro).
 */
export function esExitoOYaAnclado(resultado: Record<string, unknown>): boolean {
  if (typeof resultado.skipped !== "string") {
    return typeof resultado.pointer === "string" && resultado.pointer.length > 0;
  }
  // El `already_anchored` real es un 409 (`dx402_already_anchored`, openapi
  // vivo del facilitador). Sin exigir el status, un 5xx cuyo mensaje
  // contuviera esa subcadena servía header de éxito, no encolaba reintento y
  // reseteaba el cortacircuitos (hallazgo del refutador `dinero`, ronda 3).
  const error = resultado.error;
  return resultado.status === 409 && typeof error === "string" && error.includes("already_anchored");
}

/**
 * Cortacircuitos de anclajes fallidos consecutivos (reparación DX402 punto
 * 2, ronda 1, hallazgo del refutador sobre `DX402_REQUIRE_PROOF` fase 2).
 *
 * Hoy el facilitador ancla en modo provisional sin `proofOfPayment` ni
 * `sellerSignature` (decisión 7 del brief — fija, no se toca acá). Si el día
 * de mañana el facilitador activa el rechazo estricto (fase 2 de su propio
 * rollout, `DX402_REQUIRE_PROOF=true`), CADA anclaje de esta ruta empieza a
 * fallar de la misma forma — y sin este contador, `/verificar/durable`
 * seguiría cobrando 0,02 USD por una promesa que el vendedor ya sabe que no
 * puede cumplir, venta tras venta, sin ninguna alarma. El umbral no aborta
 * la primera venta que falle (un facilitador caído un minuto no es un
 * cambio de política) — corta recién a partir de una RACHA sostenida.
 *
 * Contador en memoria, igual que el resto de este archivo: no es el pago
 * (eso ya liquidó y queda intacto), es una señal operativa para no seguir
 * vendiendo una garantía rota.
 */
const UMBRAL_FALLOS_CONSECUTIVOS = 5;
let fallosConsecutivos = 0;

/**
 * Instante (`Date.now()`) del último fallo que subió el contador — lo que
 * hace posible el medio-abierto de `anclajeDisponible()` de acá abajo.
 *
 * SIN esto, el cortacircuitos se abre y NUNCA se vuelve a cerrar (reparación
 * DX402 punto 2 ronda 2, hallazgo de DOS refutadores independientes, mismo
 * bug): `anclajeDisponible()` corta en `x402MuroDurable.ts` ANTES de
 * `capture()`, así que después de abrirse nunca se vuelve a llamar
 * `anchorEvidence` de una venta NUEVA — y el único lugar que resetea el
 * contador (`registrarResultadoAnchor`, ahí abajo) queda inalcanzable. La
 * cola diferida de la venta que sí abrió el corte se vacía sola a los ~450s
 * (`ESPERAS_MS`) y no se vuelve a llenar porque el camino principal ya no
 * ancla nada: deadlock, 503 permanente hasta reiniciar el proceso.
 */
let ultimoFalloMs = 0;

/**
 * Ventana del medio-abierto: coincide con la mayor de `ESPERAS_MS` (300s) —
 * el tiempo que la cola diferida de la ÚLTIMA venta que abrió el corte tarda
 * en agotar su propio último reintento. Pasada esa ventana sin ninguna señal
 * nueva, la siguiente venta recibe el beneficio de la duda: se deja pasar UN
 * intento de anclar (no el cobro entero — el intento de `anchorEvidence`
 * dentro de esa venta), y su resultado real decide si el corte se cierra
 * (éxito → `registrarResultadoAnchor` resetea) o se reabre por otra ventana
 * (fallo → `ultimoFalloMs` se actualiza de nuevo).
 */
const VENTANA_MEDIO_ABIERTO_MS = 300_000;

/**
 * Ventana del medio-abierto cuando la racha de fallos incluye un rechazo por
 * POLÍTICA del facilitador (402 `dx402_proof_rejected`, fase 2 de
 * `DX402_REQUIRE_PROOF`), no una caída. Es la razón de ser del
 * cortacircuitos (ver `UMBRAL_FALLOS_CONSECUTIVOS`) y NO se arregla sola en
 * cinco minutos: `/dx402/stats` sigue en 200 mientras `/dx402/anchor`
 * rechaza, así que la sonda gratis de `sondearFacilitador` no la ve
 * (hallazgo del refutador de cierre, ronda 3). No hay sonda gratis posible
 * para el anchor (exige un pago liquidado de verdad), así que lo único que
 * acota el costo es dejar pasar UNA venta por hora — no una cada 300 s —
 * mientras la política siga cambiada; un anclaje que sí prende (esa venta,
 * o la cola diferida) cierra el corte del todo.
 *
 * El 422 `dx402_backend_unavailable` NO es política: es el backend caído,
 * y `/dx402/stats` lo expone en `backends[].enabled` — la sonda gratis SÍ
 * lo ve (`sondearFacilitador` con el backend), así que va por la ventana
 * corta (segundo refutador de cierre, ronda 3).
 */
const VENTANA_MEDIO_ABIERTO_POLITICA_MS = 3_600_000;

/**
 * `true` si en la RACHA actual de fallos hubo al menos un rechazo por
 * política (402). Se decide por la racha y no por el último fallo: con
 * `4×402 + 1×503` (o un timeout sin status, o la propia sonda fallida) el
 * último fallo devolvía la ventana a 300 s en pleno régimen de política —
 * doce ventas por hora cobradas sin evidencia en vez de una (segundo
 * refutador de cierre, ronda 3). Se limpia solo con un éxito.
 */
let hayPoliticaEnRacha = false;

/**
 * Single-flight del medio-abierto: mientras UNA venta esté usando la ventana
 * (desde que la reserva hasta que su anclaje informa el resultado o la
 * request termina), ninguna otra entra. Sin esto, entre `anclajeDisponible()`
 * y `capture()` hay varios `await`, y 20 POST concurrentes que llegaran
 * pasada la ventana verían todos el corte "disponible", sondearían todos y
 * cobrarían todos: N ventas sin evidencia por ventana, no una (hallazgo del
 * refutador de cierre, ronda 3).
 */
let intentoMedioAbiertoEnCurso = false;

/** Cuándo se tomó la reserva vigente del medio-abierto. */
let reservaDesdeMs = 0;

/**
 * Identidad de la reserva vigente: sube cada vez que se toma una. Existe
 * porque una reserva VENCIDA (`RESERVA_MAX_MS`) y reemplazada por otra venta
 * sigue teniendo una request viva detrás — un `/settle` colgado que undici
 * corta a ~300 s — y cuando esa request por fin termina, su `finally`
 * llamaba a `liberarIntentoMedioAbierto()` sin saber de quién era la
 * reserva: soltaba la de la venta NUEVA, todavía en vuelo, y una tercera
 * entraba al medio-abierto. Dos ventas en la ventana en vez de una
 * (sesión fría 2026-09-10, leyendo quién libera la reserva). Con identidad,
 * solo la request que tomó la reserva vigente puede liberarla.
 */
let reservaVigente = 0;

/**
 * Una reserva más vieja que esto se considera vencida y otra venta puede
 * tomarla: `capture()` no tiene timeout propio (`fetch` pelado en
 * `x402Muro.ts`), y un `/settle` colgado dejaba la reserva tomada hasta que
 * cortara undici (~300 s), con TODA venta en 424 mientras tanto; el
 * `finally` del adaptador la libera, pero recién cuando la request termina
 * (segundo refutador de cierre, ronda 3). 60 s es el doble del
 * `maxTimeoutSeconds` que publica el accept.
 */
const RESERVA_MAX_MS = 60_000;

/** Actualiza el contador con el resultado de un anclaje REAL de una venta
 * NUEVA (el inmediato + su único reintento en `x402MuroDurable.ts` — nunca
 * el de la medición previa al cobro, que usa un `fetch` que no sale a la
 * red, y nunca los reintentos de `intentarAhora`, que NO cuentan contra este
 * contador — ver el comentario ahí abajo sobre por qué). */
export function registrarResultadoAnchor(resultado: Record<string, unknown>): void {
  // Cualquier resultado real libera la ventana del medio-abierto, la haya
  // usado esta venta o no — y acá NO hace falta la identidad de la reserva
  // (a diferencia de `liberarIntentoMedioAbierto`): después de un resultado
  // real la bandera deja de ser la guarda, porque lo que sigue o cierra el
  // corte (éxito: `fallosConsecutivos = 0`, todo pasa como "cerrado") o
  // rearma la ventana (fallo, o 409 neutro con el corte abierto:
  // `ultimoFalloMs = ahora`, `anclajeDisponible()` vuelve a ser `false`).
  // La bandera solo decide cuando la request muere SIN resultado, y ese
  // camino es el del `finally`, que sí lleva identidad.
  intentoMedioAbiertoEnCurso = false;
  if (esExitoOYaAnclado(resultado)) {
    cerrarCorte();
    return;
  }
  if (resultado.skipped === "already_anchored") {
    // NEUTRO: un 409 resuelto sin registro propio (ajeno, o el GET no se
    // pudo leer) prueba que `/dx402/anchor` contesta — no es caída ni
    // política. Contarlo como fallo dejaba que un tercero (el `paymentId`
    // sale del tx público y `/dx402/anchor` no exige identidad) o una
    // caída de `GET /dx402/evidence` abrieran el corte con cinco compras y
    // apagaran la ruta para todos (segundo refutador de cierre, ronda 3).
    // Pero si el corte YA está abierto, esta venta tampoco probó que el
    // anclaje volvió: se rearma la ventana sin sumar.
    if (fallosConsecutivos >= UMBRAL_FALLOS_CONSECUTIVOS) ultimoFalloMs = Date.now();
    return;
  }
  fallosConsecutivos += 1;
  ultimoFalloMs = Date.now();
  if (resultado.status === 402) hayPoliticaEnRacha = true;
}

/**
 * Un anclaje que SÍ prendió — de una venta nueva o de la cola diferida —
 * cierra el corte del todo: el contador Y la racha de política. Las dos
 * juntas siempre: la cola diferida reseteaba solo el contador y dejaba
 * `hayPoliticaEnRacha` pegada, así que la racha SIGUIENTE, aunque fuera de
 * puras caídas (cinco 503), heredaba la ventana de una hora: 424 sin cobrar
 * durante una hora en vez de 300 s (refutador acotado, sesión fría
 * 2026-09-10; preexistente a esa sesión).
 */
function cerrarCorte(): void {
  fallosConsecutivos = 0;
  hayPoliticaEnRacha = false;
}

/**
 * `false` cuando el anclaje viene fallando de forma sostenida — el llamador
 * (`x402MuroDurable.ts`) lo consulta ANTES de `capture()`, para no cobrar
 * por una evidencia que la racha reciente dice que no va a anclar.
 *
 * Medio-abierto: una vez agotado el umbral, deja pasar de nuevo pasada
 * `VENTANA_MEDIO_ABIERTO_MS` desde el último fallo — sin esto el corte no
 * tiene camino de vuelta (ver `ultimoFalloMs`). Que el intento que pasa
 * falle o ancle de verdad lo decide el resultado real de esa venta, nunca
 * esta función: acá solo se decide si se la deja INTENTAR.
 */
export function anclajeDisponible(): boolean {
  if (fallosConsecutivos < UMBRAL_FALLOS_CONSECUTIVOS) return true;
  const ventana = hayPoliticaEnRacha ? VENTANA_MEDIO_ABIERTO_POLITICA_MS : VENTANA_MEDIO_ABIERTO_MS;
  return Date.now() - ultimoFalloMs >= ventana;
}

/** Lo que decide `reservarMedioAbierto` para una venta. Solo
 * `"medio-abierto"` trae `reserva`: la identidad que el `finally` de esa
 * request devuelve a `liberarIntentoMedioAbierto`. */
export type AdmisionMedioAbierto =
  | { admision: "cerrado" }
  | { admision: "ocupado" }
  | { admision: "medio-abierto"; reserva: number };

/**
 * Reserva la ventana del medio-abierto para ESTA venta, si corresponde.
 * `"cerrado"`: el corte está cerrado, venta normal. `"medio-abierto"`: el
 * corte estaba abierto, la ventana pasó y esta venta es LA que la usa (el
 * llamador sondea al facilitador antes de cobrar, y libera con
 * `registrarResultadoAnchor` o `liberarIntentoMedioAbierto` con la
 * `reserva` que recibe acá). `"ocupado"`: otra venta ya está usando la
 * ventana — no se cobra. Se llama DESPUÉS de `anclajeDisponible()` (que
 * sigue siendo la guarda, y la que un test puede espiar); acá solo se
 * decide quién de los que pasaron esa guarda entra. Todo síncrono: entre
 * la guarda y la reserva no hay `await`, así que no hay dos que la tomen.
 */
export function reservarMedioAbierto(): AdmisionMedioAbierto {
  if (fallosConsecutivos < UMBRAL_FALLOS_CONSECUTIVOS) return { admision: "cerrado" };
  if (intentoMedioAbiertoEnCurso && Date.now() - reservaDesdeMs < RESERVA_MAX_MS) return { admision: "ocupado" };
  intentoMedioAbiertoEnCurso = true;
  reservaDesdeMs = Date.now();
  reservaVigente += 1;
  return { admision: "medio-abierto", reserva: reservaVigente };
}

/** Libera la ventana del medio-abierto sin registrar resultado — para el
 * `finally` de la request que la reservó, por si murió antes de informar.
 * Solo libera si `reserva` es la vigente: la de una request cuya reserva
 * venció y ya la tomó otra venta es letra muerta (ver `reservaVigente`). */
export function liberarIntentoMedioAbierto(reserva: number): void {
  if (reserva !== reservaVigente) return;
  intentoMedioAbiertoEnCurso = false;
}

/** Solo para tests: vuelve el contador (y el reloj del medio-abierto) a
 * cero entre casos. */
export function resetContadorFallosParaTest(): void {
  fallosConsecutivos = 0;
  ultimoFalloMs = 0;
  hayPoliticaEnRacha = false;
  intentoMedioAbiertoEnCurso = false;
  reservaDesdeMs = 0;
}

/** Solo para tests: envejece la reserva vigente del medio-abierto en `ms`. */
export function envejecerReservaParaTest(ms: number): void {
  reservaDesdeMs -= ms;
}

/** Solo para tests: mueve `ultimoFalloMs` al pasado en `ms`, para probar el
 * medio-abierto sin fakear el reloj GLOBAL (`Date.now()`) — que interferiría
 * con `AbortSignal.timeout` y con cualquier otro uso real del reloj en el
 * mismo proceso de test. */
export function envejecerUltimoFalloParaTest(ms: number): void {
  ultimoFalloMs -= ms;
}

/**
 * Encola un reintento de anclaje para `paymentId`. Idempotente: una segunda
 * llamada con el mismo `paymentId` mientras la primera sigue en cola no
 * duplica la tarea ni reinicia sus intentos.
 *
 * `body`/`opts` son EXACTAMENTE lo que ya se le pasó a `anchorEvidence` la
 * primera vez (mismo sobre, mismo `payerKey`, mismo `paymentId`/`txHash`
 * reales) — repetir el anchor con los mismos datos es seguro porque el
 * facilitador es quien decide si ya lo tiene (`already_anchored`).
 *
 * Devuelve `true` si el reintento quedó en cola (o ya estaba) y `false` si se
 * descartó por el tope: el llamador se lo dice al comprador en el header
 * (`deferred`), para que sepa si vale la pena volver a preguntar por
 * `GET /dx402/evidence/{paymentId}` más tarde.
 */
export function programarAnclaje(
  paymentId: string,
  body: Uint8Array,
  opts: AnchorOptions,
  reloj: RelojDeReintentos = relojReal
): boolean {
  if (cola.has(paymentId)) return true;
  if (cola.size >= TOPE_COLA) {
    registro.error("x402", "cola de anclaje diferido llena: se descarta el reintento", undefined, {
      paymentId,
      tope: TOPE_COLA,
    });
    return false;
  }
  cola.set(paymentId, { body, opts, intento: 0 });
  agendar(paymentId, reloj);
  return true;
}

/**
 * Sonda GRATIS del facilitador para la ventana de medio-abierto: un GET a
 * `/dx402/stats` (solo lectura, sin pago) con el `fetch` con timeout del
 * llamador. `true` si contesta 2xx y, cuando se pasa `backend`, si ese
 * backend figura `enabled` en `backends[]` (es lo que un 422
 * `dx402_backend_unavailable` significa, y stats lo expone — segundo
 * refutador de cierre, ronda 3). Un stats sin `backends[]` (facilitador
 * viejo) no bloquea. Nunca lanza.
 */
export async function sondearFacilitador(facilitator: string, doFetch: typeof fetch, backend?: string): Promise<boolean> {
  try {
    const res = await doFetch(`${facilitator.replace(/\/+$/, "")}/dx402/stats`);
    if (!res.ok) return false;
    if (!backend) return true;
    const cuerpo = (await res.json()) as { backends?: unknown };
    if (!Array.isArray(cuerpo.backends)) return true;
    return cuerpo.backends.some((b) => {
      const o = b as Record<string, unknown>;
      return o.id === backend && o.enabled === true;
    });
  } catch {
    return false;
  }
}

/**
 * Qué hay detrás de un 409 `dx402_already_anchored`. El facilitador YA tiene
 * un registro para este `paymentId` que supera al nuestro (el nuestro es
 * provisional: sin `sellerSignature`, decisión 7 del brief, y en la escalera
 * "provisional < signed < verified" nunca desplaza a nadie). Puede ser
 * NUESTRO — el primer intento ancló y su respuesta se perdió en el timeout —
 * o AJENO: `paymentId = keccak(caip2‖tx)` se deriva del tx público,
 * `/dx402/anchor` no exige identidad, y un tercero que ancle primero gana.
 * Las dos cosas se distinguen con `GET /dx402/evidence/{paymentId}` (openapi
 * vivo, 2026-09-10: devuelve pointer, `contentHash` del TEXTO PLANO y el
 * recibo firmado; 404 = nunca hubo registro, 410 = venció): si el
 * `contentHash` anclado es el de los bytes que servimos, es nuestra
 * evidencia y el comprador recibe el pointer real; si no, hay un registro
 * ajeno bajo nuestro id, se loguea como error y el header lo dice
 * (`error: "registro_ajeno"`). Si el GET no contesta, se degrada a lo que se
 * servía antes: `skipped: "already_anchored"` con `paymentId` + `contentHash`
 * para que el comprador vuelva a preguntar (hallazgo del refutador
 * `protocolo`, ronda 3 — el comentario anterior afirmaba que no existía un
 * GET para recuperar el pointer).
 *
 * LÍMITE CONOCIDO (refutador de cierre, ronda 3): `contentHash` igual prueba
 * que el registro tiene NUESTRO texto plano, no que su blob esté sellado a
 * la llave del pagador — el 200 de `/dx402/evidence` no expone `payer`, así
 * que no hay otro cruce posible. El único actor que puede producir ese
 * registro es quien tiene el texto plano: el propio pagador (lo recibió en
 * t=0) o nosotros. Un pagador que ancle su propia copia antes que nosotros
 * recibe en el header el pointer de su propio registro — nada que no
 * pudiera abrir ya. El resultado recuperado se marca `recuperadoPorGet` en
 * el registro del vendedor, nunca en el header (el vocabulario DX402 no lo
 * tiene).
 */
export async function recuperarEvidenciaAnclada(
  facilitator: string,
  paymentId: string,
  contentHashServido: string,
  doFetch: typeof fetch
): Promise<Record<string, unknown>> {
  const sinPointer: Record<string, unknown> = {
    v: 1,
    skipped: "already_anchored",
    paymentId,
    contentHash: contentHashServido,
  };
  try {
    const res = await doFetch(`${facilitator.replace(/\/+$/, "")}/dx402/evidence/${paymentId}`);
    if (!res.ok) {
      registro.warn("x402", "409 del anchor pero GET /dx402/evidence no devolvió el registro", {
        paymentId,
        status: res.status,
      });
      return sinPointer;
    }
    const registroAnclado = normalizarResultadoAnchor(await res.json());
    if (typeof registroAnclado.pointer !== "string" || registroAnclado.pointer.length === 0) {
      registro.warn("x402", "409 del anchor pero el registro de GET /dx402/evidence no trae pointer", { paymentId });
      return sinPointer;
    }
    const anclado = registroAnclado.contentHash;
    if (typeof anclado !== "string" || anclado.toLowerCase() !== contentHashServido.toLowerCase()) {
      registro.error(
        "x402",
        "registro DX402 AJENO bajo nuestro paymentId: el contentHash anclado no es el de los bytes servidos",
        undefined,
        { paymentId, anclado, servido: contentHashServido }
      );
      return { ...sinPointer, error: "registro_ajeno" };
    }
    return { v: 1, ...registroAnclado, paymentId, contentHash: anclado };
  } catch (e) {
    registro.warn("x402", "409 del anchor y GET /dx402/evidence falló", {
      paymentId,
      error: e instanceof Error ? e.message : String(e),
    });
    return sinPointer;
  }
}

function agendar(paymentId: string, reloj: RelojDeReintentos): void {
  const tarea = cola.get(paymentId);
  if (!tarea) return;
  const espera = ESPERAS_MS[tarea.intento];
  if (espera === undefined) {
    cola.delete(paymentId);
    registro.error("x402", "anclaje diferido agotó sus reintentos", undefined, { paymentId });
    return;
  }
  const timer = reloj.setTimeout(() => {
    void intentarAhora(paymentId, reloj);
  }, espera);
  // `unref()` para que esta cola nunca sea lo único que mantiene vivo el
  // proceso — es evidencia adicional, no debe impedir un shutdown limpio.
  timer.unref?.();
}

async function intentarAhora(paymentId: string, reloj: RelojDeReintentos): Promise<void> {
  const tarea = cola.get(paymentId);
  if (!tarea) return;
  let resultado = normalizarResultadoAnchor(await anchorEvidence(tarea.body, tarea.opts));
  if (typeof resultado.skipped === "string" && esExitoOYaAnclado(resultado)) {
    // 409: alguien ancló bajo este `paymentId` en la ventana de 30/120/300 s.
    // El comprador tiene el texto plano desde t=0 y el tx es público, así
    // que "alguien" puede no ser el facilitador que volvió: se cruza el
    // `contentHash` igual que el camino inmediato (hallazgo del refutador de
    // cierre, ronda 3). Sea propio o ajeno, reintentar no lo supera: la
    // tarea sale de la cola.
    resultado = await recuperarEvidenciaAnclada(
      tarea.opts.facilitator ?? FACILITADOR_POR_DEFECTO,
      paymentId,
      contentHash(tarea.body),
      tarea.opts.fetch ?? fetch
    );
    cola.delete(paymentId);
    if (esExitoOYaAnclado(resultado)) {
      cerrarCorte();
      registro.info("x402", "anclaje diferido logrado", { paymentId, resultado, recuperadoPorGet: true });
    } else {
      registro.error("x402", "anclaje diferido: 409 sin registro propio (ajeno o GET caído); se abandona", undefined, {
        paymentId,
        resultado,
      });
    }
    return;
  }
  if (esExitoOYaAnclado(resultado)) {
    // Un anclaje que SÍ prende es la señal más fuerte de que el facilitador
    // volvió: cierra el cortacircuitos igual que `registrarResultadoAnchor`
    // en el camino principal. Pero un FALLO acá NO se cuenta contra el
    // contador (a diferencia del camino principal) — ver el comentario de
    // `UMBRAL_FALLOS_CONSECUTIVOS`: esta tarea es el reintento de UNA venta
    // YA cobrada, y sus hasta 3 fallos (`ESPERAS_MS`) son el 60% del umbral
    // — contarlos amplifica la falla de una sola venta contra ventas NUEVAS
    // que no tienen nada que ver (reparación DX402 punto 2 ronda 2, hallazgo
    // del refutador).
    cerrarCorte();
    cola.delete(paymentId);
    registro.info("x402", "anclaje diferido logrado", { paymentId, resultado });
    return;
  }
  tarea.intento += 1;
  agendar(paymentId, reloj);
}

/** Cuántas tareas hay en cola ahora mismo — para tests, nunca para lógica de negocio. */
export function tareasEnColaParaTest(): number {
  return cola.size;
}

/** Vacía la cola — solo para que los tests no se pisen entre sí. */
export function limpiarColaParaTest(): void {
  cola.clear();
}
