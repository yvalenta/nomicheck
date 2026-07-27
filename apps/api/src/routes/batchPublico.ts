// Endpoint público stateless para Execution Market (listings 5/6/8a/8b).
// NO se cablea a `routes/index.ts` en este commit — solo fija la superficie
// del contrato (schema + handler skeleton). La implementación del pipeline
// entra en un commit siguiente, reusando `calcularReciboLote` +
// `calcularRecibosContratistas` de `services/liquidacionCalculo.ts` sin
// tocar Prisma.
//
// Cuando se cablee: rate limit igual al de `/api/nomina/calcular`, sin auth
// (el pago del marketplace ya autoriza), y `noExternalLlm` respetado a
// nivel de runtime (no solo copy).
import { Router, Request, Response, RequestHandler } from "express";
import { zodToJsonSchema } from "zod-to-json-schema";
import { batchLiquidarSchema } from "../validation/batchPublico.js";
import { batchRetencionSchema } from "../validation/batchRetencion.js";
import { batchPagoOnchainSchema } from "../validation/batchPagoOnchain.js";
import { batchVerificacionSchema } from "../validation/batchVerificacion.js";
import { ejecutarBatchPublico } from "../services/batchPublicoService.js";
import { ejecutarBatchRetencion } from "../services/batchRetencionService.js";
import {
  ejecutarBatchPagoOnchain,
  ErrorLoteSinWallets,
} from "../services/batchPagoOnchainService.js";
import { ejecutarBatchVerificacion } from "../services/batchVerificacionService.js";
import { generarParametrosSnapshot } from "../services/parametrosSnapshotService.js";
import {
  batchToCsv,
  batchRetencionToCsv,
  batchPagoOnchainToCsv,
  batchVerificacionToCsv,
} from "../services/batchCsvService.js";
import { obtenerPublicKeyId, obtenerPublicKeyPem } from "../services/batchSignatureService.js";
import { obtenerLedgerReglas } from "../services/reglasVerificadasService.js";
import {
  emitirComprobantes,
  ErrorLoteNoAutentico,
  ErrorPagoNoCoincide,
  ErrorPagoNoConfirmado,
  ErrorWalletSinItems,
} from "../services/comprobanteService.js";
import { seguirPago } from "../services/seguimientoPagoService.js";
import { comprobanteSchema, seguimientoQuerySchema } from "../validation/comprobante.js";
import { ErrorRedNoSoportada, resolverRedPago } from "../lib/pagosConfig.js";
import {
  leerConfigX402,
  problemasDeConfig,
  requisitosDePago,
  RUTAS_CON_MURO,
} from "../lib/x402Config.js";

export const batchPublicoRouter = Router();

// ── Muro de pago x402 ───────────────────────────────────────────────────────
//
// Se monta ANTES de los handlers para que el 402 salga sin ejecutar cálculo.
// Solo cubre los POST de cómputo: los GET (`/schema/v1.json`, `/ejemplo`,
// `/publickey`, `/parametros`, `/health`) quedan gratis a propósito — son los
// que permiten integrar antes de pagar y verificar la firma después.
//
// Apagado por defecto: sin `X402_ACTIVO=true` no monta nada y el
// comportamiento es idéntico al de hoy. Eso permite desplegar el código sin
// cambiar producción y encender el muro cuando se decida.
// El registro va acá arriba, ANTES de los `.post()`, y no en una función que
// se llame al arrancar: Express recorre el stack en orden de registro, así que
// un `use()` agregado después de los handlers nunca llega a interceptar. El
// muro saldría "montado" en los logs y cobraría cero.
//
// Como `createMiddleware` es async y el registro es sincrónico, se monta un
// envoltorio que resuelve el middleware real una sola vez y delega.
const cfgX402 = leerConfigX402();

