import { describe, expect, it } from "vitest";
import { problemaDeEntrada, rutasPagasSinEsquema } from "../validacionPrevia.js";
import { PRECIOS_USD, RUTAS_CON_MURO } from "../x402Config.js";
import { construirPricing, rutasPagasSinPorque } from "../../services/pricingService.js";

// En x402 el pago es inmediato y final. Lo que estas pruebas defienden no es
// una función: es que un comprador no pague por su propio typo.
describe("validar antes de cobrar", () => {
  it("un cuerpo mal formado se rechaza (y por lo tanto no se cobra)", () => {
    const p = problemaDeEntrada("/verificar", { comprobantes: "esto no es una lista" });
    expect(p).not.toBeNull();
    expect(p?.error).toBe("invalid_input");
  });

  it("el rechazo DICE que no se cobró — el comprador no puede quedar en duda", () => {
    const p = problemaDeEntrada("/verificar", {});
    expect(p?.aviso).toMatch(/ANTES de cobrar/);
    expect(p?.aviso).toMatch(/no se liquidó ningún pago/);
  });

  it("y le dice dónde está el contrato y el ejemplo, no solo que se equivocó", () => {
    const p = problemaDeEntrada("/verificar", {});
    expect(p?.aviso).toContain("/schema/v1.json");
    expect(p?.aviso).toContain("/ejemplo");
  });

  it("un cuerpo válido pasa: null significa 'seguí, cobrale'", () => {
    // El mismo cuerpo que sirve /api/batch/verificar/ejemplo. Si el esquema
    // cambia y este deja de pasar, el ejemplo publicado tambien quedo roto.
    const valido = {
      version: "1",
      buyer: { noExternalLlm: true },
      comprobantes: [
        {
          externalId: "T-1",
          salarioBasicoMensual: 2000000,
          recibeAuxilioTransporte: true,
          periodoDesde: "2026-07-01",
          periodoHasta: "2026-07-31",
          declarado: [{ nombre: "Salario básico", valor: 2000000 }],
        },
      ],
    };
    expect(problemaDeEntrada("/verificar", valido)).toBeNull();
  });

  it("una ruta sin esquema declarado NO inventa un veredicto: deja pasar", () => {
    // Fallar acá cerraría una ruta paga por una omisión nuestra, que es peor
    // que el problema que este módulo arregla.
    expect(problemaDeEntrada("/ruta-que-no-existe", { lo: "que sea" })).toBeNull();
  });

  // La guarda que impide que el agujero vuelva: si mañana alguien agrega una
  // ruta a PRECIOS_USD y no le pone esquema, esa ruta cobraría sin validar.
  it("TODA ruta que cobra tiene esquema de validación previa", () => {
    expect(rutasPagasSinEsquema(RUTAS_CON_MURO)).toEqual([]);
  });
});

describe("pricing", () => {
  it("los importes salen de PRECIOS_USD, no de una tabla escrita", () => {
    for (const p of construirPricing().pagado) {
      const ruta = p.ruta.replace("/api/batch", "");
      expect(p.precioUsd).toBe(PRECIOS_USD[ruta]);
    }
  });

  it("TODA ruta que cobra publica POR QUÉ cobra", () => {
    expect(rutasPagasSinPorque()).toEqual([]);
  });

  it("declara la regla de incentivos antes que cualquier número", () => {
    expect(construirPricing().reglaDeIncentivos).toMatch(/JAMÁS se cobra según lo que se encuentra/);
  });

  it("dice que validar no se cobra — la lección que se pagó", () => {
    expect(construirPricing().validarNoSeCobra).toMatch(/ANTES de liquidar/);
  });

  it("lo gratis incluye el pre-chequeo, la llave y el contrato", () => {
    const rutas = construirPricing().gratis.map((g) => g.ruta).join(" ");
    expect(rutas).toContain("/verificar/prechequeo");
    expect(rutas).toContain("/publickey");
    expect(rutas).toContain("/openapi.json");
  });

  it("cada cosa gratis explica POR QUÉ lo es (si no, es marketing)", () => {
    for (const g of construirPricing().gratis) {
      expect(g.porque.length).toBeGreaterThan(40);
      expect(g.precioUsd).toBe(0);
    }
  });
});
