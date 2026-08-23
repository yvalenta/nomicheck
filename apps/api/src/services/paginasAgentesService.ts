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
import { CONTACTO } from "../lib/contacto.js";
import { origenPublico } from "../lib/pagosConfig.js";
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
function envolverHtml(opts: {
  titulo: string;
  descripcion: string;
  ruta: string;
  cuerpo: string;
}): string {
  const base = origenPublico();
  return `<!doctype html>
<html lang="es">
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
      <nav><a href="/">NomiCheck</a><a href="/about">Sobre</a><a href="/contact">Contacto</a><a href="/privacy">Privacidad</a><a href="/docs/">API</a></nav>
${opts.cuerpo}
      <footer>NomiCheck · ${CONTACTO.nombre} · <a href="/sitemap.xml">sitemap</a> · <a href="/llms.txt">llms.txt</a> · <a href="/agents.md">agents.md</a></footer>
    </main>
  </body>
</html>
`;
}

// ── Portada en markdown (Accept: text/markdown sobre `/`) ─────────────────

export function construirHomeMd(): string {
  const base = origenPublico();
  return `# NomiCheck — ¿Te pagaron bien?

Motor determinístico de nómina y retención en la fuente de Colombia. Recalcula
lo que la ley manda pagar —salario, recargos, horas extra, prima, cesantías,
retención— y lo compara con lo que llegó. Cada línea cita su norma, cada
respuesta lleva el hash del catálogo legal que la produjo (verificado al
${REGLAS_VERIFICADAS_AL}) y va firmada con Ed25519: un tercero la comprueba
sin confiar en nosotros y sin volver a llamar a este servidor.

## Cuándo usar NomiCheck

- Verificar si un comprobante de pago colombiano está bien liquidado, línea
  por línea y con la norma que rige cada una.
- Calcular retención en la fuente por salarios (art. 383/388 del Estatuto
  Tributario, desde 2023).
- Liquidar una nómina completa o la liquidación final de un contrato
  terminado, con valores vigentes A LA FECHA del periodo.
- Resolver parámetros legales fechados (SMLMV, auxilio, UVT, recargos) a
  cualquier fecha desde 2020, firmados.
- Armar un lote de pago en USDC sobre Base sin custodia: el servidor nunca
  firma ni mueve fondos.

**No sirve para:** nómina de otros países, asesoría legal o dictamen contable
(Ley 43/1990), ni conceptos extralegales sin base normativa.

## Cómo llamar, si sos un agente

Un solo GET responde qué es, qué es gratis, cuánto cuesta lo pagado y cómo se
verifica la salida: ${base}/api/batch/quickstart

Lo pagado se paga por llamada con x402 (HTTP 402 + EIP-3009, USDC en Base o
Avalanche), sin cuenta ni API key: el 402 servido trae los requisitos exactos.
El pre-chequeo es gratis y sin registro — si tu comprobante está limpio, te
enterás gratis y no pagás nunca.

## Enlaces

- Guía para agentes: ${base}/agents.md · ${base}/llms.txt
- Documentación navegable: ${base}/docs/
- OpenAPI: ${base}/api/batch/openapi.json
- Servicios y precios: ${base}/servicios
- Sobre nosotros: ${base}/about · Contacto: ${base}/contact · Privacidad: ${base}/privacy
- Mapa del sitio: ${base}/sitemap.xml
- Identidad on-chain (ERC-8004) y agent card: https://ynt.codes/.well-known/agent-card.json
`;
}

// ── Las tres páginas de confianza ──────────────────────────────────────────
// Cada una en dos formas. El texto es el mismo contenido, no dos redacciones:
// el markdown se escribe una vez y el HTML lo envuelve párrafo a párrafo, para
// que no puedan contarse historias distintas.

export function construirAboutMd(): string {
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
    cuerpo: mdACuerpoHtml(construirAboutMd()),
  });
}

export function construirContactMd(): string {
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
    cuerpo: mdACuerpoHtml(construirContactMd()),
  });
}

export function construirPrivacyMd(): string {
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
    cuerpo: mdACuerpoHtml(construirPrivacyMd()),
  });
}

// ── El 404 de verdad ───────────────────────────────────────────────────────

export function construirNoEncontradoMd(ruta: string): string {
  const base = origenPublico();
  return `# 404 — esta ruta no existe

\`${ruta}\` no corresponde a ninguna página ni endpoint de este sitio.

Para orientarte:

- Mapa del sitio: ${base}/sitemap.xml
- Guía para agentes: ${base}/llms.txt y ${base}/agents.md
- Documentación de la API: ${base}/docs/ (OpenAPI: ${base}/api/batch/openapi.json)
- Portada: ${base}/
`;
}

export function construirNoEncontradoHtml(ruta: string): string {
  return envolverHtml({
    titulo: "404 — NomiCheck",
    descripcion: "Esta ruta no existe. El mapa del sitio y la guía para agentes indican qué sí.",
    ruta: "/404",
    cuerpo: mdACuerpoHtml(construirNoEncontradoMd(ruta)),
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