if (cfgX402.activo) {
  const problemas = problemasDeConfig(cfgX402);
  if (problemas.length > 0) {
    // Reventar al cargar y no en la primera petición: un muro mal configurado
    // que falla recién cuando llega un comprador es peor que uno que no deja
    // levantar el servicio.
    throw new Error(`x402 activo pero mal configurado: ${problemas.join("; ")}`);
  }

  const muros = new Map<string, Promise<RequestHandler>>();
  const muroDe = (ruta: string): Promise<RequestHandler> => {
    let m = muros.get(ruta);
    if (!m) {
      m = import("@faremeter/middleware/express").then(({ createMiddleware }) =>
        createMiddleware({
          facilitatorURL: cfgX402.facilitatorURL,
          accepts: [requisitosDePago(cfgX402, ruta)],
          // v2 es lo que anuncia el Bazaar (`"x402Version": 2`); v1 queda
          // encendido porque hay clientes que solo hablan esa.
          supportedVersions: { x402v1: true, x402v2: true },
        }),
      ) as Promise<RequestHandler>;
      muros.set(ruta, m);
    }
    return m;
  };

  for (const ruta of RUTAS_CON_MURO) {
    const envoltorio: RequestHandler = (req, res, next) => {
      muroDe(ruta)
        .then((muro) => muro(req, res, next))
        .catch(next);
    };
    batchPublicoRouter.use(ruta, envoltorio);
    // El `/csv` entrega el mismo cálculo en otro formato, así que cuesta igual.
    // Sin esto, pedir el CSV sería la forma gratis de saltarse el muro.
    if (ruta !== "/comprobante") batchPublicoRouter.use(`${ruta}/csv`, envoltorio);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[x402] muro activo en ${cfgX402.red.nombre} · facilitador ${cfgX402.facilitatorURL} · cobra a ${cfgX402.payTo}`,
  );
}

// JSON Schema Draft 7 del contrato de intake, generado desde el zod
// versionado (RUMBO §2.2 llevado a interoperabilidad). Un LLM buyer o
// auditor lo lee sin humanos — alternativa liviana a gRPC/protobuf que
// no fragmenta la fuente de verdad (el zod sigue siendo el único que
// valida en runtime; este endpoint es su espejo publicable).
const jsonSchemaCache = zodToJsonSchema(batchLiquidarSchema, {
  name: "BatchLiquidarInput",
  target: "jsonSchema7",
  $refStrategy: "none",
});

batchPublicoRouter.get("/schema/v1.json", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json(jsonSchemaCache);
});

// Snapshot firmado de los parámetros legales vigentes (listing de Fase 1).
// No recibe input: la salida es idéntica para todos los compradores mientras
// el catálogo no cambie. Por eso es el único listing publicable como archivo
// estático en IPFS + borde, sin dependencia de este servidor.
batchPublicoRouter.get("/parametros", async (_req: Request, res: Response) => {
  try {
    const salida = await generarParametrosSnapshot();
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).json(salida);
  } catch (err) {
    return res.status(500).json({
      error: "parametros_no_disponibles",
      mensaje: err instanceof Error ? err.message : "error desconocido",
    });
  }
});

// Llave pública Ed25519 con la que se firma cada output (RUMBO §M). El
// buyer la descarga UNA vez y verifica offline todos los outputs contra
// esta llave — típico caso IPFS: el output vive sin el servidor y sigue
// siendo verificable con la llave pinneada.
batchPublicoRouter.get("/publickey", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.status(200).json({
    algo: "ed25519",
    publicKeyId: obtenerPublicKeyId(),
    publicKeyPem: obtenerPublicKeyPem(),
    verificacionEjemplo:
      'node: const {verify,createPublicKey}=require("crypto"); const pk=createPublicKey({key:pubPem,format:"pem"}); ' +
      'verify(null, Buffer.from(canonicalJson(out),"utf8"), pk, Buffer.from(out.signature.valor,"base64"))',
  });
});

// Healthcheck del wrapper (RUMBO §O). Contrato: si el buyer llama antes
// de POST, obtiene lo mínimo para confirmar que hablamos el mismo motor
// (reglasHash) y con la misma llave (publicKeyId). Sin este endpoint el
// buyer necesitaría un batch real para descubrir esos valores.
batchPublicoRouter.get("/health", async (_req: Request, res: Response) => {
  // Sin try/catch, un error acá (ej. BD sin migrar) no lo atrapa Express 4
  // en un handler async — se vuelve unhandledRejection y TUMBA TODO EL
  // PROCESO, no solo esta request (hallado probando en vivo contra prod).
  try {
    const ledger = await obtenerLedgerReglas();
    return res.status(200).json({
      ok: true,
      version: "1",
      ledger,
      signature: {
        algo: "ed25519",
        publicKeyId: obtenerPublicKeyId(),
      },
      guardsActivos: {
        noExternalLlm: true,
        habeasDataConstancia: true,
        persistenciaBd: false,
      },
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(503).json({
      ok: false,
      error: "unavailable",
      mensaje: e instanceof Error ? e.message : "Error inesperado",
    });
  }
});

// Ejemplo canónico input+output para que un buyer copie-pegue y verifique
// que su cliente HTTP habla el contrato. Reduce fricción de adopción del
// listing 5/8a.
const EJEMPLO_INPUT = {
  version: "1",
  buyer: { noExternalLlm: true },
  empresa: { nombre: "Buyer Demo", nit: "900123456-7", sector: "servicios" },
  periodo: { fechaInicio: "2026-07-01", fechaFin: "2026-07-15" },
  empleados: [
    {
      externalId: "E-1",
      nombre: "Ana Ejemplo",
      documento: "1000000001",
      salarioBase: 2_000_000,
      tipoNomina: "fijo",
      tipoContrato: "indefinido",
      auxilioTransporte: true,
      claseRiesgoArl: 1,
    },
  ],
  contratistas: [
    {
      externalId: "C-1",
      nombre: "Bob Ejemplo",
      documento: "2000000002",
      honorariosMensuales: 3_000_000,
      walletAddress: "0x2222222222222222222222222222222222222222",
    },
  ],
  turnos: [],
};

batchPublicoRouter.get("/ejemplo", async (_req: Request, res: Response) => {
  try {
    const parsed = batchLiquidarSchema.parse(EJEMPLO_INPUT);
    const salida = await ejecutarBatchPublico(parsed);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json({
      instrucciones:
        "Ejemplo del contrato v1. POST el campo `input` a /api/batch/liquidar y contrasta con `output`.",
      input: EJEMPLO_INPUT,
      output: salida,
    });
  } catch (e) {
    return res.status(500).json({
      error: "internal_error",
      mensaje: e instanceof Error ? e.message : "Error inesperado",
    });
  }
});

batchPublicoRouter.post("/liquidar", async (req: Request, res: Response) => {
  const parsed = batchLiquidarSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
  }
  try {
    const salida = await ejecutarBatchPublico(parsed.data);
    return res.status(200).json(salida);
  } catch (e) {
    return res.status(500).json({
      error: "internal_error",
      mensaje: e instanceof Error ? e.message : "Error inesperado",
    });
  }
});

// Mismo input, salida CSV (RUMBO §2.1). Útil para contadores que quieren
// abrir el batch en Excel/Google Sheets. Disclaimer + hash del catálogo
// viajan como comentarios `#` al inicio del archivo.
batchPublicoRouter.post("/liquidar/csv", async (req: Request, res: Response) => {
  const parsed = batchLiquidarSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
  }
  try {
    const salida = await ejecutarBatchPublico(parsed.data);
    const csv = batchToCsv(salida);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="nomicheck-batch-${parsed.data.periodo.fechaInicio}-${parsed.data.periodo.fechaFin}.csv"`
    );
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({
      error: "internal_error",
      mensaje: e instanceof Error ? e.message : "Error inesperado",
    });
  }
});

// ── Listing 6: retención en la fuente ───────────────────────────────────────
// Contrato aparte del de liquidación (input = N personas con parámetros
// numéricos anónimos, sin nombre/documento). Mismo sobre firmado y verificable.
const jsonSchemaRetencion = zodToJsonSchema(batchRetencionSchema, {
  name: "BatchRetencionInput",
  target: "jsonSchema7",
  $refStrategy: "none",
});

batchPublicoRouter.get("/retencion/schema/v1.json", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json(jsonSchemaRetencion);
});

const EJEMPLO_RETENCION = {
  version: "1",
  buyer: { noExternalLlm: true },
  personas: [
    { externalId: "P-1", ingresoLaboralMensual: 8_000_000, declaraRenta: false },
    {
      externalId: "P-2",
      ingresoLaboralMensual: 12_000_000,
      declaraRenta: true,
      aportesVoluntariosAfc: 1_000_000,
      tieneDependientes: true,
    },
  ],
};

batchPublicoRouter.get("/retencion/ejemplo", async (_req: Request, res: Response) => {
  try {
    const parsed = batchRetencionSchema.parse(EJEMPLO_RETENCION);
    const salida = await ejecutarBatchRetencion(parsed);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json({
      instrucciones:
        "Ejemplo del contrato de retención v1. POST el campo `input` a /api/batch/retencion y contrasta con `output`.",
      input: EJEMPLO_RETENCION,
      output: salida,
    });
  } catch (e) {
    return res.status(500).json({
      error: "internal_error",
      mensaje: e instanceof Error ? e.message : "Error inesperado",
    });
  }
});

batchPublicoRouter.post("/retencion", async (req: Request, res: Response) => {
  const parsed = batchRetencionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
  }
  try {
    const salida = await ejecutarBatchRetencion(parsed.data);
    return res.status(200).json(salida);
  } catch (e) {
    return res.status(500).json({
      error: "internal_error",
      mensaje: e instanceof Error ? e.message : "Error inesperado",
    });
  }
});

batchPublicoRouter.post("/retencion/csv", async (req: Request, res: Response) => {
  const parsed = batchRetencionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
  }
  try {
    const salida = await ejecutarBatchRetencion(parsed.data);
    const csv = batchRetencionToCsv(salida);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="nomicheck-retencion.csv"`);
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({
      error: "internal_error",
      mensaje: e instanceof Error ? e.message : "Error inesperado",
    });
  }
});

