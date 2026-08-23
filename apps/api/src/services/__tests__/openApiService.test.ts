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
import { PRECIOS_USD } from "../../lib/x402Config.js";

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

  it("TODA operación se describe sola: operationId, summary y description real", () => {
    // "85% descrito" fue el estado medido desde afuera el 2026-08-23: dos GET
    // llevaban summary sin description. La vara es el 100% y por operación —
    // un spec autodescriptivo es lo que un agente lee en vez de esta prosa. El
    // piso de 40 caracteres separa una descripción de un título repetido.
    for (const [ruta, metodos] of Object.entries(doc.paths)) {
      for (const [metodo, op] of Object.entries(metodos)) {
        const o = op as unknown as { operationId?: string; summary?: string; description?: string };
        expect(o.operationId, `${metodo.toUpperCase()} ${ruta} sin operationId`).toBeTruthy();
        expect(o.summary, `${metodo.toUpperCase()} ${ruta} sin summary`).toBeTruthy();
        expect(
          o.description?.length ?? 0,
          `${metodo.toUpperCase()} ${ruta} sin description de verdad`,
        ).toBeGreaterThanOrEqual(40);
      }
    }
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

// Este documento lo SIRVE `/api/batch/openapi.json`, así que una frase escrita a
// mano sobre el estado del muro se convierte en una mentira publicada el día que
// se encienda — y el OpenAPI no lo relee nadie. Estos tests sujetan que lo que
// se sirve salga de la config y no de la memoria de quien lo escribió.
describe("el muro en el documento servido", () => {
  const conMuro = (activo: boolean) => {
    const antes = process.env.X402_ACTIVO;
    process.env.X402_ACTIVO = activo ? "true" : "false";
    try {
      return JSON.parse(JSON.stringify(construirOpenApi())) as typeof doc & {
        components: { securitySchemes: { x402: { description: string } } };
      };
    } finally {
      if (antes === undefined) delete process.env.X402_ACTIVO;
      else process.env.X402_ACTIVO = antes;
    }
  };

  it("apagado, dice que responde sin pago y ninguna operación exige x402", () => {
    const d = conMuro(false);
    expect(d.components.securitySchemes.x402.description).toContain("apagado");
    expect(JSON.stringify(d.paths)).not.toContain('"security"');
  });

  it("encendido, publica el precio real y marca las operaciones que cobran", () => {
    const d = conMuro(true);
    const post = d.paths["/verificar"].post as unknown as {
      security?: unknown[];
      responses: Record<string, { description: string }>;
    };
    expect(post.security).toEqual([{ x402: [] }]);
    // El precio sale de PRECIOS_USD, no de un literal escrito acá al lado.
    expect(post.responses["402"].description).toContain(PRECIOS_USD["/verificar"].toFixed(2));
    expect(d.components.securitySchemes.x402.description).not.toContain("apagado");
  });

  it("el /csv cobra igual que su ruta base, y lo documenta", () => {
    // Si el CSV no anunciara su 402, pedirlo parecería la forma gratis de
    // saltarse el muro hasta que el servidor contesta 402 sin avisar.
    const d = conMuro(true);
    const csv = d.paths["/verificar/csv"].post as unknown as {
      security?: unknown[];
      responses: Record<string, { description: string }>;
    };
    expect(csv.security).toEqual([{ x402: [] }]);
    expect(csv.responses["402"]).toBeDefined();
  });

  it("publica el precio en NUMERO, no solo en la prosa del 402", () => {
    // Un cliente que quiera pintar el catálogo no puede depender de parsear
    // una frase en español: se rompe al reescribir una palabra.
    const d = conMuro(true);
    const x = (d.paths["/verificar"].post as unknown as Record<string, unknown>)["x-x402"];
    expect(x).toEqual({
      cobra: true,
      precioUsd: PRECIOS_USD["/verificar"],
      // `red`/`asset` en singular siguen publicados —son la PRIMERA red, y un
      // cliente ya puede estar leyéndolos—; `redes` es la lista completa.
      red: "eip155:8453",
      asset: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
      redes: [
        {
          red: "eip155:8453",
          asset: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
          nombre: "base",
        },
      ],
    });
  });

  it("con el muro apagado dice que no cobra, y el precio sigue visible", () => {
    // `cobra: false` con `precioUsd` presente es la verdad completa: hoy no se
    // paga, y esto es lo que costaría. Omitir el precio obligaría a adivinar.
    const d = conMuro(false);
    const x = (d.paths["/verificar"].post as unknown as Record<string, unknown>)["x-x402"] as {
      cobra: boolean;
      precioUsd: number | null;
      red: string | null;
    };
    expect(x.cobra).toBe(false);
    expect(x.precioUsd).toBe(PRECIOS_USD["/verificar"]);
    expect(x.red).toBeNull();
  });

  it("la ruta gratis a propósito se declara sin precio, no con precio cero", () => {
    // `/liquidacion-final` no está en PRECIOS_USD. Un 0 diría "cuesta cero";
    // `null` dice "no tiene precio", que es lo que se decidió.
    const d = conMuro(true);
    const x = (d.paths["/liquidacion-final"].post as unknown as Record<string, unknown>)[
      "x-x402"
    ] as { cobra: boolean; precioUsd: number | null };
    expect(x.cobra).toBe(false);
    expect(x.precioUsd).toBeNull();
  });

  it("los GET de integración siguen gratis con el muro encendido", () => {
    // Ponerle muro a la llave pública rompería el producto: nadie podría
    // verificar una salida firmada sin pagar otra vez.
    const d = conMuro(true);
    for (const ruta of ["/parametros", "/publickey"]) {
      const get = d.paths[ruta]?.get as unknown as { security?: unknown[] } | undefined;
      if (get) expect(get.security).toBeUndefined();
    }
  });
});
