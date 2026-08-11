// Tests de la traducción v2 -> v1 hacia el facilitador.
//
// Lo que protegen no es un formato: es el único modo de falla que este muro
// tiene y que NO se ve desde acá. El comprador firma bien, el 402 se ve
// impecable, y la liquidación muere del lado del facilitador — así que la
// pérdida se lee como "nadie quiso comprar" en vez de como un error.
//
// Medido el 2026-08-03 contra `facilitator.ultravioletadao.xyz` v1.66.1: sus
// `/settle` y `/verify` rechazan exactamente los tres campos que se afirman
// abajo, mientras su `/accepts` acepta los de v2. faremeter 0.22.0 —la última
// publicada— manda v2 siempre.
import { describe, expect, it } from "vitest";
import {
  AVALANCHE_MAINNET,
  BASE_MAINNET,
  BASE_SEPOLIA,
  extensionBazaar,
  perfilFacilitador,
} from "../x402Config.js";
import { EJEMPLO_RETENCION, EJEMPLO_VERIFICACION } from "../ejemplosBatch.js";
import { aFormatoV1, gruposPorFacilitador, redDelPago } from "../x402Muro.js";

/** Lo que faremeter 0.22.0 manda de verdad, copiado de la corrida real. */
const CUERPO_V2 = {
  paymentRequirements: {
    scheme: "exact",
    network: "eip155:8453",
    amount: "20000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0xb345895e8B5EB66A3480641674cbEb878E0b0070",
    maxTimeoutSeconds: 30,
    extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
  },
  paymentPayload: {
    x402Version: 2,
    accepted: { scheme: "exact", network: "eip155:8453", amount: "20000" },
    payload: {
      signature: `0x${"11".repeat(65)}`,
      authorization: {
        from: "0x8f6d22499439eb466fe12e31a98eaba0bfcf142a",
        to: "0xb345895e8B5EB66A3480641674cbEb878E0b0070",
        value: "20000",
        validAfter: "0",
        validBefore: "9999999999",
        nonce: `0x${"22".repeat(32)}`,
      },
    },
    resource: {
      url: "https://nomicheck.ynt.codes/api/batch/verificar",
      description: "NomiCheck batch verification.",
    },
  },
};

type Traducido = {
  x402Version: number;
  paymentRequirements: Record<string, unknown>;
  paymentPayload: Record<string, unknown>;
};

const traducir = (red = BASE_MAINNET) => aFormatoV1(CUERPO_V2, red) as Traducido;

describe("aFormatoV1", () => {
  it("manda el nombre v1 de la red, no el CAIP-2", () => {
    // `unknown variant 'eip155:8453', expected one of ... 'base' ...`
    const t = traducir();
    expect(t.paymentRequirements.network).toBe("base");
    expect(t.paymentPayload.network).toBe("base");
    expect(JSON.stringify(t)).not.toContain("eip155:");
  });

  it("renombra `amount` a `maxAmountRequired` conservando el monto", () => {
    // `missing field maxAmountRequired`
    const t = traducir();
    expect(t.paymentRequirements.maxAmountRequired).toBe("20000");
    expect(t.paymentRequirements.amount).toBeUndefined();
  });

  it("pone `x402Version` arriba del todo", () => {
    // `missing field x402Version`
    expect(traducir().x402Version).toBe(1);
  });

  it("no toca la firma ni la autorización", () => {
    // La firma cubre el `transferWithAuthorization`, no el sobre. Si esta
    // prueba falla, el facilitador rechazaría pagos legítimos por firma
    // inválida y el comprador no tendría forma de saber por qué.
    expect(traducir().paymentPayload.payload).toEqual(CUERPO_V2.paymentPayload.payload);
  });

  it("aplana el recurso a los tres campos sueltos de v1", () => {
    const req = traducir().paymentRequirements;
    expect(req.resource).toBe("https://nomicheck.ynt.codes/api/batch/verificar");
    expect(req.description).toBe("NomiCheck batch verification.");
    expect(req.mimeType).toBe("application/json");
  });

  it("descarta `accepted`, que v1 no conoce", () => {
    expect(traducir().paymentPayload.accepted).toBeUndefined();
  });

  it("usa el nombre de la red configurada, no uno escrito a mano", () => {
    // Si esto se hardcodeara a "base", encender el muro en Sepolia liquidaría
    // —o intentaría liquidar— contra mainnet.
    expect(traducir(BASE_SEPOLIA).paymentRequirements.network).toBe("base-sepolia");
  });

  it("no inventa una descripción cuando el recurso no la trae", () => {
    const sinDesc = {
      ...CUERPO_V2,
      paymentPayload: { ...CUERPO_V2.paymentPayload, resource: { url: "https://x/y" } },
    };
    const t = aFormatoV1(sinDesc, BASE_MAINNET) as Traducido;
    expect(t.paymentRequirements.description).toBe("");
  });
});

