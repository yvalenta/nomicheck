// Adaptador propio de `/verificar/durable` (DX402 punto 2, Parte 3 —
// implementar:adaptador).
//
// POR QUÉ NO `createMiddleware` DE `@faremeter/middleware/express`: esa
// función arma un `body` de UNA sola fase — `capture()` y, si sale bien,
// `next()` (informe `faremeter` §2, `express.js:47-53`) — y esta ruta
// necesita CUATRO fases dentro del MISMO `body`, en este orden exacto
// (decisión 4 del brief, "nada se sirve antes del settle; nada se cobra si
// la evidencia no puede producirse"):
//
//   1. `authorize()` — verificar el pago SIN cobrar, antes de calcular nada.
//   2. Calcular + sellar el sobre, y MEDIR el sellado contra el tope del
//      facilitador — todavía sin cobrar: si no entra, no se cobra.
//   3. `capture()` — recién acá se cobra.
//   4. Anclar la evidencia y responder con el sobre servido.
//
// Por eso este archivo reconstruye el wiring de Express que `express.js`
// hace a mano (informe `faremeter` §2, líneas 13-46: `resource`, `getHeader`,
// `getBody`, `setResponseHeader`, `sendJSONResponse`) y llama
// `common.handleMiddlewareRequest` directo, con SU PROPIO `body`.
//
// La otra diferencia con `express.js`: `sendJSONResponse` intercepta el 402
// para agregarle `extensions` de nivel superior y completar `extra.extensions`
// por accept si el facilitador no las hizo eco. No hay otro punto de
// inyección: `HandleMiddlewareRequestArgs`/`resourceInfo` no tienen ningún
// campo para `extensions` (informe `faremeter` §4 — "confirmado que la vía
// está muerta con el código actual"), así que hay que reescribir el
// header/cuerpo ANTES de que `sendJSONResponse` los mande.
import type { RequestHandler } from "express";
import type { common as FaremeterCommon } from "@faremeter/middleware";
import { ErrorDeDatos } from "@pv/reglas";
import {
  anchorEvidence,
  contentHash,
  dx402PaymentId as calcularPaymentId,
  evidenceHeader,
  type AnchorOptions,
} from "uvd-x402-sdk";
import {
  requisitosDePago,
  declaracionDurableEvidence,
  facilitadorDe,
  perfilFacilitador,
  nombreDeRed,
  AVALANCHE_MAINNET,
  DURABLE_EVIDENCE_INFO,
  COMPROBANTES_QUE_ENTRAN,
  type ConfigX402,
} from "./x402Config.js";
import { gruposConPropios, fetchDelFacilitador } from "./x402Muro.js";
import { calcularBatchVerificacion } from "../services/batchVerificacionService.js";
import { firmarSobre } from "../services/sobreSignatureService.js";
import { sinNulos, serializarOrdenado, ErrorDeCanonicalizacion } from "./sobre.js";
import { batchVerificacionSchema } from "../validation/batchVerificacion.js";
import { llaveDelPagador, ErrorSinLlaveDelPagador, type CargaDePago } from "./llaveDelPagador.js";
import {
  programarAnclaje,
  fetchConTimeout,
  esExitoOYaAnclado,
  registrarResultadoAnchor,
  anclajeDisponible,
  reservarMedioAbierto,
  liberarIntentoMedioAbierto,
  sondearFacilitador,
  recuperarEvidenciaAnclada,
  normalizarResultadoAnchor,
} from "./anclajeDiferido.js";
import { registro } from "./registro.js";

/**
 * El shape exacto de `x402Handlers`/`pricing`/`handleMiddlewareRequest` sale
 * de `@faremeter/middleware` SIN importar `@faremeter/types` acá: ese paquete
 * no es una dependencia directa de `apps/api` (solo lo es de
 * `@faremeter/middleware`), y TypeScript lo resuelve igual porque el import
 * de tipos atraviesa la propia declaración de `@faremeter/middleware`. Mismo
 * patrón que `muroDe` en `x402Muro.ts`, que nunca nombra `@faremeter/types`.
 */
type ArgsDurable = Parameters<typeof FaremeterCommon.handleMiddlewareRequest>[0];
export type X402HandlersDurable = NonNullable<ArgsDurable["x402Handlers"]>;
type PricingDurable = ArgsDurable["pricing"];

/**
 * Avalanche C-Chain es la ÚNICA red de esta ruta (decisión 2 del brief,
 * `REDES_POR_RUTA["/verificar/durable"]`): no hace falta parsear el chainId
 * del accept PAGADO porque acá solo puede haber uno, y parsearlo del accept
 * inventaría una segunda fuente de verdad paralela a
 * `AVALANCHE_MAINNET.caip2` que podría desincronizarse de ella.
 *
 * Lo que SÍ se corrigió (reparación DX402 punto 2, ronda 1, hallazgo del
 * refutador): el número `43114` estaba escrito TRES VECES a mano en este
 * archivo (acá, en `opcionesBase.network` y en el `paymentId`), una segunda
 * fuente de verdad de la que el comentario de arriba decía estar
 * escapando. Ahora las tres se derivan de `AVALANCHE_MAINNET.caip2` — la
 * única tabla que declara la red — así que un typo futuro en cualquiera de
 * los tres solo puede pasar si se edita `AVALANCHE_MAINNET` misma.
 */
const CHAIN_ID_AVALANCHE = Number(AVALANCHE_MAINNET.caip2.split(":")[1]);

/** `paymentId`/`txHash` de relleno para MEDIR el sellado sin haber cobrado
 * todavía (paso 2) — mismo largo que un valor real, que es lo único que le
 * importa a `JSON.stringify(payload).length` (informe `sdk` §6). */
const PLACEHOLDER_HEX32 = "0x" + "00".repeat(32);

/**
 * `fetch` que nunca toca la red, para la medición del paso 2. Solo se llama
 * si el sellado entró bajo el tope de tamaño (`anchorEvidence` revisa el
 * tamaño ANTES de llamar a `fetch` — informe `sdk` §6) — cuando entra, el
 * resultado de este `fetch` no importa: lo único que se mira es si
 * `skipped === "too_large"`, y eso ya se decidió antes de llegar acá.
 */
