import { z } from "zod";

const conceptoExtraidoSchema = z.object({
  nombre: z.string(),
  tipo: z.enum(["devengo-legal", "devengo-extralegal", "deduccion-legal", "deduccion-convenio"]),
  base: z.number().optional(),
  valor: z.number(),
});

// Salida de la extracción: siempre en forma de "conceptos" (modo salario-fijo
// del motor) — un comprobante real, sea de turnos o de salario fijo, siempre
// se ve como una lista de líneas con nombre y valor (SDD §03 Módulo E).
export const comprobanteExtraidoSchema = z.object({
  salarioBasicoMensual: z.number().positive().optional(),
  periodoDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodoHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  recibeAuxilioTransporte: z.boolean().optional(),
  conceptos: z.array(conceptoExtraidoSchema),
  advertenciaExtraccion: z.string().optional(),
});

export type ComprobanteExtraido = z.infer<typeof comprobanteExtraidoSchema>;

// Prompt compartido — el contrato de qué extraer es del dominio, no del
// proveedor. Cada adaptador solo traduce esto a su propio formato de
// schema/llamada (SDD §04 "capa de IA multi-proveedor").
export const PROMPT_SISTEMA_EXTRACCION = `Eres un asistente que EXTRAE datos de comprobantes de nómina colombianos — nunca calculas ni corriges cifras, solo transcribes lo que ves. Reporta cada línea del comprobante (devengos y deducciones) con su nombre, tipo y valor exactos. Si un dato no aparece o es ilegible, omítelo (no inventes valores) y usa advertenciaExtraccion para explicarlo.`;

// Interfaz Strategy que implementa cada proveedor — el resto del sistema solo
// conoce esta forma, nunca el SDK/API específico de cada uno.
export interface ProveedorExtraccionIA {
  extraerComprobante(archivo: Buffer, mimeType: string): Promise<ComprobanteExtraido>;
}

export interface MensajeConversacion {
  rol: "user" | "assistant";
  texto: string;
}

// Segunda capacidad de la misma capa multi-proveedor: conversación de texto
// plano (chat contador, SDD §03 Módulo E). Misma idea que ProveedorExtraccionIA
// — el resto del sistema solo conoce esta forma, el proveedor puede cambiar
// (o el modelo dentro del proveedor) sin tocar el resto del código.
export interface ProveedorChatIA {
  chat(promptSistema: string, historial: MensajeConversacion[], pregunta: string): Promise<string>;
}
