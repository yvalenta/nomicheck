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
import { batchLiquidarSchema, type BatchLiquidarOutput } from "../validation/batchPublico.js";

export const batchPublicoRouter = Router();

batchPublicoRouter.post("/liquidar", (req: Request, res: Response) => {
  const parsed = batchLiquidarSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", detalle: parsed.error.flatten() });
  }
  return res.status(501).json({
    error: "not_implemented",
    mensaje:
      "Endpoint reservado — schema v1 fijado; el pipeline entra en un commit siguiente (reusa calcularReciboLote + calcularRecibosContratistas sin Prisma).",
  } satisfies { error: string; mensaje: string });
});

// Firma tipada del handler futuro — se conserva aquí para que el compilador
// obligue a que la implementación la respete cuando entre.
export type BatchLiquidarHandler = (input: unknown) => Promise<BatchLiquidarOutput>;
