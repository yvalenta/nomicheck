import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// La superficie que ve quien NO ejecuta JavaScript: el HTML crudo del index,
// robots.txt, agents.md y la tarjeta og. Nada de esto lo cubre una prueba de
// componentes — React ni se entera — y es exactamente lo que leen los
// crawlers de IA y los buscadores. Medido el 2026-08-23 desde afuera: la
// portada cruda traía ~33 caracteres de texto y ni un enlace.
//
// Los archivos se leen desde el cwd del workspace (apps/web), como en
// estadosPeriodo.test.ts: bajo jsdom import.meta.url no trae esquema file:.
const INDEX = resolve(process.cwd(), "index.html");
const PUBLICO = resolve(process.cwd(), "public");

function leer(ruta: string): string {
  if (!existsSync(ruta)) throw new Error(`no existe ${ruta} — ¿se movió?`);
  return readFileSync(ruta, "utf8");
}

describe("el index.html crudo (lo que ve un crawler sin JS)", () => {
  const html = leer(INDEX);

  it("trae el bloque prerender con sus dos marcadores, dentro de #root", () => {
    const inicio = html.indexOf("<!-- prerender:inicio -->");
    const fin = html.indexOf("<!-- prerender:fin -->");
    const root = html.indexOf('<div id="root">');
    expect(inicio).toBeGreaterThan(root);
    expect(fin).toBeGreaterThan(inicio);
  });

  it("tiene un <h1> y al menos 500 caracteres de texto visible sin ejecutar nada", () => {
    expect(html).toMatch(/<h1[^>]*>[^<]+<\/h1>/);
    const cuerpo = html.slice(html.indexOf("<body"));
    const texto = cuerpo
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    expect(texto.length).toBeGreaterThanOrEqual(500);
  });

  it("enlaza la documentación y la superficie de agentes desde el HTML crudo", () => {
    // El hero de React ya enlazaba /docs/ — pero solo tras ejecutar JS, y el
    // crawler que evalúa "¿la portada enlaza su documentación?" no ejecuta.
    for (const enlace of ['href="/docs/"', 'href="/llms.txt"', 'href="/agents.md"', 'href="/about"', 'href="/contact"', 'href="/privacy"']) {
      expect(html).toContain(enlace);
    }
  });

  it("las cuatro señales de metadata están: canonical, lang, og:image y og:type", () => {
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('property="og:type"');
  });

  it("el og.png que anuncia existe de verdad en public/", () => {
    expect(html).toContain("https://nomicheck.ynt.codes/og.png");
    expect(existsSync(resolve(PUBLICO, "og.png"))).toBe(true);
  });

  it("la Organization del JSON-LD trae contactPoint y address completos", () => {
    const bloques = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(bloques.length).toBeGreaterThanOrEqual(1);
    const datos = JSON.parse(bloques[0][1]) as {
      publisher: {
        "@type": string;
        contactPoint?: { email?: string; contactType?: string };
        address?: { addressLocality?: string; addressCountry?: string };
      };
    };
    expect(datos.publisher["@type"]).toBe("Organization");
    expect(datos.publisher.contactPoint?.email).toBeTruthy();
    expect(datos.publisher.contactPoint?.contactType).toBeTruthy();
    expect(datos.publisher.address?.addressLocality).toBeTruthy();
    expect(datos.publisher.address?.addressCountry).toBe("CO");
  });

  it("el correo del JSON-LD es el de lib/contacto.ts del backend — copia con guarda", () => {
    // index.html no puede importar del API (otro workspace), así que lleva una
    // copia del correo. Esta prueba es la guarda de esa copia: se lee el
    // backend como texto, igual que estadosPeriodo.test.ts, y falla cerrado.
    const rutaContacto = resolve(process.cwd(), "../api/src/lib/contacto.ts");
    const fuente = leer(rutaContacto);
    const correo = fuente.match(/email: "([^"]+)"/)?.[1];
    if (!correo) throw new Error(`no se pudo leer el correo de ${rutaContacto} — ¿cambió de forma?`);
    const bloques = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const datos = JSON.parse(bloques[0][1]) as {
      publisher: { email?: string; contactPoint?: { email?: string } };
    };
    expect(datos.publisher.email).toBe(correo);
    expect(datos.publisher.contactPoint?.email).toBe(correo);
  });
});

describe("robots.txt", () => {
  it("anuncia el sitemap y sigue excluyendo los portales con login", () => {
    const robots = leer(resolve(PUBLICO, "robots.txt"));
    expect(robots).toContain("Sitemap: https://nomicheck.ynt.codes/sitemap.xml");
    for (const privada of ["/empresa", "/colaborador", "/login", "/admin"]) {
      expect(robots).toContain(`Disallow: ${privada}`);
    }
  });
});

describe("agents.md", () => {
  it("dice CUÁNDO usar el servicio, no solo cómo — con los casos nombrados", () => {
    const guia = leer(resolve(PUBLICO, "agents.md"));
    expect(guia).toContain("## Cuándo usar NomiCheck");
    // Los trabajos concretos, no marketing: cada uno con su endpoint.
    for (const endpoint of [
      "/api/batch/verificar",
      "/api/batch/retencion",
      "/api/batch/liquidar",
      "/api/batch/liquidacion-final",
      "/api/batch/parametros",
    ]) {
      expect(guia).toContain(endpoint);
    }
    // Y el límite dicho de frente.
    expect(guia).toMatch(/otros países/);
  });
});
