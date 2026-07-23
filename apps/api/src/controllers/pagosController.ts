import type { Request, Response } from "express";
import { generarBatchPago, obtenerBatchVigente, verificarBatchPago } from "../services/pagosService.js";
import { ErrorRedNoSoportada } from "../lib/pagosConfig.js";
import { ErrorConflicto } from "../services/empleadosService.js";

// Pago on-chain no-custodial (SDD §17). Los tres endpoints del ciclo:
// generar lote → (el empleador firma fuera de NomiCheck) → verificar txHash.

export async function generarBatch(req: Request, res: Response) {
  try {
    const lote = await generarBatchPago(req.usuario!.empresaId!, Number(req.params.id), req.usuario!.id);
    res.status(201).json(lote);
  } catch (err) {
    if (err instanceof ErrorRedNoSoportada) {
      res.status(422).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo generar el lote de pago" });
  }
}

export async function obtenerBatch(req: Request, res: Response) {
  const batch = await obtenerBatchVigente(req.usuario!.empresaId!, Number(req.params.id));
  if (!batch) {
    res.status(404).json({ error: "El periodo no tiene lotes de pago generados" });
    return;
  }
  res.json(batch);
}

export async function verificarBatch(req: Request, res: Response) {
  const txHash = typeof req.body?.txHash === "string" ? req.body.txHash.trim() : "";
  try {
    const resultado = await verificarBatchPago(
      req.usuario!.empresaId!,
      Number(req.params.batchId),
      txHash,
      req.usuario!.id
    );
    if (resultado.estado === "verificado") {
      res.json(resultado);
    } else {
      res.status(422).json({
        error: "La transacción no cubre todos los pagos del lote — revisa el detalle por destinatario",
        ...resultado,
      });
    }
  } catch (err) {
    if (err instanceof ErrorConflicto) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo verificar el pago" });
  }
}
