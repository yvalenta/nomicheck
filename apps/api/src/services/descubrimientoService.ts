// La capa de descubrimiento para agentes: el catálogo de APIs (RFC 9727), el
// manifiesto ARD del origen, auth.md, y el índice de skills con su artefacto.
//
// ── El criterio que comparten las cuatro piezas ────────────────────────────
//
// Solo se publica lo que EXISTE. Por eso acá no hay `/.well-known/openid-
// configuration` ni `oauth-authorization-server`: esta API no tiene OAuth — las
// lecturas de integración son libres y lo pagado se paga por llamada con x402,
// sin cuenta. Publicar metadata de un issuer inexistente sería exactamente el
// 200 que miente, con firma. `oauth-protected-resource` (RFC 9728) SÍ se
// publica desde el 2026-08-23, y no contradice la regla: su único campo
// obligatorio es `resource`, y declararlo con `authorization_servers` VACÍO es
// un enunciado verdadero — "este recurso existe y ningún issuer emite tokens
// para él" — que además le ahorra al agente el barrido de issuers que no va a
// encontrar. El server card de MCP siguió esa misma regla en
// las dos direcciones: no existió mientras el servidor era solo stdio con
// paquete privado (habría apuntado a una puerta que nadie puede abrir — la
// lección de la puerta B2B sin picaporte), y existe desde que `/api/mcp`
// sirve el transporte HTTP de verdad (2026-08-23).
//
// Todo se genera del código: los precios de PRECIOS_USD, las URLs de
// origenPublico(), y el digest del skill se calcula sobre los MISMOS bytes que
// se sirven — no puede desincronizarse porque no hay dos copias.
import { createHash } from "node:crypto";
import { INFO_SERVIDOR } from "@pv/mcp";
import { origenPublico } from "../lib/pagosConfig.js";
import { PRECIOS_USD } from "../lib/x402Config.js";
import { REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";

// ── Link headers (RFC 8288) para la portada ────────────────────────────────
// Relaciones REGISTRADAS en IANA, nada inventado: `api-catalog` (RFC 9727),
// `service-desc` y `service-doc` (RFC 8631). Relativas a propósito: se
// resuelven contra la URI pedida y no llevan el origen copiado.
export function enlacesDescubrimiento(): string {
  return [
    '</.well-known/api-catalog>; rel="api-catalog"',
    '</api/batch/openapi.json>; rel="service-desc"; type="application/json"',
    '</docs/>; rel="service-doc"; type="text/html"',
  ].join(", ");
}

// ── /.well-known/api-catalog (RFC 9727, formato linkset RFC 9264) ──────────
export function construirApiCatalog(): Record<string, unknown> {
  const base = origenPublico();
  return {
    linkset: [
      {
        anchor: `${base}/api/batch`,
        "service-desc": [
          { href: `${base}/api/batch/openapi.json`, type: "application/json" },
        ],
        "service-doc": [{ href: `${base}/docs/`, type: "text/html" }],
        status: [{ href: `${base}/api/batch/health`, type: "application/json" }],
      },
    ],
  };
}

// ── /.well-known/ai-catalog.json (ARD) para ESTE origen ────────────────────
// El apex (ynt.codes) publica el suyo con la identidad del agente; este
// describe las capacidades de nomicheck.ynt.codes. No se copian entradas del
// otro: donde hace falta la identidad, la entrada APUNTA al agent card del
// apex, que es su sitio de afirmación.
export function construirArd(): Record<string, unknown> {
  const base = origenPublico();
  const dominio = base.replace(/^https?:\/\//, "");
  const urn = (espacio: string, nombre: string) => `urn:air:${dominio}:${espacio}:${nombre}`;
  return {
    specVersion: "1.0",
    host: { displayName: "NomiCheck", identifier: base },
    entries: [
      {
        identifier: urn("api", "openapi"),
        displayName: "NomiCheck batch API — Colombian payroll, dated and signed",
        type: "application/vnd.oai.openapi+json",
        url: `${base}/api/batch/openapi.json`,
        representativeQueries: [
          "verify a Colombian payslip line by line",
          "compute Colombian withholding tax on salaries",
          "final settlement of a Colombian labor contract",
        ],
      },
      {
        identifier: urn("guia", "quickstart"),
        displayName: "Quickstart — one GET tells an agent everything",
        type: "application/json",
        url: `${base}/api/batch/quickstart`,
        representativeQueries: [
          "how do I pay NomiCheck per call with x402",
          "what is free on NomiCheck and what is paid",
        ],
      },
      {
        identifier: urn("guia", "agents"),
        displayName: "Agent integration guide",
        type: "text/markdown",
        url: `${base}/agents.md`,
        representativeQueries: [
          "when to use NomiCheck",
          "when should an agent call NomiCheck",
        ],
      },
      {
        identifier: urn("skill", "nomicheck-payroll"),
        displayName: "Agent skill — using NomiCheck end to end",
        type: "text/markdown",
        url: `${base}/.well-known/agent-skills/nomicheck-payroll/SKILL.md`,
        representativeQueries: [
          "skill for verifying Colombian payroll",
          "how an agent verifies a Colombian payslip without trusting the issuer",
        ],
      },
      {
        identifier: urn("mcp", "server-card"),
        displayName: "MCP server — five tools over the batch API (streamable HTTP)",
        type: "application/mcp-server-card+json",
        url: `${base}/.well-known/mcp/server-card.json`,
        representativeQueries: [
          "MCP server for Colombian payroll verification",
          "connect an MCP client to NomiCheck",
        ],
      },
      {
        identifier: urn("agent", "card"),
        displayName: "ERC-8004 identity and A2A agent card (served by the apex)",
        type: "application/json",
        url: "https://ynt.codes/.well-known/agent-card.json",
        representativeQueries: [
          "on-chain identity of the NomiCheck agent",
          "which wallet does NomiCheck charge to",
        ],
      },
    ],
  };
}

// ── /.well-known/mcp/server-card.json (SEP-1649) ───────────────────────────
// Existe desde que el MCP tiene transporte HTTP en `/api/mcp` — antes era
// stdio con paquete privado y un card habría apuntado a una puerta que nadie
// podía abrir. La identidad sale de INFO_SERVIDOR de @pv/mcp: la MISMA que el
// servidor declara en el handshake, así que no pueden contarse distinto.
export function construirServerCardMcp(): Record<string, unknown> {
  const base = origenPublico();
  return {
    serverInfo: {
      name: INFO_SERVIDOR.name,
      version: INFO_SERVIDOR.version,
      title: "NomiCheck — verifiable Colombian payroll",
      description:
        "Five tools over the batch wrapper: catalog and payment-identity cross-check, " +
        "signed examples, contract schema, execution behind the x402 paywall (the 402 is " +
        "exposed, not bypassed), and offline verification of the signed envelope.",
    },
    transport: { type: "streamable-http", url: `${base}/api/mcp` },
    capabilities: { tools: { listChanged: false } },
  };
}

// ── /.well-known/oauth-protected-resource (RFC 9728), versión honesta ──────
// El único campo obligatorio del RFC es `resource`. `authorization_servers`
// vacío es la verdad completa: no hay issuer que emita tokens para esta API.
// Lo que seguiría siendo mentira —y no se publica— es la metadata de un
// AUTHORIZATION SERVER (`openid-configuration`, `oauth-authorization-server`):
// esa declara un issuer, y acá no existe ninguno.
export function construirPrm(): Record<string, unknown> {
  const base = origenPublico();
  return {
    resource: base,
    authorization_servers: [],
    scopes_supported: [],
    bearer_methods_supported: [],
    resource_documentation: `${base}/auth.md`,
  };
}

// ── /.well-known/agent-card.json (A2A) para ESTE origen ───────────────────
// La identidad on-chain (wallet, agentId ERC-8004) vive en el card del apex y
// NO se copia acá — `provider.url` apunta allá, igual que hace el ARD. Este
// card declara lo que ESTE origen sirve: la interfaz HTTP+JSON del batch y
// las habilidades reales de la API, con el precio saliendo de PRECIOS_USD
// para que no pueda desincronizarse del muro.
export function construirAgentCardA2a(): Record<string, unknown> {
  const base = origenPublico();
  const precio = PRECIOS_USD["/verificar"];
  const interfaz = { transport: "HTTP+JSON", url: `${base}/api/batch` };
  return {
    protocolVersion: "0.3.0",
    name: "NomiCheck",
    description:
      "Verifiable Colombian payroll: a deterministic engine over a dated legal catalog, " +
      "with a free pre-check, a pay-per-call report (x402, USDC) and Ed25519-signed " +
      "output verifiable offline.",
    url: `${base}/api/batch`,
    version: "1.0.0",
    preferredTransport: "HTTP+JSON",
    supportedInterfaces: [interfaz],
    additionalInterfaces: [interfaz],
    documentationUrl: `${base}/docs/`,
    provider: { organization: "ynt-labs", url: "https://ynt.codes" },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "legal-parameters",
        name: "Colombian legal parameters",
        description:
          "Reads the dated legal catalog (minimum wage, transport allowance, caps, UVT) the engine uses. Free, no credential.",
        tags: ["free", "colombia", "payroll"],
      },
      {
        id: "payslip-precheck",
        name: "Payslip pre-check",
        description:
          "If your payslip is clean you find out for free and never pay; we never charge based on what we find.",
        tags: ["free", "no-signup", "triage"],
      },
      {
        id: "payslip-verification",
        name: "Full payslip verification",
        description: `Line-by-line report with the law cited and a signed envelope, ${precio} USD per batch via x402.`,
        tags: ["x402", "paid", "signed-output"],
      },
      {
        id: "payroll-settlement",
        name: "Payroll settlement",
        description:
          "Settles a full period with the same engine and the same signature; the 402 publishes the exact price.",
        tags: ["x402", "paid", "signed-output"],
      },
    ],
    securitySchemes: {},
    security: [],
  };
}

