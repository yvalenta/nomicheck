import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { registrarAcceso } from "../acceso.js";
import { usarEmisor, type LineaDeRegistro } from "../../lib/registro.js";

// Lo que más se prueba acá NO es que registre: es que no registre de más.
//
// El sobre firmado promete `persistidoEnBd: false` y `procesadoPorLlmExterno:
// false` sobre cuerpos que llevan nómina — salarios, deducciones, documentos.
// Un log que copia el body es una base de datos que nadie declaró, y la
// promesa de habeas data no distingue entre "se lo mandé a un LLM" y "quedó en
// docker logs". Por eso hay pruebas en las dos direcciones: que lo permitido
// esté, y que lo prohibido NO.

let lineas: LineaDeRegistro[] = [];

beforeEach(() => {
  lineas = [];
  usarEmisor((l) => lineas.push(l));
});
afterEach(() => usarEmisor(() => {}));

/** Un par req/res mínimo con los ganchos que usa el middleware. */
function peticion(over: Partial<Request> = {}) {
  const oyentes: Record<string, Array<() => void>> = {};
  const res = {
    statusCode: 200,
    writableFinished: true,
    on(evento: string, fn: () => void) {
      (oyentes[evento] ??= []).push(fn);
      return this;
    },
  } as unknown as Response & { statusCode: number; writableFinished: boolean };

  const req = {
    method: "POST",
    path: "/verificar",
    originalUrl: "/api/batch/verificar?token=secreto&doc=CC123456",
    baseUrl: "/api/batch",
    body: { salario: 9_999_999, documento: "CC123456" },
    query: { token: "secreto" },
    headers: { authorization: "Bearer secreto", cookie: "sesion=abc" },
    ...over,
  } as unknown as Request;

  let siguio = false;
  registrarAcceso(req, res, (() => {
    siguio = true;
  }) as NextFunction);

  return {
    res,
    siguio: () => siguio,
    terminar: (evento = "finish") => (oyentes[evento] ?? []).forEach((f) => f()),
  };
}

describe("registrarAcceso", () => {
  it("registra una línea al terminar la petición", () => {
    const p = peticion();
    expect(lineas).toHaveLength(0); // nada al entrar: no se sabe estado ni duración
    p.terminar();
    expect(lineas).toHaveLength(1);
    expect(lineas[0].nivel).toBe("info");
    expect(lineas[0].origen).toBe("http");
  });

  it("lleva método, ruta, estado y duración", () => {
    const p = peticion();
    p.res.statusCode = 402;
    p.terminar();
    const l = lineas[0];
    expect(l.metodo).toBe("POST");
    expect(l.ruta).toBe("/api/batch/verificar"); // completa, y sin el query
    expect(l.estado).toBe(402);
    expect(typeof l.ms).toBe("number");
  });

  it("NUNCA lleva el body, el query ni los headers", () => {
    // La prueba que justifica el archivo. Se serializa la línea entera y se
    // buscan los valores sensibles: así no depende de qué campos existan hoy,
    // sino de que ninguno los filtre — hoy ni al agregar uno nuevo.
    const p = peticion();
    p.terminar();
    const serializada = JSON.stringify(lineas[0]);
    for (const prohibido of ["9999999", "CC123456", "secreto", "Bearer", "sesion=abc"]) {
      expect(serializada).not.toContain(prohibido);
    }
  });

  it("guarda el patrón de la ruta, no el identificador concreto", () => {
    // Contar por `/empleados/:id` responde algo; contar por `/empleados/7` no.
    const p = peticion({
      path: "/empleados/7",
      originalUrl: "/api/empleados/7",
      baseUrl: "/api",
      route: { path: "/empleados/:id" },
    } as Partial<Request>);
    p.terminar();
    expect(lineas[0].patron).toBe("/api/empleados/:id");
  });

  it("si ninguna ruta coincidió, el patrón es null", () => {
    const p = peticion({ path: "/api/no-existe", originalUrl: "/api/no-existe" });
    p.terminar();
    expect(lineas[0].patron).toBeNull();
  });

  it("registra al cliente que corta antes de recibir la respuesta", () => {
    // Un comprador con timeout quedaría invisible justo cuando más interesa.
    const p = peticion();
    (p.res as unknown as { writableFinished: boolean }).writableFinished = false;
    p.terminar("close");
    expect(lineas).toHaveLength(1);
    expect(lineas[0].cortadaPorElCliente).toBe(true);
  });

  it("no duplica la línea si se disparan finish y close", () => {
    const p = peticion();
    p.terminar("finish");
    p.terminar("close");
    expect(lineas).toHaveLength(1);
  });

  it("no registra el healthcheck del contenedor", () => {
    // Cada 15 s, para siempre: 5.760 líneas por día que ahogan todo lo demás.
    const p = peticion({ path: "/api/health", originalUrl: "/api/health", method: "GET" });
    p.terminar();
    expect(lineas).toHaveLength(0);
  });

  it("no registra los archivos estáticos del front", () => {
    const p = peticion({ path: "/assets/index-abc123.js", originalUrl: "/assets/index-abc123.js", method: "GET" });
    p.terminar();
    expect(lineas).toHaveLength(0);
  });

  it("filtra por la ruta COMPLETA, no por la que Express deja al despachar", () => {
    // Express reescribe `req.url` al entrar a un router, asi que en el `finish`
    // `req.path` viene relativo. Si el filtro dependiera de eso, moverlo una
    // linea mas abajo lo dejaria sin filtrar nada, en silencio.
    const p = peticion({ path: "/health", originalUrl: "/api/health", baseUrl: "/api" });
    p.terminar();
    expect(lineas).toHaveLength(0);
  });

  it("siempre llama a next, registre o no", () => {
    // Es un observador: si alguna rama olvidara `next`, cuelga la API entera.
    expect(peticion().siguio()).toBe(true);
    expect(peticion({ originalUrl: "/api/health" }).siguio()).toBe(true);
    expect(peticion({ originalUrl: "/assets/x.css" }).siguio()).toBe(true);
  });
});
