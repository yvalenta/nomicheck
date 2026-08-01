import { describe, expect, it } from "vitest";
import { serviciosDe } from "./catalogo";

// El modo de falla que importa: que la landing pinte "Gratis" sobre algo que
// cobra, o un precio sobre algo que no. Las dos versiones mienten al visitante,
// y ninguna se nota mirando la página — hay que pedir el endpoint para saberlo.

const doc = {
  paths: {
    "/verificar": {
      post: {
        operationId: "payslip-verification",
        summary: "Verificar un comprobante",
        "x-x402": { cobra: true, precioUsd: 0.02, red: "eip155:8453" },
      },
    },
    "/verificar/csv": {
      post: {
        operationId: "payslip-verification-csv",
        summary: "Verificar (CSV)",
        "x-x402": { cobra: true, precioUsd: 0.02, red: "eip155:8453" },
      },
    },
    "/liquidacion-final": {
      post: {
        operationId: "final-settlement",
        summary: "Liquidar un contrato terminado",
        "x-x402": { cobra: false, precioUsd: null, red: null },
      },
    },
    "/parametros": {
      get: { operationId: "legal-parameters", summary: "Parámetros legales" },
    },
  },
};

describe("catálogo leído del OpenAPI", () => {
  it("lista los POST y deja fuera los GET", () => {
    const s = serviciosDe(doc);
    expect(s.map((x) => x.id)).toEqual(["payslip-verification", "final-settlement"]);
  });

  it("no duplica el catálogo con las gemelas /csv", () => {
    // Es el mismo cálculo en otro formato y con el mismo precio: mostrarlo dos
    // veces haría parecer que hay el doble de servicios.
    expect(serviciosDe(doc).some((x) => x.ruta.endsWith("/csv"))).toBe(false);
  });

  it("muestra el precio que declara el servidor", () => {
    const v = serviciosDe(doc).find((x) => x.id === "payslip-verification")!;
    expect(v.cobra).toBe(true);
    expect(v.precioUsd).toBe(0.02);
  });

  it("una ruta gratis se muestra gratis, sin inventar un cero", () => {
    const f = serviciosDe(doc).find((x) => x.id === "final-settlement")!;
    expect(f.cobra).toBe(false);
    expect(f.precioUsd).toBeNull();
  });

  it("si falta `x-x402`, cae del lado de GRATIS y no del de cobrar", () => {
    // Un servidor viejo, o un despliegue a medias, no declara la extensión.
    // Pintar un precio inventado sería peor que no pintarlo: el 402 real
    // aparecería igual si cobrara, pero un precio falso ahuyenta a quien iba
    // a probarlo.
    const sinExt = { paths: { "/x": { post: { operationId: "x", summary: "X" } } } };
    expect(serviciosDe(sinExt)[0]).toMatchObject({ cobra: false, precioUsd: null });
  });

  it("`cobra: true` sin precio no se anuncia como si tuviera uno", () => {
    const raro = {
      paths: { "/x": { post: { operationId: "x", summary: "X", "x-x402": { cobra: true } } } },
    };
    expect(serviciosDe(raro)[0]).toMatchObject({ cobra: false, precioUsd: null });
  });

  it("un documento sin `paths` devuelve lista vacía en vez de reventar", () => {
    expect(serviciosDe({})).toEqual([]);
  });
});
