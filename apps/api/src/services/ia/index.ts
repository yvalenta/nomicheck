import { ProveedorClaude } from "./proveedorClaude.js";
import { ProveedorGemini } from "./proveedorGemini.js";
import type { ProveedorExtraccionIA } from "./tipos.js";

export * from "./tipos.js";

// Selección de proveedor por variable de entorno — agregar uno nuevo es un
// adaptador más (implementa ProveedorExtraccionIA), sin tocar el resto del
// sistema (SDD §04, capa de IA multi-proveedor).
let instancia: ProveedorExtraccionIA | undefined;

export function proveedorExtraccion(): ProveedorExtraccionIA {
  if (instancia) return instancia;

  const proveedor = (process.env.IA_PROVEEDOR ?? "gemini").toLowerCase();

  if (proveedor === "claude") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en el servidor");
    instancia = new ProveedorClaude(apiKey);
  } else if (proveedor === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY no configurada en el servidor");
    instancia = new ProveedorGemini(apiKey);
  } else {
    throw new Error(`IA_PROVEEDOR desconocido: "${proveedor}" (usa "claude" o "gemini")`);
  }

  return instancia;
}
