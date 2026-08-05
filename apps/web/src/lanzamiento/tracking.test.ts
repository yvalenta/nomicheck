import { afterEach, describe, expect, it, vi } from "vitest";

import { trackEvento, type EventoMeta } from "./tracking";

// `trackEvento` no dibuja nada, y ese es el problema: **no tiene forma de
// verse**. Es el único punto por el que las cuatro campañas de Meta Ads se
// enteran de una conversión, y sus dos fallos son invisibles por definición:
//
//   1. **Llamar `track` en vez de `trackCustom`.** `track` es para el catálogo
//      de eventos estándar de Meta; con un nombre propio, Meta lo descarta sin
//      chistar. La landing funciona, el pixel responde 200, y la campaña se
//      queda optimizando contra cero conversiones. Se descubre semanas después
//      mirando el gasto.
//   2. **Reventar cuando el pixel no está.** Los bloqueadores de anuncios no
//      sólo borran `fbq`: a veces dejan un stub que no es función. Si la guarda
//      pasa de `typeof … === "function"` a un `if` a secas, el handler del
//      botón principal tira una excepción — y el visitante no puede convertir
//      justamente por el código que existía para medir conversiones.
//
// La lista de nombres se prueba en runtime a propósito. El tipo `EventoMeta`
// sólo protege a quien llame desde TypeScript; lo que Meta recibe es el string,
// y este archivo es su fuente de verdad.

interface VentanaPixel {
  fbq?: unknown;
}

const EVENTOS: EventoMeta[] = [
  "verificacion_iniciada",
  "verificacion_completada",
  "discrepancia_detectada",
  "registro_empresa",
  "interes_partners",
];

afterEach(() => {
  delete (window as VentanaPixel).fbq;
});

describe("trackEvento", () => {
  it("usa trackCustom, que es el único que acepta nombres propios", () => {
    const fbq = vi.fn();
    (window as VentanaPixel).fbq = fbq;

    trackEvento("registro_empresa", { plan: "empresa" });

    expect(fbq).toHaveBeenCalledWith("trackCustom", "registro_empresa", { plan: "empresa" });
    // Explícito porque es EL error: con "track" Meta descarta el evento en
    // silencio y la campaña no recibe nada.
    expect(fbq.mock.calls[0]![0]).not.toBe("track");
  });

  it.each(EVENTOS)("manda '%s' con ese nombre exacto, sin transformarlo", (evento) => {
    const fbq = vi.fn();
    (window as VentanaPixel).fbq = fbq;

    trackEvento(evento);

    // Renombrar acá sin tocar la configuración de Meta rompe la optimización
    // de conversiones sin romper una sola línea de código.
    expect(fbq).toHaveBeenCalledWith("trackCustom", evento, undefined);
  });

  it("los cinco eventos tienen nombres distintos entre sí", () => {
    // Dos eventos con el mismo nombre mezclan dos embudos en uno y el informe
    // de Meta se ve perfectamente sano.
    expect(new Set(EVENTOS).size).toBe(EVENTOS.length);
  });

  it("sin pixel no hace nada, NO tira, y deja rastro en la consola de desarrollo", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    expect(() => trackEvento("verificacion_iniciada")).not.toThrow();
    // El rastro importa: mientras el pixel no esté cableado, es la única forma
    // de comprobar que el evento se dispara donde debe.
    expect(debug).toHaveBeenCalledWith("[tracking] verificacion_iniciada", "");
  });

  it("con un `fbq` que existe pero no es función (adblocker) tampoco tira", () => {
    // Es el caso que la guarda `typeof === "function"` cubre y un `if (win.fbq)`
    // no: el visitante con bloqueador no podría ni apretar el botón.
    vi.spyOn(console, "debug").mockImplementation(() => {});
    (window as VentanaPixel).fbq = { push: [] };
    expect(() => trackEvento("verificacion_completada", { fuente: "landing" })).not.toThrow();
  });

  it("pasa los params tal cual, sin envolverlos ni reordenarlos", () => {
    const fbq = vi.fn();
    (window as VentanaPixel).fbq = fbq;
    const params = { valor: 12345, moneda: "COP", anidado: { sede: 3 } };

    trackEvento("discrepancia_detectada", params);

    expect(fbq.mock.calls[0]![2]).toEqual(params);
  });
});