// ── Listing 5: verificación de comprobante ──────────────────────────────────
// El comprobante se transcribe como líneas {nombre, valor} — sin nombre ni
// documento del empleado (mismo blindaje de privacidad que retención). El
// motor recalcula las líneas de ley de forma independiente y compara.
const jsonSchemaVerificacion = zodToJsonSchema(batchVerificacionSchema, {
  name: "BatchVerificacionInput",
  target: "jsonSchema7",
  $refStrategy: "none",
});

batchPublicoRouter.get("/verificar/schema/v1.json", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json(jsonSchemaVerificacion);
});

const EJEMPLO_VERIFICACION = {
  version: "1",
  buyer: { noExternalLlm: true },
  comprobantes: [
    {
      externalId: "CMP-1",
      salarioBasicoMensual: 2_000_000,
      recibeAuxilioTransporte: true,
      periodoDesde: "2026-07-01",
      periodoHasta: "2026-07-31",
      declarado: [
        { nombre: "Salario básico", valor: 2_000_000 },
        { nombre: "Auxilio de transporte", valor: 200_000 },
        // Deducido de más a propósito — el ejemplo debe mostrar un veredicto
        // con discrepancia, no solo el camino feliz.
        { nombre: "Salud", valor: 100_000 },
      ],
    },
  ],
};

