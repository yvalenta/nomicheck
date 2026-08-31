// Las páginas que existen para que nadie se pierda: la portada en markdown,
// las tres de confianza (/about, /contact, /privacy), el sitemap y el 404.
//
// ── Por qué viven en el backend y no en la SPA ─────────────────────────────
//
// La SPA responde 200 con el mismo shell a CUALQUIER ruta, y eso tiene dos
// costos medidos: un crawler sin JavaScript ve ~33 caracteres de texto en la
// portada, y un agente que sondea rutas concluye que todas existen (soft-404).
// Estas páginas se sirven del servidor, con su status real, en HTML para un
// navegador y en markdown para un agente (Accept: text/markdown + Vary:
// Accept, convención acceptmarkdown.com).
//
// Se generan del código —el contacto sale de lib/contacto.ts, las URLs de
// origenPublico()— para que no puedan desincronizarse de lo que sirven.
//
// ── Los dos idiomas, y por qué (2026-08-31, pedido de Yonatan) ─────────────
//
// La superficie que lee una MÁQUINA va en inglés: la audiencia medida son
// indexadores y agentes que operan en inglés (nomicheck_ops/estado/mercado).
// La web para HUMANOS sigue en español: el producto es colombiano.
//
// Eso parte las páginas en dos clases:
//
//   - Solo-agente (portada/servicios/lanzamiento en markdown, el 404, y
//     /pricing —nació para el lector sin JavaScript, que es un agente—):
//     UNA redacción, en inglés.
//   - Doble audiencia (/about, /contact, /privacy): el HTML humano en
//     español y el markdown de agente en inglés — DOS redacciones, que es
//     exactamente lo que la versión anterior evitaba. El costo está pagado
//     con guarda: textos en idiomas distintos no se pueden diffear, así que
//     la prueba compara los HECHOS de ambas (URLs, correos, leyes citadas),
//     igual que la spec bilingüe del sobre compara cifras contra vectores.
//     Los builders `…MdEs` se exportan para esa prueba.
import { CONTACTO } from "../lib/contacto.js";
import { origenPublico } from "../lib/pagosConfig.js";
import { construirPricing } from "./pricingService.js";
import { REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";

// El día del arranque del proceso, que en producción es el día del deploy: el
// contenedor se construye y arranca en cada despliegue, así que "esto pudo
// cambiar en esta fecha" es la afirmación honesta para <lastmod>. No se
// escribe una fecha a mano porque envejecería sola.
const FECHA_ARRANQUE = new Date().toISOString().slice(0, 10);

/** Las rutas que un índice externo puede visitar. UNA lista: el sitemap la
 * publica, las pruebas la recorren, y el 404 apunta a ella. */
export function rutasIndexables(): string[] {
  return [
    "/",
    "/lanzamiento",
    "/servicios",
    "/pricing",
    "/about",
    "/contact",
    "/privacy",
    "/docs/",
    "/agents.md",
    "/llms.txt",
    "/auth.md",
  ];
}

export function construirSitemapXml(): string {
  const base = origenPublico();
  const urls = rutasIndexables()
    .map(
      (ruta) =>
        `  <url>\n    <loc>${base}${ruta}</loc>\n    <lastmod>${FECHA_ARRANQUE}</lastmod>\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// ── El sobre HTML compartido ───────────────────────────────────────────────
// Autocontenido a propósito: nada de CSS del bundle, nada de JavaScript.
// Los colores son los de la marca (midnight/indigo de apps/web/src/index.css)
// para que un humano que caiga acá no sienta que salió del sitio.
// `lang` decide el idioma del documento y de la navegación: las páginas de
// confianza son humanas (es) y las de máquina (pricing, 404) van en inglés.
function envolverHtml(opts: {
  titulo: string;
  descripcion: string;
  ruta: string;
  cuerpo: string;
  lang?: "es" | "en";
}): string {
  const base = origenPublico();
  const lang = opts.lang ?? "es";
  const nav =
    lang === "es"
      ? '<nav><a href="/">NomiCheck</a><a href="/about">Sobre</a><a href="/contact">Contacto</a><a href="/privacy">Privacidad</a><a href="/docs/">API</a></nav>'
      : '<nav><a href="/">NomiCheck</a><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/docs/">API</a></nav>';
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b1120" />
    <title>${opts.titulo}</title>
    <meta name="description" content="${opts.descripcion}" />
    <link rel="canonical" href="${base}${opts.ruta}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>
      body { margin: 0; background: #0b1120; color: #e2e8f0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.65; }
      main { max-width: 44rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
      h1 { font-size: 1.8rem; letter-spacing: -0.02em; }
      h2 { font-size: 1.15rem; margin-top: 2rem; }
      a { color: #a5b4fc; }
      nav a { margin-right: 1rem; }
      nav { margin-bottom: 2.5rem; font-size: 0.9rem; }
      footer { margin-top: 3rem; font-size: 0.8rem; color: #94a3b8; }
    </style>
  </head>
  <body>
    <main>
      ${nav}
${opts.cuerpo}
      <footer>NomiCheck · ${CONTACTO.nombre} · <a href="/sitemap.xml">sitemap</a> · <a href="/llms.txt">llms.txt</a> · <a href="/agents.md">agents.md</a></footer>
    </main>
  </body>
</html>
`;
}

// ── Portada en markdown (Accept: text/markdown sobre `/`) ─────────────────
// Solo la ve quien pide markdown — un agente. El navegador recibe el shell
// del SPA (español). Por eso va en inglés, sin gemela.

export function construirHomeMd(): string {
  const base = origenPublico();
  return `# NomiCheck — were you paid correctly?

Deterministic engine for Colombian payroll and withholding tax. It recomputes
what the law mandates — salary, surcharges, overtime, prima, severance,
withholding — and compares it against what was actually paid. Every line
cites its norm, every response carries the hash of the legal catalog that
produced it (verified as of ${REGLAS_VERIFICADAS_AL}) and ships Ed25519-signed:
a third party checks it without trusting us and without calling this server
again.

## When to use NomiCheck

- Verify whether a Colombian payslip is correctly settled, line by line and
  with the norm that governs each one.
- Compute withholding tax on salaries (art. 383/388 of the Estatuto
  Tributario, from 2023 on).
- Settle a full payroll period or the final settlement of a terminated
  contract, with the values in force ON THE PERIOD'S DATE.
- Resolve dated legal parameters (minimum wage, transport allowance, UVT,
  surcharges) for any date since 2020, signed.
- Build a non-custodial USDC payout batch on Base: the server never signs
  or moves funds.

**Not for:** other countries' payroll, legal advice or accounting opinions
(Colombian Law 43/1990), or extralegal concepts with no statutory basis.

## How to call, if you are an agent

One GET answers what this is, what is free, what the paid report costs and
how to verify the output: GET ${base}/api/batch/quickstart

Paid routes are paid per call with x402 (HTTP 402 + EIP-3009, USDC on Base
or Avalanche), no account and no API key: the served 402 carries the exact
requirements. The pre-check is free and needs no sign-up — if your payslip
is clean, you find out for free and never pay.

## Links

- Agent guide: ${base}/agents.md · ${base}/llms.txt
- Browsable docs: ${base}/docs/
- OpenAPI: ${base}/api/batch/openapi.json
- Services: ${base}/servicios · Pricing, with the why of every price: ${base}/pricing
- About: ${base}/about · Contact: ${base}/contact · Privacy: ${base}/privacy
- Sitemap: ${base}/sitemap.xml
- On-chain identity (ERC-8004) and agent card: https://ynt.codes/.well-known/agent-card.json
`;
}

// ── Las tres páginas de confianza ──────────────────────────────────────────
// Doble audiencia, dos redacciones: `…Md` (inglés) para el agente que negocia
// markdown, `…MdEs` (español) como fuente del HTML humano. La prueba de
// paridad compara los hechos de ambas — ver el comentario de cabecera.

export function construirAboutMd(): string {
  const base = origenPublico();
  return `# About NomiCheck

NomiCheck is a deterministic Colombian payroll engine built on one thesis:
**compute is a commodity; proof is not.** What is sold is not the number —
it is that a third party can check it without trusting the issuer.

The engine uses no AI to calculate: same input, same output, always. Under
it sits a dated catalog of legal rules — minimum wage, transport allowance,
UVT, surcharges, withholding caps — where every value carries the norm that
set it and the window in which it applied, verified as of
${REGLAS_VERIFICADAS_AL}. Every response travels inside an Ed25519-signed
envelope that includes the sha256 of that catalog, so anyone can verify the
result offline with the published public key: the envelope format is free
and in the public domain (https://github.com/yvalenta/sobre).

It is operated by ${CONTACTO.nombre} (${CONTACTO.url}) from
${CONTACTO.ciudad}, Colombia. The service also has an on-chain agent
identity (ERC-8004 on Base) with an A2A agent card at
https://ynt.codes/.well-known/agent-card.json, and the API takes per-call
payments via x402 — built to be used by people and by software agents alike.

- For people: free verification at ${base}/
- For companies: ${base}/servicios
- For agents: ${base}/agents.md
`;
}

/** La redacción humana (es) — la fuente del HTML. Exportada para la prueba
 * de paridad de hechos contra la inglesa. */
export function construirAboutMdEs(): string {
  const base = origenPublico();
  return `# Sobre NomiCheck

NomiCheck es un motor determinístico de nómina colombiana construido sobre una
tesis: **el cálculo es commodity, la prueba no.** Lo que se vende no es el
número — es que un tercero pueda comprobarlo sin confiar en quien lo emitió.

El motor no usa IA para calcular: mismo input, mismo output, siempre. Debajo
hay un catálogo de reglas legales fechado —salario mínimo, auxilio de
transporte, UVT, recargos, topes de retención— donde cada valor lleva la norma
que lo fijó y la ventana en que rigió, verificado al ${REGLAS_VERIFICADAS_AL}.
Cada respuesta viaja dentro de un sobre firmado con Ed25519 que incluye el
hash sha256 de ese catálogo, así que cualquiera puede verificar el resultado
offline con la llave pública publicada: el formato del sobre es libre y de
dominio público (https://github.com/yvalenta/sobre).

Lo opera ${CONTACTO.nombre} (${CONTACTO.url}) desde ${CONTACTO.ciudad},
Colombia. El servicio tiene además identidad de agente on-chain (ERC-8004 en
Base) con agent card A2A en https://ynt.codes/.well-known/agent-card.json, y
la API acepta pagos por llamada vía x402 — pensada para que la usen tanto
personas como agentes de software.

- Para personas: verificación gratuita en ${base}/
- Para empresas: ${base}/servicios
- Para agentes: ${base}/agents.md
`;
}

export function construirAboutHtml(): string {
  return envolverHtml({
    titulo: "Sobre NomiCheck — quiénes somos y cómo funciona",
    descripcion:
      "NomiCheck: motor determinístico de nómina colombiana con catálogo legal fechado y salida firmada Ed25519, operado por Ynt-labs desde Medellín.",
    ruta: "/about",
    cuerpo: mdACuerpoHtml(construirAboutMdEs()),
  });
}

export function construirContactMd(): string {
  const base = origenPublico();
  return `# Contact

The most direct way to reach us is email: **${CONTACTO.email}**.
We answer in English or Spanish.

If you are reporting an API error, include the \`id\` that came in the
response (500 errors carry one): it points at the exact server log line
without you having to tell us anything else. Request bodies never reach the
logs, so the id is the only way to find it.

If you found a security issue, write to the same address with the subject
"seguridad" — we would rather hear it from you than from a third party, and
there is no retaliation for good-faith reports.

Other channels:

- Public code and issue reports: ${CONTACTO.github}
- The operator's identity: ${CONTACTO.url}
- The agent's on-chain identity (ERC-8004) and its agent card:
  https://ynt.codes/.well-known/agent-card.json

${CONTACTO.nombre} operates from ${CONTACTO.ciudad}, ${CONTACTO.region}
(Colombia). There is no walk-in office: the service is the API and this
website (${base}).
`;
}

/** La redacción humana (es) — la fuente del HTML. */
export function construirContactMdEs(): string {
  const base = origenPublico();
  return `# Contacto

La forma más directa de escribirnos es el correo: **${CONTACTO.email}**.
Respondemos en español o inglés.

Si reportás un error de la API, incluí el \`id\` que vino en la respuesta
(los errores 500 traen uno): apunta a la línea exacta del registro del
servidor sin que tengas que contarnos nada más. Los cuerpos de las peticiones
nunca quedan en los logs, así que el id es lo único que lo encuentra.

Si encontraste un problema de seguridad, escribí al mismo correo con el
asunto "seguridad" — preferimos enterarnos por vos que por un tercero, y no
hay represalias por reportar de buena fe.

Otros canales:

- El código público y los reportes de issues: ${CONTACTO.github}
- La identidad del operador: ${CONTACTO.url}
- La identidad on-chain del agente (ERC-8004) y su agent card:
  https://ynt.codes/.well-known/agent-card.json

${CONTACTO.nombre} opera desde ${CONTACTO.ciudad}, ${CONTACTO.region}
(Colombia). No hay oficina de atención al público: el servicio es la API y
esta web (${base}).
`;
}

export function construirContactHtml(): string {
  return envolverHtml({
    titulo: "Contacto — NomiCheck",
    descripcion: `Cómo escribirle al equipo de NomiCheck: correo ${CONTACTO.email}, reportes de errores y de seguridad, y los canales públicos.`,
    ruta: "/contact",
    cuerpo: mdACuerpoHtml(construirContactMdEs()),
  });
}

export function construirPrivacyMd(): string {
  return `# Privacy

The house rule is to not store what is not needed — and to be able to prove
it.

**The anonymous verifier asks for no account and keeps no result.** Tell it
your salary and your schedule, it does the math, and only you see the
outcome: the calculation is not persisted to any database unless you create
an account and choose to save it.

**The batch API does not persist the data it processes.** JSON comes in, is
processed in memory and discarded (Colombian Law 1581 of 2012, habeas data):
no queryable history exists afterwards, and every signed envelope declares
it in its habeas data notice. Server logs keep method, route, status code
and duration — **never** the body, the query string or the headers, which is
where the payroll would live.

**No third-party analytics.** This site loads no trackers or ad pixels;
there are no behavioral analytics scripts.

**What does exist, said plainly:** the portal accounts (company and
employee) authenticate with Supabase Auth, which stores the email and the
session; traffic goes through Cloudflare like any CDN; and server errors are
logged with a random id so they can be debugged — with no personal data
inside.

To exercise your habeas data rights (access, update, correct or delete your
account data), write to **${CONTACTO.email}**.
`;
}

/** La redacción humana (es) — la fuente del HTML. */
export function construirPrivacyMdEs(): string {
  return `# Privacidad

La regla de la casa es no guardar lo que no hace falta, y poder probarlo.

**El verificador anónimo no pide cuenta ni guarda tu resultado.** Dinos tu
salario y tus horarios, hacemos las cuentas y el resultado lo ves solo vos: el
cálculo no se persiste en ninguna base salvo que crees una cuenta y elijas
guardarlo.

**La API batch no persiste los datos que procesa.** Entra JSON, se calcula en
memoria y se descarta (Ley 1581 de 2012, habeas data): no existe un historial
consultable después, y cada sobre firmado lo declara en su constancia. Los
registros del servidor guardan método, ruta, código de estado y duración —
**nunca** el cuerpo, el query string ni los encabezados, que es donde viviría
la nómina.

**Sin analítica de terceros.** Esta web no carga rastreadores ni píxeles de
publicidad; no hay scripts de análisis de comportamiento.

**Lo que sí existe, dicho de frente:** las cuentas de los portales (empresa y
colaborador) se autentican con Supabase Auth, que guarda el correo y la sesión;
el tráfico pasa por Cloudflare como cualquier CDN; y los errores del servidor
quedan registrados con un id aleatorio para poder depurarlos — sin datos
personales adentro.

Para ejercer tus derechos de habeas data (conocer, actualizar, rectificar o
suprimir tus datos de cuenta), escribí a **${CONTACTO.email}**.
`;
}

export function construirPrivacyHtml(): string {
  return envolverHtml({
    titulo: "Privacidad — NomiCheck",
    descripcion:
      "Qué guarda NomiCheck y qué no: cálculo sin persistencia (habeas data, Ley 1581 de 2012), logs sin cuerpos, sin rastreadores de terceros.",
    ruta: "/privacy",
    cuerpo: mdACuerpoHtml(construirPrivacyMdEs()),
  });
}

// ── Precios (/pricing), en dos formas ──────────────────────────────────────
// Un RENDERIZADOR de construirPricing(), no una segunda redacción: cada
// número y cada porqué es el mismo objeto que sirve /api/batch/pricing, que
// a su vez sale de PRECIOS_USD — la constante con la que el muro cobra. El
// evaluador de is-agentic (2026-08-26) recorrió el sitio sin JavaScript y la
// matriz de precios le quedó opaca: existía para un cliente de API y no para
// un lector. Esta página es esa lectura — y ese lector es un agente, por eso
// va entera en inglés, HTML incluido.

export function construirPricingMd(): string {
  const p = construirPricing();
  const gratis = p.free
    .map((g) => `- \`${g.route}\` — **free** — ${g.why}`)
    .join("\n");
  const pagado = p.paid
    .map(
      (r) =>
        `- \`${r.route}\` (${r.method}) — **${r.priceUsd} ${p.currency}** per call — ${r.why}`,
    )
    .join("\n");
  return `# NomiCheck pricing

Every price with its why. This page is generated from the same constant the
paywall charges with: it cannot state one price and charge another. The
machine version is ${p.canonical} (JSON, \`${p.pricingVersion}\`).

**The rule that orders the whole table:** ${p.incentiveRule}

**Validation is never charged:** ${p.validationIsFree}

## How payment works

${p.howToPay} Currency: ${p.currency}. Networks: ${p.networks.join(" and ")}.

## What is free, and why

${gratis}

## What is paid, and why it costs what it costs

${pagado}
`;
}

export function construirPricingHtml(): string {
  return envolverHtml({
    titulo: "Pricing — NomiCheck",
    descripcion:
      "What every NomiCheck call costs and why: USDC prices via x402, generated from the same constant the paywall charges with.",
    ruta: "/pricing",
    cuerpo: mdACuerpoHtml(construirPricingMd()),
    lang: "en",
  });
}

// ── Las dos rutas SPA públicas, en markdown ────────────────────────────────
// /servicios y /lanzamiento son páginas React: el navegador recibe el shell y
// el contenido aparece con JavaScript. Para un agente eso es una página en
// blanco — las únicas indexables opacas del sitio (lo midió el evaluador de
// is-agentic, 2026-08-26). Estas variantes dicen lo que cada página comunica;
// los NÚMEROS no viven acá — se enlazan a sus fuentes derivadas, que es donde
// no pueden mentir. Solo las ve quien negocia markdown (un agente): inglés.

export function construirServiciosMd(): string {
  const base = origenPublico();
  return `# NomiCheck services

The same deterministic Colombian payroll engine, and the three ways to use
it:

- **For a person** — the free settlement calculator (interactive, on this
  page with a browser) and the payslip verifier on the home page (${base}/):
  no sign-up, and the result is not persisted.
- **For a company** — the payroll portal at ${base}/empresa (sign-up with
  NIT): full settlement, withholding tax and signed evidence of every close.
- **For a software agent** — the API with per-call payments via x402. Start
  with GET ${base}/api/batch/quickstart: one GET says what this is, what is
  free, what the paid report costs and how to verify the output.

The page shows a strip of live data (operations, legal parameters, catalog
verification date, public key) read from the server on load. You can read
the same sources directly:

- Pricing, with the why of every price: ${base}/pricing (JSON: ${base}/api/batch/pricing)
- Full catalog (OpenAPI): ${base}/api/batch/openapi.json · browsable: ${base}/docs/
- Legal parameters in force, signed: ${base}/api/batch/parametros
- The key that verifies everything: ${base}/api/batch/publickey
- Verify an example output without trusting us:
  https://ynt.codes/verificar?url=${base}/api/batch/verificar/ejemplo
`;
}

export function construirLanzamientoMd(): string {
  const base = origenPublico();
  return `# NomiCheck — were you paid correctly?

Landing page for the free verification of Colombian payslips. What it
promises, in three pillars:

- **Free and no sign-up** — upload your payslip or describe your schedule
  and see the result in minutes; no email, no card, no name.
- **Every figure cites the law** — every peso carries the article of the CST
  or the decree behind it, and the legal catalog is dated by validity
  window: a July period is settled with the norms that governed in July.
- **The same engine companies use** — the same deterministic, versioned
  calculation small businesses settle their full payroll with.

The interactive verification runs at ${base}/ (requires a browser). If you
are an agent, your door is the API: GET ${base}/api/batch/quickstart — the
pre-check is free and, if the payslip is clean, you find out for free and
never pay.

More: pricing at ${base}/pricing · agent guide at ${base}/agents.md ·
privacy at ${base}/privacy (the calculation is not persisted).
`;
}

// ── El 404 de verdad ───────────────────────────────────────────────────────
// Quien sondea rutas es una máquina; el humano perdido también entiende un
// mapa corto. Inglés, HTML incluido.

export function construirNoEncontradoMd(ruta: string): string {
  const base = origenPublico();
  return `# 404 — this route does not exist

\`${ruta}\` does not correspond to any page or endpoint of this site.

To find your way:

- Sitemap: ${base}/sitemap.xml
- Agent guide: ${base}/llms.txt and ${base}/agents.md
- API documentation: ${base}/docs/ (OpenAPI: ${base}/api/batch/openapi.json)
- Home: ${base}/
`;
}

export function construirNoEncontradoHtml(ruta: string): string {
  return envolverHtml({
    titulo: "404 — NomiCheck",
    descripcion: "This route does not exist. The sitemap and the agent guide say what does.",
    ruta: "/404",
    cuerpo: mdACuerpoHtml(construirNoEncontradoMd(ruta)),
    lang: "en",
  });
}

// ── markdown → HTML, lo mínimo ─────────────────────────────────────────────
// Convierte SOLO lo que estas páginas usan: títulos, párrafos, listas,
// negritas, código inline y URLs sueltas. Una librería de markdown completa
// sería una dependencia con superficie de ataque para seis páginas estáticas
// cuyo contenido escribimos nosotros. Escapa el HTML primero: el contenido es
// nuestro hoy, pero `ruta` en el 404 viene del cliente.
export function mdACuerpoHtml(md: string): string {
  const escapar = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const enLinea = (s: string) =>
    s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2">$2</a>');

  const bloques = md.trim().split(/\n{2,}/);
  return bloques
    .map((bloque) => {
      const b = escapar(bloque.trim());
      if (b.startsWith("# ")) return `      <h1>${enLinea(b.slice(2))}</h1>`;
      if (b.startsWith("## ")) return `      <h2>${enLinea(b.slice(3))}</h2>`;
      if (/^- /m.test(b)) {
        const items = b
          .split(/\n(?=- )/)
          .map((i) => `        <li>${enLinea(i.replace(/^- /, "").replace(/\n\s+/g, " "))}</li>`)
          .join("\n");
        return `      <ul>\n${items}\n      </ul>`;
      }
      return `      <p>${enLinea(b.replace(/\n/g, " "))}</p>`;
    })
    .join("\n");
}
