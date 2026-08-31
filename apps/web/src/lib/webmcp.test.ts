import { afterEach, describe, expect, it, vi } from "vitest";
import { herramientas, registrarWebMcp, type HerramientaWebMcp } from "./webmcp";

// WebMCP es un API experimental: lo que más importa probar no es que registre
// —eso es una llamada— sino que su ausencia sea un no-op perfecto y que las
// herramientas digan la verdad: la de parámetros pega al endpoint firmado con
// la fecha bien pasada, y ninguna se inventa una respuesta cuando el servidor
// contesta mal.

afterEach(() => vi.unstubAllGlobals());

function fetchFalso(cuerpo: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: async () => cuerpo });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("herramientas", () => {
  it("son dos, de lectura, con nombre e inputSchema de objeto", () => {
    const lista = herramientas();
    expect(lista.map((t) => t.name)).toEqual([
      "get_colombian_legal_parameters",
      "get_usage_guide",
    ]);
    for (const t of lista) {
      expect(t.description.length).toBeGreaterThan(60);
      expect(t.inputSchema).toMatchObject({ type: "object" });
      expect(typeof t.execute).toBe("function");
    }
  });

  it("parámetros: la fecha viaja como query y encodificada", async () => {
    const fetch = fetchFalso({ vigenteDesde: "2024-03-15" });
    const [parametros] = herramientas();
    await parametros.execute({ fecha: "2024-03-15" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/batch/parametros?fecha=2024-03-15",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("parámetros: sin fecha no manda query — 'hoy' lo resuelve el servidor", async () => {
    const fetch = fetchFalso({});
    const [parametros] = herramientas();
    await parametros.execute({});
    expect(fetch.mock.calls[0][0]).toBe("/api/batch/parametros");
  });

  it("la respuesta va como contenido de texto MCP, no como objeto suelto", async () => {
    fetchFalso({ smlmv: 1750905 });
    const [parametros] = herramientas();
    const r = await parametros.execute({});
    expect(r.content[0].type).toBe("text");
    expect(JSON.parse(r.content[0].text)).toEqual({ smlmv: 1750905 });
  });

  it("un status no-ok sale como error nombrado, nunca como respuesta plausible", async () => {
    fetchFalso({}, false, 503);
    const [parametros, guia] = herramientas();
    for (const tool of [parametros, guia]) {
      const r = await tool.execute({});
      expect(r.content[0].text).toContain("503");
    }
  });

  it("la guía pega al quickstart, que es la puerta de una llamada", async () => {
    const fetch = fetchFalso({ queEs: "..." });
    const [, guia] = herramientas();
    await guia.execute({});
    expect(fetch.mock.calls[0][0]).toBe("/api/batch/quickstart");
  });
});

describe("registrarWebMcp", () => {
  it("sin navigator.modelContext es un no-op que devuelve false", () => {
    expect(registrarWebMcp({})).toBe(false);
  });

  it("con registerTool registra las herramientas una por una", () => {
    const registerTool = vi.fn();
    expect(registrarWebMcp({ modelContext: { registerTool } })).toBe(true);
    expect(registerTool).toHaveBeenCalledTimes(2);
    const nombres = registerTool.mock.calls.map((c) => (c[0] as HerramientaWebMcp).name);
    expect(nombres).toContain("get_colombian_legal_parameters");
  });

  it("sin registerTool cae a provideContext con el lote completo", () => {
    const provideContext = vi.fn();
    expect(registrarWebMcp({ modelContext: { provideContext } })).toBe(true);
    const lote = provideContext.mock.calls[0][0] as { tools: HerramientaWebMcp[] };
    expect(lote.tools.length).toBe(2);
  });

  it("un API que revienta al registrar no tumba la página: false y silencio", () => {
    const registerTool = vi.fn(() => {
      throw new Error("shape del API cambió");
    });
    expect(registrarWebMcp({ modelContext: { registerTool } })).toBe(false);
  });
});
