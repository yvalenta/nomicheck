// Tests de la configuración del muro de pago x402.
//
// El foco no son los precios sino las tres formas de perder plata en silencio:
//
//   1. que el muro se encienda cobrando a la wallet comprometida (en x402 el
//      pago es directo y final: quien tenga la clave se lleva el saldo),
//   2. que se encienda mal configurado y falle recién cuando llegue el primer
//      comprador, en vez de no dejar levantar el servicio,
//   3. que un endpoint quede con muro pero sin precio, o al revés.
//
// El caso 1 es el que motivó estos tests: encender el muro NO depende de rotar
// la wallet del executor, porque `payTo` solo RECIBE. Pero eso solo es cierto
// si algo impide mecánicamente apuntarle a la dirección vieja.
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  BASE_MAINNET,
  BASE_SEPOLIA,
  DESCRIPCIONES,
  PRECIOS_USD,
  RUTAS_CON_MURO,
  WALLET_COMPROMETIDA,
  leerConfigX402,
  problemasDeConfig,
  requisitosDePago,
  soloAscii,
} from "../x402Config.js";
import { rutasPublicasConMuro } from "../x402Muro.js";

const LIMPIA = "0x1111111111111111111111111111111111111111";

const base = (over: Partial<ReturnType<typeof leerConfigX402>> = {}) => ({
  activo: true,
  facilitatorURL: "https://facilitator.ultravioletadao.xyz",
  red: BASE_MAINNET,
  payTo: LIMPIA,
  origenPublico: "https://nomicheck.ynt.codes",
  ...over,
});

describe("problemasDeConfig", () => {
  it("no exige nada mientras el muro esté apagado", () => {
    // Es lo que permite desplegar el código sin tocar producción.
    expect(problemasDeConfig(base({ activo: false, payTo: "" }))).toEqual([]);
  });

  it("acepta una dirección de cobro limpia", () => {
    expect(problemasDeConfig(base())).toEqual([]);
  });

  it("rechaza encender el muro sin payTo", () => {
    expect(problemasDeConfig(base({ payTo: "" }))).toHaveLength(1);
  });

  it("rechaza una dirección que no es EVM", () => {
    expect(problemasDeConfig(base({ payTo: "0xabc" }))).toHaveLength(1);
  });

  it("rechaza cobrar a la wallet del executor, cuya clave está expuesta", () => {
    const p = problemasDeConfig(base({ payTo: WALLET_COMPROMETIDA }));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/clave está expuesta/);
  });

  it("la rechaza también escrita en checksum EIP-55", () => {
    // La misma dirección se escribe de dos formas. Un `===` crudo contra la
    // constante en minúsculas dejaría pasar la que se copia de un explorador,
    // que es justamente la forma en que llegaría al `.env`.
    const eip55 = "0x5BdAD1d8641D8fD71EFADDF38A2E0b9854Ad05b8";
    expect(eip55.toLowerCase()).toBe(WALLET_COMPROMETIDA);
    expect(problemasDeConfig(base({ payTo: eip55 }))[0]).toMatch(/clave está expuesta/);
  });

  it("exige https en el facilitador", () => {
    const p = problemasDeConfig(base({ facilitatorURL: "http://facilitator.local" }));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/https/);
  });
});

describe("leerConfigX402", () => {
  const previo = { ...process.env };
  beforeEach(() => {
    for (const k of Object.keys(process.env)) if (k.startsWith("X402_")) delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...previo };
  });

  it("está apagado si nadie lo enciende", () => {
    expect(leerConfigX402().activo).toBe(false);
  });

  it("solo lo enciende el literal 'true'", () => {
    // Un `X402_ACTIVO=1` o `=yes` debe dejarlo apagado: fallar hacia gratis es
    // recuperable, fallar hacia cobrar mal no lo es.
    for (const v of ["1", "yes", "TRUE", "si"]) {
      process.env.X402_ACTIVO = v;
      expect(leerConfigX402().activo).toBe(false);
    }
    process.env.X402_ACTIVO = "true";
    expect(leerConfigX402().activo).toBe(true);
  });

  it("usa mainnet salvo que se pida sepolia explícitamente", () => {
    expect(leerConfigX402().red).toEqual(BASE_MAINNET);
    process.env.X402_RED = "base-sepolia";
    expect(leerConfigX402().red).toEqual(BASE_SEPOLIA);
  });

  it("le quita la barra final al origen público", () => {
    // Sin esto el `resource` sale con `//api/batch/...` y no coincide con la
    // URL que el comprador pidió ni con la que se registra en el Bazaar.
    process.env.NOMICHECK_PUBLIC_ORIGIN = "https://nomicheck.ynt.codes/";
    expect(requisitosDePago(leerConfigX402(), "/verificar").resource).toBe(
      "https://nomicheck.ynt.codes/api/batch/verificar",
    );
  });
});

