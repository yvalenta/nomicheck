// El transporte HTTP del servidor MCP, para servirlo desde el contenedor de
// la API (SEP: Streamable HTTP). Vive acá y no en @pv/api a propósito: el SDK
// de MCP es dependencia de ESTE workspace, y que la API lo importara directo
// sería depender de un transitivo — la deuda que ya mordió con @types/node.
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/**
 * Un transporte NUEVO por petición, sin sesión y con respuesta JSON plana.
 *
 * Sin sesión (`sessionIdGenerator: undefined`) porque las cinco herramientas
 * son stateless igual que el wrapper que envuelven: cada llamada trae todo lo
 * que necesita, y un almacén de sesiones sería estado nuevo en un producto
 * cuyo contrato es no tenerlo. Y JSON en vez de SSE porque sin sesión no hay
 * nada que streamear: la respuesta cabe en un cuerpo.
 */
export function crearTransporteHttp(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
}
