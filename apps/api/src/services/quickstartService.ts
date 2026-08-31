// El quickstart: TODO lo que un agente comprador necesita, en una sola llamada.
//
// ── Por qué existe ─────────────────────────────────────────────────────────
//
// Las piezas ya estaban: `/schema/v1.json`, `/ejemplo`, `/publickey`,
// `/parametros`, `/openapi.json` y el pre-chequeo gratis. Pero estaban
// DESPARRAMADAS: un comprador-bot tenía que descubrirlas de a una, adivinando
// nombres, y ninguna le decía cuánto cuesta ni qué NO hace el servicio.
//
// La idea es prestada de un paquete ajeno que hace bien la distribución hacia
// agentes (ARC/culture.sbs, 2026-08-14): un solo GET que responde qué es,
// cuánto cuesta, cómo se paga, cómo se verifica y qué NO hace. Copiamos la
// forma, no su modelo de negocio.
//
// ── Por qué se GENERA y no se escribe ──────────────────────────────────────
//
// Un documento de bienvenida escrito a mano miente el día que cambia un
// precio. Acá el precio sale de `PRECIOS_USD` —la misma constante que usa el
// muro para cobrar— y la llave y el catálogo salen de quien los sirve. Si el
// muro cobra otra cosa, este documento cambia solo. Es la ley de la casa
// aplicada a la vitrina: una sola fuente por cifra.
//
// ── En INGLÉS, claves incluidas (2026-08-31, pedido de Yonatan) ────────────
//
// La audiencia medida son máquinas que operan en inglés. Las claves también
// son interfaz para ese lector, así que el schema pasó de
// `nomicheck-quickstart/v1` (claves en español) a `/v2` (inglés). El v1 nunca
// tuvo compradores integrados —medido: cero órdenes—, por eso el cambio es
// ahora y no después. Dos precisiones DELIBERADAS sobre el original: el
// "in COP" del pre-chequeo (cierto: el delta suma pesos) y `limits.docs`
// apuntando al OpenAPI (el /schema/v1.json pelado es solo el de /liquidar).
import { origenPublico } from "../lib/pagosConfig.js";
import { PRECIOS_USD } from "../lib/x402Config.js";
import { obtenerPublicKeyId } from "./batchSignatureService.js";
import { REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";

export function construirQuickstart() {
  // El origen sale de donde ya vive (pagosConfig): una sola fuente para todas
  // las URLs que este servicio publica de sí mismo.
  const base = origenPublico();
  const precioVerificar = PRECIOS_USD["/verificar"];

  return {
    schemaVersion: "nomicheck-quickstart/v2",
    canonical: `${base}/api/batch/quickstart`,

    whatIs:
      "Deterministic verification of Colombian payslips (nómina). It independently " +
      "recomputes the statutory lines — base salary, transport allowance, health, " +
      "pension and solidarity fund — and compares them against what the payslip " +
      "declares. Zero AI in the calculation: same input, same output.",

    // Lo primero que ve el lector es lo GRATIS, a propósito: si su comprobante
    // está limpio se entera sin pagar y no vuelve. Esa es la promesa publicada.
    startFree: {
      url: `${base}/api/batch/verificar/prechequeo`,
      method: "POST",
      priceUsd: 0,
      signupRequired: false,
      returns:
        "How many payslips carry discrepancies and their net effect in COP. " +
        "Never which line or which norm: that is the paid report.",
      sameEngine:
        "Runs the same calculation as the report. If the pre-check says N, the report finds N.",
      whyFree:
        "Charging based on what we find is the incentive a verifier must not have. " +
        "If your payslip is clean, you find out for free and never pay.",
    },

    paidReport: {
      url: `${base}/api/batch/verificar`,
      method: "POST",
      priceUsd: precioVerificar,
      flatPrice: true,
      payment: {
        protocol: "x402",
        howItWorks:
          "The endpoint answers 402 with the exact requirements; the client signs an " +
          "EIP-3009 authorization and retries with the X-PAYMENT header. No account, no API key.",
        networks: ["base", "avalanche"],
        currency: "USDC",
      },
      returns:
        "A verdict per line (correcto | pagado_de_mas | pagado_de_menos | " +
        "faltante_en_comprobante | no_verificable_extralegal), the value the law " +
        "mandates, the norm that governs it, and the estimated net effect. All inside " +
        "an Ed25519-signed envelope.",
    },

    // La diferencia con cualquier otro verificador, y por eso va con su receta.
    verifyTheOutput: {
      whatIs:
        "The output is a signed envelope: it can be checked WITHOUT talking to this " +
        "server and without trusting the issuer. The signature covers the whole document.",
      publicKey: `${base}/api/batch/publickey`,
      publicKeyId: obtenerPublicKeyId(),
      oneClick: `https://ynt.codes/verificar?url=${base}/api/batch/verificar/ejemplo`,
      format: "https://github.com/yvalenta/sobre",
      offline:
        "Four independent implementations (Ruby, Node, browser, and one written by a " +
        "third party from the specification alone) produce the same bytes.",
    },

    tryBeforePaying: {
      example: `${base}/api/batch/verificar/ejemplo`,
      whatItCarries: "A real input and its exact output. POST it and compare.",
      schema: `${base}/api/batch/verificar/schema/v1.json`,
      openapi: `${base}/api/batch/openapi.json`,
      health: `${base}/api/batch/health`,
      legalParameters: `${base}/api/batch/parametros`,
    },

    provenance: {
      rulesVerifiedAt: REGLAS_VERIFICADAS_AL,
      whatItMeans:
        "The date a human checked the legal catalog against the published norms. " +
        "Every output also carries `reglasHash`: two reports with the same hash were " +
        "computed against the same catalog and are comparable with each other.",
    },

    // Prestado del mismo paquete ajeno, y es la parte más honesta que tienen:
    // decir qué NO hace evita el peor estado de un verificador, que es el que
    // se lee como más de lo que es (§6.1 de la spec del sobre).
    whatItDoesNot: [
      "It is not an accounting opinion or legal advice (Colombian Law 43/1990).",
      "It does not verify bonuses, commissions or other extralegal concepts: with no " +
        "legal basis to derive them, they come back marked `no_verificable_extralegal`.",
      "A `correcto` verdict says the line is derivable from the declared catalog, " +
        "not that that catalog is the one in force today. That is what `reglasVerificadasAl` " +
        "is for (served here as `provenance.rulesVerifiedAt`).",
      "It does not persist batch data (Colombian Law 1581/2012, habeas data). There is " +
        "no history to query afterwards.",
      "It does not compute your payroll: it verifies one that already exists.",
    ],

    manifest: {
      url: `${base}/api/batch/manifiesto`,
      whatItCarries:
        "What we believe, what we do NOT claim, and the weaknesses we know about — " +
        "dated. Including the most uncomfortable one: nobody has bought from us yet.",
    },

    limits: {
      docs: `${base}/api/batch/openapi.json`,
      note: "Each route's schema publishes its per-batch caps as `maxItems`.",
    },
  };
}
