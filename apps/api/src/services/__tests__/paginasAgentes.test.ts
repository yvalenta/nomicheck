import { describe, expect, it } from "vitest";
import { CONTACTO } from "../../lib/contacto.js";
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
  mdACuerpoHtml,
  rutasIndexables,
} from "../paginasAgentesService.js";

// Estas páginas existen para que un agente decida si confiar: la vara no es
// que respondan 200 sino que digan algo. Por eso el mínimo de caracteres es
// una afirmación de estas pruebas — una página de confianza de dos líneas es
// la señal de "sitio de relleno" que el crawler está entrenado a descartar.
const MINIMO_CONFIANZA = 500;

describe("las páginas de confianza", () => {
  const casos: Array<[string, () => string, () => string]> = [
    ["about", construirAboutMd, construirAboutHtml],
    ["contact", construirContactMd, construirContactHtml],
    ["privacy", construirPrivacyMd, construirPrivacyHtml],
  ];

  for (const [nombre, md, html] of casos) {
    it(`/${nombre} en markdown trae contenido de verdad (≥${MINIMO_CONFIANZA} caracteres)`, () => {
      expect(md().length).toBeGreaterThanOrEqual(MINIMO_CONFIANZA);
      expect(md()).toMatch(/^# /);
    });

    it(`/${nombre} en HTML es una página completa con canonical e idioma`, () => {
      const pagina = html();
      expect(pagina).toContain("<!doctype html>");
      expect(pagina).toContain('lang="es"');
      expect(pagina).toContain(`href="https://nomicheck.ynt.codes/${nombre}"`);
      expect(pagina).toContain("<h1>");
      // El markdown se convirtió: no puede quedar sintaxis cruda visible.
      expect(pagina).not.toMatch(/^## /m);
      expect(pagina).not.toContain("**");
    });
  }

  it("el contacto publica el correo de la fuente única, no una copia", () => {
    expect(construirContactMd()).toContain(CONTACTO.email);
    expect(construirContactHtml()).toContain(CONTACTO.email);
  });

  it("la privacidad nombra la ley que la obliga y adónde escribir", () => {
    const p = construirPrivacyMd();
    expect(p).toMatch(/1581/);
    expect(p).toContain(CONTACTO.email);
  });

  it("el about dice quién opera y desde dónde", () => {
    const a = construirAboutMd();
    expect(a).toContain(CONTACTO.nombre);
    expect(a).toContain(CONTACTO.ciudad);
  });
});

describe("la portada en markdown", () => {
  it("tiene H1, dice cuándo usarla y enlaza el resto de la superficie", () => {
    const home = construirHomeMd();
    expect(home).toMatch(/^# NomiCheck/);
    expect(home).toContain("## Cuándo usar NomiCheck");
    for (const enlace of ["/docs/", "/llms.txt", "/agents.md", "/api/batch/quickstart", "/sitemap.xml"]) {
      expect(home).toContain(enlace);
    }
    expect(home.length).toBeGreaterThanOrEqual(MINIMO_CONFIANZA);
  });

  it("también dice qué NO hace — leerse como más de lo que se es, no", () => {
    expect(construirHomeMd()).toContain("No sirve para");
  });
});

describe("el sitemap", () => {
  it("es XML del schema de sitemaps.org con TODAS las rutas indexables", () => {
    const xml = construirSitemapXml();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    for (const ruta of rutasIndexables()) {
      expect(xml).toContain(`<loc>https://nomicheck.ynt.codes${ruta}</loc>`);
    }
    // Una entrada por ruta: ni URLs de más ni duplicadas.
    expect(xml.match(/<url>/g)?.length).toBe(rutasIndexables().length);
  });

  it("cada entrada lleva lastmod con fecha ISO", () => {
    const fechas = construirSitemapXml().match(/<lastmod>(.*?)<\/lastmod>/g) ?? [];
    expect(fechas.length).toBe(rutasIndexables().length);
    for (const f of fechas) expect(f).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it("las rutas indexables no incluyen los portales con login", () => {
    // robots.txt los excluye; un sitemap que los liste diría lo contrario.
    for (const privada of ["/empresa", "/colaborador", "/login", "/admin"]) {
      expect(rutasIndexables()).not.toContain(privada);
    }
  });
});

describe("el 404", () => {
  it("nombra la ruta pedida y apunta al mapa, la guía y la portada", () => {
    const md = construirNoEncontradoMd("/no-existe");
    expect(md).toContain("`/no-existe`");
    for (const enlace of ["/sitemap.xml", "/llms.txt", "/agents.md", "/docs/"]) {
      expect(md).toContain(enlace);
    }
  });

  it("escapa la ruta en el HTML: viene del cliente y no debe ejecutar nada", () => {
    const html = construirNoEncontradoHtml('/<script>alert(1)</script>');
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("mdACuerpoHtml", () => {
  it("convierte lo que estas páginas usan: títulos, negritas, código, URLs", () => {
    const html = mdACuerpoHtml("# Título\n\nUn **fuerte** con `codigo` y https://ynt.codes ahí.");
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<strong>fuerte</strong>");
    expect(html).toContain("<code>codigo</code>");
    expect(html).toContain('<a href="https://ynt.codes">');
  });

  it("escapa HTML ANTES de convertir — el orden es la seguridad", () => {
    expect(mdACuerpoHtml("<img src=x onerror=alert(1)>")).not.toContain("<img");
  });

  it("una lista markdown sale como <ul> con sus <li>", () => {
    const html = mdACuerpoHtml("- uno\n- dos");
    expect(html).toContain("<ul>");
    expect(html.match(/<li>/g)?.length).toBe(2);
  });
});
