import { proveedorExtraccion, type ComprobanteExtraido } from "./ia/index.js";

export type { ComprobanteExtraido };

export async function extraerComprobante(archivo: Buffer, mimeType: string): Promise<ComprobanteExtraido> {
  return proveedorExtraccion().extraerComprobante(archivo, mimeType);
}