batchPublicoRouter.get("/verificar/ejemplo", async (_req: Request, res: Response) => {
  try {
    const parsed = batchVerificacionSchema.parse(EJEMPLO_VERIFICACION);
    const salida = await ejecutarBatchVerificacion(parsed);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json({
      instrucciones:
        "Ejemplo del contrato de verificación v1. POST el campo `input` a /api/batch/verificar y contrasta con `output`.",
      input: EJEMPLO_VERIFICACION,
      output: salida,
    });
  } catch (e) {
    return res.status(500).json({
      error: "internal_error",
      mensaje: e instanceof Error ? e.message : "Error inesperado",
    });
  }
});

batchPublicoRouter.post("/verificar", async (req: Request, res: Response) => {
  const parsed = batchVerificacionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
  }
  try {
    const salida = await ejecutarBatchVerificacion(parsed.data);
    return res.status(200).json(salida);
  } catch (e) {
    return res.status(500).json({
      error: "internal_error",
      mensaje: e instanceof Error ? e.message : "Error inesperado",
    });
  }
});

batchPublicoRouter.post("/verificar/csv", async (req: Request, res: Response) => {
  const parsed = batchVerificacionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
  }
  try {
    const salida = await ejecutarBatchVerificacion(parsed.data);
    const csv = batchVerificacionToCsv(salida);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="nomicheck-verificacion.csv"`);
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({
      error: "internal_error",
      mensaje: e instanceof Error ? e.message : "Error inesperado",
    });
  }
});

// ── Listing 8b: pago on-chain (USDC en Base) ────────────────────────────────
// Gemelo stateless de generarBatchPago. red/token inválidos → 422
// (ErrorRedNoSoportada); lote sin wallets → 422 (ErrorLoteSinWallets).
const jsonSchemaPagoOnchain = zodToJsonSchema(batchPagoOnchainSchema, {
  name: "BatchPagoOnchainInput",
  target: "jsonSchema7",
  $refStrategy: "none",
});

batchPublicoRouter.get("/pago-onchain/schema/v1.json", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json(jsonSchemaPagoOnchain);
});

// Errores de negocio del wrapper 8b que son culpa del input del buyer (no del
// servidor) → 422 con mensaje accionable; el resto → 500.
function responderErrorPagoOnchain(res: Response, e: unknown) {
  if (e instanceof ErrorRedNoSoportada || e instanceof ErrorLoteSinWallets) {
    return res.status(422).json({ error: "unprocessable", mensaje: e.message });
  }
  return res.status(500).json({
    error: "internal_error",
    mensaje: e instanceof Error ? e.message : "Error inesperado",
  });
}

batchPublicoRouter.post("/pago-onchain", async (req: Request, res: Response) => {
  const parsed = batchPagoOnchainSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
  }
  try {
    const salida = await ejecutarBatchPagoOnchain(parsed.data);
    return res.status(200).json(salida);
  } catch (e) {
    return responderErrorPagoOnchain(res, e);
  }
});

batchPublicoRouter.post("/pago-onchain/csv", async (req: Request, res: Response) => {
  const parsed = batchPagoOnchainSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
  }
  try {
    const salida = await ejecutarBatchPagoOnchain(parsed.data);
    const csv = batchPagoOnchainToCsv(salida);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="nomicheck-pago-onchain.csv"`);
    return res.status(200).send(csv);
  } catch (e) {
    return responderErrorPagoOnchain(res, e);
  }
});

