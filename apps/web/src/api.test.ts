import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cliente HTTP del verificador anónimo. Nada de lo que hay acá calcula nómina
// —eso vive en el motor—, pero sí decide tres cosas que sólo se ven cuando algo
// sale mal, y para entonces ya no hay a quién preguntarle:
//
//   1. **Qué mensaje de error ve el usuario.** El backend explica exactamente
//      qué falta ("fechaIngreso posterior a fechaCorte"); si el `?? default`
//      se come esa explicación, la pantalla dice "No se pudo calcular" y la
//      persona no tiene forma de arreglarlo.
//   2. **Qué endpoint recibe cada payload.** Las cinco calculadoras mandan
//      objetos parecidos y reciben JSON parecido. Una ruta cruzada no rompe
//      ningún tipo: la pantalla de prima muestra, con total naturalidad, las
//      cesantías.
//   3. **Si el JWT viaja.** Sin token el backend responde 401 y el usuario lee
//      "No se pudo guardar", que parece un problema del servidor y no una
//      sesión que nunca se adjuntó.
//
// Se mockea `lib/supabase` a propósito y no sólo por comodidad: ese módulo
// llama a `createClient()` AL CARGARSE y revienta sin las variables de Vite.
// Con el mock, esta suite corre sin `.env.local` — que es como corre CI.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./lib/supabase", () => ({ supabase: { auth: { getSession } } }));

import {
  asegurarPerfilIndividual,
  calcularCesantias,
  calcularNomina,
  calcularPrima,
  calcularRecargos,
  calcularRetencion,
  explicarChat,
  extraerComprobante,
  guardarLiquidacion,
  listarFestivos,
  listarMisLiquidaciones,
  obtenerMiRol,
  obtenerParametros,
  registrarIndividual,
} from "./api";

type Peticion = { url: string; init: RequestInit };

const fetchMock = vi.fn();

/** Respuesta mínima: sólo lo que `api.ts` lee de verdad. */
function respuesta(estado: number, cuerpo: unknown) {
  return {
    ok: estado >= 200 && estado < 300,
    status: estado,
    json: async () => cuerpo,
  } as unknown as Response;
}

/** El 500 que devuelve HTML (proxy caído, timeout de la plataforma). Es el
 *  caso que más se olvida y el que convierte un error del servidor en un
 *  `SyntaxError: Unexpected token <` sin sentido para nadie. */
function respuestaSinJson(estado: number) {
  return {
    ok: false,
    status: estado,
    json: async () => {
      throw new SyntaxError("Unexpected token '<', \"<html>\" is not valid JSON");
    },
  } as unknown as Response;
}

function ultima(): Peticion {
  const c = fetchMock.mock.calls.at(-1)!;
  return { url: String(c[0]), init: c[1] as RequestInit };
}

const RESULTADO = { neto: 1 } as unknown as Parameters<typeof guardarLiquidacion>[0]["resultado"];

