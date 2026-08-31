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
//
// ── En INGLÉS a propósito (2026-08-31, pedido de Yonatan) ──────────────────
//
// La audiencia medida de esta superficie son máquinas que operan en inglés
// (ver nomicheck_ops/docs/estado/mercado.md). El español del producto vive en
// la web para humanos, no acá.
import { origenPublico } from "../lib/pagosConfig.js";
import { PRECIOS_USD } from "../lib/x402Config.js";
import { REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";

export function construirLlmsTxt(): string {
  const base = origenPublico();
  const precio = PRECIOS_USD["/verificar"];

  return `# NomiCheck

> Deterministic verification of Colombian payslips (nómina). It independently
> recomputes the statutory lines of a payslip and compares them against what
> the payslip declares. No AI in the calculation: same input, same output.
> Every output ships Ed25519-signed and can be verified without talking to
> this server.

If you are an agent, start here: GET ${base}/api/batch/quickstart
That single GET answers what this is, what is free, what the paid report
costs, how payment works, how to verify the output without trusting us, and
what it does NOT do.

## When to use NomiCheck

Use this service when your task is one of these, about **Colombian** payroll:

- Verify whether a payslip is correctly settled, line by line and with the
  norm that governs each one (\`POST /api/batch/verificar\`).
- Compute withholding tax on salaries (retención en la fuente), art. 383/388
  of the Estatuto Tributario, from 2023 on (\`POST /api/batch/retencion\`).
- Settle a full payroll period, with the values in force ON THE PERIOD'S
  DATE (\`POST /api/batch/liquidar\`).
- Settle a terminated contract: severance (cesantías), its interest, prima,
  vacation and indemnity (\`POST /api/batch/liquidacion-final\`).
- Resolve dated legal parameters — minimum wage, transport allowance, UVT,
  surcharges — for any date since 2020, signed
  (\`GET /api/batch/parametros?fecha=\`).
- Build a non-custodial USDC payout batch on Base
  (\`POST /api/batch/pago-onchain\`).

How to call: start with the quickstart above; paid routes answer 402 with the
exact payment requirements (x402) and are paid per call, no account. Do NOT
use this service for other countries' payroll or as legal advice.

## Free, no sign-up

- [Pre-check](${base}/api/batch/verificar/prechequeo): POST your payslips;
  it returns how many carry discrepancies and their net effect in COP.
  Never which
  line or which norm. **If your payslip is clean, you find out for free and
  never pay.** Same engine as the report: if it says N, the report finds N.
- [Example](${base}/api/batch/verificar/ejemplo): a real input and its exact
  output, to compare against before paying.
- [Schema](${base}/api/batch/verificar/schema/v1.json): the input contract.
- [OpenAPI](${base}/api/batch/openapi.json): every endpoint.
- [Public key](${base}/api/batch/publickey): the one that verifies everything.
- [Health](${base}/api/batch/health): legal catalog hash and review date.
- [Legal parameters](${base}/api/batch/parametros): the statutory values in force.

## Paid

- [Line-by-line report](${base}/api/batch/verificar): POST, **${precio} USD
  per batch, flat price**. A verdict per line, the value the law mandates,
  the norm that governs it, and the net effect. All inside a signed envelope.
  Paid with x402 (HTTP 402 + EIP-3009) in USDC on Base or Avalanche, no
  account and no API key.

**We never charge based on what we find.** The price is the same with one
finding or with twenty. Charging per finding is the incentive a verifier
must not have.

## How to check the output without trusting us

The output is a "sobre" — a signed envelope: canonical JSON with an Ed25519
signature covering the whole document. It verifies offline, with the public
key, without this server.

- One click: https://ynt.codes/verificar?url=${base}/api/batch/verificar/ejemplo
- The format, free and in the public domain: https://github.com/yvalenta/sobre
- Four independent implementations (Ruby, Node, browser, and one written by
  a third party from the specification alone) produce the same bytes.

## What it does NOT do

- It is not an accounting opinion or legal advice (Colombian Law 43/1990).
- It does not verify bonuses, commissions or other extralegal concepts: with
  no legal basis to derive them, they come back marked
  \`no_verificable_extralegal\`.
- A \`correcto\` verdict says the line is derivable from the declared
  catalog, not that that catalog is the one in force today. That is what
  \`reglasVerificadasAl\` is for (today: ${REGLAS_VERIFICADAS_AL}).
- It does not persist batch data (Colombian Law 1581/2012, habeas data):
  there is no history to query afterwards.
- It does not compute the payroll — it verifies one that already exists.

## Identity

ERC-8004 agent with an on-chain identity and an A2A agent card at
https://ynt.codes/.well-known/agent-card.json

## More agent surface

- [Integration guide](${base}/agents.md)
- [Authentication](${base}/auth.md): spoiler — there is none, and why
- [API catalog](${base}/.well-known/api-catalog) (RFC 9727)
- [ARD manifest](${base}/.well-known/ai-catalog.json)
- [Agent skills](${base}/.well-known/agent-skills/index.json)
- MCP server over HTTP: ${base}/api/mcp (card: ${base}/.well-known/mcp/server-card.json)
- Sitemap: ${base}/sitemap.xml
- Pricing, with the why of every price: ${base}/pricing
- About: ${base}/about · Contact: ${base}/contact · Privacy: ${base}/privacy
- The home page ${base}/, ${base}/servicios and ${base}/lanzamiento also
  answer \`text/markdown\` via content negotiation (\`Accept:
  text/markdown\`, with \`Vary: Accept\`).
`;
}