const fetchQueNoSale: typeof fetch = (async () => ({
  ok: false,
  status: 0,
  json: async () => ({}),
})) as unknown as typeof fetch;

function respuestaDeError(res: { status: (n: number) => { json: (b: unknown) => unknown } }, e: unknown): void {
  // `ErrorDeCanonicalizacion` (sobre.ts) es TAMBIÉN un error de datos, no del
  // servidor: la dispara un `valorDeclarado` que el comprador mandó (un
  // decimal fuera del rango que JS/Ruby pueden reproducir igual, un entero
  // que no cabe en 2^53-1, un surrogate UTF-16 suelto) — nunca un fallo de
  // NomiCheck. Antes cualquiera de esos casos salía como 500 `internal_error`
  // filtrando el mensaje interno de canonicalización, Y bloqueaba
  // `/verificar/durable` para una entrada que `/verificar` plano sí sirve
  // (reparación DX402 punto 2, ronda 1, hallazgo del refutador).
  if (e instanceof ErrorDeDatos || e instanceof ErrorDeCanonicalizacion) {
    res.status(400).json({ error: "invalid_input", mensaje: e.message });
  } else {
    res.status(500).json({ error: "internal_error", mensaje: e instanceof Error ? e.message : "Error inesperado" });
  }
}

/** Agrega `extra.extensions["durable-evidence"]` a un accept SI FALTA —
 * `requisitoDePago` ya lo pone (Parte 2), pero el facilitador podría no
 * hacerle eco en su respuesta de `/accepts` (informe `faremeter` §3: "extra
 * sobrevive de punta a punta SOLO si el facilitador lo hace eco"), y esta es
 * la red de seguridad para ese caso. Nunca REEMPLAZA el accept: solo mezcla
 * esa clave. */
function conDurableEvidenceExtra(accept: Record<string, unknown>): Record<string, unknown> {
  const extra = { ...((accept.extra as Record<string, unknown> | undefined) ?? {}) };
  const extensions = { ...((extra.extensions as Record<string, unknown> | undefined) ?? {}) };
  if (!("durable-evidence" in extensions)) {
    extensions["durable-evidence"] = DURABLE_EVIDENCE_INFO;
  }
  extra.extensions = extensions;
  return { ...accept, extra };
}

function conExtensionesPorAccept(cuerpo: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(cuerpo.accepts)) return cuerpo;
  return { ...cuerpo, accepts: (cuerpo.accepts as Record<string, unknown>[]).map(conDurableEvidenceExtra) };
}

/**
 * El accept PROPIO que corresponde a `a` (o `undefined`): coincide EXACTO
 * —esquema, red, activo, `payTo` y monto— con uno de los que
 * `requisitosDePago(cfg, "/verificar/durable")` declaró (ya convertidos a forma v2 con `common.relaxedRequirementsToV2`,
 * que es la misma forma en la que llegan los `accepts` que devuelve
 * `getRequirements()` — de ahí que se comparen `amount` contra `amount`, no
 * `amount` contra `maxAmountRequired`).
 *
 * Comparar SOLO la red (como hacía la versión anterior de este filtro) deja
 * pasar un accept eco del facilitador con la red correcta pero OTRO `payTo`
 * u OTRO `asset`: el comprador firma un `transferWithAuthorization` hacia
 * ese tercero, `/verify` y `/settle` del facilitador dan verde contra su
 * propio requirement (nunca contra el nuestro), y nomicheck sirve el sobre y
 * ancla un recibo que declara `payee: cfg.payTo` para una plata que nunca
 * llegó ahí (hallazgo del refutador, reparación DX402 punto 2 ronda 2).
 * `payTo`/`asset` se comparan sin distinguir mayúsculas — son direcciones
 * EVM/checksums que pueden llegar en cualquier casing.
 */
/**
 * `eip155:43114` y su nombre legado `avalanche` son la MISMA red: faremeter
 * pasa todo por `normalizeNetworkId`, y el facilitador puede ecoar el nombre
 * que él mismo exige en `/settle` (`fetchDelFacilitador`, `x402Muro.ts`).
 * Comparar el string crudo descartaba el accept propio ante un eco legado y
 * la ruta dejaba de vender (hallazgo del refutador `dinero`, ronda 3).
 * `nombreDeRed` es la tabla de la casa (`REDES_X402`): un CAIP-2 conocido va
 * a su nombre, cualquier otra cosa queda tal cual.
 */
function mismaRed(x: unknown, y: unknown): boolean {
  if (typeof x !== "string" || typeof y !== "string") return x === y;
  return nombreDeRed(x).toLowerCase() === nombreDeRed(y).toLowerCase();
}

function acceptPropioDe(
  a: Record<string, unknown>,
  propios: Record<string, unknown>[]
): Record<string, unknown> | undefined {
  const iguales = (x: unknown, y: unknown): boolean =>
    typeof x === "string" && typeof y === "string" ? x.toLowerCase() === y.toLowerCase() : x === y;
  return propios.find(
    (p) =>
      p.scheme === a.scheme &&
      mismaRed(p.network, a.network) &&
      iguales(p.asset, a.asset) &&
      iguales(p.payTo, a.payTo) &&
      p.amount === a.amount
  );
}

/**
 * Filtra los `accepts` que cada handler anuncia a los que esta ruta declaró
 * de verdad (`acceptPropioDe`, arriba).
 *
 * POR QUÉ HACE FALTA, si `requisitosDePago` YA filtra antes de construir
 * `acceptsOverride`: ese filtro decide lo que NOSOTROS declaramos, pero
 * `resolveX402Requirements` (`@faremeter/types/dist/src/x402-handlers.js`,
 * informe `faremeter` §3) arma el `accepts` publicado en el 402 llamando a
 * `handler.getRequirements()` y usa lo que ESE devuelva tal cual —sin
 * volver a filtrarlo contra `acceptsOverride` ni contra `pricing`—, y un
 * facilitador que "enriquece" (sirve más ofertas en el mismo `/accepts`, o
 * simplemente hace un eco distinto del que pedimos) puede devolver accepts
 * que NO son los nuestros. `handleMiddlewareRequest` (`common.js` de
 * `@faremeter/middleware`) arma `context.paymentRequirements` DIRECTO de lo
 * que este filtro deja pasar —nunca de lo que el comprador manda—, así que
 * filtrar acá es el único punto de control: lo que sobrevive es lo único que
 * puede terminar publicado en el 402, pagado, y anclado.
 *
 * Filtrar acá (envolviendo cada handler ANTES de dárselo a
 * `common.handleMiddlewareRequest`) es lo que hace esto testeable con
 * handlers dobles, igual que el resto de este archivo — no hay que montar
 * `muroDurableDe` completa ni pegarle a un facilitador real para probarlo.
 */
