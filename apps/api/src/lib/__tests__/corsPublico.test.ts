import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { CorsRequest } from "cors";
import {
  esLecturaPublica,
  opcionesPara,
  delegadoCors,
  RUTAS_PUBLICAS,
  ORIGEN_POR_DEFECTO,
} from "../corsPublico.js";

function pedido(
  url: string,
  method = "GET",
  headers: Record<string, string> = {},
): CorsRequest {
  return { url, method, headers } as unknown as CorsRequest;
}

describe("corsPublico", () => {
  const previo = process.env.CORS_ORIGIN;
  beforeEach(() => {
    process.env.CORS_ORIGIN = "https://nomicheck.ynt.codes";
  });
  afterEach(() => {
    if (previo === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previo;
  });

  describe("lo que se abre", () => {
    it("la llave pública es legible desde cualquier origen", () => {
      // Es la razón de ser del módulo: sin esto ningún verificador de terceros
      // escrito en el navegador puede comprobar una firma nuestra.
      expect(opcionesPara(pedido("/api/batch/publickey")).origin).toBe("*");
    });

    it("los ejemplos firmados y sus esquemas también", () => {
      for (const ruta of [
        "/api/batch/verificar/ejemplo",
        "/api/batch/verificar/schema/v1.json",
        "/api/batch/ejemplo",
        "/api/batch/parametros",
      ]) {
        expect(opcionesPara(pedido(ruta)).origin, ruta).toBe("*");
      }
    });

    it("una query string no cambia el veredicto", () => {
      expect(opcionesPara(pedido("/api/tasa/verify?hash=abc")).origin).toBe("*");
    });

    it("una barra final tampoco", () => {
      expect(esLecturaPublica(pedido("/api/batch/publickey/"))).toBe(true);
    });

    it("HEAD se permite igual que GET", () => {
      expect(esLecturaPublica(pedido("/api/batch/publickey", "HEAD"))).toBe(true);
    });

    it("nunca manda credenciales junto con el comodín", () => {
      // Con `origin: "*"` el navegador RECHAZA la respuesta si además viaja
      // Access-Control-Allow-Credentials. Abrir y romper es peor que no abrir.
      const o = opcionesPara(pedido("/api/batch/publickey"));
      expect(o.origin).toBe("*");
      expect(o.credentials).toBe(false);
    });
  });

  describe("lo que NO se abre", () => {
    it("un POST a una ruta pública no es lectura pública", () => {
      expect(esLecturaPublica(pedido("/api/batch/verificar", "POST"))).toBe(false);
    });

    it("un POST a la MISMA ruta de la allowlist tampoco", () => {
      expect(esLecturaPublica(pedido("/api/batch/publickey", "POST"))).toBe(false);
    });

    it("las rutas con auth caen al origen configurado", () => {
      for (const ruta of [
        "/api/empresa/empleados",
        "/api/liquidations",
        "/api/auth/whoami",
      ]) {
        expect(opcionesPara(pedido(ruta)).origin, ruta).toBe(
          "https://nomicheck.ynt.codes",
        );
      }
    });

    it("un preflight que pide POST se rechaza aunque la ruta esté en la lista", () => {
      // El preflight llega como OPTIONS y lleva el método real en la cabecera.
      // Mirar solo `req.method` dejaría pasar cualquier escritura cross-origin.
      const req = pedido("/api/batch/publickey", "OPTIONS", {
        "access-control-request-method": "POST",
      });
      expect(esLecturaPublica(req)).toBe(false);
    });

    it("un preflight que pide GET sí pasa", () => {
      const req = pedido("/api/batch/publickey", "OPTIONS", {
        "access-control-request-method": "GET",
      });
      expect(esLecturaPublica(req)).toBe(true);
    });

    it("un prefijo parecido no cuela", () => {
      // La allowlist es exacta a propósito: con un `startsWith` cualquier ruta
      // nueva bajo /api/batch heredaría el comodín sin decidirlo nadie.
      for (const ruta of [
        "/api/batch/publickey/../empresa/empleados",
        "/api/batch/publickeyX",
        "/api/batch",
      ]) {
        expect(esLecturaPublica(pedido(ruta)), ruta).toBe(false);
      }
    });

    it("una ruta desconocida cae al origen configurado", () => {
      expect(opcionesPara(pedido("/api/lo-que-sea")).origin).toBe(
        "https://nomicheck.ynt.codes",
      );
    });
  });

  describe("configuración", () => {
    it("sin CORS_ORIGIN usa el panel local, no el comodín", () => {
      delete process.env.CORS_ORIGIN;
      expect(opcionesPara(pedido("/api/empresa/empleados")).origin).toBe(
        ORIGEN_POR_DEFECTO,
      );
    });

    it("abrir una ruta nueva es deliberado: la lista es explícita", () => {
      // Guarda de intención. Si alguien agrega una ruta, este test lo obliga a
      // pasar por acá y a mirar la lista completa.
      expect(RUTAS_PUBLICAS.size).toBe(15);
      expect(RUTAS_PUBLICAS.has("/api/batch/publickey")).toBe(true);
    });

    it("ninguna ruta con auth se coló en la lista", () => {
      for (const r of RUTAS_PUBLICAS) {
        expect(r.startsWith("/api/empresa"), r).toBe(false);
        expect(r.startsWith("/api/auth"), r).toBe(false);
        expect(r, r).not.toBe("/api/liquidations");
      }
    });

    it("el delegado devuelve las opciones sin error", () => {
      let visto: unknown = "sin llamar";
      delegadoCors(pedido("/api/batch/publickey"), (err, o) => {
        expect(err).toBeNull();
        visto = o?.origin;
      });
      expect(visto).toBe("*");
    });
  });
});
