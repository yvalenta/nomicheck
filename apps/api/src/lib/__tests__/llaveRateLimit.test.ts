import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { llavePorIpReal } from "../llaveRateLimit.js";

// Por qué existe esta suite, en una línea: el tope por IP se saltea si la llave
// sale de algo que escribe el cliente.
//
// Medido el 2026-08-09 con las versiones instaladas: con `trust proxy: true`
// —que el muro x402 necesita para que `req.protocol` sea https— `req.ip` toma
// el X-Forwarded-For de más a la izquierda, o sea el que mandó el cliente.
// Rotándolo, 40 de 40 pedidos pasaron contra un tope de 10.
//
// El arreglo es llavear por CF-Connecting-IP, que Cloudflare SOBRESCRIBE. Estas
// pruebas fijan las dos propiedades de las que depende esa decisión; si alguien
// vuelve a llavear por `req.ip`, o saca el normalizado de IPv6, esto se pone
// rojo antes de que el tope quede de adorno otra vez.

function pedido(headers: Record<string, string>, ip = "127.0.0.1"): Request {
  return { headers, ip } as unknown as Request;
}

describe("llavePorIpReal", () => {
  it("usa CF-Connecting-IP y NO el X-Forwarded-For que manda el cliente", () => {
    const rotando = [1, 2, 3].map((n) =>
      llavePorIpReal(
        pedido(
          { "x-forwarded-for": `203.0.113.${n}, 198.51.100.9`, "cf-connecting-ip": "198.51.100.9" },
          `203.0.113.${n}`, // req.ip ya contaminado por trust proxy: true
        ),
      ),
    );

    // Las tres tienen que caer en el MISMO bucket: es el mismo atacante.
    expect(new Set(rotando).size).toBe(1);
  });

  it("separa clientes distintos de verdad", () => {
    const a = llavePorIpReal(pedido({ "cf-connecting-ip": "198.51.100.9" }));
    const b = llavePorIpReal(pedido({ "cf-connecting-ip": "198.51.100.10" }));
    expect(a).not.toBe(b);
  });

  it("colapsa un /64 de IPv6 en una sola llave", () => {
    // Un /64 es lo que le asignan a UN cliente residencial. Sin normalizar,
    // ese cliente tiene 2^64 buckets y el tope no existe para él.
    const dentroDelMismo64 = ["2001:db8::1", "2001:db8::2", "2001:db8::ffff"].map((ip) =>
      llavePorIpReal(pedido({ "cf-connecting-ip": ip })),
    );
    expect(new Set(dentroDelMismo64).size).toBe(1);

    const otroPrefijo = llavePorIpReal(pedido({ "cf-connecting-ip": "2001:db9::1" }));
    expect(otroPrefijo).not.toBe(dentroDelMismo64[0]);
  });

  it("cae a req.ip si la petición no vino por Cloudflare", () => {
    // No debería pasar en producción (el origen solo es alcanzable por el
    // túnel), pero un fallback vacío metería a todo el mundo en un bucket.
    expect(llavePorIpReal(pedido({}, "198.51.100.9"))).toBe(
      llavePorIpReal(pedido({ "cf-connecting-ip": "198.51.100.9" })),
    );
  });

  it("ignora un CF-Connecting-IP vacío en vez de llavear por cadena vacía", () => {
    const vacio = llavePorIpReal(pedido({ "cf-connecting-ip": "" }, "198.51.100.9"));
    expect(vacio).toBe(llavePorIpReal(pedido({ "cf-connecting-ip": "198.51.100.9" })));
  });
});