function conAcceptsFiltrados(
  cfg: ConfigX402,
  common: typeof FaremeterCommon,
  handlers: X402HandlersDurable
): X402HandlersDurable {
  const propios = requisitosDePago(cfg, "/verificar/durable").map(
    (a) => common.relaxedRequirementsToV2(a) as Record<string, unknown>
  );
  if (propios.length === 0) return handlers;
  return handlers.map((h) => ({
    ...h,
    getRequirements: async (...args: Parameters<typeof h.getRequirements>) => {
      const todos = await h.getRequirements(...args);
      // Los que sobreviven salen con la red TAL COMO LA DECLARAMOS (CAIP-2):
      // el eco puede traer el nombre legado (`avalanche`), y la tabla legada
      // de faremeter (`@faremeter/info`, `legacyNameToCAIP2`) no lo conoce —
      // un comprador v2 con `accepted.network = eip155:43114` nunca casaría
      // contra ese eco en `findMatching` y recibiría 402 tras 402. El accept
      // es propio: restaurar nuestra propia declaración no inventa nada
      // (revisión de la sesión madre, ronda 3).
      const filtrados = todos.flatMap((a) => {
        const propio = acceptPropioDe(a as Record<string, unknown>, propios);
        return propio ? [{ ...(a as Record<string, unknown>), network: propio.network } as typeof a] : [];
      });
      if (todos.length > 0 && filtrados.length === 0) {
        // Una ruta paga que deja de vender NO puede verse igual que "nadie
        // compró" (`problemasDeConfig`, x402Config.ts): sin este log, el 402
        // salía con `accepts: []` y sin `extensions`, mudo (hallazgo del
        // refutador `dinero`, ronda 3).
        const resumen = (r: unknown) => {
          const o = r as Record<string, unknown>;
          return { network: o.network, asset: o.asset, payTo: o.payTo, amount: o.amount };
        };
        registro.error(
          "x402",
          "/verificar/durable: el facilitador no ecoó ningún accept propio; el 402 sale sin ofertas",
          undefined,
          { ecoados: todos.map(resumen), propios: propios.map(resumen) }
        );
      }
      return filtrados;
    },
  }));
}

/**
 * El valor de `X-Durable-Evidence` para un resultado de anchor YA resuelto
 * (el 409 pasa antes por `recuperarEvidenciaAnclada`, `anclajeDiferido.ts`,
 * que o trae el pointer real o deja un `skipped` con motivo).
 *
 * Todo `skipped` post-cobro lleva `paymentId` + `contentHash`, y `deferred`
 * cuando la cola en memoria va a reintentar: el 503 del facilitador es
 * RETRYABLE ("do not record as 'no evidence'", openapi de `/dx402/anchor`), y
 * el comprador tiene que poder volver a preguntar por
 * `GET /dx402/evidence/{paymentId}` en vez de leer "no se ancló nada" como
 * final (hallazgo del refutador `protocolo`, ronda 3).
 */
function encabezadoEvidencia(
  resultado: Record<string, unknown>,
  paymentId: string,
  cuerpo: Buffer,
  diferido: boolean
): string {
  if (typeof resultado.skipped !== "string") return evidenceHeader(resultado);
  return evidenceHeader({
    ...resultado,
    paymentId,
    contentHash: contentHash(cuerpo),
    ...(diferido ? { deferred: true } : {}),
  });
}

/**
 * El núcleo testeable: recibe `x402Handlers` ya construidos (los reales, o
 * dobles de test) y arma el middleware de Express entero. `muroDurableDe`
 * (más abajo) es la única que construye los handlers reales — separarlo así
 * es lo que permite probar las tres fases del `body` sin pegarle a ningún
 * facilitador de verdad (regla de la casa: nada de POST reales al
 * facilitador en los tests).
 */
