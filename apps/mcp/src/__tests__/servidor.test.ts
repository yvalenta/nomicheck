// Tests del servidor MCP entero, hablando el protocolo de verdad.
//
// No se llama a las funciones por dentro: un cliente MCP real se conecta por
// un `InMemoryTransport` y pasa por TODO lo que un cliente externo pasaría —
// registro de herramientas, validación zod del input, serialización del
// resultado. Es la diferencia entre probar la cocina y probar el restaurante:
// una herramienta registrada con el schema equivocado cocina perfecto y aún
// así no se puede pedir.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { construirServidor } from "../servidor.js";

const FIXTURES = new URL("./fixtures/", import.meta.url);
const leerFixture = (nombre: string) =>
  JSON.parse(readFileSync(new URL(nombre, FIXTURES), "utf8")) as Record<string, unknown>;

async function conectar() {
  const [ladoCliente, ladoServidor] = InMemoryTransport.createLinkedPair();
  const servidor = construirServidor();
  const cliente = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([servidor.connect(ladoServidor), cliente.connect(ladoCliente)]);
  return cliente;
}

/** El texto del primer content, parseado — que es como lo consume un modelo. */
function jsonDelResultado(r: { content?: unknown }): unknown {
  const contenido = r.content as { type: string; text: string }[];
  return JSON.parse(contenido[0].text);
}

beforeEach(() => vi.stubEnv("NOMICHECK_BASE_URL", "https://nomicheck.test"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("el catálogo de herramientas", () => {
  it("expone exactamente las cinco herramientas v1, con su nombre público", async () => {
    const cliente = await conectar();
    const { tools } = await cliente.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "nomicheck_calcular",
      "nomicheck_ejemplo",
      "nomicheck_info",
      "nomicheck_schema",
      "nomicheck_verificar_sobre",
    ]);
  });

  it("la descripción de calcular ya explica el flujo 402, porque el caller decide con ella", async () => {
    // Un modelo elige herramienta leyendo descripciones. Si el 402 no está
    // contado ahí, el primer "pago requerido" se lee como fallo y el caller
    // abandona en vez de firmar y reintentar.
    const cliente = await conectar();
    const { tools } = await cliente.listTools();
    const calcular = tools.find((t) => t.name === "nomicheck_calcular");
    expect(calcular?.description).toContain("402");
    expect(calcular?.description).toContain("x_payment");
  });
});

describe("nomicheck_schema y nomicheck_ejemplo por el transporte", () => {
  it("schema devuelve el JSON del servidor tal cual, sin resumirlo", async () => {
    const schema = { $schema: "http://json-schema.org/draft-07/schema#", title: "BatchLiquidarInput" };
    vi.stubGlobal("fetch", async (url: string | URL) => {
      expect(String(url)).toBe("https://nomicheck.test/api/batch/schema/v1.json");
      return new Response(JSON.stringify(schema), { status: 200 });
    });

    const cliente = await conectar();
    const r = await cliente.callTool({ name: "nomicheck_schema", arguments: {} });
    expect(jsonDelResultado(r)).toEqual(schema);
  });

  it("ejemplo arma la URL desde la ruta pedida", async () => {
    const pedidas: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      pedidas.push(String(url));
      return new Response(JSON.stringify({ instrucciones: "…", input: {}, output: {} }), { status: 200 });
    });

    const cliente = await conectar();
    await cliente.callTool({ name: "nomicheck_ejemplo", arguments: { ruta: "liquidacion-final" } });
    expect(pedidas).toEqual(["https://nomicheck.test/api/batch/liquidacion-final/ejemplo"]);
  });

  it("una ruta fuera del enum se rechaza ANTES de tocar la red", async () => {
    // La validación es del servidor MCP, no del endpoint: mandar la ruta
    // inventada a la API sería descubrir el typo con un 404 ajeno — o peor,
    // con un POST pagado a una ruta que no existe.
    const fetchEspia = vi.fn(() => {
      throw new Error("no debió salir a la red");
    });
    vi.stubGlobal("fetch", fetchEspia);

    const cliente = await conectar();
    const r = await cliente.callTool({ name: "nomicheck_ejemplo", arguments: { ruta: "retenciom" } });
    expect(r.isError).toBe(true);
    // El SDK devuelve la validación como resultado isError (-32602), y el
    // mensaje enumera las rutas válidas — el typo se corrige leyendo, no
    // adivinando contra la API.
    expect((r.content as { text: string }[])[0].text).toContain("liquidacion-final");
    expect(fetchEspia).not.toHaveBeenCalled();
  });
});

describe("nomicheck_verificar_sobre por el transporte", () => {
  it("verifica el sobre real de producción con la llave pinneada, todo offline", async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("con llave pinneada nada debe tocar la red");
    });
    const sobre = leerFixture("sobre-retencion.json").sobre;
    const llave = (leerFixture("publickey.json").respuesta as Record<string, unknown>).publicKeyPem;

    const cliente = await conectar();
    const r = await cliente.callTool({
      name: "nomicheck_verificar_sobre",
      arguments: { documento: sobre, llave_publica_pem: llave },
    });
    expect(jsonDelResultado(r)).toMatchObject({ veredicto: "verificable" });
  });
});

describe("cuando la red falla, el error llega con nombre", () => {
  it("un HTTP caído vuelve como isError con la URL y el status — no como error de protocolo", async () => {
    // Si la excepción cruzara el transporte sin atrapar, el cliente vería un
    // "internal error" genérico y perdería justo lo útil: QUÉ falló.
    vi.stubGlobal("fetch", async () => new Response("se cayó", { status: 503 }));

    const cliente = await conectar();
    const r = await cliente.callTool({ name: "nomicheck_schema", arguments: {} });
    expect(r.isError).toBe(true);
    const contenido = r.content as { text: string }[];
    expect(contenido[0].text).toContain("503");
    expect(contenido[0].text).toContain("/api/batch/schema/v1.json");
  });
});
