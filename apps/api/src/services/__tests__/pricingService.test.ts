// `construirPricing` (DX402 punto 2, reparación ronda 2): las entradas de
// `paid` que restringen red (hoy solo `/verificar/durable`, vía
// `REDES_POR_RUTA`) tienen que declararlo, o un agente que arme un pago
// leyendo solo el `networks` GLOBAL de este documento firma en la red
// equivocada y se lleva un 402 con un único `accept` — el descubrimiento le
// mintió (hallazgo del refutador).
import { describe, expect, it } from "vitest";
import { construirPricing } from "../pricingService.js";
import { RUTAS_CON_MURO } from "../../lib/x402Config.js";

describe("construirPricing — networks por entrada de `paid`", () => {
  it("/verificar/durable declara `networks: [avalanche]`", () => {
    const p = construirPricing();
    const durable = p.paid.find((e) => e.route === "/api/batch/verificar/durable") as
      | { networks?: string[] }
      | undefined;
    expect(durable?.networks).toEqual(["avalanche"]);
  });

  it("las rutas sin restricción de red NO repiten el campo `networks`", () => {
    const p = construirPricing();
    for (const entrada of p.paid) {
      if (entrada.route === "/api/batch/verificar/durable") continue;
      expect(entrada).not.toHaveProperty("networks");
    }
  });

  it("toda ruta paga aparece en `paid`, una sola vez", () => {
    const p = construirPricing();
    const rutas = p.paid.map((e) => e.route);
    for (const ruta of RUTAS_CON_MURO) {
      expect(rutas.filter((r) => r === `/api/batch${ruta}`)).toHaveLength(1);
    }
  });

  it("el `networks` global del documento sigue listando ambas redes del sitio", () => {
    const p = construirPricing();
    expect(p.networks).toEqual(["base", "avalanche"]);
  });
});
