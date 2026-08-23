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
  construirAboutHtml,
  construirAboutMd,
  construirContactHtml,
  construirContactMd,
  construirHomeMd,
  construirNoEncontradoHtml,
  construirNoEncontradoMd,
  construirPrivacyHtml,
  construirPrivacyMd,
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
      mensaje: "Esta ruta se sirve como text/html o text/markdown.",
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
    responderNegociado(req, res, { html: indexHtml, md: construirHomeMd(), cacheSegundos: 0 });
  });

  router.get("/sitemap.xml", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/xml; charset=utf-8").send(construirSitemapXml());
  });

  const paginas: Array<[string, () => string, () => string]> = [
    ["/about", construirAboutHtml, construirAboutMd],
    ["/contact", construirContactHtml, construirContactMd],
    ["/privacy", construirPrivacyHtml, construirPrivacyMd],
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
  ];
  for (const [de, a] of alias) {
    router.get(de, (_req, res) => res.redirect(308, a));
  }

  // El OpenAPI en la ruta que un cliente prueba primero. Redirect al canónico
  // en vez de servirlo dos veces: un documento, una URL que citar.
  router.get("/openapi.json", (_req, res) => res.redirect(308, "/api/batch/openapi.json"));

  return router;
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
