import type { Request, Response } from "express";
import { extraerComprobante } from "../services/extraccionService.js";

const TIPOS_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function extraer(req: Request, res: Response) {
  const archivo = req.file;
  if (!archivo) {
    res.status(400).json({ error: "Debes subir un archivo (imagen o PDF)" });
    return;
  }
  if (!TIPOS_PERMITIDOS.has(archivo.mimetype)) {
    res.status(400).json({ error: "Formato no soportado — sube JPG, PNG, WEBP o PDF" });
    return;
  }

  try {
    // El archivo vive solo en memoria (multer memoryStorage) durante esta
    // solicitud — nunca toca disco ni se persiste (SDD §03 Módulo E, req. 6).
    const datos = await extraerComprobante(archivo.buffer, archivo.mimetype);
    res.json(datos);
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "No se pudo extraer el comprobante" });
  }
}
