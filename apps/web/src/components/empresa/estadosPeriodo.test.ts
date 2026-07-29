import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { TERMINALES } from "./estadosPeriodo";

// La constante `TERMINALES` es una copia a mano de ESTADOS_TERMINALES_LIQUIDACION
// del backend, y el comentario que la acompaña lo dice sin rodeos: "cambiar aquí
// Y allá". Esta prueba es la única guarda que tiene esa copia.
//
// Por qué importa que exista: si las dos listas se desincronizan, el polling NO
// falla. Si al front le falta un estado terminal, sigue consultando para siempre
// un periodo que ya terminó — una petición cada 3 segundos, indefinidamente, por
// cada periodo abierto. Si le sobra uno, deja de consultar antes de tiempo y la
// UI se congela mostrando "liquidando". Ninguna de las dos cosas se ve mirando
// la pantalla, y ninguna rompe un tipo.
//
// El backend se lee como TEXTO y no se importa. Es a propósito: `apps/web` no
// depende de `@pv/api` ni debe empezar a depender por una prueba — la dirección
// de la dependencia es una decisión de arquitectura, no un detalle. Leer el
// archivo da la misma señal sin crear el acoplamiento.
// Se resuelve desde el directorio del paquete y no desde `import.meta.url`:
// bajo jsdom ese URL no tiene esquema `file:` y `fileURLToPath` revienta.
// Vitest corre con el cwd fijado en la raiz del workspace.
const RUTA_BACKEND = resolve(process.cwd(), "../api/src/lib/estados.ts");

function terminalesDelBackend(): string[] {
  // Si el archivo no esta donde esta prueba lo busca, eso es un fallo y no un
  // "no se pudo comprobar". Una guarda que se salta a si misma cuando no
  // encuentra su objetivo es peor que no tenerla.
  if (!existsSync(RUTA_BACKEND)) {
    throw new Error(`no existe ${RUTA_BACKEND} — ¿se movió el módulo de estados del backend?`);
  }
  const fuente = readFileSync(RUTA_BACKEND, "utf8");
  const bloque = fuente.match(
    /ESTADOS_TERMINALES_LIQUIDACION[^=]*=\s*\[([^\]]*)\]/,
  );
  // Falla cerrado: si el backend se reescribe y el patrón deja de enganchar,
  // esto revienta con un mensaje claro en vez de comparar contra una lista
  // vacía y dar verde.
  if (!bloque) {
    throw new Error(
      `no se pudo leer ESTADOS_TERMINALES_LIQUIDACION de ${RUTA_BACKEND} — ¿cambió de forma?`,
    );
  }
  return [...bloque[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe("TERMINALES es espejo del backend", () => {
  // Se comparan como CONJUNTO y no como lista. La primera versión de esta
  // prueba exigía el mismo orden y se ponía roja al reordenar la lista del
  // backend — un cambio que no altera nada, porque el único uso es
  // `TERMINALES.includes(estado)`. Un detector que grita por un cambio inocuo
  // se apaga a la tercera, y entonces no queda detector.
  it("tiene exactamente los mismos estados", () => {
    expect([...TERMINALES].sort()).toEqual(terminalesDelBackend().sort());
  });

  it("no está vacía — una lista vacía haría polling infinito", () => {
    expect(TERMINALES.length).toBeGreaterThan(0);
  });

  // Si el patrón deja de enganchar, quiero un error con nombre y no un verde.
  it("el backend sigue declarando la constante donde esta prueba la busca", () => {
    expect(() => terminalesDelBackend()).not.toThrow();
  });

  it("todos los estados del espejo son estados que el backend conoce", () => {
    const fuente = readFileSync(RUTA_BACKEND, "utf8");
    const todos = fuente.match(/ESTADOS_PERIODO[^=]*=\s*\[([^\]]*)\]/);
    expect(todos).not.toBeNull();
    const conocidos = [...todos![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    for (const estado of TERMINALES) expect(conocidos).toContain(estado);
  });
});
