// WebMCP: las acciones clave del sitio expuestas al agente del navegador
// (navigator.modelContext, el API experimental de Chrome/W3C WebML).
//
// ── Qué se expone y qué no ─────────────────────────────────────────────────
//
// Dos herramientas de LECTURA: los parámetros legales fechados y el
// quickstart. Son las dos puertas que un agente necesita primero, no mutan
// nada, y sus respuestas viajan firmadas o son autodescriptivas. El cálculo
// completo NO se expone como tool a propósito: su contrato es el del wizard
// (turnos, periodos, comprobantes) y duplicarlo en un inputSchema de juguete
// produciría la herramienta que responde algo plausible con el input
// equivocado — para eso el tool del quickstart ya le dice al agente dónde
// vive el contrato real (los schema/v1.json servidos).
//
// El módulo NO falla si el API no existe (hoy es experimental): registrar es
// oportunista y silencioso. Y no toca React ni el DOM — se llama desde
// main.tsx antes del render y termina.

interface RespuestaTool {
  content: Array<{ type: "text"; text: string }>;
}

export interface HerramientaWebMcp {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: Record<string, unknown>): Promise<RespuestaTool>;
}

/** El shape mínimo del API experimental que este módulo sabe usar. */
interface ModelContext {
  registerTool?: (tool: HerramientaWebMcp) => unknown;
  provideContext?: (contexto: { tools: HerramientaWebMcp[] }) => unknown;
}

const comoTexto = (dato: unknown): RespuestaTool => ({
  content: [{ type: "text", text: JSON.stringify(dato, null, 2) }],
});

export function herramientas(base = ""): HerramientaWebMcp[] {
  return [
    {
      name: "consultar_parametros_legales",
      description:
        "Parámetros legales colombianos de nómina (SMLMV, auxilio de transporte, UVT, " +
        "recargos, topes de retención), resueltos a una fecha y firmados. Sin fecha " +
        "devuelve los vigentes hoy; con fecha (YYYY-MM-DD, desde 2020) los que regían " +
        "ese día — lo que necesita una liquidación retroactiva.",
      inputSchema: {
        type: "object",
        properties: {
          fecha: {
            type: "string",
            format: "date",
            description: "Día al que resolver los valores (YYYY-MM-DD). Omitida = hoy.",
          },
        },
        additionalProperties: false,
      },
      async execute(input) {
        const fecha = typeof input?.fecha === "string" && input.fecha !== "" ? input.fecha : null;
        const url = `${base}/api/batch/parametros${fecha ? `?fecha=${encodeURIComponent(fecha)}` : ""}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) {
          return comoTexto({ error: `El servidor respondió ${res.status}`, url });
        }
        return comoTexto(await res.json());
      },
    },
    {
      name: "obtener_guia_de_uso",
      description:
        "La guía completa para usar NomiCheck como agente, en una llamada: qué hace, " +
        "qué es gratis (pre-chequeo de comprobantes incluido), qué cuesta el informe " +
        "pagado y cómo se paga por llamada (x402), dónde están los contratos de " +
        "entrada, y cómo verificar cualquier salida sin confiar en este servidor.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        const res = await fetch(`${base}/api/batch/quickstart`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          return comoTexto({ error: `El servidor respondió ${res.status}` });
        }
        return comoTexto(await res.json());
      },
    },
  ];
}

/**
 * Registra las herramientas si el navegador trae el API; devuelve si lo hizo.
 * Soporta las dos formas que ha tenido el API mientras se estandariza:
 * `registerTool` (una por una) y `provideContext` (el lote).
 */
export function registrarWebMcp(
  nav: { modelContext?: ModelContext } = navigator as { modelContext?: ModelContext },
): boolean {
  const mc = nav.modelContext;
  if (!mc) return false;
  try {
    if (typeof mc.registerTool === "function") {
      for (const tool of herramientas()) mc.registerTool(tool);
      return true;
    }
    if (typeof mc.provideContext === "function") {
      mc.provideContext({ tools: herramientas() });
      return true;
    }
  } catch {
    // Un API experimental que cambia de forma no puede tumbar la página.
  }
  return false;
}