describe("api.ts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt-de-prueba" } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- (1) Los mensajes de error ---

  describe("errores del servidor", () => {
    it("un 400 muestra la explicación del backend, no un genérico", async () => {
      fetchMock.mockResolvedValue(respuesta(400, { error: "fechaIngreso posterior a fechaCorte" }));
      await expect(calcularNomina({} as Parameters<typeof calcularNomina>[0])).rejects.toThrow(
        "fechaIngreso posterior a fechaCorte",
      );
    });

    it("un error SIN campo `error` cae en el mensaje por defecto y no en undefined", async () => {
      fetchMock.mockResolvedValue(respuesta(500, {}));
      // El fallo que caza: sin el `??`, el Error se construye con `undefined` y
      // el usuario ve un cartel vacío.
      await expect(calcularNomina({} as Parameters<typeof calcularNomina>[0])).rejects.toThrow(
        "No se pudo calcular la nómina",
      );
    });

    it("cada calculadora tiene su propio mensaje por defecto, no uno compartido", async () => {
      fetchMock.mockResolvedValue(respuesta(500, {}));
      const datos = { salarioMensual: 1, recibeAuxilioTransporte: false, fechaIngreso: "", fechaCorte: "" };
      await expect(calcularPrima(datos)).rejects.toThrow("No se pudo calcular la prima");
      await expect(calcularCesantias(datos)).rejects.toThrow("No se pudieron calcular las cesantías");
    });

    it("un 500 que devuelve HTML no llega a pantalla como SyntaxError", async () => {
      fetchMock.mockResolvedValue(respuestaSinJson(502));
      // `guardarLiquidacion` sí trae el `.catch(() => ({}))`; sin él, el usuario
      // lee un error del parser de JSON en vez de saber que falló el guardado.
      await expect(guardarLiquidacion({ resultado: RESULTADO })).rejects.toThrow(
        "No se pudo guardar la liquidación",
      );
    });

    it("registrar con un email repetido tampoco se rompe si el cuerpo no es JSON", async () => {
      fetchMock.mockResolvedValue(respuestaSinJson(409));
      await expect(
        registrarIndividual({ email: "a@b.co", password: "x", nombre: "A" }),
      ).rejects.toThrow("No se pudo crear la cuenta");
    });
  });

  // --- Degradar sin fallar: dos endpoints donde un error NO debe tumbar la UI ---

  it("sin festivos la app sigue: un 500 devuelve lista vacía en vez de tirar", async () => {
    fetchMock.mockResolvedValue(respuesta(500, { error: "db caída" }));
    // El motor aplica los festivos server-side igual; esto es sólo para pintar
    // el calendario. Tirar acá dejaría el wizard entero en blanco.
    await expect(listarFestivos()).resolves.toEqual([]);
  });

  it("los parámetros legales devuelven null si el servidor no responde", async () => {
    fetchMock.mockResolvedValue(respuesta(503, {}));
    await expect(obtenerParametros()).resolves.toBeNull();
  });

  it("con 200 sí devuelven lo que mandó el servidor", async () => {
    fetchMock.mockResolvedValue(respuesta(200, [{ fecha: "2026-01-01" }]));
    await expect(listarFestivos()).resolves.toEqual([{ fecha: "2026-01-01" }]);

    fetchMock.mockResolvedValue(respuesta(200, { smlmv: 1_423_500, auxilioTransporteTopeSmlmv: 2 }));
    await expect(obtenerParametros()).resolves.toEqual({
      smlmv: 1_423_500,
      auxilioTransporteTopeSmlmv: 2,
    });
  });

  // --- (2) Cada payload a su endpoint ---

  describe("rutas", () => {
    beforeEach(() => {
      fetchMock.mockResolvedValue(respuesta(200, {}));
    });

    it.each([
      ["prima", () => calcularPrima({ salarioMensual: 1, recibeAuxilioTransporte: false, fechaIngreso: "", fechaCorte: "" }), "/api/prima/calcular"],
      ["cesantías", () => calcularCesantias({ salarioMensual: 1, recibeAuxilioTransporte: false, fechaIngreso: "", fechaCorte: "" }), "/api/cesantias/calcular"],
      ["recargos", () => calcularRecargos({ salarioMensual: 1, fechaReferencia: "", horas: {} }), "/api/recargos/calcular"],
      ["retención", () => calcularRetencion({ ingresoLaboralMensual: 1, declaraRenta: false, tieneDependientes: false }), "/api/retencion/calcular"],
    ])("la calculadora de %s pega en su propio endpoint", async (_nombre, llamar, ruta) => {
      // Una ruta cruzada devuelve JSON válido de OTRA calculadora: la pantalla
      // se pinta entera, con números que no son los que el usuario pidió.
      await llamar();
      expect(ultima().url).toBe(ruta);
    });

    it("las cuatro calculadoras mandan POST con JSON, no GET", async () => {
      await calcularRecargos({ salarioMensual: 1, fechaReferencia: "2026-01-01", horas: { nocturnas: 3 } });
      const { init } = ultima();
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toMatchObject({ horas: { nocturnas: 3 } });
    });

    it("el chat devuelve el campo `respuesta`, no el objeto entero", async () => {
      fetchMock.mockResolvedValue(respuesta(200, { respuesta: "El auxilio no cotiza." }));
      await expect(explicarChat(RESULTADO, "¿por qué?", [])).resolves.toBe("El auxilio no cotiza.");
    });
  });

  it("subir un comprobante NO fija Content-Type a mano", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { conceptos: [] }));
    await extraerComprobante(new File(["x"], "recibo.pdf"));
    const { init } = ultima();
    // Fijarlo rompe el `boundary` que el navegador genera para el multipart, y
    // el servidor responde "archivo faltante" con el archivo delante.
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });

  // --- (3) El JWT ---

  describe("sesión", () => {
    it("guardar sin sesión falla ANTES de pegarle al servidor", async () => {
      getSession.mockResolvedValue({ data: { session: null } });
      await expect(guardarLiquidacion({ resultado: RESULTADO })).rejects.toThrow(
        "Necesitas iniciar sesión para guardar tu liquidación",
      );
      // Lo importante no es el mensaje sino esto: un POST sin token vuelve 401
      // y el usuario lee "no se pudo guardar", que suena a servidor caído.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("con sesión, el token viaja en Authorization", async () => {
      fetchMock.mockResolvedValue(respuesta(200, { id: 7, creadoEn: "2026-08-05" }));
      await guardarLiquidacion({ resultado: RESULTADO, netoRecibido: 100 });
      const { init } = ultima();
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-de-prueba");
      expect(JSON.parse(String(init.body))).toMatchObject({ netoRecibido: 100 });
    });

    it("el historial sin sesión tampoco sale a la red", async () => {
      getSession.mockResolvedValue({ data: { session: null } });
      await expect(listarMisLiquidaciones()).rejects.toThrow("Necesitas iniciar sesión");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("whoami sin sesión dice que no hay sesión, no 'no se pudo determinar tu rol'", async () => {
      getSession.mockResolvedValue({ data: { session: null } });
      // Distinguirlos importa: el segundo mensaje manda a mirar el backend
      // cuando el problema es que la sesión ni siquiera existe.
      await expect(obtenerMiRol()).rejects.toThrow("No hay sesión activa");
    });

    it("asegurar el perfil sin sesión NO tira: sale en silencio", async () => {
      getSession.mockResolvedValue({ data: { session: null } });
      // Es deliberadamente distinto de los tres de arriba. Corre en el retorno
      // de un redirect OAuth, donde la sesión puede no estar todavía; tirar acá
      // pintaría un error en la cara de alguien que sí se autenticó bien.
      await expect(asegurarPerfilIndividual()).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("asegurar el perfil con sesión manda el token y tolera un cuerpo vacío", async () => {
      fetchMock.mockResolvedValue(respuesta(200, {}));
      await asegurarPerfilIndividual();
      const { url, init } = ultima();
      expect(url).toBe("/api/auth/perfil-individual");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-de-prueba");
    });
  });
});