// ---------------------------------------------------------------------------
// Constancia de pago verificable + seguimiento en vivo del pago
// ---------------------------------------------------------------------------

// Cada error dice de QUIÉN es la culpa, porque el titular necesita saber si
// espera, si corrige, o si reclama:
//   422 el lote no es auténtico o la red no se soporta → el input está mal
//   404 la wallet no está en el lote                   → no hay nada que certificar
//   409 la cadena todavía no respalda el pago          → esperá y reintentá
function responderErrorComprobante(res: Response, e: unknown) {
  if (e instanceof ErrorLoteNoAutentico || e instanceof ErrorRedNoSoportada) {
    return res.status(422).json({ error: "lote_no_autentico", mensaje: e.message });
  }
  if (e instanceof ErrorWalletSinItems) {
    return res.status(404).json({ error: "sin_items", mensaje: e.message });
  }
  if (e instanceof ErrorPagoNoConfirmado || e instanceof ErrorPagoNoCoincide) {
    return res.status(409).json({ error: "pago_no_acreditado", mensaje: e.message });
  }
  return res.status(500).json({
    error: "internal_error",
    mensaje: e instanceof Error ? e.message : "Error inesperado",
  });
}

batchPublicoRouter.post("/comprobante", async (req: Request, res: Response) => {
  const parsed = comprobanteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
  }
  try {
    const comprobantes = await emitirComprobantes(parsed.data.lote, parsed.data.txHash, parsed.data.wallet);
    // Un recibo de transacción minada es INMUTABLE: la misma consulta va a dar
    // lo mismo siempre. Se cachea agresivo en el edge para que la segunda
    // visita no toque el RPC — es la optimización que de verdad rinde acá
    // (la emisión mide ~385 ms, y casi todo es la ida al RPC de Base).
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).json({ comprobantes });
  } catch (e) {
    return responderErrorComprobante(res, e);
  }
});

batchPublicoRouter.get("/pago-onchain/seguir", async (req: Request, res: Response) => {
  const parsed = seguimientoQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
  }
  let red;
  try {
    red = resolverRedPago(parsed.data.red, parsed.data.token);
  } catch (e) {
    return responderErrorPagoOnchain(res, e);
  }

  // `no-transform` es obligatorio: sin él un proxy que comprima el cuerpo
  // rompe el framing de SSE. `X-Accel-Buffering` desactiva el buffer de nginx,
  // que si no retiene los eventos hasta cerrar y anula el propósito.
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Cerrar la pestaña aborta la espera en vez de dejar un generador
  // consultando el RPC contra un cliente que ya no existe.
  const abortador = new AbortController();
  req.on("close", () => abortador.abort());

  // Cloudflare corta conexiones ociosas cerca de los 100 s. El latido es un
  // comentario SSE (`:`), que el cliente ignora pero mantiene viva la conexión.
  const latido = setInterval(() => res.write(": keepalive\n\n"), 15_000);

  try {
    for await (const evento of seguirPago(red, parsed.data.txHash, {
      confirmaciones: parsed.data.confirmaciones,
      senal: abortador.signal,
    })) {
      res.write(`event: ${evento.fase}\ndata: ${JSON.stringify(evento)}\n\n`);
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error inesperado";
    res.write(`event: error\ndata: ${JSON.stringify({ fase: "error", mensaje })}\n\n`);
  } finally {
    clearInterval(latido);
    res.end();
  }
});
