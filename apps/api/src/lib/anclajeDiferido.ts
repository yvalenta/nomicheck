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
import { anchorEvidence, type AnchorOptions } from "uvd-x402-sdk";
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
  const error = resultado.error;
  return typeof error === "string" && error.includes("already_anchored");
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

/** Actualiza el contador con el resultado de un anclaje REAL de una venta
 * NUEVA (el inmediato + su único reintento en `x402MuroDurable.ts` — nunca
 * el de la medición previa al cobro, que usa un `fetch` que no sale a la
 * red, y nunca los reintentos de `intentarAhora`, que NO cuentan contra este
 * contador — ver el comentario ahí abajo sobre por qué). */
export function registrarResultadoAnchor(resultado: Record<string, unknown>): void {
  if (esExitoOYaAnclado(resultado)) {
    fallosConsecutivos = 0;
    return;
  }
  fallosConsecutivos += 1;
  ultimoFalloMs = Date.now();
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
  return Date.now() - ultimoFalloMs >= VENTANA_MEDIO_ABIERTO_MS;
}

/** Solo para tests: vuelve el contador (y el reloj del medio-abierto) a
 * cero entre casos. */
export function resetContadorFallosParaTest(): void {
  fallosConsecutivos = 0;
  ultimoFalloMs = 0;
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
 */
export function programarAnclaje(
  paymentId: string,
  body: Uint8Array,
  opts: AnchorOptions,
  reloj: RelojDeReintentos = relojReal
): void {
  if (cola.has(paymentId)) return;
  if (cola.size >= TOPE_COLA) {
    registro.error("x402", "cola de anclaje diferido llena: se descarta el reintento", undefined, {
      paymentId,
      tope: TOPE_COLA,
    });
    return;
  }
  cola.set(paymentId, { body, opts, intento: 0 });
  agendar(paymentId, reloj);
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
  const resultado = normalizarResultadoAnchor(await anchorEvidence(tarea.body, tarea.opts));
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
    fallosConsecutivos = 0;
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
