import { ProveedorClaude } from "./proveedorClaude.js";
import { ProveedorGemini } from "./proveedorGemini.js";
import type { ProveedorChatIA, ProveedorExtraccionIA } from "./tipos.js";

export * from "./tipos.js";

// Selección de proveedor por variable de entorno — agregar uno nuevo es un
// adaptador más (implementa ProveedorExtraccionIA/ProveedorChatIA), sin tocar
// el resto del sistema (SDD §04, capa de IA multi-proveedor). Extracción y
// chat comparten el mismo IA_PROVEEDOR: ambos adaptadores implementan las dos
// interfaces, así que un solo switch mueve toda la IA de la plataforma.
type ProveedorIA = ProveedorClaude | ProveedorGemini;

let instancia: ProveedorIA | undefined;

function proveedor(): ProveedorIA {
  if (instancia) return instancia;

  const nombre = (process.env.IA_PROVEEDOR ?? "gemini").toLowerCase();

  if (nombre === "claude") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en el servidor");
    instancia = new ProveedorClaude(apiKey);
  } else if (nombre === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY no configurada en el servidor");
    instancia = new ProveedorGemini(apiKey);
  } else {
    throw new Error(`IA_PROVEEDOR desconocido: "${nombre}" (usa "claude" o "gemini")`);
  }

  return instancia;
}

export function proveedorExtraccion(): ProveedorExtraccionIA {
  return proveedor();
}

export function proveedorChat(): ProveedorChatIA {
  return proveedor();
}
