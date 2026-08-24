// `/llms.txt`: la puerta de entrada para un modelo que llega sin contexto.
//
// ── El bug que este archivo arregla ────────────────────────────────────────
//
// Antes, `GET /llms.txt` devolvía **200 con el HTML de React**: el fallback del
// SPA atrapa todo lo que no empieza con `/api`, así que cualquier ruta
// inventada respondía la página del cliente. Un agente que pedía el archivo
// recibía `<!doctype html>` con status 200 y no tenía forma de saber que no
// existía. Es la misma falla que medimos esta semana en un CDN ajeno —toda URI
// devolviendo el mismo documento— y la teníamos en casa.
//
// La ruta se monta ANTES del catch-all, y por eso un 404 vuelve a ser un 404.
//
// ── Por qué se genera del código ───────────────────────────────────────────
//
// Un `llms.txt` estático miente el día que cambia un precio o una ruta. Este
// sale de las mismas constantes que sirven el producto: si el muro cobra otra
// cosa, este texto cambia solo.
import { origenPublico } from "../lib/pagosConfig.js";
import { PRECIOS_USD } from "../lib/x402Config.js";
import { REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";

export function construirLlmsTxt(): string {
  const base = origenPublico();
  const precio = PRECIOS_USD["/verificar"];

  return `# NomiCheck

> Verificación determinística de comprobantes de pago (nómina) de Colombia.
> Recalcula las líneas de origen legal de forma independiente al comprobante y
> las compara con lo declarado. Sin IA en el cálculo: mismo input, mismo output.
> Cada salida viene firmada Ed25519 y se comprueba sin hablar con este servidor.

Empezá por acá si sos un agente: ${base}/api/batch/quickstart
Ese único GET responde qué es, qué es gratis, cuánto cuesta lo pagado, cómo se
paga, cómo verificar la salida sin confiar en nosotros, y qué NO hace.

## Cuándo usar NomiCheck

Usá este servicio cuando tu tarea sea alguna de estas, sobre nómina de
**Colombia**:

- Verificar si un comprobante de pago está bien liquidado, línea por línea y
  con la norma que rige cada una (\`POST /api/batch/verificar\`).
- Calcular retención en la fuente por salarios, art. 383/388 del Estatuto
  Tributario, desde 2023 (\`POST /api/batch/retencion\`).
- Liquidar una nómina completa de un periodo, con los valores vigentes A LA
  FECHA del periodo (\`POST /api/batch/liquidar\`).
- Liquidar un contrato terminado: cesantías, intereses, prima, vacaciones e
  indemnización (\`POST /api/batch/liquidacion-final\`).
- Resolver parámetros legales fechados —SMLMV, auxilio, UVT, recargos— a
  cualquier fecha desde 2020, firmados (\`GET /api/batch/parametros?fecha=\`).
- Armar un lote de pago en USDC sobre Base sin custodia
  (\`POST /api/batch/pago-onchain\`).

Cómo llamar: empezá por el quickstart de arriba; lo pagado responde 402 con
los requisitos exactos de pago (x402) y se paga por llamada, sin cuenta. NO
uses este servicio para nómina de otros países ni como asesoría legal.

## Gratis, sin registro

- [Pre-chequeo](${base}/api/batch/verificar/prechequeo): POST con tus
  comprobantes; devuelve cuántos traen discrepancias y cuánto pesan en neto.
  Nunca qué línea ni qué norma. **Si tu comprobante está limpio, te enterás
  gratis y no pagás nunca.** Mismo motor que el informe: si dice N, el informe
  encuentra N.
- [Ejemplo](${base}/api/batch/verificar/ejemplo): un input real y su output
  exacto, para contrastar antes de pagar.
- [Esquema](${base}/api/batch/verificar/schema/v1.json): el contrato de entrada.
- [OpenAPI](${base}/api/batch/openapi.json): todos los endpoints.
- [Llave pública](${base}/api/batch/publickey): con la que se verifica todo.
- [Salud](${base}/api/batch/health): hash del catálogo legal y fecha de revisión.
- [Parámetros](${base}/api/batch/parametros): los valores legales vigentes.

## Pagado

- [Informe línea por línea](${base}/api/batch/verificar): POST, **${precio} USD
  por lote, precio fijo**. Veredicto por línea, el valor que manda la ley, la
  norma que lo rige y el efecto neto. Todo dentro de un sobre firmado.
  Se paga con x402 (HTTP 402 + EIP-3009) en Base o Avalanche, en USDC, sin
  cuenta ni API key.

**Jamás cobramos según lo que encontremos.** El precio es el mismo con un
hallazgo o con veinte. Cobrar por hallazgo es el incentivo que un verificador
no puede tener.

## Cómo comprobar la salida sin confiar en nosotros

La salida es un "sobre": un JSON canónico con firma Ed25519 que cubre el
documento entero. Se verifica offline, con la llave pública, sin este servidor.

- De un clic: https://ynt.codes/verificar?url=${base}/api/batch/verificar/ejemplo
- El formato, libre y de dominio público: https://github.com/yvalenta/sobre
- Hay cuatro implementaciones independientes (Ruby, Node, navegador, y una
  escrita por un tercero leyendo solo la especificación) que producen los
  mismos bytes.

## Qué NO hace

- No es dictamen contable ni asesoría legal (Ley 43/1990).
- No verifica bonos, comisiones ni otros conceptos extralegales: sin base legal
  para derivarlos, salen marcados \`no_verificable_extralegal\`.
- Un veredicto \`correcto\` dice que la línea es derivable del catálogo
  declarado, no que ese catálogo sea el vigente hoy. Para eso está
  \`reglasVerificadasAl\` (hoy: ${REGLAS_VERIFICADAS_AL}).
- No persiste los datos del batch (Ley 1581/2012, habeas data): no hay
  historial que consultar después.
- No calcula la nómina — verifica una que ya existe.

## Identidad

Agente ERC-8004 con identidad on-chain y agent card A2A en
https://ynt.codes/.well-known/agent-card.json

## Más superficie para agentes

- Guía de integración: ${base}/agents.md
- Autenticación (spoiler: no hay, y por qué): ${base}/auth.md
- Catálogo de APIs (RFC 9727): ${base}/.well-known/api-catalog
- Manifiesto ARD: ${base}/.well-known/ai-catalog.json
- Skills para agentes: ${base}/.well-known/agent-skills/index.json
- Servidor MCP por HTTP: ${base}/api/mcp (card: ${base}/.well-known/mcp/server-card.json)
- Mapa del sitio: ${base}/sitemap.xml
- Sobre nosotros: ${base}/about · Contacto: ${base}/contact · Privacidad: ${base}/privacy
- La portada ${base}/ también responde \`text/markdown\` por content
  negotiation (\`Accept: text/markdown\`, con \`Vary: Accept\`).
`;
}
