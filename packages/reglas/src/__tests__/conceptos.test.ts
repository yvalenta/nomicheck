import { describe, expect, it } from "vitest";
import {
  CODIGOS_RECARGO_EXTRA,
  ETIQUETAS_CONCEPTO,
  esDevengoBase,
  esIngresoSalarial,
  esRecargoOExtra,
  traducirLineas,
} from "../conceptos.js";
import { CalculadoraPorTurnos } from "../calculadoraTurnos.js";
import { HORARIO_BASE_DEFAULT } from "../constantes.js";
import type { LineaResultado } from "../types.js";
import { FESTIVOS_2026, REGLAS_JUL_2026 } from "./fixtures.js";

const linea = (codigo: LineaResultado["codigo"], extra: Partial<LineaResultado> = {}): LineaResultado => ({
  codigo,
  concepto: "etiqueta cualquiera",
  valorCalculado: 1000,
  tipo: "devengo",
  ...extra,
});

describe("clasificación por código", () => {
  it("reconoce recargos y extras sin mirar la etiqueta", () => {
    for (const codigo of CODIGOS_RECARGO_EXTRA) {
      expect(esRecargoOExtra(linea(codigo)), codigo).toBe(true);
    }
    expect(esRecargoOExtra(linea("SALARIO_BASE"))).toBe(false);
    expect(esRecargoOExtra(linea("SALUD_EMPLEADO"))).toBe(false);
  });

  it("el auxilio de transporte es ingreso salarial del recibo pero NO devengo base con recargos", () => {
    expect(esIngresoSalarial(linea("AUXILIO_TRANSPORTE"))).toBe(true);
    expect(esDevengoBase(linea("AUXILIO_TRANSPORTE"))).toBe(true);
    expect(esDevengoBase(linea("RECARGO_DOMINICAL"))).toBe(false);
    expect(esIngresoSalarial(linea("RECARGO_DOMINICAL"))).toBe(true);
  });
});

describe("traducción de etiquetas", () => {
  it("en español devuelve el mismo arreglo, sin copiar", () => {
    const lineas = [linea("SALARIO_BASE")];
    expect(traducirLineas(lineas, "es")).toBe(lineas);
  });

  it("traduce la etiqueta y deja intactos código, importe y cita legal", () => {
    const original = linea("RECARGO_DOMINICAL", {
      concepto: "Recargo dominical/festivo",
      ley: "Ley 2466 de 2025, art. 2",
      valorCalculado: 45023,
    });
    const [t] = traducirLineas([original], "en");
    expect(t.concepto).toBe("Sunday/holiday differential");
    expect(t.codigo).toBe("RECARGO_DOMINICAL");
    expect(t.valorCalculado).toBe(45023);
    // Una cita legal es nombre propio: "Law 2466 of 2025" no existe.
    expect(t.ley).toBe("Ley 2466 de 2025, art. 2");
  });

  it("no traduce lo que declaró quien llama — ese texto es suyo", () => {
    const declarado = linea("CONCEPTO_DECLARADO", { concepto: "Bono de productividad Q3" });
    const [t] = traducirLineas([declarado], "en");
    expect(t.concepto).toBe("Bono de productividad Q3");
  });

  it("todo código que emite el motor tiene etiqueta en los dos idiomas", () => {
    for (const [codigo, etiquetas] of Object.entries(ETIQUETAS_CONCEPTO)) {
      expect(etiquetas.es, codigo).toBeTruthy();
      expect(etiquetas.en, codigo).toBeTruthy();
    }
  });
});

describe("el motor emite código en todas sus líneas", () => {
  it("ninguna línea de una liquidación real sale sin código", () => {
    const resultado = CalculadoraPorTurnos.calcular(
      {
        modo: "turnos",
        salarioBasicoMensual: 1750905,
        recibeAuxilioTransporte: true,
        periodoDesde: "2026-07-16",
        periodoHasta: "2026-07-31",
        horarioBase: HORARIO_BASE_DEFAULT,
        novedades: [],
        prestamoMensual: 100000,
      },
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    expect(resultado.lineas.length).toBeGreaterThan(3);
    for (const l of resultado.lineas) {
      expect(l.codigo, `"${l.concepto}" salió sin código`).toBeTruthy();
      expect(ETIQUETAS_CONCEPTO[l.codigo], `código ${l.codigo} sin etiqueta`).toBeTruthy();
    }
  });
});