// ── /auth.md ───────────────────────────────────────────────────────────────
// La respuesta honesta a "¿cómo me registro?": no hay registro, y eso se dice
// de frente en vez de codificarse en metadata OAuth que no existe.
export function construirAuthMd(): string {
  const base = origenPublico();
  const precio = PRECIOS_USD["/verificar"];
  return `# auth.md

How an agent authenticates with NomiCheck — and why it barely needs to.

## Audience

Software agents consuming the public API at ${base} (Colombian payslip
verification, legal catalog verified as of ${REGLAS_VERIFICADAS_AL}).

## Registration: NONE

We issue no API keys, there are no agent accounts and no registration
endpoint. This is by design, not an omission: the API is used without an
identity, and paid operations are paid **per call**.

## Supported methods

- **Integration reads** (OpenAPI, schemas, signed examples, public key,
  legal parameters, health): **no credential at all.**
- **Paid operations** (e.g. the verification report, ${precio} USD per
  batch): **x402** — the server answers \`HTTP 402\` with the exact
  requirements (\`accepts\`: network, token, amount, \`payTo\` and the
  EIP-712 domain); the agent signs an **EIP-3009** authorization (USDC; the
  facilitator pays the gas) and retries with the payment attached. No
  account, no API key.
- Before signing, cross-check the \`payTo\` against the
  \`x-executor.walletAddress\` in
  https://ynt.codes/.well-known/agent-card.json — an x402 payment is final.

## Credential use

No credential is issued or accepted on the public API (no API keys, no
tokens, no client registration). \`/.well-known/oauth-protected-resource\`
exists with \`authorization_servers\` **empty** — which is the truth: no
issuer emits tokens for this resource. What this domain does **not** publish
is \`/.well-known/openid-configuration\` or \`oauth-authorization-server\`:
that would declare
an issuer that does not exist, and it would be lying to whoever reads it.

The session portals (\`/empresa\`, \`/colaborador\`, \`/admin\`) are for
people, use Supabase Auth, and are **not agent surface** — robots.txt
excludes them.

## Getting started

One GET answers what this is, what is free and how to verify the output
without trusting us: GET ${base}/api/batch/quickstart
`;
}

