import { describe, expect, it } from "vitest";
import { problemaDeEntrada, rutasPagasSinEsquema } from "../validacionPrevia.js";
import { PRECIOS_USD, RUTAS_CON_MURO } from "../x402Config.js";
import { construirPricing, rutasPagasSinPorque } from "../../services/pricingService.js";
import { cantidadDeDebilidades, construirManifiesto } from "../../services/manifiestoService.js";
import { compararComprobante } from "../../services/verificacionComprobanteService.js";

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
    for (const p of construirPricing().paid) {
      const ruta = p.route.replace("/api/batch", "");
      expect(p.priceUsd).toBe(PRECIOS_USD[ruta]);
    }
  });

  it("TODA ruta que cobra publica POR QUÉ cobra", () => {
    expect(rutasPagasSinPorque()).toEqual([]);
  });

  it("declara la regla de incentivos antes que cualquier número", () => {
    expect(construirPricing().incentiveRule).toMatch(/NEVER charge based on what we find/);
  });

  it("dice que validar no se cobra — la lección que se pagó", () => {
    expect(construirPricing().validationIsFree).toMatch(/BEFORE the payment settles/);
  });

  it("lo gratis incluye el pre-chequeo, la llave y el contrato", () => {
    const rutas = construirPricing().free.map((g) => g.route).join(" ");
    expect(rutas).toContain("/verificar/prechequeo");
    expect(rutas).toContain("/publickey");
    expect(rutas).toContain("/openapi.json");
  });

  it("cada cosa gratis explica POR QUÉ lo es (si no, es marketing)", () => {
    for (const g of construirPricing().free) {
      expect(g.why.length).toBeGreaterThan(40);
      expect(g.priceUsd).toBe(0);
    }
  });
});

describe("manifiesto", () => {
  it("declara debilidades conocidas — una lista vacía deja de ser honesta", () => {
    expect(cantidadDeDebilidades()).toBeGreaterThanOrEqual(5);
  });

  it("cada debilidad trae CUÁNDO pasó: sin fecha es humildad de folleto", () => {
    for (const d of construirManifiesto().knownWeaknesses) {
      expect(d.when.length).toBeGreaterThan(2);
      expect(d.detail.length).toBeGreaterThan(60);
    }
  });

  it("incluye la más incómoda: que todavía nadie compró", () => {
    const texto = construirManifiesto().knownWeaknesses.map((d) => d.what).join(" ");
    expect(texto).toMatch(/nobody has bought from us/i);
  });

  it("dice lo que NO afirma, no solo en lo que cree", () => {
    const m = construirManifiesto();
    expect(m.whatWeDoNotClaim.length).toBeGreaterThanOrEqual(4);
    expect(m.whatWeDoNotClaim.join(" ")).toMatch(/no_verificable_extralegal/);
  });

  it("el principio de null vs 0 está declarado, y el código lo cumple", () => {
    expect(construirManifiesto().whatWeBelieve.join(" ")).toMatch(/Missing data is `null`, never `0`/);
    // Y la otra mitad: que el motor de verdad devuelva null para lo extralegal.
    const linea = compararComprobante(
      [{ nombre: "Bono de productividad", valor: 500000 }],
      []
    ).lineas.find((l) => l.veredicto === "no_verificable_extralegal");
    expect(linea?.valorCalculado).toBeNull();
    expect(linea?.delta).toBeNull();
  });
});
