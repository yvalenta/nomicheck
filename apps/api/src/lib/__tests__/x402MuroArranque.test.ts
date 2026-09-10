// El wiring real entre Parte 1 y Parte 3 del brief DX402 punto 2: dentro de
// `montarMuroX402`, `x402Muro.ts:404` llama
// `problemasDeConfig(cfg, sobreConfigurado())` — el `sobreConfigurado()` DE
// VERDAD, no uno inyectado — así que un deployment con `/verificar/durable`
// activa (está en `RUTAS_CON_MURO` sin condición) pero sin
// `NOMICHECK_SOBRE_SIGNING_KEY_PEM` configurada tiene que reventar al
// arrancar, igual que `sinEsquema`.
//
// Esa línea es la única que junta las dos piezas, y ningún otro test la
// ejercita: `x402Config.test.ts` (describe "sobreProblema") prueba
// `problemasDeConfig` con un string INYECTADO a mano; `sobreSignatureService
// .test.ts` prueba `sobreConfigurado()` aislado; `x402MuroGet.test.ts`
// SIEMPRE setea la env en su `beforeAll` antes de llamar a
// `montarMuroX402`, así que solo cubre "está bien configurada, no revienta".
// Si alguien reemplazara la línea real por, por ejemplo,
// `problemasDeConfig(cfg, null)`, ninguno de esos tests lo notaría — este sí.
import express from "express";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { montarMuroX402 } from "../x402Muro.js";

const PAY_TO_LIMPIA = "0x1111111111111111111111111111111111111111";

afterEach(() => {
  delete process.env.X402_ACTIVO;
  delete process.env.DX402_ACTIVO;
  delete process.env.X402_PAY_TO;
  delete process.env.X402_RED;
  delete process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM;
});

describe("montarMuroX402 sin NOMICHECK_SOBRE_SIGNING_KEY_PEM", () => {
  it("revienta al arrancar — no espera al primer comprador de /verificar/durable", () => {
    process.env.X402_ACTIVO = "true";
    process.env.DX402_ACTIVO = "true";
    process.env.X402_PAY_TO = PAY_TO_LIMPIA;
    // Avalanche presente a propósito: así el ÚNICO problema posible es el de
    // la llave del sobre, no la falta de red (eso ya lo prueba
    // `x402Config.test.ts`, describe "requisitos de red por ruta", por
    // separado — mezclar los dos acá dejaría la aserción de abajo sin poder
    // distinguir cuál de los dos reventó).
    process.env.X402_RED = "base,avalanche";
    delete process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM;

    expect(() => montarMuroX402(express())).toThrow(/NOMICHECK_SOBRE_SIGNING_KEY_PEM no está configurada/);
  });
});

// La flag `DX402_ACTIVO` (2026-09-10): el mismo wiring real, con la flag
// apagada. Es el deploy que la flag vino a permitir — muro encendido, sin la
// llave del sobre y sin Avalanche — y tiene que ARRANCAR. Si alguien
// volviera a `problemasDeConfig(cfg, sobreConfigurado())` sin condicionar,
// o a `rutasPagasSinEsquema(RUTAS_CON_MURO)`, este test lo nota.
describe("montarMuroX402 con DX402_ACTIVO apagada", () => {
  it("arranca sin NOMICHECK_SOBRE_SIGNING_KEY_PEM y sin Avalanche en X402_RED", () => {
    process.env.X402_ACTIVO = "true";
    delete process.env.DX402_ACTIVO;
    process.env.X402_PAY_TO = PAY_TO_LIMPIA;
    process.env.X402_RED = "base";
    delete process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM;

    expect(() => montarMuroX402(express())).not.toThrow();
  });

  it("`DX402_ACTIVO=false` explícito es lo mismo que ausente", () => {
    process.env.X402_ACTIVO = "true";
    process.env.DX402_ACTIVO = "false";
    process.env.X402_PAY_TO = PAY_TO_LIMPIA;
    process.env.X402_RED = "base";
    delete process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM;

    expect(() => montarMuroX402(express())).not.toThrow();
  });

  it("apagada, con la llave DECLARADA pero rota, revienta nombrando la llave", () => {
    // La flag no exige la llave, pero si el operador la declaró es porque los
    // sobres ya vendidos verifican contra ella (90 días): declarada y rota es
    // una revocación silenciosa, y se acusa al arrancar como cualquier config
    // rota (segundo refutador, 2026-09-10).
    process.env.X402_ACTIVO = "true";
    delete process.env.DX402_ACTIVO;
    process.env.X402_PAY_TO = PAY_TO_LIMPIA;
    process.env.X402_RED = "base";
    process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM = "-----BEGIN PRIVATE KEY-----\ntruncada\n";

    expect(() => montarMuroX402(express())).toThrow(/NOMICHECK_SOBRE_SIGNING_KEY_PEM está configurada pero no es un PEM/);
  });

  it("apagada, con la llave declarada y válida, arranca sin Avalanche", () => {
    process.env.X402_ACTIVO = "true";
    delete process.env.DX402_ACTIVO;
    process.env.X402_PAY_TO = PAY_TO_LIMPIA;
    process.env.X402_RED = "base";
    process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM = generateKeyPairSync("ed25519")
      .privateKey.export({ format: "pem", type: "pkcs8" })
      .toString();

    expect(() => montarMuroX402(express())).not.toThrow();
  });

  it("encendida sin Avalanche revienta nombrando la ruta y la red, no la llave", () => {
    process.env.X402_ACTIVO = "true";
    process.env.DX402_ACTIVO = "true";
    process.env.X402_PAY_TO = PAY_TO_LIMPIA;
    process.env.X402_RED = "base";
    delete process.env.NOMICHECK_SOBRE_SIGNING_KEY_PEM;

    // Los dos problemas juntos, en el mismo error: la red y la llave. Reventar
    // por uno solo escondería el otro hasta el siguiente deploy.
    expect(() => montarMuroX402(express())).toThrow(/verificar\/durable.*eip155:43114[\s\S]*NOMICHECK_SOBRE_SIGNING_KEY_PEM/);
  });
});