describe("redDelPago", () => {
  // El punto donde el multired se rompe en silencio: traducir a v1 con la red
  // equivocada le dice al facilitador que busque la transacción en una cadena
  // donde nunca estuvo, y desde acá se ve como "nadie quiso comprar".
  const DOS = [BASE_MAINNET, AVALANCHE_MAINNET];

  it("con una sola red configurada la devuelve sin mirar el cuerpo", () => {
    // Es el comportamiento anterior al multired: un cuerpo sin `network` no
    // puede romper un despliegue que hoy funciona.
    expect(redDelPago([BASE_MAINNET], {})).toBe(BASE_MAINNET);
  });

  it("resuelve por el CAIP-2 que declaró el comprador", () => {
    const cuerpo = { paymentRequirements: { network: "eip155:43114" } };
    expect(redDelPago(DOS, cuerpo)).toBe(AVALANCHE_MAINNET);
  });

  it("acepta también el nombre v1, que es lo que un cliente viejo declara", () => {
    const cuerpo = { paymentRequirements: { network: "avalanche" } };
    expect(redDelPago(DOS, cuerpo)).toBe(AVALANCHE_MAINNET);
  });

  it("mira el paymentPayload cuando los requirements no traen red", () => {
    const cuerpo = { paymentPayload: { network: "eip155:43114" } };
    expect(redDelPago(DOS, cuerpo)).toBe(AVALANCHE_MAINNET);
  });

  it("REVIENTA ante una red no anunciada, en vez de caer a la primera", () => {
    // Liquidar contra la red equivocada es peor que no liquidar: el comprador
    // ya firmó, y el error aparecería como "transacción no encontrada".
    const cuerpo = { paymentRequirements: { network: "eip155:1" } };
    expect(() => redDelPago(DOS, cuerpo)).toThrow(/no está entre las anunciadas/);
  });

  it("REVIENTA con dos redes y un cuerpo sin red declarada", () => {
    expect(() => redDelPago(DOS, {})).toThrow(/no está entre las anunciadas/);
  });

  it("cada facilitador recibe SOLO sus redes", () => {
    // Producción cobra Base por CDP —ahí vive el catálogo del Bazaar— y CDP no
    // liquida Avalanche. Un handler global con todas las redes le mandaría a
    // CDP pagos que no puede liquidar, y el fallo aparecería como settle muerto.
    const cfg = {
      activo: true,
      facilitatorURL: "https://api.cdp.coinbase.com/platform/v2/x402",
      facilitadoresPorRed: { avalanche: "https://facilitator.ultravioletadao.xyz" },
      redes: [BASE_MAINNET, AVALANCHE_MAINNET],
      redesInvalidas: [],
      payTo: "0x1111111111111111111111111111111111111111",
      origenPublico: "https://nomicheck.ynt.codes",
    };
    expect(gruposPorFacilitador(cfg)).toEqual([
      { url: "https://api.cdp.coinbase.com/platform/v2/x402", redes: [BASE_MAINNET] },
      { url: "https://facilitator.ultravioletadao.xyz", redes: [AVALANCHE_MAINNET] },
    ]);
  });

  it("sin overrides queda un solo grupo con todas las redes", () => {
    // El comportamiento de siempre: un facilitador, un handler.
    const cfg = {
      activo: true,
      facilitatorURL: "https://facilitator.ultravioletadao.xyz",
      facilitadoresPorRed: {},
      redes: [BASE_MAINNET, AVALANCHE_MAINNET],
      redesInvalidas: [],
      payTo: "0x1111111111111111111111111111111111111111",
      origenPublico: "https://nomicheck.ynt.codes",
    };
    expect(gruposPorFacilitador(cfg)).toEqual([
      { url: "https://facilitator.ultravioletadao.xyz", redes: [BASE_MAINNET, AVALANCHE_MAINNET] },
    ]);
  });

  it("el pago en Avalanche se traduce con el nombre de Avalanche", () => {
    // La integración completa: el mismo cuerpo v2 que manda faremeter, con la
    // red cambiada, tiene que salir hacia el facilitador como "avalanche".
    const cuerpo = {
      ...CUERPO_V2,
      paymentRequirements: { ...CUERPO_V2.paymentRequirements, network: "eip155:43114" },
    };
    const t = aFormatoV1(cuerpo, redDelPago(DOS, cuerpo)) as Traducido;
    expect(t.paymentRequirements.network).toBe("avalanche");
    expect(t.paymentPayload.network).toBe("avalanche");
  });
});

