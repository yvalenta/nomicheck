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
  const servidor = new McpServer({ name: "nomicheck", version: "0.1.0" });

  servidor.registerTool(
    "nomicheck_info",
    {
      title: "Catálogo, precios y cruce de identidad de pago",
      description:
        "Gratis. Resume el OpenAPI del wrapper (productos, precios x402, redes aceptadas) y " +
        "hace el cruce de seguridad: mide el `payTo` que el 402 anuncia HOY y lo compara con " +
        "el `walletAddress` del agent card en el apex. Llamala antes de firmar cualquier pago — " +
        "si `cruce.coinciden` no es true, no firmes.",
      inputSchema: {},
    },
    () => protegido(async () => comoTexto(await armarInfo())),
  );

  servidor.registerTool(
    "nomicheck_ejemplo",
    {
      title: "Ejemplo canónico input+output de un listing",
      description:
        "Gratis. Devuelve el par input+output real de un listing para copiar el contrato sin " +
        "leer documentación. El `output` viene FIRMADO por producción, así que también sirve " +
        "como insumo directo de `nomicheck_verificar_sobre`.",
      inputSchema: {
        ruta: z.enum(RUTAS_EJEMPLO).describe("Listing del que pedir el ejemplo."),
      },
    },
    ({ ruta }) => protegido(async () => comoTexto(await pedirEjemplo(ruta))),
  );

  servidor.registerTool(
    "nomicheck_schema",
    {
      title: "JSON Schema del contrato de liquidación (v1)",
      description:
        "Gratis. El JSON Schema Draft 7 del input de `/liquidar`, generado del mismo zod que " +
        "valida en runtime — no hay una segunda fuente que pueda mentir.",
      inputSchema: {},
    },
    () => protegido(async () => comoTexto(await pedirSchema())),
  );

  servidor.registerTool(
    "nomicheck_calcular",
    {
      title: "Ejecutar un cálculo (POST con muro x402)",
      description:
        "POST del body a un listing. Sin `x_payment` y con el muro encendido devuelve el 402 " +
        "ESTRUCTURADO: el array `accepts` completo (red, token, monto, payTo, dominio EIP-712) " +
        "más el cruce del payTo contra el agent card. El caller elige una red, firma EIP-3009 " +
        "y reintenta pasando `x_payment`; la respuesta pagada vuelve con el resultado firmado " +
        "y el header X-PAYMENT-RESPONSE ya decodificado.",
      inputSchema: {
        ruta: z.enum(RUTAS_CALCULO).describe("Listing a ejecutar."),
        body: z
          .record(z.unknown())
          .describe("El body JSON del contrato v1 del listing (ver nomicheck_ejemplo / nomicheck_schema)."),
        x_payment: z
          .string()
          .optional()
          .describe("Autorización EIP-3009 serializada; va como header X-PAYMENT."),
      },
    },
    ({ ruta, body, x_payment }) => protegido(async () => comoTexto(await calcular(ruta, body, x_payment))),
  );

  servidor.registerTool(
    "nomicheck_verificar_sobre",
    {
      title: "Verificar un sobre firmado — offline",
      description:
        "Verifica LOCALMENTE una salida firmada de NomiCheck (Ed25519 sobre el JSON canónico) " +
        "con la copia vendorizada del verificador `sobre` — la verificación en sí no toca la " +
        "red. Veredictos: `verificable`, `firmado_sin_procedencia` (firma válida pero sin " +
        "reglasHash: una opinión firmada) o `invalido`. Si no se pasa la llave, se baja de " +
        "/api/batch/publickey — mismo origen que el sobre, o sea consistencia, no identidad.",
      inputSchema: {
        documento: z
          .record(z.unknown())
          .describe("El sobre completo tal cual lo devolvió la API, con su campo `signature`."),
        llave_publica_pem: z
          .string()
          .optional()
          .describe("Llave pública Ed25519 en PEM, pinneada por el caller. El caso fuerte."),
      },
    },
    ({ documento, llave_publica_pem }) =>
      protegido(async () => comoTexto(await verificarSobre(documento, llave_publica_pem))),
  );

  return servidor;
}
