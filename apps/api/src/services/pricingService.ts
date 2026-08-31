// `/api/batch/pricing`: qué cuesta cada cosa, y **por qué**.
//
// ── Por qué un endpoint y no una tabla en el README ────────────────────────
//
// La idea es prestada de describe.net, que publica un `/pricing` donde cada
// tarifa viene con su defensa escrita: *"un monitor no puede pagar para
// averiguar si estás vivo"*, *"una API cuya documentación cuesta plata no la
// integra nadie"*. Leerlo deja claro dónde está la línea entre lo gratis y lo
// pagado, y —más importante— que la línea fue pensada.
//
// Nosotros teníamos el mismo razonamiento en comentarios de código y en el
// vault, o sea en ningún lugar que un comprador pueda leer. El precio estaba
// publicado; el criterio no.
//
// ── Se genera del código, como todo lo que se publica acá ──────────────────
//
// Los importes salen de `PRECIOS_USD`, la misma constante con la que el muro
// cobra. Un documento de precios escrito a mano miente el día que alguien toca
// la tabla — y de todos los documentos que este servicio publica, ese es el
// peor para mentir.
//
// ── En INGLÉS, claves incluidas (2026-08-31) ───────────────────────────────
//
// Mismo motivo y mismo bump que el quickstart: la audiencia medida son
// máquinas en inglés, y el v1 (claves en español) no tenía integradores.
import { origenPublico } from "../lib/pagosConfig.js";
import { PRECIOS_USD, RUTAS_CON_MURO } from "../lib/x402Config.js";

// El porqué de cada ruta paga. La clave es la MISMA de `PRECIOS_USD`: si se
// agrega una ruta con precio y sin motivo, la guarda de abajo lo nombra.
const WHY_IT_CHARGES: Record<string, string> = {
  "/verificar":
    "It independently recomputes every statutory line of the payslip and checks it " +
    "against the norm that governs it. That is the work, and that is what is charged — " +
    "at a flat price: NEVER based on what we find. A verifier that earns more when it " +
    "finds more is not a verifier, it is someone with an incentive.",
  "/liquidar":
    "Full payroll settlement per batch. It charges for compute, not for findings.",
  "/retencion":
    "Withholding tax (retención en la fuente): the statutory base adjustment, bracket " +
    "table and UVT in force, per employee.",
  "/pago-onchain":
    "Converts COP amounts to USDC at a frozen rate and builds a non-custodial payout batch " +
    "the payer signs; the server never signs or moves funds. It charges for compute, not custody.",
  "/comprobante":
    "Payment receipt: cross-checks the settlement, the frozen FX snapshot and the on-chain " +
    "transfer. It costs more than the rest because it crosses three layers and makes an RPC " +
    "call to the chain — the price follows the real cost, not what the data is worth to the caller.",
};

// Lo gratis, y por qué lo es. Esta lista es la que hace honesta a la otra:
// sin ella, "tenemos endpoints gratis" es una frase de marketing.
const FREE: { route: string; why: string }[] = [
  {
    route: "/verificar/prechequeo",
    why:
      "THE PROMISE THIS SERVICE CANNOT BREAK: if your payslip is clean, you find out " +
      "for free and never pay. It runs the same engine as the report and says how many " +
      "payslips carry something and how much it weighs — never which line or which " +
      "norm. Charging to discover whether there is a problem would make the verifier " +
      "someone interested in there being one.",
  },
  {
    route: "/health",
    why:
      "A monitor cannot pay to find out whether the service is alive. And it is the " +
      "answer most needed exactly when something is wrong.",
  },
  {
    route: "/pricing",
    why: "Charging for the price list would make finding out what something costs cost something.",
  },
  {
    route: "/quickstart",
    why:
      "It is the door: what this is, what is free, how payment works and what it does " +
      "NOT do. Nobody walks through a door with a toll.",
  },
  {
    route: "/openapi.json",
    why:
      "The contract is the manual, not the product. An API whose documentation costs " +
      "money gets integrated by no one.",
  },
  {
    route: "/schema/v1.json",
    why:
      "Same rule as the OpenAPI: the input contract is the manual, and a manual behind " +
      "a toll gets read by no one.",
  },
  {
    route: "/ejemplo",
    why:
      "A real input with its exact output, so a client can test itself against " +
      "something before spending. Without this, the first purchase is blind.",
  },
  {
    route: "/publickey",
    why:
      "The key that verifies EVERYTHING we emit. Charging for it would be charging " +
      "for the ability to audit us, which is exactly the opposite of what this " +
      "service claims to be.",
  },
  {
    route: "/parametros",
    why:
      "The statutory values in force are public: the State publishes them, not us. " +
      "Charging to repeat them would be charging for someone else's data.",
  },
];

export function construirPricing() {
  const base = origenPublico();

  return {
    pricingVersion: "nomicheck-pricing/v2",
    canonical: `${base}/api/batch/pricing`,
    currency: "USDC",
    networks: ["base", "avalanche"],
    howToPay:
      "x402: the endpoint answers 402 with the exact requirements, the client signs an " +
      "EIP-3009 authorization and retries with the X-PAYMENT header. No account, no API " +
      "key, no sign-up. The payment is immediate and final.",

    // La regla que ordena toda la tabla, dicha antes que los números.
    incentiveRule:
      "The price is the same with one finding or with twenty. We NEVER charge based on " +
      "what we find: the pre-check tells you for free whether there is anything, and " +
      "the report costs the same either way.",

    // Y la que se aprendió pagando: validar es gratis, siempre.
    validationIsFree:
      "A malformed body is rejected with 400 BEFORE the payment settles. In x402 the " +
      "payment is final, so charging for a client's typo would be keeping money for an " +
      "error that never even cost us compute.",

    free: FREE.map((g) => ({
      route: `/api/batch${g.route}`,
      priceUsd: 0,
      why: g.why,
    })),

    paid: RUTAS_CON_MURO.map((ruta) => ({
      route: `/api/batch${ruta}`,
      priceUsd: PRECIOS_USD[ruta],
      method: "POST",
      why: WHY_IT_CHARGES[ruta] ?? "(no reason declared — an omission, not a secret)",
    })),
  };
}

/**
 * Rutas que cobran sin motivo publicado. Vacío = todas lo declaran.
 *
 * Un precio sin defensa escrita es el que nadie revisa: se pone una vez y se
 * queda. Esto lo vigila una prueba, no una intención.
 */
export function rutasPagasSinPorque(): string[] {
  return RUTAS_CON_MURO.filter((r) => !WHY_IT_CHARGES[r]);
}