export function crearMiddlewareDurable(
  cfg: ConfigX402,
  common: typeof FaremeterCommon,
  x402Handlers: X402HandlersDurable,
  pricing: PricingDurable
): RequestHandler {
  const handlersFiltrados = conAcceptsFiltrados(cfg, common, x402Handlers);
  // Sin `next` en la firma A PROPÓSITO (reparación DX402 punto 2, ronda 1):
  // antes este handler llamaba `common.handleMiddlewareRequest(reqArgs)
  // .catch(next)` puertas adentro, así que la función siempre devolvía
  // `undefined` de forma SÍNCRONA y el `.then(...).catch(...)` de
  // `montarMuroX402` (x402Muro.ts) nunca veía el rechazo — un `handleSettle`
  // que revienta (el facilitador cuelga, contesta HTML, etc.) salía como
  // 500 `Error interno` genérico en vez del 424 `facilitator_error` legible
  // que esa ruta existe para dar (mismo 424 que ya tiene `muroDe`, ver el
  // comentario largo de `x402Muro.ts:montarMuroX402`). Devolver la promesa
  // TAL CUAL, sin capturarla acá, es lo que deja que ese `.catch()` de
  // arriba la vea (hallazgo del refutador).
  return (req, res) => {
    const resource = `${req.protocol}://${req.headers.host}${req.path}`;
    // `true` desde el instante en que se llama `context.capture()`. Lo lee
    // `sendJSONResponse`: faremeter manda su 402 "pagá" DESDE ADENTRO de
    // `capture()` (`sendPaymentRequired()`, `common.js`) cuando el settle
    // reporta fallo, antes de devolver `success:false` — así que el único
    // lugar donde ese 402 se puede convertir en otra cosa es la función que
    // lo escribe, no el `if (!cap.success)` de más abajo (ahí la respuesta
    // ya salió).
    let cobroIntentado = false;
    // La identidad de la reserva del medio-abierto si ESTA request la tomó
    // (`reservarMedioAbierto`): el `finally` de abajo la libera aunque la
    // request muera antes de informar un resultado (single-flight sin
    // deadlock — hallazgo del refutador de cierre, ronda 3). Lleva identidad
    // y no un booleano para que una reserva vencida y reemplazada no suelte
    // la de otra venta al terminar tarde (ver `reservaVigente` en
    // `anclajeDiferido.ts`).
    let reservaMedioAbierto: number | null = null;
    const reqArgs: ArgsDurable = {
      x402Handlers: handlersFiltrados,
      pricing,
      resource,
      supportedVersions: { x402v1: true, x402v2: true },
      getHeader: (key) => req.header(key),
      // Mismo comentario que `express.js:21-24`: solo sirve con Buffer/string
      // crudo. Esta ruta no usa MPP, así que no hace falta que funcione —
      // se replica por fidelidad al wiring, no porque algo lo consuma.
      getBody: async () => {
        if (!req.body) return null;
        if (Buffer.isBuffer(req.body)) return new Uint8Array(req.body).buffer as ArrayBuffer;
        if (typeof req.body === "string") return new TextEncoder().encode(req.body).buffer as ArrayBuffer;
        return null;
      },
      setResponseHeader: (key, value) => res.setHeader(key, value),
      sendJSONResponse: (status, body, headers) => {
        if (status === 402 && cobroIntentado) {
          // Un 402 después de intentar cobrar es el settle reportado como
          // fallido. NO se reenvía: un 402 significa "pagá", y si la
          // autorización llegó a liquidarse antes del fallo reportado, un
          // cliente x402 que obedece paga DOS VECES sin vuelta atrás — la
          // misma regla que `montarMuroX402` (x402Muro.ts) escribe para el
          // settle que revienta. 424 sin `PAYMENT-REQUIRED` (no se invita a
          // repagar); `PAYMENT-RESPONSE` ya viaja con el `errorReason` del
          // facilitador porque faremeter lo setea antes de este punto
          // (hallazgo del refutador `dinero`, ronda 3).
          registro.error("x402", "settle fallido en /verificar/durable: el 402 de faremeter sale como 424", undefined, {
            paymentResponse: res.getHeader("PAYMENT-RESPONSE") ?? res.getHeader("X-PAYMENT-RESPONSE"),
          });
          return res.status(424).json({
            error: "settle_failed",
            mensaje:
              "El facilitador reportó la liquidación como fallida (el motivo viene en PAYMENT-RESPONSE). " +
              "No se entregó el recurso. Si PAYMENT-RESPONSE no trae `transaction`, nada se liquidó y " +
              "podés pagar de nuevo con una autorización nueva; si trae una, mirá ese tx antes: un " +
              "pago nuevo sobre una autorización que sí liquidó cobra dos veces.",
          });
        }
        let cuerpo = body as Record<string, unknown> | undefined;
        const headersFinales = headers ? { ...headers } : undefined;
        if (status === 402) {
          const encabezado = headersFinales?.["PAYMENT-REQUIRED"];
          if (headersFinales && encabezado) {
            try {
              const decodificado = JSON.parse(atob(encabezado)) as Record<string, unknown>;
              const conExtra = conExtensionesPorAccept(decodificado);
              // `acceptIndexes` real: TODOS los índices de `accepts` que
              // sobrevivieron `conAcceptsFiltrados` -- cada uno de ellos YA
              // es un accept propio (nunca hace falta volver a comprobar
              // cuál). Con `accepts` vacío (el facilitador no ecoó ningún
              // accept propio) no hay ninguna oferta que declarar durable:
              // `extensions` se OMITE entero en vez de señalar el índice 0
              // de un array que no tiene índice 0 — una promesa de evidencia
              // durable sobre una oferta que no existe (reparación DX402
              // punto 2 ronda 2, hallazgo del refutador).
              const accepts = Array.isArray(conExtra.accepts) ? (conExtra.accepts as unknown[]) : [];
              if (accepts.length > 0) {
                conExtra.extensions = declaracionDurableEvidence(accepts.map((_, i) => i));
              } else {
                delete conExtra.extensions;
              }
              headersFinales["PAYMENT-REQUIRED"] = btoa(JSON.stringify(conExtra));
            } catch {
              // Un header que no se puede decodificar no se inventa uno
              // nuevo: se manda tal cual llegó. Peor publicar nada que
              // publicar un header roto.
            }
          }
          // El cuerpo v1 (SIEMPRE el que viaja como JSON — informe
          // `faremeter` §4: "faremeter manda header v2 + body v1 en la misma
          // respuesta 402") no tiene campo para `extensions` de nivel
          // superior en su tipo, pero se le cuelga igual — el mismo criterio
          // que `desafioDeDescubrimiento` (x402Muro.ts) ya aplica al 402 del
          // GET: un comprador v1 que POSTea lee el cuerpo, no el header, y la
          // puerta previa al pago de testigo exige `info.acceptIndexes` en el
          // nivel superior. Un parser v1 estricto ignora la clave; sin ella,
          // el 402 de venta y el de descubrimiento decían cosas distintas
          // (hallazgo del refutador `protocolo`, ronda 3).
          if (cuerpo) {
            cuerpo = conExtensionesPorAccept(cuerpo);
            const acceptsV1 = Array.isArray(cuerpo.accepts) ? (cuerpo.accepts as unknown[]) : [];
            if (acceptsV1.length > 0) {
              cuerpo.extensions = declaracionDurableEvidence(acceptsV1.map((_, i) => i));
            } else {
              delete cuerpo.extensions;
            }
          }
        }
        res.status(status);
        if (headersFinales) {
          for (const [k, v] of Object.entries(headersFinales)) res.setHeader(k, v);
        }
        if (cuerpo) return res.json(cuerpo);
        return res.end();
      },
      body: async (context) => {
        // Esta ruta no configura `mppMethodHandlers`, así que `context` nunca
        // es la variante MPP en la práctica — pero `MiddlewareBodyContext` es
        // una unión de las tres, y solo angostándola acá TypeScript deja ver
        // `authorize`/`capture`/`paymentPayload`/`paymentRequirements`, que
        // en la variante MPP tienen otra forma (o no existen).
        if (context.protocolVersion === "mpp") {
          res.status(500).json({
            error: "internal_error",
            mensaje: "protocolo mpp no soportado en /verificar/durable",
          });
          return undefined;
        }

        // 1) Verificar SIN cobrar.
        const auth = await context.authorize();
        if (!auth.success) return auth.errorResponse;

        // 2) Calcular + sellar el sobre. `problemaDeEntrada` ya validó este
        // mismo cuerpo contra el mismo esquema en `montarMuroX402` antes de
        // llegar acá (`validacionPrevia.ts` con
        // `ESQUEMA_POR_RUTA["/verificar/durable"]`) — este `safeParse` es
        // para TIPAR, no para validar de nuevo; si de todos modos fallara
        // (el esquema cambió entre una validación y la otra), no se sirve
        // nada sin comprobar dos veces.
        const parsed = batchVerificacionSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
          return undefined;
        }

        let cuerpo: Buffer;
        try {
          const sinFirma = await calcularBatchVerificacion(parsed.data);
          // `habeasData` de `calcularBatchVerificacion` es la constancia
          // COMPARTIDA con `/verificar` plano (`construirHabeasData()`,
          // `batchPublicoService.ts`): dice que NomiCheck no persiste, pero
          // no dice nada del propio facilitador, que SÍ hospeda el
          // ciphertext 90 días — justo lo que este comprador está pagando
          // (`DURABLE_EVIDENCE_INFO.retention`, `DESCRIPCIONES["/verificar/durable"]`).
          // Se agrega ACÁ, no en `construirHabeasData()`: esa función la
          // comparten seis rutas más que no tienen esta retención externa, y
          // tocarla ahí se lo hubiera colgado a todas (hallazgo del
          // refutador, reparación DX402 punto 2 ronda 1).
          const conRetencionExterna = {
            ...sinFirma,
            habeasData: {
              ...sinFirma.habeasData,
              // Sin `revocable: true`: en el vocabulario del facilitador
              // (`/dx402/stats`) "revocable" es una propiedad del store —no
              // es permanente, a diferencia de `ipfs-public`—, no una
              // operación que el comprador pueda invocar: su openapi
              // (2026-09-10) no tiene DELETE ni revoke, solo anchor, blob,
              // evidence, receipt, recover, repair y stats. Firmado bajo
              // `habeasData` se leía como un derecho que nadie puede ejercer
              // (hallazgo del refutador `protocolo`, ronda 3). Lo que SÍ es
              // cierto y verificable: vence, y al vencer el blob contesta
              // 410; no hay borrado anticipado a pedido.
              retencionExterna: {
                donde: "facilitador DX402 (cifrado, solo lo abre el pagador)",
                plazo: DURABLE_EVIDENCE_INFO.retention,
                alVencer: "el facilitador deja de servir el cifrado (410)",
                borradoAPedido: false,
              },
            },
          };
          const sobreFirmado = firmarSobre(sinNulos(conRetencionExterna));
          cuerpo = Buffer.from(serializarOrdenado(sobreFirmado), "utf8");
        } catch (e) {
          respuestaDeError(res, e);
          return undefined;
        }

        // La llave del pagador: se recupera de la MISMA firma que ya
        // autorizó el pago, contra el dominio EIP-712 del accept pagado
        // (`llaveDelPagador.ts` explica por qué se contrasta contra `from`).
        const carga = (context.paymentPayload as { payload: unknown }).payload as CargaDePago;
        const requisitos = context.paymentRequirements as unknown as {
          network: string;
          asset: string;
          extra?: { name?: string; version?: string };
        };

        // La red del accept PAGADO tiene que ser Avalanche: es la única que
        // `REDES_POR_RUTA` permite acá, y el dominio EIP-712/chainId de más
        // abajo están fijos a esa red. Si el filtro de `conAcceptsFiltrados`
        // fallara (o el facilitador liquidara con un accept que no filtramos
        // nosotros), un accept de otra red igual NO debe llegar a calcularse
        // el digest con el dominio equivocado — eso recupera una llave
        // válida de un extraño y sale como `no_payer_key`, un error que le
        // echa la culpa a la firma del comprador cuando la causa real es la
        // red (hallazgo del refutador, reparación DX402 punto 2 ronda 1).
        // `mismaRed`, no `!==`: el accept pagado es el que el facilitador
        // ecoó y sobrevivió al filtro, y puede venir con el nombre legado
        // (`avalanche`) — comparar el string crudo dejaba pasar la oferta y
        // mataba la venta acá con 422 `red_no_soportada` (revisión de la
        // sesión madre, ronda 3). El dominio, el `network` del anchor y el
        // `paymentId` siguen saliendo de `AVALANCHE_MAINNET`, nunca del eco.
        if (!mismaRed(requisitos.network, AVALANCHE_MAINNET.caip2)) {
          registro.error("x402", "accept pagado en una red que /verificar/durable no liquida", undefined, {
            network: requisitos.network,
          });
          res.status(422).json({
            error: "red_no_soportada",
            mensaje:
              `El accept pagado declara la red ${JSON.stringify(requisitos.network)}, pero ` +
              `/verificar/durable solo liquida en ${AVALANCHE_MAINNET.caip2} (Avalanche C-Chain). ` +
              "No se calcula el digest del pagador con el dominio de otra red.",
          });
          return undefined;
        }

        // El dominio EIP-712 sale de la MISMA tabla que armó el accept
        // (`AVALANCHE_MAINNET.eip712`, ya medida on-chain — `x402Config.ts`),
        // no del eco de `extra` que devuelva el facilitador: `extra`
        // sobrevive de punta a punta SOLO si el facilitador lo hace eco
        // (informe `faremeter` §3), y uno que no lo haga dejaba
        // `name`/`version` en `""`, lo que recupera la llave de un extraño
        // con el mismo `no_payer_key` — para una firma que en realidad es
        // correcta (hallazgo del refutador). Si el eco DIFIERE del dominio
        // real, se loguea (podría ser una señal de que algo cambió on-chain)
        // pero no bloquea la venta: el dominio real es el que manda.
        const dominioReal = AVALANCHE_MAINNET.eip712;
        if (requisitos.extra?.name && requisitos.extra.name !== dominioReal.name) {
          registro.warn("x402", "el eco de extra.name del facilitador difiere del dominio real", {
            eco: requisitos.extra.name,
            real: dominioReal.name,
          });
        }
        if (requisitos.extra?.version && requisitos.extra.version !== dominioReal.version) {
          registro.warn("x402", "el eco de extra.version del facilitador difiere del dominio real", {
            eco: requisitos.extra.version,
            real: dominioReal.version,
          });
        }

        // El tercer campo del dominio, `verifyingContract`, sale de la MISMA
        // tabla que `name`/`version`, no del eco de `asset`: `acceptPropioDe`
        // ya garantiza que el accept pagado lleva NUESTRO asset, así que un
        // eco distinto (USDC.e en vez del nativo) o ausente solo puede
        // desviar el dominio — y con `asset` ausente viem OMITE
        // `verifyingContract` y recupera otra dirección válida sin error
        // (hallazgo del refutador `identidad`, ronda 3). Se loguea y manda
        // la tabla, igual que con `name`/`version`.
        if (
          typeof requisitos.asset !== "string" ||
          requisitos.asset.toLowerCase() !== AVALANCHE_MAINNET.asset.toLowerCase()
        ) {
          registro.warn("x402", "el eco de asset del facilitador difiere del USDC de la tabla", {
            eco: requisitos.asset,
            real: AVALANCHE_MAINNET.asset,
          });
        }

        let payerKey: Uint8Array;
        try {
          payerKey = await llaveDelPagador(carga, {
            name: dominioReal.name,
            version: dominioReal.version,
            chainId: CHAIN_ID_AVALANCHE,
            verifyingContract: AVALANCHE_MAINNET.asset as `0x${string}`,
          });
        } catch (e) {
          res.setHeader("X-Durable-Evidence", evidenceHeader({ v: 1, skipped: "no_payer_key" }));
          res.status(422).json({
            error: "no_payer_key",
            mensaje: e instanceof ErrorSinLlaveDelPagador ? e.message : "no se pudo recuperar la llave del pagador",
          });
          return undefined;
        }

        const payer = carga.authorization.from;
        const opcionesBase = {
          payerKey,
          network: AVALANCHE_MAINNET.caip2,
          payer,
          payee: cfg.payTo,
          backend: DURABLE_EVIDENCE_INFO.backend,
          // `storage` es el SELECTOR (`AnchorOptions`, uvd-x402-sdk: "which
          // backend to anchor to … omit to take the facilitator's default");
          // `backend` de arriba es solo "declared, not measured". Sin
          // `storage`, cada 402 publicaba s3 y cada venta aterrizaba en el
          // default del facilitador (`ipfs`, medido en `/dx402/stats`), y el
          // log de "backend real difiere" sonaba el 100 % de las veces
          // (hallazgo del refutador `protocolo`, ronda 3).
          storage: DURABLE_EVIDENCE_INFO.backend,
          retention: DURABLE_EVIDENCE_INFO.retention,
          facilitator: facilitadorDe(cfg, AVALANCHE_MAINNET),
        };

        // MEDIR antes de cobrar: sella con la llave real y el tamaño real,
        // pero con ids de relleno y un `fetch` que no sale a la red — solo
        // interesa si el resultado es `skipped:"too_large"`. `fetchQueNoSale`
        // nunca devuelve algo que `anchorEvidence` reenvíe tal cual (siempre
        // sale de la rama `too_large` o de la que arma el objeto de arriba),
        // pero se normaliza igual por si acaso: es la MISMA lectura de
        // `.skipped` que el resultado real de más abajo, y la regla de este
        // archivo es no leer un resultado del SDK sin normalizar antes.
        const medida = normalizarResultadoAnchor(
          await anchorEvidence(cuerpo, {
            ...opcionesBase,
            paymentId: PLACEHOLDER_HEX32,
            txHash: PLACEHOLDER_HEX32,
            fetch: fetchQueNoSale,
          })
        );
        if (medida.skipped === "too_large") {
          res.setHeader("X-Durable-Evidence", evidenceHeader({ v: 1, skipped: "too_large" }));
          res.status(413).json({
            error: "too_large_for_durable",
            mensaje:
              "El lote sellado supera lo que el facilitador puede anclar (64 KiB por request; " +
              `en la práctica unos ${COMPROBANTES_QUE_ENTRAN} comprobantes de 4 líneas por llamada). ` +
              "Partí el lote o usá POST /api/batch/verificar; no se cobró.",
            limite: { requestSelladoBytes: 64 * 1024, comprobantesAprox: COMPROBANTES_QUE_ENTRAN },
          });
          return undefined;
        }

        // El cortacircuitos: si el anclaje viene fallando de forma sostenida
        // (`anclajeDiferido.ts`, `anclajeDisponible`), no se cobra por una
        // evidencia que la racha reciente dice que no se va a poder anclar
        // — es la misma ley que el tope de tamaño de arriba ("nada se cobra
        // si la evidencia no puede producirse", decisión 4 del brief),
        // aplicada al caso en que el facilitador rechace anclajes de forma
        // sostenida (p. ej. si activa `DX402_REQUIRE_PROOF` en su fase 2 —
        // hallazgo del refutador, ver dudas de esta reparación).
        //
        // 424, no 503: este despliegue vive detrás de Cloudflare, que se
        // come el cuerpo de los 502/503/504 y lo reemplaza por 16 bytes de
        // texto plano ("error code: 502") — medido y documentado en
        // `x402Muro.ts` (comentario de `montarMuroX402`, 2026-08-03). El
        // cuerpo de este error es justo la información que decide qué hace
        // el comprador ("no se cobró, probá /verificar"), así que tiene que
        // viajar por un código que el proxy deje pasar intacto. 424 es el
        // mismo que este archivo ya usa para el fallo del facilitador
        // (`construirAppConCatch424` en el test, y `montarMuroX402` en
        // producción) y tiene la misma semántica: la petición dependía de un
        // tercero y ese tercero falló (reparación DX402 punto 2 ronda 2,
        // hallazgo del refutador).
        const noDisponible = (): undefined => {
          res.setHeader("X-Durable-Evidence", evidenceHeader({ v: 1, skipped: "anchor_failed", error: "circuit_open" }));
          res.status(424).json({
            error: "durable_evidence_unavailable",
            mensaje:
              "El anclaje de evidencia durable viene fallando de forma sostenida. No se cobró. " +
              "Probá con POST /api/batch/verificar mientras tanto.",
          });
          return undefined;
        };
        if (!anclajeDisponible()) return noDisponible();
        // Medio-abierto, UNA venta a la vez (`reservarMedioAbierto`: las
        // demás que lleguen mientras esta lo usa reciben 424 sin cobrar).
        // La prueba de que el facilitador volvió de una CAÍDA es un GET
        // gratis a `/dx402/stats`, no la venta del siguiente comprador (antes
        // el que caía en la ventana pagaba 0,02 por ser la sonda — hallazgo
        // del refutador `dinero`, ronda 3). Si la sonda falla, cuenta como
        // fallo y rearma la ventana sin cobrar; mira también que nuestro
        // backend figure `enabled` en stats. Lo que la sonda NO ve es un
        // rechazo por POLÍTICA del anchor (402 con stats en 200): para
        // eso `anclajeDisponible` usa una ventana de una hora
        // (`VENTANA_MEDIO_ABIERTO_POLITICA_MS`), y esta venta única es la
        // sonda cara — no hay una gratis (refutador de cierre, ronda 3).
        const admision = reservarMedioAbierto();
        if (admision.admision === "ocupado") return noDisponible();
        if (admision.admision === "medio-abierto") {
          reservaMedioAbierto = admision.reserva;
          const vivo = await sondearFacilitador(
            opcionesBase.facilitator,
            fetchConTimeout(3000),
            DURABLE_EVIDENCE_INFO.backend
          );
          if (!vivo) {
            registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", error: "sonda_medio_abierto" });
            return noDisponible();
          }
        }

        // 3) Recién acá se cobra.
        cobroIntentado = true;
        const cap = await context.capture();
        if (!cap.success) {
          // La respuesta YA salió: faremeter mandó su 402 desde adentro de
          // `capture()` y `sendJSONResponse` (arriba) lo convirtió en el 424
          // `settle_failed`. Acá solo queda el motivo para el registro.
          const motivo = "errorMessage" in cap && typeof cap.errorMessage === "string" ? cap.errorMessage : undefined;
          registro.error("x402", "settle fallido en /verificar/durable", undefined, { motivo });
          return undefined;
        }

        // 4) Anclar y responder. Un reintento inmediato si el primer anchor
        // falla; si el segundo también falla, se agenda un reintento
        // diferido y se responde igual — el pago ya liquidó, y la respuesta
        // no puede quedar esperando a que el facilitador conteste.
        //
        // `tx` se valida y normaliza ANTES de derivar nada de él: un
        // `/settle` que no trae `transaction` (faremeter lo tolera con
        // `?? ""` — `common.js` de `@faremeter/middleware`) produce, sin
        // este chequeo, el MISMO `paymentId` —una constante— para CUALQUIER
        // venta: la segunda pisa a la primera (hallazgo del refutador,
        // reparación DX402 punto 2 ronda 1). Se normaliza a minúsculas
        // porque `testigo` (Ruby) y el facilitador derivan el mismo
        // `paymentId` en minúsculas — un `txHash` en mayúsculas produciría
        // un id distinto del que el comprador puede re-derivar.
        const txCruda = cap.response.transaction;
        const tx = typeof txCruda === "string" ? txCruda.toLowerCase() : "";
        if (!/^0x[0-9a-f]{64}$/.test(tx)) {
          registro.error("x402", "settle sin txHash valido: no se ancla con un id inventado", undefined, {
            transaction: txCruda,
          });
          // Cuenta contra el cortacircuitos: este camino cobra y NO ancla, y
          // era el único post-`capture()` que no lo informaba — un facilitador
          // que deje de devolver `transaction` vendía la garantía rota venta
          // tras venta sin que el corte se enterara (hallazgo del refutador
          // `dinero`, ronda 3). Sin `paymentId` no hay reintento posible.
          registrarResultadoAnchor({ v: 1, skipped: "anchor_failed", error: "settle_sin_txhash" });
          res.setHeader(
            "X-Durable-Evidence",
            evidenceHeader({ v: 1, skipped: "anchor_failed", error: "settle_sin_txhash", contentHash: contentHash(cuerpo) })
          );
          res.status(200).type("application/json").send(cuerpo);
          return undefined;
        }

        const idDePago = calcularPaymentId(AVALANCHE_MAINNET.caip2, tx);
        const opcionesAnchor: AnchorOptions = {
          ...opcionesBase,
          paymentId: idDePago,
          txHash: tx,
          // 3s x 2 intentos = 6s de presupuesto TOTAL post-cobro, no 8s x 2
          // = 16s. La respuesta ya está pagada en este punto: un cliente con
          // timeout de 10s —default de muchos agentes— cortaba ANTES de
          // recibirla, y el sobre no se persiste en ningún lado
          // (`anclajeDiferido.ts`) — perdido así, es irrecuperable (hallazgo
          // del refutador, reparación DX402 punto 2 ronda 1).
          fetch: fetchConTimeout(3000),
        };

        // `normalizarResultadoAnchor` en la ÚNICA entrada de cada resultado
        // crudo: sin esto, un `null` (JSON válido, `res.json()` de la línea
        // que abajo dispara) hace explotar `registrarResultadoAnchor` con un
        // TypeError DESPUÉS de `capture()` (el pago ya liquidó), y un
        // `123`/`[]`/`"ok"` se cuela como éxito sin haber anclado nada
        // (reparación DX402 punto 2 ronda 2, hallazgo del refutador).
        // Un 409 `dx402_already_anchored` se RESUELVE antes de registrarse:
        // `recuperarEvidenciaAnclada` distingue si el registro es el nuestro
        // (pointer real al header, éxito) o AJENO / irrecuperable (`skipped`
        // con `paymentId` + `contentHash`, y `error: "registro_ajeno"` si se
        // supo). Registrar el 409 crudo reseteaba el cortacircuitos ANTES de
        // saber que la venta quedó sin evidencia propia (hallazgo del
        // refutador de cierre, ronda 3). Con registro de por medio no se
        // reintenta ni se difiere: un anclaje provisional nunca lo supera.
        const resolver = async (
          crudo: unknown
        ): Promise<{ resultado: Record<string, unknown>; huboRegistro: boolean }> => {
          const r = normalizarResultadoAnchor(crudo);
          if (typeof r.skipped !== "string" || !esExitoOYaAnclado(r)) return { resultado: r, huboRegistro: false };
          return {
            resultado: await recuperarEvidenciaAnclada(
              opcionesBase.facilitator,
              idDePago,
              contentHash(cuerpo),
              fetchConTimeout(3000)
            ),
            huboRegistro: true,
          };
        };
        let { resultado, huboRegistro } = await resolver(await anchorEvidence(cuerpo, opcionesAnchor));
        registrarResultadoAnchor(resultado);
        let diferido = false;
        if (!esExitoOYaAnclado(resultado) && !huboRegistro) {
          ({ resultado, huboRegistro } = await resolver(await anchorEvidence(cuerpo, opcionesAnchor)));
          registrarResultadoAnchor(resultado);
          if (!esExitoOYaAnclado(resultado) && !huboRegistro) {
            diferido = programarAnclaje(idDePago, cuerpo, opcionesAnchor);
          }
        }

        // El sobre YA firmó `habeasData.retencionExterna` con
        // `DURABLE_EVIDENCE_INFO.backend`/`.retention` — ANTES de cobrar, y
        // ya no se puede corregir. El SDK avisa que el backend es
        // "Declared, not measured": desde x402-rs 2.3.0 el facilitador
        // registra el store que DE VERDAD tomó los bytes y puede devolver
        // uno distinto del que se pidió (p. ej. `ipfs` primario aunque se
        // pidió `s3`) — eso no es un fallo de anclaje
        // (`esExitoOYaAnclado` ya dio true), pero SÍ es una divergencia
        // entre lo que el sobre le prometió al comprador y lo que pasó de
        // verdad. Como el sobre ya está firmado y servido, este log es la
        // ÚNICA señal posible de esa divergencia — sin él no queda ningún
        // rastro del lado del vendedor (reparación DX402 punto 2 ronda 2,
        // hallazgo del refutador: hoy ya diverge — el facilitador de
        // Ultravioleta declara `ipfs` como backend primario en
        // `/dx402/stats` — y nada lo grita).
        if (esExitoOYaAnclado(resultado) && typeof resultado.pointer === "string") {
          if (typeof resultado.backend === "string" && resultado.backend !== DURABLE_EVIDENCE_INFO.backend) {
            registro.error("x402", "el backend real del anchor difiere del que el sobre firmó", undefined, {
              paymentId: idDePago,
              firmado: DURABLE_EVIDENCE_INFO.backend,
              real: resultado.backend,
            });
          }
          if (typeof resultado.retention === "string" && resultado.retention !== DURABLE_EVIDENCE_INFO.retention) {
            registro.error("x402", "la retención real del anchor difiere de la que el sobre firmó", undefined, {
              paymentId: idDePago,
              firmada: DURABLE_EVIDENCE_INFO.retention,
              real: resultado.retention,
            });
          }
        }

        // Los bytes servidos son los SELLADOS y hasheados — nunca `res.json()`,
        // que reserializaría el objeto y ya no coincidiría con `contentHash`.
        res.setHeader("X-Durable-Evidence", encabezadoEvidencia(resultado, idDePago, cuerpo, diferido));
        registro.info("x402", "sobre durable servido", {
          paymentId: idDePago,
          tx,
          resultado: typeof resultado.skipped === "string" ? resultado.skipped : resultado.pointer,
          ...(typeof resultado.error === "string" ? { error: resultado.error } : {}),
          diferido,
        });
        res.status(200).type("application/json").send(cuerpo);
        return undefined;
      },
    };
    return common.handleMiddlewareRequest(reqArgs).finally(() => {
      if (reservaMedioAbierto !== null) liberarIntentoMedioAbierto(reservaMedioAbierto);
    });
  };
}

