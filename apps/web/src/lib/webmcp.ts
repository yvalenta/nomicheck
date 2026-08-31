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
//
// ── En INGLÉS, nombres de tool incluidos (2026-08-31, pedido de Yonatan) ──
//
// `consultar_parametros_legales` y `obtener_guia_de_uso` pasaron a
// `get_colombian_legal_parameters` y `get_usage_guide` A PROPÓSITO: el API es
// experimental, los agentes del navegador descubren las tools en vivo (no hay
// integraciones que romper, a diferencia del MCP de apps/mcp, cuyos nombres
// NO se tocaron), y el que las lee opera en inglés.

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
      name: "get_colombian_legal_parameters",
      description:
        "Colombian statutory payroll parameters (minimum wage, transport allowance, UVT, " +
        "surcharges, withholding caps), resolved at a date and signed. Without a date it " +
        "returns the ones in force today; with a date (YYYY-MM-DD, since 2020) the ones " +
        "that governed that day — what a retroactive settlement needs.",
      inputSchema: {
        type: "object",
        properties: {
          fecha: {
            type: "string",
            format: "date",
            description: "Day to resolve the values at (YYYY-MM-DD). Omitted = today.",
          },
        },
        additionalProperties: false,
      },
      async execute(input) {
        const fecha = typeof input?.fecha === "string" && input.fecha !== "" ? input.fecha : null;
        const url = `${base}/api/batch/parametros${fecha ? `?fecha=${encodeURIComponent(fecha)}` : ""}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) {
          return comoTexto({ error: `The server answered ${res.status}`, url });
        }
        return comoTexto(await res.json());
      },
    },
    {
      name: "get_usage_guide",
      description:
        "The full guide to using NomiCheck as an agent, in one call: what it does, what " +
        "is free (payslip pre-check included), what the paid report costs and how to pay " +
        "per call (x402), where the input contracts live, and how to verify any output " +
        "without trusting this server.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        const res = await fetch(`${base}/api/batch/quickstart`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          return comoTexto({ error: `The server answered ${res.status}` });
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
