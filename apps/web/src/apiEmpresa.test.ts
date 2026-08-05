import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Todo el panel de empresa pasa por una sola función privada, `autenticado()`:
// arma la URL bajo `/api`, adjunta el JWT, parsea y traduce el error. Sus
// fallos no se ven porque siempre producen una pantalla plausible:
//
//   - **El detalle del rechazo se pierde.** Cuando el motor de QA rechaza una
//     liquidación, el 4xx trae `rechazos[]` con el empleado, el código y la ley.
//     `autenticado` lo cuelga del error en `err.body` y el panel lo despliega.
//     Si esa carga se cae, la empresa lee "Error de red" sobre una liquidación
//     que el servidor rechazó por una razón concreta y explicada.
//   - **Un filtro `false` se cae del querystring.** `activo=false` son los
//     empleados retirados. Sin ese param el backend usa su default y la tabla
//     lista a los activos bajo el título "Retirados" — mismo layout, mismas
//     columnas, gente equivocada.
//   - **El JWT no viaja.** Un 401 se lee como servidor caído.
//
// `lib/supabase` va mockeado: llama a `createClient()` al cargarse y revienta
// sin las variables de Vite. Con el mock esta suite corre sin `.env.local`.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./lib/supabase", () => ({ supabase: { auth: { getSession } } }));

import {
  actualizarEmpleado,
  crearEmpleado,
  eliminarEmpleado,
  encolarLiquidacion,
  listarAuditoria,
  listarContratistas,
  listarEmpleados,
  listarPeriodos,
  obtenerCostos,
  obtenerEstadoLiquidacion,
  type RechazoQA,
} from "./apiEmpresa";

const fetchMock = vi.fn();

function respuesta(estado: number, cuerpo: unknown) {
  return {
    ok: estado >= 200 && estado < 300,
    status: estado,
    json: async () => cuerpo,
  } as unknown as Response;
}

function respuestaSinJson(estado: number) {
  return {
    ok: false,
    status: estado,
    json: async () => {
      throw new SyntaxError("Unexpected token '<'");
    },
  } as unknown as Response;
}

function ultima() {
  const c = fetchMock.mock.calls.at(-1)!;
  return { url: String(c[0]), init: c[1] as RequestInit };
}

/** Los search params de la última petición, ya parseados. */
function query() {
  return new URLSearchParams(ultima().url.split("?")[1] ?? "");
}

