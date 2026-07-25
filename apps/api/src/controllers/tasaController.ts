import type { Request, Response } from "express";
import { z } from "zod";
import { hashSnapshot } from "../services/tasaCambioService.js";
import { obtenerReglasYFestivos } from "../services/nominaService.js";
import { crearResolutorReglas } from "@pv/reglas";

// GET /api/tasa/verify?hash=<sha256>&trm=&fuente=&fechaTrm=&primaPct=&tasaEfectiva=&capturadoEn=
//
// Usado por buyers del listing 8b para auditar el `tasaSnapshot` embebido en
// su batch de `POST /api/batch/pago-onchain`. El buyer manda los MISMOS 6
// campos que trae `tasaSnapshot` en su output (todos, salvo `hash`) — el
// endpoint recomputa el hash con `hashSnapshot()` (función pura, mismos
// insumos → mismo hash) y confirma que:
//   1. el hash coincide (el snapshot no fue alterado — integridad), y
//   2. `capturadoEn` sigue dentro de la ventana de validez vigente
//      (`pago_onchain_ventana_horas`, típicamente 6h).
//
// Diseño anterior (roto): capturaba una tasa NUEVA en cada llamada y
// comparaba su hash contra el del query — como `hashSnapshot` incluye
// `capturadoEn`, dos capturas nunca coinciden salvo por casualidad de
// milisegundo. Nunca podía verificar un batch real.
const querySchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/i, "sha256 hex de 64 chars"),
  trm: z.coerce.number().positive(),
  fuente: z.string().min(1),
  fechaTrm: z.string().min(1),
  primaPct: z.coerce.number(),
  tasaEfectiva: z.coerce.number().positive(),
  capturadoEn: z.string().datetime({ message: "capturadoEn debe ser ISO 8601" }),
});

export async function verificarHashTasa(req: Request, res: Response) {
  const parseo = querySchema.safeParse(req.query);
  if (!parseo.success) {
    res.status(400).json({
      error: "Parámetros inválidos — envía los 6 campos de `tasaSnapshot` de tu batch (trm, fuente, fechaTrm, primaPct, tasaEfectiva, capturadoEn) más `hash`.",
      detalles: parseo.error.flatten(),
    });
    return;
  }
  const { hash, ...snapshotSinHash } = parseo.data;

  try {
    const hashRecalculado = hashSnapshot(snapshotSinHash);
    const integro = hashRecalculado.toLowerCase() === hash.toLowerCase();

    const { reglas } = await obtenerReglasYFestivos();
    const resolutor = crearResolutorReglas(reglas);
    const hoy = new Date().toISOString().slice(0, 10);
    const ventanaHoras = resolutor.en("pago_onchain_ventana_horas", hoy) as number;
    const capturadoEnMs = new Date(snapshotSinHash.capturadoEn).getTime();
    const expiraEn = new Date(capturadoEnMs + ventanaHoras * 60 * 60 * 1000);
    const dentroDeVentana = Date.now() <= expiraEn.getTime();

    const verificado = integro && dentroDeVentana;
    res.json({
      verificado,
      integro,
      dentroDeVentana,
      expiraEn: expiraEn.toISOString(),
      hash_consultado: hash,
      hash_recalculado: hashRecalculado,
      mensaje: !integro
        ? "El hash NO coincide con los campos del snapshot enviados — el snapshot fue alterado o el hash no corresponde a estos valores."
        : !dentroDeVentana
          ? `El snapshot es auténtico pero ya expiró (venció ${expiraEn.toISOString()}, ventana de ${ventanaHoras}h) — no es válido para pagar hoy.`
          : "El snapshot es auténtico y sigue dentro de su ventana de validez.",
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Error interno" });
  }
}
