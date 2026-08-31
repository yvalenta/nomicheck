// El servidor MCP de NomiCheck: cinco herramientas sobre el wrapper stateless.
//
// La construcción está separada del transporte (`index.ts`) por los tests: un
// servidor que solo existe enchufado a stdio no se puede probar sin subprocesos,
// y los tests de acá hablan MCP de verdad por un `InMemoryTransport` — así lo
// que se prueba es lo mismo que un cliente real va a ver, incluida la
// validación zod de cada input.
//
// Las herramientas devuelven el JSON COMPLETO de cada respuesta, no un resumen
// en prosa. El caller es un modelo: darle prosa sobre números es invitarlo a
// citar el número de la prosa en vez del dato, y este producto existe porque
// las cifras se verifican, no se parafrasean.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RUTAS_CALCULO, RUTAS_EJEMPLO } from "./lib/base.js";
import { armarInfo } from "./lib/info.js";
import { pedirEjemplo, pedirSchema } from "./lib/consultas.js";
import { calcular } from "./lib/calcular.js";
import { verificarSobre } from "./lib/sobreLocal.js";

export { crearTransporteHttp } from "./http.js";

/**
 * La identidad del servidor, exportada porque la lee más de uno: acá el
 * McpServer, y en @pv/api el server card de `/.well-known/mcp/server-card.json`.
 * Un card con nombre o versión copiados a mano es el que miente al primer bump.
 */
export const INFO_SERVIDOR = { name: "nomicheck", version: "0.1.0" } as const;

/** Un resultado MCP de texto con el JSON tal cual, indentado para humanos. */
function comoTexto(v: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] };
}

/**
 * Todo fallo vuelve como resultado `isError` con el mensaje real, nunca como
 * excepción suelta: una excepción que cruza el transporte se convierte en un
 * error de protocolo genérico, y el caller pierde justo la parte útil — QUÉ
 * URL falló y con qué status.
 */
async function protegido(fn: () => Promise<{ content: { type: "text"; text: string }[] }>) {
  try {
    return await fn();
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text" as const, text: mensaje }], isError: true };
  }
}

export function construirServidor(): McpServer {
  const servidor = new McpServer(INFO_SERVIDOR);

  servidor.registerTool(
    "nomicheck_info",
    {
      title: "Catalog, prices and payment-identity cross-check",
      description:
        "Free. Summarizes the wrapper's OpenAPI (products, x402 prices, accepted networks) " +
        "and performs the safety cross-check: it reads the `payTo` the 402 announces " +
        "TODAY and compares it against the `walletAddress` of the agent card on the apex. " +
        "Call it before signing any payment — if `cruce.coinciden` is not true, do not sign.",
      inputSchema: {},
    },
    () => protegido(async () => comoTexto(await armarInfo())),
  );

  servidor.registerTool(
    "nomicheck_ejemplo",
    {
      title: "Canonical input+output example of a listing",
      description:
        "Free. Returns a listing's real input+output pair so you can copy the contract " +
        "without reading documentation. The `output` comes SIGNED by production, so it also " +
        "works as direct input for `nomicheck_verificar_sobre`.",
      inputSchema: {
        ruta: z.enum(RUTAS_EJEMPLO).describe("Route to fetch the example from."),
      },
    },
    ({ ruta }) => protegido(async () => comoTexto(await pedirEjemplo(ruta))),
  );

  servidor.registerTool(
    "nomicheck_schema",
    {
      title: "JSON Schema of the settlement contract (v1)",
      description:
        "Free. The JSON Schema Draft 7 of the `/liquidar` input, generated from the same zod " +
        "that validates at runtime — there is no second source that could lie.",
      inputSchema: {},
    },
    () => protegido(async () => comoTexto(await pedirSchema())),
  );

  servidor.registerTool(
    "nomicheck_calcular",
    {
      title: "Run a calculation (POST behind the x402 paywall)",
      description:
        "POSTs the body to a listing. Without `x_payment` and with the paywall on, it returns " +
        "the STRUCTURED 402: the full `accepts` array (network, token, amount, payTo, EIP-712 " +
        "domain) plus the payTo cross-check against the agent card. The caller picks a " +
        "network, signs EIP-3009 and retries passing `x_payment`; the paid response returns " +
        "the signed result with the X-PAYMENT-RESPONSE header already decoded.",
      inputSchema: {
        ruta: z.enum(RUTAS_CALCULO).describe("Route to run."),
        body: z
          .record(z.unknown())
          .describe("The JSON body of the listing's v1 contract (see nomicheck_ejemplo / nomicheck_schema)."),
        x_payment: z
          .string()
          .optional()
          .describe("Serialized EIP-3009 authorization; sent as the X-PAYMENT header."),
      },
    },
    ({ ruta, body, x_payment }) => protegido(async () => comoTexto(await calcular(ruta, body, x_payment))),
  );

  servidor.registerTool(
    "nomicheck_verificar_sobre",
    {
      title: "Verify a signed envelope — offline",
      description:
        "LOCALLY verifies a signed NomiCheck output (Ed25519 over the canonical JSON) with " +
        "the vendored copy of the `sobre` verifier — the verification itself never touches " +
        "the network. Verdicts: `verificable`, `firmado_sin_procedencia` (valid signature " +
        "but no reglasHash: a signed opinion) or `invalido`. If no key is passed, it is " +
        "fetched from /api/batch/publickey — same origin as the envelope, i.e. consistency, " +
        "not identity.",
      inputSchema: {
        documento: z
          .record(z.unknown())
          .describe("The complete envelope exactly as the API returned it, with its `signature` field."),
        llave_publica_pem: z
          .string()
          .optional()
          .describe("Ed25519 public key in PEM, pinned by the caller. The strong case."),
      },
    },
    ({ documento, llave_publica_pem }) =>
      protegido(async () => comoTexto(await verificarSobre(documento, llave_publica_pem))),
  );

  return servidor;
}
