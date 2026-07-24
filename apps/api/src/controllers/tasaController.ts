import type { Request, Response } from "express";
import { capturarTasaSnapshot, hashSnapshot } from "../services/tasaCambioService.js";
import { obtenerReglasYFestivos } from "../services/nominaService.js";
import { crearResolutorReglas } from "@pv/reglas";

// GET /api/tasa/verify?hash=<sha256>
// Captura el snapshot actual y verifica si el hash proporcionado coincide.
// Usado por buyers del listing 8b para auditar que la tasa usada en su batch
// es auténtica y está dentro de la ventana de validez.
export async function verificarHashTasa(req: Request, res: Response) {
  const { hash } = req.query;

  if (!hash || typeof hash !== "string" || !/^[0-9a-f]{64}$/i.test(hash)) {
    res.status(400).json({ error: "Parámetro 'hash' requerido (sha256 hex de 64 chars)" });
    return;
  }

  try {
    const { reglas } = await obtenerReglasYFestivos();
    const resolutor = crearResolutorReglas(reglas);
    const hoy = new Date().toISOString().slice(0, 10);
    const primaPct = resolutor.en("pago_onchain_prima_pct", hoy) as number ?? 0.01;

    const snapshot = await capturarTasaSnapshot(primaPct);
    const coincide = snapshot.hash.toLowerCase() === hash.toLowerCase();

    res.json({
      verificado: coincide,
      hash_consultado: hash,
      hash_actual: snapshot.hash,
      snapshot_actual: snapshot,
      mensaje: coincide
        ? "El hash coincide con el snapshot de tasa actual."
        : "El hash NO coincide con el snapshot actual — puede haber expirado (ventana 4-6h) o ser inválido.",
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error interno" });
  }
}
