import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { useFiltrosUrl } from "./useFiltrosUrl";

// `useFiltrosUrl` es el puente entre lo que el usuario cree que está viendo y
// lo que la tabla pidió al servidor. Todos sus fallos son del mismo tipo: la
// pantalla muestra datos correctos **para otra consulta**, sin error ni
// pantalla rota. Los cuatro que importan:
//
//   1. Perder un filtro al paginar. El usuario busca "ana", pasa a la página 2,
//      y ve la página 2 de TODO el listado creyendo que sigue filtrado.
//   2. Perder la coerción de tipo. `page` vuelve de la URL como el string "2";
//      `page + 1` da "21" y el paginador salta a una página que no existe.
//   3. Comer un `false` o un `0`. El filtro "activo=false" (los retirados) se
//      cae de la URL, el backend recibe el default, y la tabla lista activos
//      bajo el título "Retirados".
//   4. Empujar al historial en vez de reemplazar. Cada tecla queda como una
//      entrada del navegador, y el botón "atrás" borra la búsqueda letra por
//      letra en lugar de volver a la pantalla anterior.
//
// Ninguno de los cuatro rompe un tipo ni tira un error, y los tres primeros se
// ven idénticos a un resultado legítimo.
//
// Se prueba el hook REAL montándolo dentro de un `MemoryRouter`, no una copia
// de su lógica: `useSearchParams` es la mitad de lo que hay que verificar, y
// una reimplementación en el test daría verde con el módulo roto.

// React sólo acepta `act()` si el entorno lo declara; sin esto cada llamada
// escribe una advertencia en stderr y el ruido tapa los fallos de verdad.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Sonda<T> {
  filtros: T;
  set: (patch: Partial<T> | ((prev: T) => Partial<T>)) => void;
  search: string;
  atras: () => void;
}

/** Monta el hook en un router de memoria y expone lo último que renderizó.
 *  No es una librería de testing: es el mínimo para poder llamar a un hook. */
async function montar<T extends Record<string, string | number | boolean | undefined>>(
  defaults: T,
  urlInicial = "/lista",
): Promise<Sonda<T>> {
  const sonda = {} as Sonda<T>;

  function Probe() {
    const [filtros, setFiltros] = useFiltrosUrl(defaults);
    const navegar = useNavigate();
    sonda.filtros = filtros;
    sonda.set = setFiltros;
    sonda.search = useLocation().search;
    sonda.atras = () => navegar(-1);
    return null;
  }

  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [urlInicial] }, createElement(Probe)));
  });
  return sonda;
}

describe("useFiltrosUrl", () => {
  it("sin params en la URL devuelve los defaults tal cual", async () => {
    const s = await montar({ q: "", estado: "todos", page: 1, activo: true });
    expect(s.filtros).toEqual({ q: "", estado: "todos", page: 1, activo: true });
  });

  // (2) La coerción por tipo del default. Un `page` string no rompe nada
  // visible hasta que alguien hace aritmética con él.
  it("coerciona cada param al tipo de su default, no todo a string", async () => {
    const s = await montar({ q: "", page: 1, activo: false }, "/lista?q=ana&page=3&activo=true");
    expect(s.filtros.q).toBe("ana");
    expect(s.filtros.page).toBe(3);
    expect(s.filtros.activo).toBe(true);
    // Lo que de verdad se rompía: `page + 1` daba "31" en vez de 4.
    expect(s.filtros.page + 1).toBe(4);
  });

  it("un default string NUNCA se convierte a boolean, aunque diga 'true'", async () => {
    // Hay filtros de texto libre; alguien podría buscar literalmente "true".
    const s = await montar({ q: "" }, "/lista?q=true");
    expect(s.filtros.q).toBe("true");
  });

  it("un param que la URL no trae cae en su default, no en undefined", async () => {
    const s = await montar({ q: "", page: 1 }, "/lista?q=ana");
    expect(s.filtros.page).toBe(1);
  });

  // (1) El fallo que el brief nombra por su nombre.
  it("paginar CONSERVA los filtros: no se pierde la búsqueda al pasar de página", async () => {
    const s = await montar({ q: "", estado: "todos", page: 1 }, "/lista?q=ana&estado=activo");
    await act(async () => s.set({ page: 2 }));
    expect(s.filtros).toMatchObject({ q: "ana", estado: "activo", page: 2 });
    expect(s.search).toContain("q=ana");
    expect(s.search).toContain("estado=activo");
  });

  it("la forma funcional recibe los filtros YA coercionados, no los strings crudos", async () => {
    const s = await montar({ page: 1 }, "/lista?page=4");
    let visto: unknown;
    await act(async () => s.set((prev) => {
      visto = prev.page;
      return { page: prev.page + 1 };
    }));
    // Si `prev` llegara sin coercionar, esto sería "4" y el resultado "41".
    expect(visto).toBe(4);
    expect(s.filtros.page).toBe(5);
  });

  // (3) Los dos falsy que SÍ son filtros.
  it("un filtro en `false` viaja a la URL: no se confunde con 'sin filtro'", async () => {
    // `true as boolean` y no `true` a secas: si no, TS infiere el tipo literal
    // `true` para el default y `false` deja de ser un valor válido del filtro.
    const s = await montar({ activo: true as boolean, q: "" });
    await act(async () => s.set({ activo: false }));
    expect(s.search).toContain("activo=false");
    expect(s.filtros.activo).toBe(false);
  });

  it("un filtro en `0` viaja a la URL: `0` no es lo mismo que vacío", async () => {
    const s = await montar({ sedeId: -1 });
    await act(async () => s.set({ sedeId: 0 }));
    expect(s.search).toContain("sedeId=0");
    expect(s.filtros.sedeId).toBe(0);
  });

  it("un valor vacío BORRA su param en vez de dejar `?q=` colgando", async () => {
    const s = await montar({ q: "x" }, "/lista?q=ana");
    await act(async () => s.set({ q: "" }));
    expect(s.search).not.toContain("q=");
    // Y al releerlo vuelve el default, que es el contrato con el llamador.
    expect(s.filtros.q).toBe("x");
  });

  it("volver a un valor igual al default lo saca de la URL pero se sigue leyendo igual", async () => {
    const s = await montar({ estado: "todos" }, "/lista?estado=activo");
    await act(async () => s.set({ estado: "todos" }));
    expect(s.search).toBe("");
    expect(s.filtros.estado).toBe("todos");
  });

  // (4) El historial. Esto no se ve nunca hasta que alguien usa el botón atrás.
  it("teclear reemplaza la entrada del historial en vez de apilar una por tecla", async () => {
    const s = await montar({ q: "" }, "/lista");
    await act(async () => s.set({ q: "a" }));
    await act(async () => s.set({ q: "an" }));
    await act(async () => s.set({ q: "ana" }));

    await act(async () => s.atras());
    // Con `replace` las tres escrituras pisaron la misma entrada, así que no
    // hay a dónde volver. Sin él, atrás dejaría "?q=an" y el usuario tendría
    // que apretarlo tres veces para salir de la pantalla.
    expect(s.search).toContain("q=ana");
  });

  it("un patch parcial no borra los otros params ni los duplica", async () => {
    const s = await montar({ q: "", estado: "todos", page: 1 }, "/lista?q=ana&estado=activo&page=2");
    await act(async () => s.set({ estado: "retirado" }));
    const params = new URLSearchParams(s.search);
    expect(params.getAll("estado")).toEqual(["retirado"]);
    expect(params.get("q")).toBe("ana");
    expect(params.get("page")).toBe("2");
  });
});
