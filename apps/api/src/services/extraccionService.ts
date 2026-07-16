import Anthropic from "@anthropic-ai/sdk";
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

const HERRAMIENTA_EXTRACCION = {
  name: "reportar_comprobante",
  description: "Reporta los datos extraídos de un comprobante de nómina colombiano.",
  input_schema: {
    type: "object" as const,
    properties: {
      salarioBasicoMensual: {
        type: "number",
        description: "Salario básico mensual pactado, si aparece explícito en el comprobante.",
      },
      periodoDesde: { type: "string", description: "Fecha de inicio del periodo liquidado, YYYY-MM-DD." },
      periodoHasta: { type: "string", description: "Fecha de fin del periodo liquidado, YYYY-MM-DD." },
      recibeAuxilioTransporte: {
        type: "boolean",
        description: "true si el comprobante muestra un concepto de auxilio de transporte.",
      },
      conceptos: {
        type: "array",
        description: "Cada línea del comprobante (devengos y deducciones), tal como aparece.",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string", description: "Nombre del concepto tal como aparece en el comprobante." },
            tipo: {
              type: "string",
              enum: ["devengo-legal", "devengo-extralegal", "deduccion-legal", "deduccion-convenio"],
              description:
                "devengo-legal: salario/recargos/horas extra de ley. devengo-extralegal: prima, auxilios no legales, bonos. deduccion-legal: salud, pensión, retención en la fuente. deduccion-convenio: créditos, seguros, aportes voluntarios.",
            },
            base: { type: "number", description: "Base sobre la que se calculó el concepto, si aparece." },
            valor: { type: "number", description: "Valor en pesos colombianos del concepto." },
          },
          required: ["nombre", "tipo", "valor"],
        },
      },
      advertenciaExtraccion: {
        type: "string",
        description: "Solo si algo del comprobante es ilegible o ambiguo — describe qué no se pudo leer con certeza.",
      },
    },
    required: ["conceptos"],
  },
};

const PROMPT_SISTEMA = `Eres un asistente que EXTRAE datos de comprobantes de nómina colombianos — nunca calculas ni corriges cifras, solo transcribes lo que ves. Reporta cada línea del comprobante (devengos y deducciones) con su nombre, tipo y valor exactos. Si un dato no aparece o es ilegible, omítelo (no inventes valores) y usa advertenciaExtraccion para explicarlo. Responde únicamente llamando a la herramienta reportar_comprobante.`;

export async function extraerComprobante(
  archivo: Buffer,
  mimeType: string
): Promise<ComprobanteExtraido> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY no configurada en el servidor");
  }

  const client = new Anthropic({ apiKey });
  const base64 = archivo.toString("base64");

  const contenido =
    mimeType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/webp", data: base64 },
        } as const);

  const respuesta = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: PROMPT_SISTEMA,
    tools: [HERRAMIENTA_EXTRACCION],
    tool_choice: { type: "tool", name: "reportar_comprobante" },
    messages: [
      {
        role: "user",
        content: [contenido, { type: "text", text: "Extrae los datos de este comprobante de nómina." }],
      },
    ],
  });

  const bloqueHerramienta = respuesta.content.find((b) => b.type === "tool_use");
  if (!bloqueHerramienta || bloqueHerramienta.type !== "tool_use") {
    throw new Error("Claude no devolvió datos estructurados del comprobante");
  }

  const parseo = comprobanteExtraidoSchema.safeParse(bloqueHerramienta.input);
  if (!parseo.success) {
    throw new Error("La extracción no cumple el formato esperado");
  }
  return parseo.data;
}
