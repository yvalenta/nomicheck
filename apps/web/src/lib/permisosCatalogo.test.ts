import { describe, expect, it } from "vitest";

import { agruparPorDominio, fichaDe, masRestringidos, rutasDe } from "./permisosCatalogo";
import type { FilaMatriz } from "../apiEmpresa";

// El catálogo es la mitad de presentación de la página de Roles: nombres,
// grupos y frases de ayuda encima de las claves que manda la API. La otra
// mitad —quién puede qué— no está acá y no debe estarlo.
//
// Lo que se prueba es el contrato entre las dos mitades, porque sus fallos son
// invisibles: la tabla siempre se ve completa y ordenada.
//
//   1. **Un permiso del backend sin ficha desaparece.** Es el peor: alguien
//      agrega `nomina.anular` a la matriz, la API lo hace cumplir, y la página
//      —que decide las filas por su catálogo— no lo dibuja. La empresa lee una
//      tabla que dice ser completa y le falta una acción.
//   2. **El orden lo pone el front.** Si los grupos salieran de una lista
//      escrita acá, reordenar `PERMISOS` en el backend no movería nada y la
//      tabla se iría separando del archivo que representa.
//   3. **La cobertura se elige en vez de medirse.** Un panel de "lo más
//      restringido" con las filas escritas a mano se queda viejo el día que una
//      celda cambia — y justo ese día es cuando alguien lo mira.

function fila(clave: string, roles: string[]): FilaMatriz {
  return { clave, roles };
}

describe("fichaDe", () => {
  it("una clave conocida trae etiqueta legible, dominio y ayuda", () => {
    const f = fichaDe("nomina.pagar");
    expect(f.dominio).toBe("Nómina");
    expect(f.etiqueta).not.toBe("nomina.pagar");
    expect(f.que.length).toBeGreaterThan(0);
  });

  it("una clave que el front no conoce cae en su nombre crudo, nunca en vacío", () => {
    const f = fichaDe("nomina.anular");
    // Un `undefined` acá sería una fila sin nombre; una cadena vacía, una fila
    // invisible. Las dos esconden una acción que el servidor sí hace cumplir.
    expect(f.etiqueta).toBe("nomina.anular");
    expect(f.dominio.length).toBeGreaterThan(0);
    expect(f.que.length).toBeGreaterThan(0);
  });
});

describe("agruparPorDominio", () => {
  it("un permiso sin ficha SIGUE en la tabla", () => {
    const grupos = agruparPorDominio([fila("empresa.ver", ["auditor"]), fila("nomina.anular", ["admin_empresa"])]);
    const claves = grupos.flatMap((g) => g.filas.map((f) => f.clave));
    expect(claves).toContain("nomina.anular");
    // Y no se cuela dentro de un dominio real: queda aparte, señalado.
    expect(grupos.find((g) => g.filas.some((f) => f.clave === "nomina.anular"))!.dominio).not.toBe("Empresa");
  });

  it("no pierde ni duplica filas", () => {
    const entrada = [
      fila("empresa.ver", ["auditor"]),
      fila("nomina.operar", ["admin_empresa"]),
      fila("empresa.editar", ["admin_empresa"]),
      fila("clave.rara", []),
    ];
    const salida = agruparPorDominio(entrada).flatMap((g) => g.filas);
    expect(salida).toHaveLength(entrada.length);
    expect(new Set(salida.map((f) => f.clave)).size).toBe(entrada.length);
  });

  it("el orden de los grupos es el de la primera aparición, no una lista del front", () => {
    const empresaPrimero = agruparPorDominio([fila("empresa.ver", []), fila("nomina.ver", [])]);
    const nominaPrimero = agruparPorDominio([fila("nomina.ver", []), fila("empresa.ver", [])]);
    expect(empresaPrimero.map((g) => g.dominio)).toEqual(["Empresa", "Nómina"]);
    // Al invertir la entrada se invierte la tabla: la API manda el orden.
    expect(nominaPrimero.map((g) => g.dominio)).toEqual(["Nómina", "Empresa"]);
  });

  it("junta las filas del mismo dominio aunque lleguen separadas", () => {
    const grupos = agruparPorDominio([
      fila("empresa.ver", []),
      fila("nomina.ver", []),
      fila("empresa.editar", []),
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].filas.map((f) => f.clave)).toEqual(["empresa.ver", "empresa.editar"]);
  });
});

describe("rutasDe", () => {
  it("las rutas de la API le ganan al resumen escrito a mano", () => {
    // El día que la API derive las rutas del router, esas son las verdaderas.
    expect(rutasDe({ clave: "empresa.ver", roles: [], rutas: ["GET /empresa/datos"] })).toBe("GET /empresa/datos");
  });

  it("sin rutas de la API, cae al resumen del catálogo", () => {
    expect(rutasDe({ clave: "empresa.editar", roles: [] })).toBe("PUT /empresa/datos");
  });

  it("una clave desconocida y sin rutas no inventa una ruta", () => {
    expect(rutasDe({ clave: "nomina.anular", roles: [] })).toBe("");
  });
});

describe("masRestringidos", () => {
  it("ordena por cantidad de roles, del más restringido al menos", () => {
    const orden = masRestringidos(
      [fila("nomina.ver", ["a", "b", "c"]), fila("nomina.pagar", ["a"]), fila("nomina.operar", ["a", "b"])],
      3,
    ).map((f) => f.clave);
    expect(orden).toEqual(["nomina.pagar", "nomina.operar", "nomina.ver"]);
  });

  it("corta en la cantidad pedida y no toca la lista original", () => {
    const entrada = [fila("a.ver", ["x", "y"]), fila("b.ver", ["x"]), fila("c.ver", [])];
    const copia = [...entrada];
    expect(masRestringidos(entrada, 2)).toHaveLength(2);
    // `sort` muta: si ordenara la entrada, la tabla quedaría reordenada por
    // cobertura en vez de por dominio, sin que nadie lo pidiera.
    expect(entrada).toEqual(copia);
  });
});
