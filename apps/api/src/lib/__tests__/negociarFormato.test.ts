import { describe, expect, it } from "vitest";
import { negociarFormato } from "../negociarFormato.js";

// La negociación decide QUÉ ve cada cliente en la portada: un navegador la
// página, un agente el markdown. El fallo caro no es elegir mal — es que un
// navegador reciba markdown crudo o un 406, así que la mitad de estas pruebas
// afirman que lo raro degrada a HTML y solo lo explícito llega a markdown.
describe("negociarFormato", () => {
  it("sin encabezado Accept: HTML — un cliente que no pide, recibe la página", () => {
    expect(negociarFormato(undefined)).toBe("html");
    expect(negociarFormato("")).toBe("html");
    expect(negociarFormato("   ")).toBe("html");
  });

  it("Accept: text/markdown a secas — el caso del agente — da markdown", () => {
    expect(negociarFormato("text/markdown")).toBe("markdown");
  });

  it("el Accept real de un navegador da HTML", () => {
    expect(
      negociarFormato(
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      ),
    ).toBe("html");
  });

  it("el */* de curl da HTML, no markdown", () => {
    expect(negociarFormato("*/*")).toBe("html");
  });

  it("honra q-values: gana el tipo con más q, en las dos direcciones", () => {
    expect(negociarFormato("text/html;q=0.2, text/markdown")).toBe("markdown");
    expect(negociarFormato("text/markdown;q=0.1, text/html;q=0.9")).toBe("html");
  });

  it("en empate de q gana HTML — cubre text/* y las listas sin q", () => {
    expect(negociarFormato("text/*")).toBe("html");
    expect(negociarFormato("text/markdown, text/html")).toBe("html");
  });

  it("el rango MÁS específico decide la q de su tipo (RFC 9110)", () => {
    // text/html tiene q explícita 0.1; markdown hereda 0.9 del comodín.
    expect(negociarFormato("text/*;q=0.9, text/html;q=0.1")).toBe("markdown");
    // markdown explícito por encima del comodín bajo.
    expect(negociarFormato("text/*;q=0.3, text/markdown;q=0.9")).toBe("markdown");
  });

  it("un Accept que excluye a los dos formatos es null — el 406 del handler", () => {
    expect(negociarFormato("application/json")).toBeNull();
    expect(negociarFormato("image/png, application/xml;q=0.5")).toBeNull();
  });

  it("q=0 es exclusión, no preferencia baja", () => {
    expect(negociarFormato("text/markdown;q=0")).toBeNull();
    expect(negociarFormato("text/html;q=0, text/markdown")).toBe("markdown");
  });

  it("basura en el encabezado degrada a HTML, nunca a excepción ni a 406", () => {
    expect(negociarFormato("esto-no-es-un-media-type")).toBe("html");
    expect(negociarFormato(";;;,,,")).toBe("html");
  });

  it("una q ilegible vale 0 para su rango, no 1", () => {
    // Si `q=banana` valiera 1, markdown ganaría; tiene que quedar excluido.
    expect(negociarFormato("text/markdown;q=banana, text/html;q=0.5")).toBe("html");
  });

  it("mayúsculas y espacios no cambian la decisión", () => {
    expect(negociarFormato("TEXT/MARKDOWN")).toBe("markdown");
    expect(negociarFormato(" text/markdown ; q=1 ")).toBe("markdown");
  });
});
