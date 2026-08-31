import { describe, expect, it } from "vitest";
import { CONTACTO } from "../../lib/contacto.js";
import { PRECIOS_USD, RUTAS_CON_MURO } from "../../lib/x402Config.js";
import {
  construirAboutHtml,
  construirAboutMd,
  construirAboutMdEs,
  construirContactHtml,
  construirContactMd,
  construirContactMdEs,
  construirHomeMd,
  construirLanzamientoMd,
  construirNoEncontradoHtml,
  construirNoEncontradoMd,
  construirPricingHtml,
  construirPricingMd,
  construirPrivacyHtml,
  construirPrivacyMd,
  construirPrivacyMdEs,
  construirServiciosMd,
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
  // El idioma se asevera por página: las tres de confianza son humanas (es)
  // y /pricing existe para el lector sin JavaScript, que es un agente (en).
  const casos: Array<[string, () => string, () => string, "es" | "en"]> = [
    ["about", construirAboutMd, construirAboutHtml, "es"],
    ["contact", construirContactMd, construirContactHtml, "es"],
    ["privacy", construirPrivacyMd, construirPrivacyHtml, "es"],
    ["pricing", construirPricingMd, construirPricingHtml, "en"],
  ];

  for (const [nombre, md, html, lang] of casos) {
    it(`/${nombre} en markdown trae contenido de verdad (≥${MINIMO_CONFIANZA} caracteres)`, () => {
      expect(md().length).toBeGreaterThanOrEqual(MINIMO_CONFIANZA);
      expect(md()).toMatch(/^# /);
    });

    it(`/${nombre} en HTML es una página completa con canonical e idioma`, () => {
      const pagina = html();
      expect(pagina).toContain("<!doctype html>");
      expect(pagina).toContain(`lang="${lang}"`);
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
    expect(home).toContain("## When to use NomiCheck");
    for (const enlace of ["/docs/", "/llms.txt", "/agents.md", "/api/batch/quickstart", "/sitemap.xml"]) {
      expect(home).toContain(enlace);
    }
    expect(home.length).toBeGreaterThanOrEqual(MINIMO_CONFIANZA);
  });

  it("también dice qué NO hace — leerse como más de lo que se es, no", () => {
    expect(construirHomeMd()).toContain("Not for:");
  });
});

describe("la página de precios", () => {
  it("cada ruta paga aparece con SU precio — el de la constante que cobra", () => {
    const md = construirPricingMd();
    for (const ruta of RUTAS_CON_MURO) {
      expect(md).toContain(`/api/batch${ruta}`);
      expect(md).toContain(`**${PRECIOS_USD[ruta]} USDC**`);
    }
  });

  it("lo gratis se lista con su porqué y apunta al JSON canónico", () => {
    const md = construirPricingMd();
    expect(md).toContain("/api/batch/verificar/prechequeo");
    expect(md).toContain("/api/batch/pricing");
    expect(md).toContain("**free**");
  });

  it("ningún precio vive en esta página como texto propio: si la constante cambia, la página cambia", () => {
    // La aserción es indirecta pero suficiente: el markdown menciona exactamente
    // tantas rutas pagas como RUTAS_CON_MURO — ni una tabla vieja de más.
    const md = construirPricingMd();
    const seccionPagado = md.slice(md.indexOf("## What is paid"));
    expect(seccionPagado.match(/per call/g)?.length).toBe(RUTAS_CON_MURO.length);
  });
});

describe("las rutas SPA públicas en markdown", () => {
  const casos: Array<[string, () => string]> = [
    ["servicios", construirServiciosMd],
    ["lanzamiento", construirLanzamientoMd],
  ];

  for (const [nombre, md] of casos) {
    it(`/${nombre} trae contenido de verdad y la puerta para agentes`, () => {
      expect(md().length).toBeGreaterThanOrEqual(MINIMO_CONFIANZA);
      expect(md()).toMatch(/^# /);
      // La puerta de la API: sin ella, el agente leyó marketing y quedó igual.
      expect(md()).toContain("/api/batch/quickstart");
    });
  }

  it("los números no viven acá: se enlaza /pricing, no se copia un precio", () => {
    for (const [, md] of casos) {
      expect(md()).toContain("/pricing");
      expect(md()).not.toMatch(/\d+[.,]\d+\s*USDC/i);
    }
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


describe("paridad de hechos entre las dos redacciones (en/es)", () => {
  // Las páginas de confianza tienen DOS redacciones: la inglesa (markdown de
  // agente) y la española (fuente del HTML humano). Textos en idiomas
  // distintos no se pueden diffear, así que la guarda compara los HECHOS —
  // URLs, correos y leyes citadas — igual que la spec bilingüe del sobre
  // compara cifras contra vectores. Si una redacción gana o pierde un hecho
  // sin la otra, esto sale rojo.
  const hechos = (md: string) => ({
    urls: new Set(md.match(/https?:\/\/[^\s)`>]+/g) ?? []),
    correos: new Set(md.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []),
    leyes: new Set(md.match(/\b\d{2,4}\/\d{4}\b/g) ?? []),
  });

  const pares: Array<[string, () => string, () => string]> = [
    ["about", construirAboutMd, construirAboutMdEs],
    ["contact", construirContactMd, construirContactMdEs],
    ["privacy", construirPrivacyMd, construirPrivacyMdEs],
  ];

  for (const [nombre, en, es] of pares) {
    it(`/${nombre}: la redacción inglesa y la española afirman los mismos hechos`, () => {
      const hEn = hechos(en());
      const hEs = hechos(es());
      expect([...hEn.urls].sort()).toEqual([...hEs.urls].sort());
      expect([...hEn.correos].sort()).toEqual([...hEs.correos].sort());
      expect([...hEn.leyes].sort()).toEqual([...hEs.leyes].sort());
    });
  }

  it("el HTML humano se construye de la redacción española, no de la inglesa", () => {
    // Si alguien recablea el HTML a la inglesa, la página humana cambia de
    // idioma en silencio. El H1 español es el testigo más barato.
    expect(construirAboutHtml()).toContain("<h1>Sobre NomiCheck</h1>");
    expect(construirContactHtml()).toContain("<h1>Contacto</h1>");
    expect(construirPrivacyHtml()).toContain("<h1>Privacidad</h1>");
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
