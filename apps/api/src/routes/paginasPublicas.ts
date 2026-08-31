// Las rutas públicas que NO son API ni assets: la portada negociada, las
// páginas de confianza, el sitemap y el 404 real.
//
// El orden de montaje en index.ts es el contrato de este archivo:
//
//   1. este router          — rutas con dueño (/, /about, /sitemap.xml, …)
//   2. express.static       — assets del build (con index:false — `/` es de acá)
//   3. crearFallback        — el catch-all: shell del SPA SOLO para las rutas
//                             del cliente, 404 de verdad para todo lo demás
//
// Antes el catch-all servía el shell con 200 a CUALQUIER ruta: un agente que
// sondeaba `/sitemap.xml` o `/ruta-inventada` recibía la página de React y
// concluía que todo existe. Un 200 que miente es peor que un 404 — es el mismo
// bug que ya se arregló para /llms.txt, cerrado ahora para el resto del árbol.
import { Router, type Request, type RequestHandler, type Response } from "express";
import { negociarFormato } from "../lib/negociarFormato.js";
import {
  SKILL_NOMBRE,
  construirAgentCardA2a,
  construirApiCatalog,
  construirArd,
  construirAuthMd,
  construirIndiceSkills,
  construirPrm,
  construirServerCardMcp,
  construirSkillMd,
  enlacesDescubrimiento,
} from "../services/descubrimientoService.js";
import {
  construirAboutHtml,
  construirAboutMd,
  construirContactHtml,
  construirContactMd,
  construirHomeMd,
  construirLanzamientoMd,
  construirNoEncontradoHtml,
  construirNoEncontradoMd,
  construirPricingHtml,
  construirPricingMd,
  construirPrivacyHtml,
  construirPrivacyMd,
  construirServiciosMd,
  construirSitemapXml,
} from "../services/paginasAgentesService.js";

/** Las rutas que resuelve el router del CLIENTE (apps/web/src/main.tsx decide
 * por prefijo de pathname). Solo estas reciben el shell del SPA; agregarle un
 * portal a la web exige agregarlo acá, y la prueba del lado web lo vigila. */
export function esRutaSpa(pathname: string): boolean {
  return /^\/(lanzamiento|servicios|login|empresa|colaborador|admin)(\/|$)/.test(pathname);
}

/** El shell para las rutas del cliente: el mismo index.html SIN el bloque
 * prerenderizado de la portada. El bloque existe para que un crawler sin
 * JavaScript vea la portada real en `/`; en /login o /empresa ese contenido
 * sería el de OTRA página parpadeando antes de que cargue React. */
export function sinPrerender(html: string): string {
  return html.replace(/[ \t]*<!-- prerender:inicio -->[\s\S]*?<!-- prerender:fin -->\n?/, "");
}

/** Negocia HTML/markdown, siempre con `Vary: Accept` — también en la variante
 * HTML y en el 406: un CDN que cachee sin esa marca le sirve la página al
 * agente o el markdown al navegador, según quién llegó primero. */
function responderNegociado(
  req: Request,
  res: Response,
  opts: { html: string | null; md: string; status?: number; cacheSegundos?: number },
): void {
  res.vary("Accept");
  if (opts.cacheSegundos !== undefined) {
    res.setHeader("Cache-Control", `public, max-age=${opts.cacheSegundos}`);
  }
  const formato = negociarFormato(req.headers.accept);
  if (formato === null) {
    res.status(406).json({
      error: "not_acceptable",
      mensaje: "This route is served as text/html or text/markdown.",
      soportados: ["text/html", "text/markdown"],
    });
    return;
  }
  if (formato === "markdown" || opts.html === null) {
    res.status(opts.status ?? 200).type("text/markdown; charset=utf-8").send(opts.md);
    return;
  }
  res.status(opts.status ?? 200).type("text/html; charset=utf-8").send(opts.html);
}

/**
 * @param indexHtml el index.html del build de la web, ya leído — o null si no
 *   hay build (modo solo-API): las páginas generadas siguen sirviendo, y la
 *   portada responde su variante markdown, que es mejor que el 404 de antes.
 */