// ── El skill y su índice (/.well-known/agent-skills/…) ─────────────────────

export const SKILL_NOMBRE = "nomicheck-payroll";

export function construirSkillMd(): string {
  const base = origenPublico();
  const precio = PRECIOS_USD["/verificar"];
  return `---
name: ${SKILL_NOMBRE}
description: Verify Colombian payslips, compute withholding, settle payroll and final settlements through NomiCheck's public API — free precheck, pay-per-call (x402) full report, every response signed and verifiable offline.
---

# NomiCheck payroll skill

Use this skill when the task involves **Colombian payroll**: verifying a
payslip, computing withholding (retención en la fuente), settling a payroll
period or a terminated contract, or resolving dated legal parameters (minimum
wage, transport allowance, UVT) for any date since 2020.

Do NOT use it for other countries' payroll, or as legal/accounting advice.

## How to call

1. \`GET ${base}/api/batch/quickstart\` — one call answers what exists, what
   is free, what the paid report costs and how to verify any output.
2. Free, no signup: \`POST ${base}/api/batch/verificar/prechequeo\` with your
   payslips (schema: \`${base}/api/batch/verificar/schema/v1.json\`). It
   returns how many have discrepancies and their net effect — if your payslip
   is clean you find out for free and never pay.
3. Paid full report (${precio} USD per batch, flat): \`POST
   ${base}/api/batch/verificar\`. Without payment it answers \`402\` with the
   exact requirements (network, token, amount, \`payTo\`, EIP-712 domain).
   Sign an EIP-3009 USDC authorization and retry with the payment attached —
   no account, no API key. Before signing, cross-check \`payTo\` against
   \`x-executor.walletAddress\` in https://ynt.codes/.well-known/agent-card.json.
4. Verify ANY response offline: each one travels inside a signed envelope
   (Ed25519, public key at \`${base}/api/batch/publickey\`). One-click:
   https://ynt.codes/verificar?url=${base}/api/batch/verificar/ejemplo

## Guarantees worth knowing

- Deterministic engine: same input, same output — no AI in the calculation.
- Every line cites the legal norm that governs it; every response carries the
  sha256 of the dated rule catalog that produced it.
- Flat pricing, never by finding: charging per discrepancy is the incentive a
  verifier must not have.
- Nothing you POST is persisted (Colombian habeas data law 1581/2012).
`;
}

/** El digest se calcula sobre los MISMOS bytes que sirve la ruta del skill:
 * una sola fuente, así que no puede quedar viejo. */
export function construirIndiceSkills(): Record<string, unknown> {
  const base = origenPublico();
  const digest = createHash("sha256").update(construirSkillMd(), "utf8").digest("hex");
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: SKILL_NOMBRE,
        type: "skill-md",
        description:
          "Verify Colombian payslips and settle payroll through NomiCheck's public API: " +
          "free precheck, pay-per-call (x402) full report, signed verifiable output.",
        url: `${base}/.well-known/agent-skills/${SKILL_NOMBRE}/SKILL.md`,
        digest: `sha256:${digest}`,
      },
    ],
  };
}
