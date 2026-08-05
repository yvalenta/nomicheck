import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { useDatos } from "./useDatos";

// `useDatos` es el que decide qué ve la tabla del panel. Sus tres fallos son
// invisibles por definición — la pantalla siempre muestra datos con forma
// correcta, sólo que de la consulta equivocada:
//
//   1. **Respuesta obsoleta que pisa a la buena.** El usuario teclea "ana" y
//      después "ana maría"; si la primera petición tarda más, llega DESPUÉS y
//      sobreescribe. La tabla lista a todas las Anas bajo el filtro "ana maría".
//      Es el bug que este hook vino a matar, y no se reproduce a mano: hace
//      falta que las respuestas lleguen desordenadas.
//   2. **Escritura después de desmontar.** Se sale de la sección y la respuesta
//      en vuelo guarda en la caché un valor de una pantalla que ya no existe.
//   3. **Refetch en bucle.** `cargar` suele ser una lambda nueva en cada
//      render; si entra en las dependencias del efecto, el hook pide, re-renderiza
//      y vuelve a pedir para siempre. En pantalla se ve perfecto — el que se
//      entera es el servidor.
//
// Se prueba el hook REAL montándolo con `react-dom/client`. No hay copia de su
// lógica acá: el orden entre `setState`, el efecto y su cleanup ES lo que se
// está verificando, y una reimplementación en el test no lo tendría.

// React sólo acepta `act()` si el entorno lo declara; sin esto cada llamada
// escribe una advertencia en stderr y el ruido tapa los fallos de verdad.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Promesa que el test resuelve cuando quiere: es la única forma de forzar el
 *  desorden de respuestas que provoca el bug 1. */
function diferido<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

interface Sonda<T> {
  datos: T | null;
  cargando: boolean;
  error: string | null;
  refrescar: () => void;
  /** Un registro por render. Hace falta porque `act()` ya dejó asentada la
   *  revalidación cuando volvemos del `render`: sin el historial no se puede
   *  distinguir "pintó al instante y después revalidó" de "esperó y pintó". */
  renders: { cargando: boolean; datos: T | null }[];
}

function montar<T>(cache?: Map<string, unknown>) {
  const sonda: Sonda<T> = { datos: null, cargando: false, error: null, refrescar: () => {}, renders: [] };
  const root = createRoot(document.createElement("div"));

  function Probe({ clave, cargar }: { clave: string; cargar: () => Promise<T> }) {
    const r = useDatos<T>(clave, cargar, { cache });
    sonda.datos = r.datos;
    sonda.cargando = r.cargando;
    sonda.error = r.error;
    sonda.refrescar = r.refrescar;
    sonda.renders.push({ cargando: r.cargando, datos: r.datos });
    return null;
  }

  return {
    sonda,
    async render(clave: string, cargar: () => Promise<T>) {
      await act(async () => {
        root.render(createElement(Probe, { clave, cargar }));
      });
    },
    async desmontar() {
      await act(async () => {
        root.unmount();
      });
    },
    /** Deja correr los microtasks pendientes dentro de `act`. */
    async asentar() {
      await act(async () => {
        await Promise.resolve();
      });
    },
  };
}

