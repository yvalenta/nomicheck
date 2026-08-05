// Tests de `chatService.ts` — el "chat contador" que EXPLICA un resultado ya
// calculado, vía la capa multi-proveedor de `services/ia/`. Acá el riesgo no
// es un cálculo mal hecho (el LLM no calcula): es QUÉ viaja al proveedor
// externo. La única barrera de habeas data de este servicio es la FORMA del
// contexto: `contextoResultado` arma el prompt campo por campo desde una
// allowlist de cifras (modo, periodo, salario, líneas, totales, advertencias)
// — sin nombre, sin documento, sin empresa. Estas pruebas fijan esa allowlist:
// si alguien la reemplaza por un JSON.stringify(resultado) "más completo",
// los campos colados de un caller empiezan a salir a la red y esto se pone
// rojo.
//
// RED PROHIBIDA: `../ia/index.js` está mockeado entero — ni Gemini ni Claude
// existen acá, y no hay API keys en el entorno de CI para delatarlo tarde.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock("../ia/index.js", () => ({
  // El servicio pide el proveedor EN CADA llamada — devolver siempre el mismo
  // mock hace visible cada conversación.
  proveedorChat: () => ({ chat: chatMock }),
}));

import { explicarResultado } from "../chatService.js";

type Resultado = Parameters<typeof explicarResultado>[0];

function resultadoFixture(over: Partial<Resultado> = {}): Resultado {
  return {
    modo: "salario-fijo",
    periodoDesde: "2026-07-01",
    periodoHasta: "2026-07-31",
    salarioBasicoMensual: 2_000_000,
    lineas: [
      { concepto: "Salario", valorCalculado: 2_000_000, tipo: "devengo" },
      // Recargo dominical del 90% desde jul-2026 (Ley 2466 de 2025) — la misma
      // regla que la semilla legal siembra; el chat debe poder citarla.
      { concepto: "Recargo dominical", valorCalculado: 90_000, tipo: "devengo", horas: 8, recargoPct: 0.9, ley: "Ley 2466 de 2025, art. 2" },
      { concepto: "Salud", valorCalculado: 80_000, tipo: "deduccion" },
    ],
    totalDevengos: 2_090_000,
    totalDeducciones: 80_000,
    netoEsperado: 2_010_000,
    advertencias: [],
    ...over,
  };
}

/** El system prompt que efectivamente viajó al proveedor. */
function promptEnviado(): string {
  return chatMock.mock.calls[0]![0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  chatMock.mockResolvedValue("explicación del contador");
});

describe("explicarResultado — qué viaja al proveedor", () => {
  it("una sola llamada al proveedor: system prompt con contexto, historial y pregunta como argumentos separados", async () => {
    await explicarResultado(resultadoFixture(), "¿por qué el neto no es el salario completo?");
    expect(chatMock).toHaveBeenCalledTimes(1);
    const [prompt, historial, pregunta] = chatMock.mock.calls[0]!;
    expect(prompt).toContain('Eres el "chat contador"');
    // El contrato del prompt: explicar, jamás recalcular ni contradecir.
    expect(prompt).toContain("nunca lo recalculas");
    expect(historial).toEqual([]);
    // La pregunta viaja como argumento propio, no concatenada al historial ni
    // al system prompt — el proveedor decide cómo encajarla en su formato.
    expect(pregunta).toBe("¿por qué el neto no es el salario completo?");
  });

  it("el contexto lleva las cifras del resultado: periodo, líneas con %, horas y ley citables", async () => {
    await explicarResultado(resultadoFixture(), "explícame el recargo");
    const prompt = promptEnviado();
    expect(prompt).toContain("Modo: salario-fijo");
    expect(prompt).toContain("Periodo: 2026-07-01 a 2026-07-31");
    expect(prompt).toContain("Salario básico mensual pactado: $");
    // La línea con metadata completa: horas, porcentaje humano y su ley — es
    // lo que permite responder "el recargo dominical es del 90%… según la
    // Ley 2466" sin que el LLM invente.
    expect(prompt).toContain("devengo: Recargo dominical");
    expect(prompt).toContain("8 h");
    expect(prompt).toContain("90%");
    expect(prompt).toContain("(Ley 2466 de 2025, art. 2)");
    expect(prompt).toContain("Neto esperado: $");
  });

  it("HABEAS DATA: al proveedor solo viaja la allowlist — nombre, documento y empresa colados NO salen a la red", async () => {
    // El schema de entrada (chatExplicarSchema) no tiene campos de identidad,
    // pero un caller interno podría pasar el objeto gordo de otra capa. La
    // garantía tiene que estar en la construcción del contexto: campo por
    // campo, nunca serializando el objeto entero.
    const gordo = {
      ...resultadoFixture(),
      nombreEmpleado: "Ana María Rojas Quintero",
      documento: "CC 43.598.221",
      empresa: "Frutera del Valle SAS",
      email: "ana.rojas@frutera.co",
    } as unknown as Resultado;
    await explicarResultado(gordo, "¿está bien mi neto?");
    const prompt = promptEnviado();
    expect(prompt).not.toContain("Ana María Rojas Quintero");
    expect(prompt).not.toContain("43.598.221");
    expect(prompt).not.toContain("Frutera del Valle");
    expect(prompt).not.toContain("ana.rojas@frutera.co");
  });

  it("advertencias presentes se citan; ausentes no dejan una línea 'Advertencias:' vacía que invite a inventar", async () => {
    await explicarResultado(
      resultadoFixture({ advertencias: ["Supera el tope de horas extra semanales"] }),
      "¿qué significa la advertencia?"
    );
    expect(promptEnviado()).toContain("Advertencias: Supera el tope de horas extra semanales");

    chatMock.mockClear();
    await explicarResultado(resultadoFixture({ advertencias: [] }), "todo bien?");
    expect(promptEnviado()).not.toContain("Advertencias:");
  });
});

describe("explicarResultado — historial y respuesta", () => {
  it("convierte los roles del dominio a los del proveedor conservando orden y texto", async () => {
    // "usuario"/"asistente" es el contrato del API público (validation/chat);
    // "user"/"assistant" es el de los SDKs. Si la conversión se cae, el
    // proveedor recibe roles inválidos y el turno de cada quien se invierte.
    await explicarResultado(resultadoFixture(), "¿y entonces?", [
      { rol: "usuario", texto: "hola" },
      { rol: "asistente", texto: "buenas, ¿qué duda tienes?" },
    ]);
    expect(chatMock.mock.calls[0]![1]).toEqual([
      { rol: "user", texto: "hola" },
      { rol: "assistant", texto: "buenas, ¿qué duda tienes?" },
    ]);
  });

  it("la respuesta del proveedor vuelve tal cual, sin editar", async () => {
    chatMock.mockResolvedValue("El neto baja por salud y pensión (4% y 4%).");
    await expect(explicarResultado(resultadoFixture(), "¿por qué baja?")).resolves.toBe(
      "El neto baja por salud y pensión (4% y 4%)."
    );
  });

  it("proveedor caído: el error SUBE claro — no se traga, no se reintenta, no se cuelga", async () => {
    // La degradación la maneja el controlador (código HTTP); lo que este
    // servicio garantiza es no convertir un fallo del proveedor en una
    // promesa colgada ni en una respuesta vacía que parezca del contador.
    chatMock.mockRejectedValue(new Error("GEMINI_API_KEY no configurada en el servidor"));
    await expect(explicarResultado(resultadoFixture(), "hola")).rejects.toThrow("GEMINI_API_KEY no configurada");
    expect(chatMock).toHaveBeenCalledTimes(1); // sin reintentos escondidos
  });
});