describe("apiEmpresa", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(respuesta(200, { items: [], total: 0, page: 1, limit: 25 }));
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt-empresa" } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("sesión y encabezados", () => {
    it("manda el JWT y el Content-Type, y cuelga todo de /api", async () => {
      await listarEmpleados();
      const { url, init } = ultima();
      expect(url.startsWith("/api/empresa/empleados")).toBe(true);
      expect(init.headers).toMatchObject({
        "Content-Type": "application/json",
        Authorization: "Bearer jwt-empresa",
      });
    });

    it("sin sesión OMITE el header, no manda 'Bearer undefined'", async () => {
      getSession.mockResolvedValue({ data: { session: null } });
      await listarEmpleados();
      // Un `Bearer undefined` es peor que no mandar nada: en los logs del
      // backend parece un token inválido y manda a buscar el bug en Supabase.
      expect(ultima().init.headers).not.toHaveProperty("Authorization");
    });

    it("los headers del llamador se suman sin borrar los de base", async () => {
      await crearEmpleado({ nombre: "Ana" } as Parameters<typeof crearEmpleado>[0]);
      const { init } = ultima();
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("devuelve el cuerpo parseado cuando el servidor responde 2xx", async () => {
      fetchMock.mockResolvedValue(respuesta(200, { id: 3, estado: "liquidando", progreso: 0 }));
      await expect(obtenerEstadoLiquidacion(3)).resolves.toMatchObject({ id: 3, estado: "liquidando" });
    });
  });

  describe("errores", () => {
    it("usa el mensaje del servidor cuando lo hay", async () => {
      fetchMock.mockResolvedValue(respuesta(409, { error: "El periodo ya fue liquidado" }));
      await expect(encolarLiquidacion(3)).rejects.toThrow("El periodo ya fue liquidado");
    });

    it("un cuerpo sin `error` cae en 'Error de red', no en undefined", async () => {
      fetchMock.mockResolvedValue(respuesta(500, {}));
      await expect(encolarLiquidacion(3)).rejects.toThrow("Error de red");
    });

    it("un 502 con HTML no llega como SyntaxError del parser", async () => {
      fetchMock.mockResolvedValue(respuestaSinJson(502));
      await expect(eliminarEmpleado(1)).rejects.toThrow("Error de red");
    });

    // El caso estrella: el detalle del rechazo de QA.
    it("el cuerpo del error viaja en `err.body` para que el panel muestre los rechazos", async () => {
      const rechazos: RechazoQA[] = [
        {
          empleadoId: 42,
          nombre: "Ana Pérez",
          issues: [
            {
              codigo: "NETO_BAJO_MINIMO",
              severidad: "error",
              mensaje: "El neto queda por debajo del mínimo inembargable",
              referenciaLegal: "CST art. 154",
              detalles: { valorCalculado: 900_000, valorLimite: 1_423_500 },
            },
          ],
        },
      ];
      fetchMock.mockResolvedValue(respuesta(422, { error: "Liquidación rechazada por QA", rechazos }));

      let err: (Error & { body?: unknown }) | undefined;
      try {
        await encolarLiquidacion(3);
      } catch (e) {
        err = e as Error & { body?: unknown };
      }

      expect(err).toBeDefined();
      expect(err!.message).toBe("Liquidación rechazada por QA");
      // Sin esto la empresa ve un cartel genérico y no sabe qué recibo corregir;
      // el `message` solo no alcanza, y nada en pantalla delata la pérdida.
      expect(err!.body).toMatchObject({ rechazos });
      const cuerpo = err!.body as { rechazos: RechazoQA[] };
      expect(cuerpo.rechazos[0]!.issues[0]!.referenciaLegal).toBe("CST art. 154");
    });
  });

  describe("querystring de los listados", () => {
    it("un filtro en `false` SÍ viaja: es 'retirados', no 'sin filtro'", async () => {
      await listarEmpleados({ activo: false });
      expect(query().get("activo")).toBe("false");
    });

    it("un filtro en `0` SÍ viaja: `0` es un id de sede válido, no un vacío", async () => {
      await listarEmpleados({ sedeId: 0 });
      expect(query().get("sedeId")).toBe("0");
    });

    it("undefined, null y string vacío NO ensucian la URL", async () => {
      await listarEmpleados({ q: "", sedeId: undefined, tipoContrato: null as unknown as string });
      const q = query();
      expect(q.has("q")).toBe(false);
      expect(q.has("sedeId")).toBe(false);
      expect(q.has("tipoContrato")).toBe(false);
    });

    it("los valores que sí hay se serializan tal cual", async () => {
      await listarAuditoria({ q: "ana", tabla: "Empleado", accion: "UPDATE", page: 3 });
      const q = query();
      expect(q.get("q")).toBe("ana");
      expect(q.get("tabla")).toBe("Empleado");
      expect(q.get("accion")).toBe("UPDATE");
      expect(q.get("page")).toBe("3");
    });

    it.each([
      ["empleados", () => listarEmpleados()],
      ["contratistas", () => listarContratistas()],
      ["periodos", () => listarPeriodos()],
      ["auditoría", () => listarAuditoria()],
    ])("el listado de %s fija limit=25 por defecto", async (_n, llamar) => {
      // Sin límite explícito manda el default del backend, que no tiene por qué
      // ser 25: el paginador calcularía las páginas con un tamaño equivocado y
      // mostraría un número de páginas que no existe.
      await llamar();
      expect(query().get("limit")).toBe("25");
    });

    it("un limit explícito gana sobre el default", async () => {
      await listarEmpleados({ limit: 100 });
      expect(query().get("limit")).toBe("100");
    });
  });

  describe("rutas con parámetro", () => {
    it("el toggle de exoneración viaja en la query de costos", async () => {
      // Si se perdiera, el panel mostraría los costos CON parafiscales para una
      // empresa exonerada: números más altos, perfectamente creíbles, y una
      // decisión de contratación tomada sobre ellos.
      await obtenerCostos(true);
      expect(ultima().url).toBe("/api/empresa/costos?exonerado=true");
      await obtenerCostos(false);
      expect(ultima().url).toBe("/api/empresa/costos?exonerado=false");
    });

    it("actualizar y eliminar apuntan al id, con su método", async () => {
      await actualizarEmpleado(7, { nombre: "Ana" });
      expect(ultima()).toMatchObject({ url: "/api/empresa/empleados/7", init: { method: "PUT" } });

      await eliminarEmpleado(7);
      expect(ultima()).toMatchObject({ url: "/api/empresa/empleados/7", init: { method: "DELETE" } });
    });
  });
});