describe("useDatos", () => {
  it("sin caché muestra el esqueleto y después los datos", async () => {
    const d = diferido<string>();
    const h = montar<string>();
    await h.render("a", () => d.promesa);

    expect(h.sonda.cargando).toBe(true);
    expect(h.sonda.datos).toBeNull();

    d.resolver("A");
    await h.asentar();

    expect(h.sonda.cargando).toBe(false);
    expect(h.sonda.datos).toBe("A");
    expect(h.sonda.error).toBeNull();
  });

  // (1) El bug original, en su forma exacta.
  it("una respuesta VIEJA que llega tarde NO pisa a la nueva", async () => {
    const lenta = diferido<string>();
    const rapida = diferido<string>();
    const respuestas = [lenta.promesa, rapida.promesa];
    let i = 0;

    const h = montar<string>();
    await h.render("busqueda", () => respuestas[i++]!);

    // Segunda petición mientras la primera sigue en vuelo.
    await act(async () => {
      h.sonda.refrescar();
    });

    rapida.resolver("ana maría");
    await h.asentar();
    expect(h.sonda.datos).toBe("ana maría");

    // Y ahora llega la vieja. Sin el número de secuencia, la tabla volvería a
    // mostrar el resultado de "ana" con "ana maría" escrito en el buscador.
    lenta.resolver("ana");
    await h.asentar();
    expect(h.sonda.datos).toBe("ana maría");
  });

  it("el ERROR de una petición obsoleta tampoco pisa el resultado bueno", async () => {
    const vieja = diferido<string>();
    const nueva = diferido<string>();
    const respuestas = [vieja.promesa, nueva.promesa];
    let i = 0;

    const h = montar<string>();
    await h.render("busqueda", () => respuestas[i++]!);
    await act(async () => {
      h.sonda.refrescar();
    });

    nueva.resolver("ok");
    await h.asentar();

    vieja.rechazar(new Error("timeout de la petición vieja"));
    await h.asentar();

    // Un banner rojo sobre una tabla con datos correctos es peor que nada:
    // el usuario no sabe si lo que ve sirve.
    expect(h.sonda.error).toBeNull();
    expect(h.sonda.datos).toBe("ok");
    expect(h.sonda.cargando).toBe(false);
  });

  // (2) La escritura tardía. La caché es la prueba observable de que no pasó:
  // si el guardia de secuencia desapareciera, la clave quedaría escrita.
  it("desmontar cancela: una respuesta en vuelo no escribe ni en la caché", async () => {
    const d = diferido<string>();
    const cache = new Map<string, unknown>();
    const h = montar<string>(cache);
    await h.render("a", () => d.promesa);

    await h.desmontar();
    d.resolver("llegó tarde");
    await act(async () => {
      await Promise.resolve();
    });

    expect(cache.has("a")).toBe(false);
  });

  // (3) El bucle. Lo que se afirma es que `cargar` cambiando de identidad en
  // cada render no vuelve a disparar la petición.
  it("un `cargar` nuevo en cada render NO dispara una petición nueva", async () => {
    const cargar = vi.fn(async () => "A");
    const h = montar<string>();

    // Tres renders, tres lambdas distintas — lo que hace cualquier componente
    // que escriba `useDatos(clave, () => api(filtro))`.
    await h.render("a", () => cargar());
    await h.render("a", () => cargar());
    await h.render("a", () => cargar());

    expect(cargar).toHaveBeenCalledTimes(1);
  });

  // La otra mitad del ref, y la que no se ve contando peticiones: guardar
  // `cargar` en un ref sirve de poco si lo que se ejecuta es el del PRIMER
  // render. Un `refrescar()` que llama a la lambda vieja vuelve a pedir con el
  // parámetro anterior y repinta la tabla con lo que ya estaba — parece que el
  // botón de refrescar no hace nada, y en realidad hace lo equivocado.
  it("refrescar ejecuta el `cargar` del ÚLTIMO render, no el del primero", async () => {
    const primero = vi.fn(async () => "valor viejo");
    const ultimo = vi.fn(async () => "valor nuevo");

    const h = montar<string>();
    await h.render("a", primero);
    await h.render("a", ultimo);
    expect(ultimo).not.toHaveBeenCalled();

    await act(async () => {
      h.sonda.refrescar();
    });

    expect(ultimo).toHaveBeenCalledTimes(1);
    expect(primero).toHaveBeenCalledTimes(1); // sólo la carga inicial
    expect(h.sonda.datos).toBe("valor nuevo");
  });

  it("cambiar de clave SÍ vuelve a pedir, y no deja ver los datos de la clave anterior", async () => {
    const h = montar<string>();
    await h.render("a", async () => "datos de A");
    expect(h.sonda.datos).toBe("datos de A");

    const d = diferido<string>();
    await h.render("b", () => d.promesa);
    // Mostrar "datos de A" bajo la clave "b" es exactamente el fallo silencioso
    // que este hook evita: números de otra empresa/periodo con el rótulo nuevo.
    expect(h.sonda.datos).toBeNull();
    expect(h.sonda.cargando).toBe(true);

    d.resolver("datos de B");
    await h.asentar();
    expect(h.sonda.datos).toBe("datos de B");
  });

  it("volver a una clave ya vista pinta al instante y revalida en silencio", async () => {
    const cargar = vi.fn<() => Promise<string>>();
    cargar.mockResolvedValueOnce("A").mockResolvedValueOnce("B").mockResolvedValueOnce("A v2");

    const h = montar<string>();
    await h.render("a", cargar);
    await h.render("b", cargar);

    h.sonda.renders.length = 0;
    await h.render("a", cargar);

    // Sin parpadeo: si `cargando` volviera a true, la tabla se reemplazaría por
    // el esqueleto en cada ida y vuelta entre pestañas.
    expect(h.sonda.renders.map((r) => r.cargando)).not.toContain(true);

    // Y el valor cacheado se pintó ANTES de que volviera la revalidación. Sin
    // ese pintado previo la pantalla queda en blanco esperando al servidor,
    // que es justamente lo que la caché vino a evitar.
    const pintados = h.sonda.renders.map((r) => r.datos);
    expect(pintados).toContain("A");
    expect(pintados.indexOf("A")).toBeLessThan(pintados.indexOf("A v2"));

    // Pero igual revalida: servir caché sin refrescar deja datos viejos para
    // siempre, que es el otro modo de mentir sin romperse.
    expect(cargar).toHaveBeenCalledTimes(3);
    expect(h.sonda.datos).toBe("A v2");
  });

  it("una caché compartida deja que otra instancia pinte sin pedir de cero", async () => {
    const cache = new Map<string, unknown>([["costos:true", { total: 42 }]]);
    const h = montar<{ total: number }>(cache);
    await h.render("costos:true", async () => ({ total: 99 }));

    // Primer render ya con datos: es lo que evita el esqueleto al alternar el
    // toggle de exoneración. `datos` en null acá significaría un parpadeo con
    // la tabla vacía en cada toggle.
    expect(h.sonda.renders[0]).toEqual({ cargando: false, datos: { total: 42 } });
  });

  it("un fallo muestra el mensaje del servidor y suelta el esqueleto", async () => {
    const h = montar<string>();
    await h.render("a", async () => {
      throw new Error("403: no tenés acceso a esta sede");
    });

    expect(h.sonda.error).toBe("403: no tenés acceso a esta sede");
    // Si `cargando` se quedara en true, la pantalla mostraría el esqueleto para
    // siempre y nadie vería nunca el mensaje de error.
    expect(h.sonda.cargando).toBe(false);
  });

  it("algo que no es un Error no llega a pantalla como '[object Object]'", async () => {
    const h = montar<string>();
    await h.render("a", async () => {
      throw { status: 500 };
    });
    expect(h.sonda.error).toBe("Error al cargar datos");
  });

  it("refrescar reintenta y limpia el error anterior", async () => {
    let falla = true;
    const h = montar<string>();
    await h.render("a", async () => {
      if (falla) throw new Error("red caída");
      return "A";
    });
    expect(h.sonda.error).toBe("red caída");

    falla = false;
    await act(async () => {
      h.sonda.refrescar();
    });

    // Un error viejo que no se limpia deja el banner rojo sobre datos buenos.
    expect(h.sonda.error).toBeNull();
    expect(h.sonda.datos).toBe("A");
  });
});