export function crearPaginasPublicas(indexHtml: string | null): Router {
  const router = Router();

  router.get("/", (req, res) => {
    // Link (RFC 8288) en las DOS variantes: el header es la miga que un agente
    // sigue sin parsear el cuerpo, y el markdown también la merece.
    res.setHeader("Link", enlacesDescubrimiento());
    responderNegociado(req, res, { html: indexHtml, md: construirHomeMd(), cacheSegundos: 0 });
  });

  // ── Descubrimiento para agentes ──────────────────────────────────────────
  // Lo que NO está acá también es decisión: sin `/.well-known/openid-
  // configuration` ni `oauth-authorization-server` (declararían un issuer que
  // no existe) — el porqué vive en descubrimientoService.ts, y auth.md lo dice
  // servido. `oauth-protected-resource` sí está, con la lista de issuers
  // VACÍA, que es la verdad completa.
  router.get("/.well-known/api-catalog", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/linkset+json").send(JSON.stringify(construirApiCatalog(), null, 2));
  });

  router.get("/.well-known/ai-catalog.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/json").send(JSON.stringify(construirArd(), null, 2));
  });

  router.get("/.well-known/mcp/server-card.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/json").send(JSON.stringify(construirServerCardMcp(), null, 2));
  });

  router.get("/.well-known/agent-card.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/json").send(JSON.stringify(construirAgentCardA2a(), null, 2));
  });

  router.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/json").send(JSON.stringify(construirPrm(), null, 2));
  });

  router.get("/.well-known/agent-skills/index.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/json").send(JSON.stringify(construirIndiceSkills(), null, 2));
  });

  router.get(`/.well-known/agent-skills/${SKILL_NOMBRE}/SKILL.md`, (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("text/markdown; charset=utf-8").send(construirSkillMd());
  });

  router.get("/auth.md", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("text/markdown; charset=utf-8").send(construirAuthMd());
  });

  router.get("/sitemap.xml", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/xml; charset=utf-8").send(construirSitemapXml());
  });

  const paginas: Array<[string, () => string, () => string]> = [
    ["/about", construirAboutHtml, construirAboutMd],
    ["/contact", construirContactHtml, construirContactMd],
    ["/privacy", construirPrivacyHtml, construirPrivacyMd],
    ["/pricing", construirPricingHtml, construirPricingMd],
  ];
  for (const [ruta, html, md] of paginas) {
    router.get(ruta, (req, res) => {
      responderNegociado(req, res, { html: html(), md: md(), cacheSegundos: 3600 });
    });
  }

  // Alias en español → la ruta canónica. Redirect y no contenido duplicado:
  // dos URLs con la misma página son dos entradas de índice compitiendo.
  const alias: Array<[string, string]> = [
    ["/acerca", "/about"],
    ["/contacto", "/contact"],
    ["/privacidad", "/privacy"],
    ["/precios", "/pricing"],
  ];
  for (const [de, a] of alias) {
    router.get(de, (_req, res) => res.redirect(308, a));
  }

  // El OpenAPI en la ruta que un cliente prueba primero. Redirect al canónico
  // en vez de servirlo dos veces: un documento, una URL que citar.
  router.get("/openapi.json", (_req, res) => res.redirect(308, "/api/batch/openapi.json"));

  // Las rutas SPA públicas: el navegador sigue recibiendo el shell, y el
  // agente que pide markdown recibe la página servida. Sub-rutas
  // (/lanzamiento/campana) siguen cayendo al fallback → shell, como siempre.
  const shellSpa = indexHtml === null ? null : sinPrerender(indexHtml);
  for (const [ruta, md] of PAGINAS_SPA_PUBLICAS) {
    router.get(ruta, crearPaginaSpa(shellSpa, md));
  }

  return router;
}

/** Las rutas del SPA que además son PÚBLICAS (están en `rutasIndexables`) y
 * por eso negocian markdown — eran las únicas indexables opacas sin
 * JavaScript (lo midió el evaluador de is-agentic, 2026-08-26). Los portales
 * (/login, /empresa, /colaborador, /admin) no negocian: no son para agentes,
 * y robots.txt ya los excluye. */
export const PAGINAS_SPA_PUBLICAS: Array<[string, () => string]> = [
  ["/servicios", construirServiciosMd],
  ["/lanzamiento", construirLanzamientoMd],
];

/** El handler de una ruta SPA pública: shell para el navegador, markdown para
 * quien lo pide con más ganas — misma negociación y mismo `Vary: Accept` que
 * la portada. Sin build de la web (`shellSpa === null`) responde el markdown,
 * que es mejor que un 404. */
export function crearPaginaSpa(shellSpa: string | null, md: () => string): RequestHandler {
  return (req, res) => {
    responderNegociado(req, res, { html: shellSpa, md: md(), cacheSegundos: 0 });
  };
}

/** El catch-all que reemplaza al viejo `sendFile(index.html)` incondicional.
 * @param shellSpa index.html sin el bloque prerender — o null sin build. */
export function crearFallback(shellSpa: string | null): RequestHandler {
  return (req, res) => {
    if (shellSpa !== null && esRutaSpa(req.path)) {
      res.type("text/html; charset=utf-8").send(shellSpa);
      return;
    }
    responderNegociado(req, res, {
      html: construirNoEncontradoHtml(req.path),
      md: construirNoEncontradoMd(req.path),
      status: 404,
    });
  };
}
