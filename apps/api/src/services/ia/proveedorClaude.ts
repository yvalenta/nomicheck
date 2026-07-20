import Anthropic from "@anthropic-ai/sdk";
import {
  comprobanteExtraidoSchema,
  PROMPT_SISTEMA_EXTRACCION,
  type ComprobanteExtraido,
  type MensajeConversacion,
  type ProveedorChatIA,
  type ProveedorExtraccionIA,
} from "./tipos.js";

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

export class ProveedorClaude implements ProveedorExtraccionIA, ProveedorChatIA {
  constructor(
    private readonly apiKey: string,
    private readonly modelo = "claude-sonnet-5"
  ) {}

  async extraerComprobante(archivo: Buffer, mimeType: string): Promise<ComprobanteExtraido> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const base64 = archivo.toString("base64");

    const contenido =
      mimeType === "application/pdf"
        ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as const)
        : ({
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
              data: base64,
            },
          } as const);

    const respuesta = await client.messages.create({
      model: this.modelo,
      max_tokens: 2048,
      system: `${PROMPT_SISTEMA_EXTRACCION} Responde únicamente llamando a la herramienta reportar_comprobante.`,
      tools: [HERRAMIENTA_EXTRACCION],
      tool_choice: { type: "tool", name: "reportar_comprobante" },
      messages: [
        {
          role: "user",
          content: [contenido, { type: "text", text: "Extrae los datos de este comprobante de nómina." }],
        },
      ],
    });

    const bloque = respuesta.content.find((b) => b.type === "tool_use");
    if (!bloque || bloque.type !== "tool_use") {
      throw new Error("Claude no devolvió datos estructurados del comprobante");
    }

    const parseo = comprobanteExtraidoSchema.safeParse(bloque.input);
    if (!parseo.success) {
      throw new Error("La extracción de Claude no cumple el formato esperado");
    }
    return parseo.data;
  }

  async chat(promptSistema: string, historial: MensajeConversacion[], pregunta: string): Promise<string> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const respuesta = await client.messages.create({
      model: this.modelo,
      max_tokens: 1024,
      system: promptSistema,
      messages: [...historial.map((m) => ({ role: m.rol, content: m.texto })), { role: "user" as const, content: pregunta }],
    });

    const bloque = respuesta.content.find((b) => b.type === "text");
    if (!bloque || bloque.type !== "text") {
      throw new Error("Claude no devolvió una respuesta de texto");
    }
    return bloque.text;
  }
}
