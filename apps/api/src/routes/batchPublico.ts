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
import { batchLiquidarSchema } from "../validation/batchPublico.js";
import { ejecutarBatchPublico } from "../services/batchPublicoService.js";

export const batchPublicoRouter = Router();

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
