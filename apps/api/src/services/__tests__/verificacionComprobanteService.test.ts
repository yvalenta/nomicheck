// Tests PUROS del matcher declarado-vs-calculado (listing 5) — sin BD, sin
// motor, solo estructuras de datos. `calcularNomina` en sí ya tiene sus
// propios tests en packages/reglas; aquí se prueba el PUENTE de comparación.
import { describe, expect, it } from "vitest";
import type { LineaResultado } from "@pv/reglas";
import { canonicalizarConcepto, compararComprobante } from "../verificacionComprobanteService.js";

const LINEAS_CALCULADAS: LineaResultado[] = [
  { concepto: "Salario básico", valorCalculado: 2_000_000, tipo: "devengo", ley: "Contrato de trabajo" },
  { concepto: "Auxilio de transporte", valorCalculado: 200_000, tipo: "devengo", ley: "Decreto de salario mínimo vigente" },
  { concepto: "Salud (aporte empleado)", valorCalculado: 80_000, tipo: "deduccion", ley: "Ley 100 de 1993" },
  { concepto: "Pensión (aporte empleado)", valorCalculado: 80_000, tipo: "deduccion", ley: "Ley 100 de 1993" },
  // Fondo de solidaridad NO aparece — por debajo del umbral de 4 SMLMV, el
  // motor no la emite (mismo comportamiento que deduccionesDeLey).
];

describe("canonicalizarConcepto", () => {
  it("reconoce variantes de texto de salario básico", () => {
    expect(canonicalizarConcepto("Salario básico")).toBe("salario_basico");
    expect(canonicalizarConcepto("SUELDO BASICO")).toBe("salario_basico");
    expect(canonicalizarConcepto("Auxilio de sostenimiento")).toBe("salario_basico");
  });

  it("distingue fondo de solidaridad de pensión (pensional contiene 'pension')", () => {
    expect(canonicalizarConcepto("Fondo de solidaridad pensional")).toBe("fondo_solidaridad");
    expect(canonicalizarConcepto("Pensión (aporte empleado)")).toBe("pension");
  });

  it("no reconoce conceptos extralegales", () => {
    expect(canonicalizarConcepto("Bono de productividad")).toBeNull();
    expect(canonicalizarConcepto("Préstamo empresa")).toBeNull();
  });
});

describe("compararComprobante", () => {
  it("todo declarado igual a lo calculado → veredicto correcto, delta cero", () => {
    const diff = compararComprobante(
      [
        { nombre: "Salario básico", valor: 2_000_000 },
        { nombre: "Auxilio de transporte", valor: 200_000 },
        { nombre: "Salud", valor: 80_000 },
        { nombre: "Pensión", valor: 80_000 },
      ],
      LINEAS_CALCULADAS
    );
    expect(diff.veredicto).toBe("correcto");
    expect(diff.deltaNetoEstimado).toBe(0);
    expect(diff.lineas.every((l) => l.veredicto === "correcto")).toBe(true);
  });

  it("deducen más salud de la debida → pagado_de_menos con impacto negativo", () => {
    const diff = compararComprobante([{ nombre: "Salud", valor: 120_000 }], LINEAS_CALCULADAS);
    const l = diff.lineas[0]!;
    expect(l.claveConcepto).toBe("salud");
    expect(l.delta).toBe(40_000);
    expect(l.impactoNeto).toBe(-40_000); // dedujeron 40k de más → el trabajador recibió menos
    expect(l.veredicto).toBe("pagado_de_menos");
    expect(diff.veredicto).toBe("discrepancias_encontradas");
  });

  it("pagan menos auxilio de transporte del debido → pagado_de_menos (devengo a la baja)", () => {
    const diff = compararComprobante([{ nombre: "Auxilio de transporte", valor: 150_000 }], LINEAS_CALCULADAS);
    const l = diff.lineas[0]!;
    expect(l.impactoNeto).toBe(-50_000);
    expect(l.veredicto).toBe("pagado_de_menos");
  });

  it("pagan de más un devengo → pagado_de_mas", () => {
    const diff = compararComprobante([{ nombre: "Salario básico", valor: 2_100_000 }], LINEAS_CALCULADAS);
    expect(diff.lineas[0]!.veredicto).toBe("pagado_de_mas");
    expect(diff.lineas[0]!.impactoNeto).toBe(100_000);
  });

  it("concepto extralegal queda no_verificable y no afecta el veredicto global", () => {
    const diff = compararComprobante(
      [
        { nombre: "Salario básico", valor: 2_000_000 },
        { nombre: "Auxilio de transporte", valor: 200_000 },
        { nombre: "Salud", valor: 80_000 },
        { nombre: "Pensión", valor: 80_000 },
        { nombre: "Bono de productividad", valor: 500_000 },
      ],
      LINEAS_CALCULADAS
    );
    const bono = diff.lineas.find((l) => l.nombreDeclarado === "Bono de productividad")!;
    expect(bono.veredicto).toBe("no_verificable_extralegal");
    expect(bono.impactoNeto).toBe(0);
    expect(diff.veredicto).toBe("correcto"); // el resto sí cuadra
  });

  it("no declaran ninguna deducción/auxilio: todas las líneas de ley salen como faltante_en_comprobante", () => {
    const diff = compararComprobante([{ nombre: "Salario básico", valor: 2_000_000 }], LINEAS_CALCULADAS);
    const faltantes = diff.lineas.filter((l) => l.veredicto === "faltante_en_comprobante");
    // Auxilio, salud y pensión — las tres líneas de LINEAS_CALCULADAS que no
    // fueron declaradas, todas con valor calculado > 0.
    expect(faltantes.map((l) => l.claveConcepto).sort()).toEqual(["auxilio_transporte", "pension", "salud"]);
    const salud = faltantes.find((l) => l.claveConcepto === "salud")!;
    expect(salud.valorCalculado).toBe(80_000);
    expect(salud.impactoNeto).toBe(80_000); // no dedujeron → a favor del trabajador
    const auxilio = faltantes.find((l) => l.claveConcepto === "auxilio_transporte")!;
    expect(auxilio.impactoNeto).toBe(-200_000); // no lo pagaron → en contra del trabajador
    expect(diff.veredicto).toBe("discrepancias_encontradas");
  });

  it("fondo de solidaridad no aplica (no calculado) y no declarado → no se reporta como faltante", () => {
    const diff = compararComprobante(
      [
        { nombre: "Salario básico", valor: 2_000_000 },
        { nombre: "Auxilio de transporte", valor: 200_000 },
        { nombre: "Salud", valor: 80_000 },
        { nombre: "Pensión", valor: 80_000 },
      ],
      LINEAS_CALCULADAS
    );
    expect(diff.lineas.some((l) => l.claveConcepto === "fondo_solidaridad")).toBe(false);
    expect(diff.veredicto).toBe("correcto");
  });
});