describe("requisitosDePago", () => {
  it("convierte dólares a micro-USDC", () => {
    expect(requisitosDePago(base(), "/verificar").maxAmountRequired).toBe("100000");
    expect(requisitosDePago(base(), "/comprobante").maxAmountRequired).toBe("250000");
  });

  it("revienta ante una ruta sin precio en vez de cobrar cero", () => {
    expect(() => requisitosDePago(base(), "/inventada")).toThrow(/no hay precio/);
  });

  it("publica la red en CAIP-2, que es lo que espera el facilitador", () => {
    expect(requisitosDePago(base(), "/verificar").network).toBe("eip155:8453");
    expect(requisitosDePago(base({ red: BASE_SEPOLIA }), "/verificar").network).toBe(
      "eip155:84532",
    );
  });
});

describe("cobertura de rutas", () => {
  it("toda ruta con muro tiene precio", () => {
    // `RUTAS_CON_MURO` se deriva de `PRECIOS_USD`, así que esto sujeta la
    // derivación: si alguien la desacopla, una ruta podría montarse con muro y
    // reventar al primer comprador.
    for (const ruta of RUTAS_CON_MURO) {
      expect(() => requisitosDePago(base(), ruta)).not.toThrow();
    }
    expect(RUTAS_CON_MURO).toEqual(Object.keys(PRECIOS_USD));
  });

  it("los GET de integración y verificación quedan fuera del muro", () => {
    // Ponerle precio a la llave pública rompe el producto: nadie podría
    // comprobar una salida firmada sin pagar otra vez.
    for (const gratis of ["/publickey", "/parametros", "/schema/v1.json", "/verificar/ejemplo"]) {
      expect(RUTAS_CON_MURO).not.toContain(gratis);
    }
  });

  it("cubre el /csv de cada ruta que lo tiene", () => {
    // El CSV entrega el mismo cálculo en otro formato: sin muro sería la forma
    // gratis de saltárselo. `/comprobante` no tiene variante CSV.
    const publicas = rutasPublicasConMuro().map((r) => r.publica);
    expect(publicas).toContain("/api/batch/verificar");
    expect(publicas).toContain("/api/batch/verificar/csv");
    expect(publicas).toContain("/api/batch/comprobante");
    expect(publicas).not.toContain("/api/batch/comprobante/csv");
    expect(publicas).toHaveLength(9);
  });

  it("el /csv cuesta lo mismo que su ruta base", () => {
    const porPublica = new Map(rutasPublicasConMuro().map((r) => [r.publica, r.precio]));
    expect(porPublica.get("/api/batch/liquidar/csv")).toBe(
      porPublica.get("/api/batch/liquidar"),
    );
  });
});

describe("descripciones publicadas", () => {
  it("hay una por cada ruta con precio", () => {
    expect(Object.keys(DESCRIPCIONES).sort()).toEqual(Object.keys(PRECIOS_USD).sort());
    for (const ruta of RUTAS_CON_MURO) {
      expect(requisitosDePago(base(), ruta).description.length).toBeGreaterThan(20);
    }
  });

  it("son ASCII, porque el middleware las serializa con btoa", () => {
    // Esto no es purismo: un guion largo (U+2014) hace que `btoa` tire
    // InvalidCharacterError y el endpoint conteste 500 en vez de 402. Pasó de
    // verdad probando contra el facilitador; el test existe para que no vuelva.
    for (const [ruta, d] of Object.entries(DESCRIPCIONES)) {
      expect(soloAscii(d), `${ruta} tiene caracteres que rompen btoa`).toBe(true);
      expect(() => btoa(d)).not.toThrow();
    }
  });

  it("soloAscii detecta lo que rompe", () => {
    expect(soloAscii("NomiCheck payroll")).toBe(true);
    expect(soloAscii("NomiCheck — payroll")).toBe(false);
    expect(soloAscii("catálogo")).toBe(false);
  });
});