// Perfiles de facilitador. Cada campo de estos es la diferencia entre cobrar y
// no cobrar, y ninguno se nota desde acá: el 402 se ve igual en los dos casos.
describe("perfilFacilitador", () => {
  const CDP = "https://api.cdp.coinbase.com/platform/v2/x402";
  const UV = "https://facilitator.ultravioletadao.xyz";

  it("a CDP no le traduce a v1: habla v2 con CAIP-2", () => {
    // Medido: `/supported` de CDP declara eip155:8453 + exact + x402Version 2.
    // Mandarle v1 sería romper pagos que hoy funcionan.
    const p = perfilFacilitador(CDP);
    expect(p.traduceAV1).toBe(false);
    expect(p.versionEnCuerpo).toBe(2);
  });

  it("a CDP le sintetiza /accepts, que no existe", () => {
    // 404 medido. faremeter lo pide siempre, así que sin esto ningún 402 sale.
    expect(perfilFacilitador(CDP).sintetizaAccepts).toBe(true);
  });

  it("solo CDP lleva autenticación", () => {
    expect(perfilFacilitador(CDP).autenticaCdp).toBe(true);
    expect(perfilFacilitador(UV).autenticaCdp).toBe(false);
  });

  it("a Ultravioleta sí le traduce a v1", () => {
    const p = perfilFacilitador(UV);
    expect(p.traduceAV1).toBe(true);
    expect(p.versionEnCuerpo).toBe(1);
    expect(p.sintetizaAccepts).toBe(false);
  });

  it("un facilitador desconocido se trata como el ESTÁNDAR, sin remiendos", () => {
    // Al revés —"lo desconocido habla v1"— un facilitador nuevo heredaría los
    // defectos de Ultravioleta sin que nadie lo hubiera decidido.
    const p = perfilFacilitador("https://facilitador.nuevo.example");
    expect(p.traduceAV1).toBe(false);
    expect(p.sintetizaAccepts).toBe(false);
    expect(p.autenticaCdp).toBe(false);
    expect(p.versionEnCuerpo).toBe(2);
  });

  it("una URL rota no habilita remiendos por accidente", () => {
    const p = perfilFacilitador("no-es-una-url");
    expect(p.traduceAV1).toBe(false);
    expect(p.autenticaCdp).toBe(false);
  });
});

// La extensión que nos mete al catálogo de Coinbase. Lo que se declara acá es
// el contrato que un agente lee ANTES de pagar: si miente, el comprador paga y
// recibe un 400, y del lado de él parece que el roto es él.
describe("extensionBazaar", () => {
  it("solo declara rutas cuyo ejemplo servimos de verdad", () => {
    // `/liquidar`, `/pago-onchain` y `/comprobante` no tienen `/ejemplo`
    // publicado. Declararlos exigiría inventarles la forma de entrada, y una
    // forma inventada en el catálogo se cobra igual que una buena.
    expect(extensionBazaar("/verificar")).toBeDefined();
    expect(extensionBazaar("/retencion")).toBeDefined();
    expect(extensionBazaar("/liquidar")).toBeUndefined();
    expect(extensionBazaar("/pago-onchain")).toBeUndefined();
    expect(extensionBazaar("/comprobante")).toBeUndefined();
  });

  it("publica EXACTAMENTE el mismo ejemplo que sirve /ejemplo", () => {
    // El día que se separen, el Bazaar anuncia una forma que el endpoint
    // rechaza. Los dos leen `ejemplosBatch.ts`; esto lo comprueba.
    const ext = extensionBazaar("/verificar") as {
      info: { input: { body: unknown } };
    };
    expect(ext.info.input.body).toBe(EJEMPLO_VERIFICACION);
    const ret = extensionBazaar("/retencion") as { info: { input: { body: unknown } } };
    expect(ret.info.input.body).toBe(EJEMPLO_RETENCION);
  });

  it("el ejemplo cumple el schema que se declara al lado", () => {
    // CDP valida esto ESTRICTO y rechaza la extensión si no cuadra — y el
    // rechazo solo se ve al liquidar, o sea después de cobrar.
    const ext = extensionBazaar("/verificar") as {
      info: { input: Record<string, unknown> };
      schema: { properties: { input: { properties: Record<string, unknown>; required: string[] } } };
    };
    const declarados = Object.keys(ext.schema.properties.input.properties);
    // `additionalProperties: false` => toda clave del ejemplo tiene que estar
    // declarada, o la validación falla.
    for (const clave of Object.keys(ext.info.input)) {
      expect(declarados).toContain(clave);
    }
    for (const requerido of ext.schema.properties.input.required) {
      expect(ext.info.input[requerido]).toBeDefined();
    }
  });

  it("se declara descubrible y como POST con cuerpo JSON", () => {
    const ext = extensionBazaar("/verificar") as {
      discoverable: boolean;
      info: { input: { method: string; type: string; bodyType: string } };
    };
    expect(ext.discoverable).toBe(true);
    expect(ext.info.input.method).toBe("POST");
    expect(ext.info.input.type).toBe("http");
    expect(ext.info.input.bodyType).toBe("json");
  });
});
