import { describe, it, expect } from "vitest";
import { ErrorDeDatos } from "../errores.js";
import { calcularIndemnizacion } from "../indemnizacion.js";
import { CalculadoraPorTurnos } from "../calculadoraTurnos.js";
import { CalculadoraSalarioFijo } from "../calculadoraSalarioFijo.js";
import { CalculadoraServicios } from "../calculadoraServicios.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";

// Esta suite fija la CLASIFICACIÓN, no los mensajes.
//
// El motor distingue dos cosas que antes salían iguales: lo que está mal en el
// insumo de quien llama (`ErrorDeDatos` → 400) y lo que está mal de nuestro
// lado (`Error` → 500). La distinción existe porque el muro x402 cobra ANTES de
// ejecutar: devolverle 500 a un comprador por un dato suyo es cobrarle y
// dejarlo sin forma de saber que la culpa era de él.
//
// Lo que puede regresar en silencio no es el mapeo de la ruta —eso se ve— sino
// que alguien agregue una validación nueva con `throw new Error` y quede del
// lado equivocado. Por eso las dos direcciones están cubiertas.

describe("clasificación de errores del motor", () => {
  describe("son del comprador → ErrorDeDatos", () => {
    it("una fecha inexistente", () => {
      expect(() =>
        calcularIndemnizacion(
          {
            tipoContrato: "indefinido",
            salarioMensual: 2_000_000,
            fechaIngreso: "2024-02-30", // no existe
            fechaTerminacion: "2026-07-31",
            conJustaCausa: false,
          },
          REGLAS_JUL_2026,
        ),
      ).toThrow(ErrorDeDatos);
    });

    it("un salario en cero", () => {
      expect(() =>
        calcularIndemnizacion(
          {
            tipoContrato: "indefinido",
            salarioMensual: 0,
            fechaIngreso: "2024-01-15",
            fechaTerminacion: "2026-07-31",
            conJustaCausa: false,
          },
          REGLAS_JUL_2026,
        ),
      ).toThrow(ErrorDeDatos);
    });

    it("un periodo invertido", () => {
      expect(() =>
        calcularIndemnizacion(
          {
            tipoContrato: "indefinido",
            salarioMensual: 2_000_000,
            fechaIngreso: "2026-07-31",
            fechaTerminacion: "2024-01-15", // termina antes de entrar
            conJustaCausa: false,
          },
          REGLAS_JUL_2026,
        ),
      ).toThrow(ErrorDeDatos);
    });
  });

  describe("NO son del comprador → Error común, o sea 500", () => {
    // El que paga no elige qué calculadora corre. Si llega la equivocada el bug
    // es nuestro, y un 400 le mentiría diciéndole que revise sus datos.
    const guardas: Array<[string, () => unknown]> = [
      ["turnos", () => CalculadoraPorTurnos.calcular({ modo: "salario-fijo" } as never, REGLAS_JUL_2026, [])],
      ["salario fijo", () => CalculadoraSalarioFijo.calcular({ modo: "turnos" } as never, REGLAS_JUL_2026, [])],
      ["servicios", () => CalculadoraServicios.calcular({ modo: "turnos" } as never, REGLAS_JUL_2026, [])],
    ];

    for (const [nombre, construir] of guardas) {
      it(`la guarda de modo de ${nombre}`, () => {
        expect(construir).toThrow(Error);
        expect(construir).not.toThrow(ErrorDeDatos);
      });
    }
  });

  it("ErrorDeDatos sigue siendo un Error para todo el que ya lo atrapaba", () => {
    // La web hace `catch (e) { e.message }` en varios lados y no sabe que esta
    // clase existe. Si `instanceof Error` fallara, este cambio la rompería.
    const e = new ErrorDeDatos("algo del insumo");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ErrorDeDatos);
    expect(e.message).toBe("algo del insumo");
    expect(e.name).toBe("ErrorDeDatos");
  });
});
