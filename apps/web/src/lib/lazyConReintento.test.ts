import { beforeEach, describe, expect, it } from "vitest";

// `lazyConReintento` existe por un fallo que solo aparece DESPUÉS de un deploy:
// una pestaña abierta desde antes pide chunks con hashes que ya no están, el
// import dinámico rechaza, y el usuario ve una pantalla en blanco al navegar.
//
// Su lógica es un interruptor de un solo uso, y los dos modos de falla son
// opuestos y caros:
//
//   - si NUNCA recarga, vuelve la pantalla en blanco que vino a arreglar;
//   - si recarga SIEMPRE, con la red caída la app entra en bucle de recargas y
//     el usuario no puede ni leer el error.
//
// Nada de eso se ve en desarrollo: en `vite dev` los chunks siempre están. Por
// eso se prueba acá y no mirando la pantalla.
//
// Se prueba `cargarConReintento`, que es la función REAL: lo que tiene
// decisiones es la fábrica, no el componente que `lazy()` devuelve.
//
// La primera versión de este archivo tenía una COPIA de esa lógica acá, porque
// llegar a la original a través de `lazy()` exigía montar Suspense. Se descubrió
// probando: al romper el módulo de verdad —cambiando la guarda del bucle por
// `if (true)`— la suite siguió en verde, porque ejercitaba la copia. Por eso la
// lógica ahora se exporta y esto la importa.
import { cargarConReintento } from "./lazyConReintento";

const CLAVE = "nc-chunk-reintento";
const fabrica = cargarConReintento;

function conTimeout<T>(p: Promise<T>, ms = 30): Promise<T | "colgada"> {
  return Promise.race([p, new Promise<"colgada">((r) => setTimeout(() => r("colgada"), ms))]);
}

describe("lazyConReintento", () => {
  let recargas = 0;

  beforeEach(() => {
    sessionStorage.clear();
    recargas = 0;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: () => { recargas += 1; } },
    });
  });

  it("un import que funciona devuelve el módulo y no recarga", async () => {
    const mod = await fabrica(async () => ({ default: "ok" }));
    expect(mod.default).toBe("ok");
    expect(recargas).toBe(0);
  });

  it("un import que funciona LIMPIA la marca, para que el próximo fallo tenga su reintento", async () => {
    sessionStorage.setItem(CLAVE, "1");
    await fabrica(async () => ({ default: "ok" }));
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });

  it("el primer fallo recarga UNA vez y deja la marca", async () => {
    const r = await conTimeout(fabrica(async () => { throw new Error("chunk 404"); }));
    expect(recargas).toBe(1);
    expect(sessionStorage.getItem(CLAVE)).toBe("1");
    // La promesa NO resuelve a propósito: la página se está recargando, y
    // resolverla haría que React intente renderizar un módulo que no llegó.
    expect(r).toBe("colgada");
  });

  it("el segundo fallo NO recarga: propaga el error en vez de entrar en bucle", async () => {
    sessionStorage.setItem(CLAVE, "1");
    await expect(fabrica(async () => { throw new Error("red caida"); })).rejects.toThrow("red caida");
    expect(recargas).toBe(0);
  });

  // El escenario completo, que es el que importa: deploy nuevo, la pestaña
  // vieja falla, recarga, y al volver funciona. La marca queda limpia para que
  // el PRÓXIMO deploy vuelva a tener su reintento — si no se limpiara, el
  // segundo deploy dejaría la pantalla en blanco.
  it("ciclo real: falla, recarga, funciona, y queda listo para el próximo deploy", async () => {
    await conTimeout(fabrica(async () => { throw new Error("chunk viejo"); }));
    expect(recargas).toBe(1);

    await fabrica(async () => ({ default: "app nueva" }));
    expect(sessionStorage.getItem(CLAVE)).toBeNull();

    await conTimeout(fabrica(async () => { throw new Error("otro deploy"); }));
    expect(recargas).toBe(2);
  });

});
