import { describe, expect, it } from "vitest";
import { construirQuickstart } from "../quickstartService.js";
import { construirLlmsTxt } from "../llmsTxtService.js";
import { PRECIOS_USD } from "../../lib/x402Config.js";

// El quickstart y el llms.txt son la VITRINA: lo primero que ve un agente que
// llega sin contexto. Una vitrina que miente es peor que no tenerla, así que lo
// que se prueba acá no es que existan, sino que no puedan desincronizarse del
// producto que describen.
describe("quickstart", () => {
  it("el precio sale de PRECIOS_USD, no de un número escrito", () => {
    expect(construirQuickstart().informePagado.precioUsd).toBe(PRECIOS_USD["/verificar"]);
  });

  it("lo gratis es gratis y lo dice sin ambigüedad", () => {
    const q = construirQuickstart();
    expect(q.empezarGratis.precioUsd).toBe(0);
    expect(q.empezarGratis.requiereRegistro).toBe(false);
  });

  it("declara la regla de incentivos: precio fijo, no por hallazgo", () => {
    const q = construirQuickstart();
    expect(q.informePagado.precioFijo).toBe(true);
    expect(q.empezarGratis.porQueEsGratis).toMatch(/incentivo/i);
  });

  it("dice qué NO hace — el estado más peligroso es leerse como más de lo que se es", () => {
    const q = construirQuickstart();
    expect(q.queNoHace.length).toBeGreaterThanOrEqual(4);
    expect(q.queNoHace.join(" ")).toMatch(/no_verificable_extralegal/);
    expect(q.queNoHace.join(" ")).toMatch(/43\/1990/); // no es dictamen contable
  });

  it("trae la receta para verificar SIN el emisor", () => {
    const q = construirQuickstart();
    expect(q.verificarLaSalida.publicKeyId).toMatch(/^[0-9a-f]{32}$/);
    expect(q.verificarLaSalida.unClic).toContain("/verificar?url=");
  });

  it("no promete redes que el muro no rutea", () => {
    // Si algún día se agrega una red al muro, esta lista tiene que crecer con
    // ella: prometer una red que no liquida deja al comprador armando un pago
    // que nadie cobra, y el error le aparece a ÉL.
    expect(construirQuickstart().informePagado.pago.redes).toEqual(["base", "avalanche"]);
  });
});

describe("llms.txt", () => {
  it("es texto plano con el título del servicio, no HTML", () => {
    const t = construirLlmsTxt();
    expect(t.startsWith("# NomiCheck")).toBe(true);
    expect(t).not.toContain("<!doctype");
    expect(t).not.toContain("<html");
  });

  it("manda al quickstart primero: una llamada y el agente sabe todo", () => {
    expect(construirLlmsTxt()).toContain("/api/batch/quickstart");
  });

  it("el precio que anuncia es el que cobra el muro", () => {
    expect(construirLlmsTxt()).toContain(`${PRECIOS_USD["/verificar"]} USD`);
  });

  it("lo gratis aparece ANTES que lo pagado", () => {
    const t = construirLlmsTxt();
    expect(t.indexOf("## Gratis")).toBeLessThan(t.indexOf("## Pagado"));
  });

  it("incluye la sección de lo que NO hace", () => {
    expect(construirLlmsTxt()).toContain("## Qué NO hace");
  });
});
