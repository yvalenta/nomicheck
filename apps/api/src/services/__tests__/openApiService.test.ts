// El documento OpenAPI se genera de los zod que validan en runtime, así que no
// puede desincronizarse del contrato. Lo que SÍ puede pudrirse es lo de
// alrededor: que se agregue una ruta y nadie la liste, que un `$ref` apunte a
// donde no hay nada, o que los operationId dejen de coincidir con los id de
// skill que el agent card anuncia en ynt.codes.
//
// Ese último es el que importa para descubrimiento: un cliente que llega por el
// catálogo ARD lee `capabilities: ["final-settlement", ...]` y después busca esa
// operación en el OpenAPI. Si los nombres no coinciden, encontró el anuncio y
// no encuentra la puerta.
import { describe, expect, it } from "vitest";
import { construirOpenApi } from "../openApiService.js";

const doc = construirOpenApi() as {
  openapi: string;
  paths: Record<string, Record<string, { operationId: string; requestBody?: unknown }>>;
  components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
  security: unknown[];
};

// Los mismos id que el agent card A2A y el catálogo ARD publican como
// `skills[].id` / `capabilities`. Si acá cambia uno, hay que cambiarlo allá —
// y este test es el que lo recuerda.
// Los cinco cálculos: POST con gemela CSV.
const LISTINGS_ANUNCIADOS = [
  "withholding-tax",
  "payslip-verification",
  "payroll-settlement",
  "final-settlement",
  "usdc-contractor-payout",
];

// Capacidades de catálogo: se anuncian igual, pero son GET y no tienen CSV.
// Van aparte porque el test anterior exigía una gemela `-csv` a todo lo
// anunciado, y eso habría bloqueado anunciar `legal-parameters` — que es
// justamente la capacidad menos replicable del conjunto.
const CATALOGO_ANUNCIADO = ["legal-parameters"];

describe("documento OpenAPI", () => {
  it("es OpenAPI 3.0 con servidor y seguridad declarados", () => {
    expect(doc.openapi).toMatch(/^3\.0/);
    // `security: []` es "abierto", y es distinto de no decir nada: quien
    // integra necesita saber que no hay que autenticarse, no deducirlo.
    expect(doc.security).toEqual([]);
    expect(doc.components.securitySchemes).toHaveProperty("x402");
  });

  it("cada listing anunciado tiene su operación y su gemela CSV", () => {
    const ids = Object.values(doc.paths).flatMap((m) => Object.values(m).map((o) => o.operationId));
    for (const skill of LISTINGS_ANUNCIADOS) {
      expect(ids, `la skill "${skill}" se anuncia pero no está en el OpenAPI`).toContain(skill);
      expect(ids, `falta la gemela CSV de "${skill}"`).toContain(`${skill}-csv`);
    }
  });

  it("cada capacidad de catálogo anunciada tiene su operación", () => {
    const ids = Object.values(doc.paths).flatMap((m) => Object.values(m).map((o) => o.operationId));
    for (const cap of CATALOGO_ANUNCIADO) {
      expect(ids, `"${cap}" se anuncia en el agent card y no está en el OpenAPI`).toContain(cap);
    }
  });

  it("no hay operationId repetidos", () => {
    const ids = Object.values(doc.paths).flatMap((m) => Object.values(m).map((o) => o.operationId));
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("todo $ref resuelve dentro del documento", () => {
    // Diez `$ref` rotos pasaron desapercibidos a ojo la primera vez: zod
    // emitía `#/definitions/X` y el documento usa `#/components/schemas/X`.
    // A ojo se ve igual de bien; a un cliente le revienta.
    const rotos: string[] = [];
    const recorrer = (nodo: unknown) => {
      if (Array.isArray(nodo)) return nodo.forEach(recorrer);
      if (!nodo || typeof nodo !== "object") return;
      for (const [k, v] of Object.entries(nodo)) {
        if (k === "$ref" && typeof v === "string") {
          const nombre = v.replace("#/components/schemas/", "");
          if (!v.startsWith("#/components/schemas/") || !(nombre in doc.components.schemas)) {
            rotos.push(v);
          }
        } else {
          recorrer(v);
        }
      }
    };
    recorrer(doc.paths);
    expect(rotos, "referencias que no resuelven").toEqual([]);
  });

  it("cada schema colgado en components lo usa alguien", () => {
    const json = JSON.stringify(doc.paths);
    for (const nombre of Object.keys(doc.components.schemas)) {
      expect(json, `${nombre} está en components y nadie lo referencia`).toContain(
        `#/components/schemas/${nombre}`
      );
    }
  });

  it("el catálogo de parámetros documenta la consulta por fecha", () => {
    const op = doc.paths["/parametros"].get as unknown as {
      description: string;
      parameters: { name: string; in: string }[];
    };
    expect(op.description).toContain("historia de vigencias");
    expect(op.parameters.some((p) => p.name === "fecha" && p.in === "query")).toBe(true);
    // Y que las claves ausentes se nombran en vez de desaparecer.
    expect(op.description).toContain("noVigentes");
  });
});
