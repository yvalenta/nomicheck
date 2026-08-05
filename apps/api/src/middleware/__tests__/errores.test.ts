import { describe, expect, it, beforeEach } from "vitest";

import { linea, serializarError, usarEmisor, type LineaDeRegistro } from "../../lib/registro.js";
import { manejadorDeErrores } from "../errores.js";

// La instrumentación de errores tiene dos modos de falla propios, y los dos son
// peores que no tenerla:
//
//   1. Que el log COPIE lo que no debe. Los cuerpos de las peticiones llevan
//     nómina; un log que los guarda es una base de datos que nadie declaró, y
//     rompe la promesa de habeas data por la puerta de atrás.
//   2. Que la respuesta FILTRE lo que no debe. El stack de un servicio de
//     nómina servido al cliente es un mapa del sistema para quien ataca.
//
// Por eso estas pruebas afirman tanto lo que sale como lo que NO sale, en las
// dos direcciones.

const capturadas: LineaDeRegistro[] = [];

function reqFalsa(over: Record<string, unknown> = {}) {
  return {
    method: "POST",
    path: "/api/batch/retencion",
    // Presentes A PROPÓSITO: si el manejador los tocara, las pruebas de "no
    // sale en el log" no probarían nada.
    body: { personas: [{ externalId: "P-1", ingresoLaboralMensual: 8_000_000 }] },
    query: { secreto: "no-debe-salir" },
    headers: { authorization: "Bearer token-real" },
    ...over,
  } as never;
}

function resFalsa() {
  const res = {
    headersSent: false,
    codigo: 0,
    cuerpo: null as unknown,
    status(c: number) { this.codigo = c; return this; },
    json(b: unknown) { this.cuerpo = b; return this; },
  };
  return res as typeof res & { codigo: number; cuerpo: unknown };
}

beforeEach(() => {
  capturadas.length = 0;
  usarEmisor((l) => capturadas.push(l));
});

describe("manejadorDeErrores", () => {
  it("un error inesperado sale como 500 con id, y el id está en el log", () => {
    const res = resFalsa();
    manejadorDeErrores(new Error("boom interno"), reqFalsa(), res as never, () => {});
    expect(res.codigo).toBe(500);
    const cuerpo = res.cuerpo as { error: string; id: string };
    expect(cuerpo.error).toBe("Error interno");
    expect(cuerpo.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(capturadas).toHaveLength(1);
    expect(capturadas[0]!.id).toBe(cuerpo.id);
  });

  it("la respuesta NO lleva el mensaje ni el stack del error", () => {
    // "boom interno" puede nombrar tablas, rutas de archivo o lógica de
    // negocio. El cliente recibe el id y nada más.
    const res = resFalsa();
    manejadorDeErrores(new Error("boom interno con /ruta/secreta"), reqFalsa(), res as never, () => {});
    const serializada = JSON.stringify(res.cuerpo);
    expect(serializada).not.toContain("boom");
    expect(serializada).not.toContain("ruta/secreta");
    expect(serializada).not.toContain("stack");
  });

  it("el log NO lleva el body, el query ni los headers — ahí vive la nómina", () => {
    const res = resFalsa();
    manejadorDeErrores(new Error("x"), reqFalsa(), res as never, () => {});
    const serializado = JSON.stringify(capturadas[0]);
    expect(serializado).not.toContain("8000000");
    expect(serializado).not.toContain("no-debe-salir");
    expect(serializado).not.toContain("token-real");
    // Lo que sí: método y ruta, que no identifican a nadie.
    expect(capturadas[0]!.metodo).toBe("POST");
    expect(capturadas[0]!.ruta).toBe("/api/batch/retencion");
  });

  it("el log SÍ lleva el stack — va a stdout local, no a un tercero", () => {
    const res = resFalsa();
    manejadorDeErrores(new Error("con stack"), reqFalsa(), res as never, () => {});
    const error = capturadas[0]!.error as { stack: string };
    expect(error.stack).toContain("con stack");
  });

  it("JSON malformado del cliente: 400 claro, y NO se registra como error nuestro", () => {
    // Un atacante mandando basura no debe poder llenar el log de errores
    // "nuestros" — eso entrena a ignorar el log, que es como muere un log.
    const res = resFalsa();
    const err = new SyntaxError("Unexpected token");
    (err as unknown as { status: number }).status = 400;
    manejadorDeErrores(err, reqFalsa(), res as never, () => {});
    expect(res.codigo).toBe(400);
    expect(capturadas).toHaveLength(0);
  });

  it("si la respuesta ya empezó, delega en Express en vez de escribir encima", () => {
    const res = resFalsa();
    res.headersSent = true;
    let delegado: unknown = null;
    manejadorDeErrores(new Error("tarde"), reqFalsa(), res as never, ((e: unknown) => { delegado = e; }) as never);
    expect(res.codigo).toBe(0); // no tocó la respuesta
    expect((delegado as Error).message).toBe("tarde");
  });

  it("un throw que no es Error no revienta el manejador", () => {
    // `throw "texto"` y rechazos con objetos planos existen. El registro es el
    // peor lugar para reventar por uno: el error del error se pierde y el
    // cliente queda colgado sin respuesta.
    const res = resFalsa();
    manejadorDeErrores("no soy un Error", reqFalsa(), res as never, () => {});
    expect(res.codigo).toBe(500);
    expect((capturadas[0]!.error as { mensaje: string }).mensaje).toBe("no soy un Error");
  });
});

describe("registro", () => {
  it("cada línea lleva ts, nivel, origen y sha", () => {
    const l = linea("error", "http", "algo");
    expect(l.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(l.nivel).toBe("error");
    expect(l.origen).toBe("http");
    // Sin GIT_SHA en el entorno vale null — un null visible es honesto; un
    // campo ausente parece un log de otra versión.
    expect("sha" in l).toBe(true);
  });

  it("serializa la cadena de causas, no solo el error de arriba", () => {
    const raiz = new Error("la causa raíz");
    const envuelto = new Error("capa de arriba", { cause: raiz });
    const s = serializarError(envuelto);
    expect((s.causa as { mensaje: string }).mensaje).toBe("la causa raíz");
  });
});
