import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { crearFallback, esRutaSpa, sinPrerender } from "../paginasPublicas.js";

// El catch-all es donde vivía el soft-404: cualquier ruta respondía el shell
// del SPA con 200 y un agente concluía que todo existe. Lo que se prueba acá
// es la frontera — shell SOLO para las rutas del cliente, 404 real para el
// resto — y que el bloque prerender de la portada no se cuele en /login.

describe("esRutaSpa", () => {
  it("las seis rutas del cliente reciben el shell, con o sin subruta", () => {
    for (const ruta of [
      "/lanzamiento",
      "/lanzamiento/campana",
      "/servicios",
      "/login",
      "/empresa",
      "/empresa/periodos/3",
      "/colaborador",
      "/admin",
    ]) {
      expect(esRutaSpa(ruta), ruta).toBe(true);
    }
  });

  it("todo lo demás NO es ruta del SPA — incluidos los casi-prefijos", () => {
    for (const ruta of [
      "/",
      "/sitemap.xml",
      "/about",
      "/agents.md",
      "/lanzamientoX", // startsWith daría true; el límite de segmento, no
      "/loginfalso",
      "/ruta-inventada",
    ]) {
      expect(esRutaSpa(ruta), ruta).toBe(false);
    }
  });

  it("los prefijos del servidor son EXACTAMENTE los que decide main.tsx", () => {
    // apps/web/src/main.tsx elige portal por pathname.startsWith('/x'). Si
    // alguien estrena un portal allá y no lo agrega acá, su URL directa
    // respondería 404 — y nada lo rompería en tipos. Se lee como texto, no se
    // importa: la web no es dependencia del API. Vitest corre con cwd en el
    // workspace (apps/api).
    const rutaMain = resolve(process.cwd(), "../web/src/main.tsx");
    if (!existsSync(rutaMain)) {
      throw new Error(`no existe ${rutaMain} — ¿se movió el arranque de la web?`);
    }
    const fuente = readFileSync(rutaMain, "utf8");
    const prefijos = [...fuente.matchAll(/pathname\.startsWith\('\/([a-z]+)'\)/g)].map((m) => m[1]);
    expect(prefijos.length).toBeGreaterThanOrEqual(6);
    for (const prefijo of prefijos) {
      expect(esRutaSpa(`/${prefijo}`), `/${prefijo} está en main.tsx y el servidor lo 404ea`).toBe(
        true,
      );
    }
  });
});

describe("sinPrerender", () => {
  const conBloque = [
    "<html><body><div id=\"root\">",
    "  <!-- prerender:inicio -->",
    "  <h1>portada</h1>",
    "  <!-- prerender:fin -->",
    "</div><script src=\"/x.js\"></script></body></html>",
  ].join("\n");

  it("recorta el bloque completo y deja el resto intacto", () => {
    const shell = sinPrerender(conBloque);
    expect(shell).not.toContain("portada");
    expect(shell).not.toContain("prerender:");
    expect(shell).toContain('<div id="root">');
    expect(shell).toContain('<script src="/x.js">');
  });

  it("sin marcadores no toca nada", () => {
    const sin = "<html><body><div id=\"root\"></div></body></html>";
    expect(sinPrerender(sin)).toBe(sin);
  });

  it("funciona sobre el index.html REAL de la web, no solo sobre un fixture", () => {
    const rutaIndex = resolve(process.cwd(), "../web/index.html");
    if (!existsSync(rutaIndex)) {
      throw new Error(`no existe ${rutaIndex} — ¿se movió el index de la web?`);
    }
    const real = readFileSync(rutaIndex, "utf8");
    // "Dinos tu salario" vive SOLO en el bloque prerender del index; las metas
    // del head dicen otra cosa a propósito, para que esta aserción distinga.
    expect(real).toContain("Dinos tu salario");
    const shell = sinPrerender(real);
    expect(shell).not.toContain("Dinos tu salario");
    expect(shell).toContain('<div id="root">');
    expect(shell).toContain("src=");
  });
});

// Un par req/res mínimo, al estilo de middleware/__tests__/acceso.test.ts.
function simular(ruta: string, accept?: string) {
  const registro: {
    status?: number;
    tipo?: string;
    cuerpo?: unknown;
    varies: string[];
  } = { varies: [] };
  const res = {
    vary(v: string) {
      registro.varies.push(v);
      return this;
    },
    setHeader() {
      return this;
    },
    status(s: number) {
      registro.status = s;
      return this;
    },
    type(t: string) {
      registro.tipo = t;
      return this;
    },
    send(c: unknown) {
      registro.cuerpo = c;
      return this;
    },
    json(c: unknown) {
      registro.cuerpo = c;
      registro.tipo = "application/json";
      return this;
    },
  } as unknown as Response;
  const req = { path: ruta, headers: accept === undefined ? {} : { accept } } as unknown as Request;
  return { req, res, registro };
}

describe("crearFallback", () => {
  const shell = '<div id="root"></div>';
  const fallback = crearFallback(shell);

  it("una ruta del cliente recibe el shell con 200 implícito", () => {
    const { req, res, registro } = simular("/login");
    fallback(req, res, () => {});
    expect(registro.cuerpo).toBe(shell);
    expect(registro.status).toBeUndefined();
  });

  it("una ruta inventada recibe 404 de VERDAD, no el shell", () => {
    const { req, res, registro } = simular("/ruta-inventada");
    fallback(req, res, () => {});
    expect(registro.status).toBe(404);
    expect(String(registro.cuerpo)).not.toContain('id="root"');
  });

  it("el 404 se negocia: markdown para el agente, HTML para el navegador", () => {
    const agente = simular("/x", "text/markdown");
    fallback(agente.req, agente.res, () => {});
    expect(agente.registro.tipo).toContain("text/markdown");
    expect(String(agente.registro.cuerpo)).toContain("# 404");

    const navegador = simular("/x", "text/html");
    fallback(navegador.req, navegador.res, () => {});
    expect(navegador.registro.tipo).toContain("text/html");
    expect(String(navegador.registro.cuerpo)).toContain("<!doctype html>");
  });

  it("el 404 negociado SIEMPRE marca Vary: Accept — con él vive el caché", () => {
    for (const accept of [undefined, "text/html", "text/markdown"]) {
      const { req, res, registro } = simular("/x", accept);
      fallback(req, res, () => {});
      expect(registro.varies).toContain("Accept");
    }
  });

  it("sin build de la web, hasta /login es 404: no hay shell que mentir", () => {
    const sinBuild = crearFallback(null);
    const { req, res, registro } = simular("/login", "text/html");
    sinBuild(req, res, () => {});
    expect(registro.status).toBe(404);
  });
});