/**
 * La versión real, montada por `montarMuroX402`: construye los
 * `x402Handlers` EXACTAMENTE como `muroDe` — `createHTTPFacilitatorHandler` +
 * `fetchDelFacilitador`, `acceptsOverride`, y solo los grupos de facilitador
 * que pasan `gruposConPropios` (`x402Muro.ts`) — y llama a
 * `crearMiddlewareDurable`.
 *
 * Superficie pública final, no abierta a discusión: `muroDurableDe` es la
 * integración real, la que usa `montarMuroX402`. `crearMiddlewareDurable`
 * queda exportada aparte a propósito — es el núcleo que los tests de
 * `x402MuroDurable.test.ts` (los diez originales de la Parte 3, más los de
 * la reparación de ronda 1) usan para inyectar `x402Handlers` dobles y
 * controlar `authorize`/`capture` sin pegarle a ningún facilitador real
 * (regla de la casa). Publicar las dos no es indecisión: cada una tiene un
 * único llamador con una única razón de ser.
 */
export function muroDurableDe(cfg: ConfigX402, publica: string): Promise<RequestHandler> {
  return import("@faremeter/middleware").then(({ createHTTPFacilitatorHandler, common }) => {
    const accepts = requisitosDePago(cfg, "/verificar/durable");

    const handlers = gruposConPropios(cfg, accepts).map(({ url, redes, propios }) =>
      createHTTPFacilitatorHandler(url, {
        capabilities: common.deriveCapabilities(propios),
        schemes: common.deriveSchemes(propios),
        acceptsOverride: propios.map(common.relaxedRequirementsToV2),
        fetch: fetchDelFacilitador(redes, perfilFacilitador(url), () => `${cfg.origenPublico}${publica}`),
      })
    );

    return crearMiddlewareDurable(cfg, common, handlers, common.acceptsToPricing(accepts));
  }) as Promise<RequestHandler>;
}
