import {
  comprobanteExtraidoSchema,
  PROMPT_SISTEMA_EXTRACCION,
  type ComprobanteExtraido,
  type ProveedorExtraccionIA,
} from "./tipos.js";

// Gemini usa un subconjunto de OpenAPI 3.0 Schema (tipos en mayúsculas) para
// `responseSchema` — formato distinto al de Claude, por eso cada adaptador
// tiene su propia definición (mismo contrato de dominio, distinta traducción).
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    salarioBasicoMensual: { type: "NUMBER", description: "Salario básico mensual pactado, si aparece explícito." },
    periodoDesde: { type: "STRING", description: "Fecha de inicio del periodo liquidado, YYYY-MM-DD." },
    periodoHasta: { type: "STRING", description: "Fecha de fin del periodo liquidado, YYYY-MM-DD." },
    recibeAuxilioTransporte: {
      type: "BOOLEAN",
      description: "true si el comprobante muestra un concepto de auxilio de transporte.",
    },
    conceptos: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          nombre: { type: "STRING", description: "Nombre del concepto tal como aparece en el comprobante." },
          tipo: {
            type: "STRING",
            enum: ["devengo-legal", "devengo-extralegal", "deduccion-legal", "deduccion-convenio"],
            description:
              "devengo-legal: salario/recargos/horas extra de ley. devengo-extralegal: prima, auxilios no legales, bonos. deduccion-legal: salud, pensión, retención en la fuente. deduccion-convenio: créditos, seguros, aportes voluntarios.",
          },
          base: { type: "NUMBER", description: "Base sobre la que se calculó el concepto, si aparece." },
          valor: { type: "NUMBER", description: "Valor en pesos colombianos del concepto." },
        },
        required: ["nombre", "tipo", "valor"],
      },
    },
    advertenciaExtraccion: {
      type: "STRING",
      description: "Solo si algo del comprobante es ilegible o ambiguo — describe qué no se pudo leer con certeza.",
    },
  },
  required: ["conceptos"],
};

export class ProveedorGemini implements ProveedorExtraccionIA {
  constructor(
    private readonly apiKey: string,
    private readonly modelo = "gemini-flash-latest"
  ) {}

  async extraerComprobante(archivo: Buffer, mimeType: string): Promise<ComprobanteExtraido> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelo}:generateContent`;
    const base64 = archivo.toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT_SISTEMA_EXTRACCION }] },
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: "Extrae los datos de este comprobante de nómina." },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!res.ok) {
      const detalle = await res.text();
      throw new Error(`Gemini respondió ${res.status}: ${detalle}`);
    }

    const body = await res.json();
    const texto: string | undefined = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) {
      throw new Error("Gemini no devolvió datos estructurados del comprobante");
    }

    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new Error("Gemini devolvió un JSON inválido");
    }

    const parseo = comprobanteExtraidoSchema.safeParse(json);
    if (!parseo.success) {
      throw new Error("La extracción de Gemini no cumple el formato esperado");
    }
    return parseo.data;
  }
}
