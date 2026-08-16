import { beforeEach, describe, expect, it } from "vitest";
import { capturarOrigen, leerOrigen, normalizarOrigen } from "./origenCampana";

// Este módulo existe porque el Meta Pixel rompe dos promesas ya servidas (ver la
// cabecera del fuente). Reemplazarlo por atribución de primera persona resuelve
// eso y abre un riesgo nuevo, más chico pero real: **el `utm_campaign` lo
// escribe quien arma el anuncio**, y ese texto viaja del anuncio a nuestra base.
//
// Lo que se vigila acá es que por ese camino no entre cualquier cosa — y que
// «no sé de dónde vino» no se convierta en una atribución inventada.

function almacenFalso(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

describe("qué se acepta como origen", () => {
  it("arma el origen con las tres claves que interesan", () => {
    expect(normalizarOrigen("?utm_source=meta&utm_campaign=empresas&utm_medium=paid_social")).toBe(
      "meta/empresas/paid_social",
    );
  });

  it("sirve con solo una de ellas", () => {
    expect(normalizarOrigen("?utm_campaign=contadores")).toBe("contadores");
  });

  it("ignora los parámetros que no son de campaña", () => {
    // La URL del anuncio trae más cosas; solo entran las tres declaradas.
    expect(normalizarOrigen("?utm_content=variante-a&fbclid=abc123&ref=x")).toBeNull();
  });

  it("sin parámetros devuelve null, y null NO es «directo»", () => {
    // Una empresa que llegó por su cuenta y una cuyo origen se perdió se ven
    // igual. Decir "directo" sobre la segunda sería inventar atribución.
    expect(normalizarOrigen("")).toBeNull();
    expect(normalizarOrigen("?")).toBeNull();
  });
});

describe("lo que NO puede entrar a la base por acá", () => {
  it("un correo pegado en utm_campaign se descarta entero", () => {
    // Pasa de verdad: quien arma el anuncio pega un correo o un id de usuario en
    // el utm. Un campo libre que viaja a la base es un lugar donde termina
    // apareciendo un dato personal que nadie pidió.
    expect(normalizarOrigen("?utm_campaign=juan.perez@ejemplo.com")).toBeNull();
  });

  it("espacios, símbolos y marcado quedan fuera", () => {
    for (const v of ["hola mundo", "<script>", "a/b", "cam|paña", "año-2026", "%20x"]) {
      expect(normalizarOrigen(`?utm_campaign=${encodeURIComponent(v)}`)).toBeNull();
    }
  });

  it("un valor larguísimo no se trunca a algo válido: se descarta", () => {
    // Truncar dejaría pasar la mitad de un dato que no debía llegar.
    expect(normalizarOrigen(`?utm_campaign=${"a".repeat(200)}`)).toBeNull();
  });

  it("normaliza a minúsculas para que la misma campaña no cuente dos veces", () => {
    expect(normalizarOrigen("?utm_campaign=Empresas")).toBe("empresas");
  });
});

describe("sobrevive de la landing al registro", () => {
  let almacen: Storage;
  beforeEach(() => {
    almacen = almacenFalso();
  });

  it("lo capturado en la landing se lee en el registro", () => {
    // El recorrido real: /lanzamiento?utm… → /login?rol=empresa → /empresa.
    capturarOrigen("?utm_source=meta&utm_campaign=empresas", almacen);
    expect(leerOrigen(almacen)).toBe("meta/empresas");
  });

  it("una visita sin utm no pisa un origen ya anotado", () => {
    capturarOrigen("?utm_campaign=empresas", almacen);
    capturarOrigen("", almacen);
    expect(leerOrigen(almacen)).toBe("empresas");
  });

  it("sin nada anotado devuelve null", () => {
    expect(leerOrigen(almacen)).toBeNull();
  });

  it("si el almacenamiento está bloqueado, el registro NO se rompe", () => {
    // Modo privado, cuota llena, o el usuario bloqueó storage. La atribución es
    // un lujo; el registro tiene que funcionar igual.
    const roto = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    } as unknown as Storage;
    expect(() => capturarOrigen("?utm_campaign=empresas", roto)).not.toThrow();
    expect(leerOrigen(roto)).toBeNull();
  });

  it("sin almacenamiento (SSR, o navegador sin storage) tampoco revienta", () => {
    expect(() => capturarOrigen("?utm_campaign=x", null)).not.toThrow();
    expect(leerOrigen(null)).toBeNull();
  });
});
