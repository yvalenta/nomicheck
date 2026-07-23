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
import { Router, Request, Response } from "express";
import { zodToJsonSchema } from "zod-to-json-schema";
import { batchLiquidarSchema } from "../validation/batchPublico.js";
import { ejecutarBatchPublico } from "../services/batchPublicoService.js";
import { batchToCsv } from "../services/batchCsvService.js";
import { obtenerPublicKeyId, obtenerPublicKeyPem } from "../services/batchSignatureService.js";
import { obtenerLedgerReglas } from "../services/reglasVerificadasService.js";

export const batchPublicoRouter = Router();

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
