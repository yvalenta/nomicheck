// Tests de la función pura del pipeline de liquidación (SDD §15, Fase 6.1).
// calcularReciboLote es lo que corre el worker por cada lote de 50 empleados;
// como no toca BD, cabe en Vitest puro. Los tests con Prisma se quedan como
// E2E ad-hoc contra el contenedor (ver scratchpad/e2e_liquidar.mjs).
import { describe, expect, it } from "vitest";
import { REGLAS_JUL_2026, FESTIVOS_2026 } from "../../../../../packages/reglas/src/__tests__/fixtures.js";
import { crearResolutorReglas } from "@pv/reglas";
import {
  calcularReciboLote,
  calcularRecibosContratistas,
  type EmpleadoLiquidable,
} from "../liquidacionCalculo.js";

const PERIODO = { fechaInicio: "2026-07-01", fechaFin: "2026-07-30" };
const PERIODO_ID = 999;

function empleado(over: Partial<EmpleadoLiquidable> = {}): EmpleadoLiquidable {
  return {
    id: 1,
    nombre: "Empleado Base",
    salarioBase: 2_000_000,
    auxilioTransporte: false,
    tipoNomina: "fijo",
    tipoContrato: "indefinido",
    ...over,
  };
}

describe("calcularReciboLote", () => {
  const resolutor = crearResolutorReglas(REGLAS_JUL_2026);

  it("lote todo aprobado: emite un recibo por empleado, sin rechazos", () => {
    const empleados = [
      empleado({ id: 1, nombre: "Ana", salarioBase: 2_000_000 }),
      empleado({ id: 2, nombre: "Bob", salarioBase: 2_500_000 }),
      empleado({ id: 3, nombre: "Clara", salarioBase: 3_000_000 }),
    ];
    const { recibos, rechazos } = calcularReciboLote(
      PERIODO_ID, PERIODO, empleados, [], REGLAS_JUL_2026, FESTIVOS_2026, resolutor
    );
    expect(rechazos).toEqual([]);
    expect(recibos).toHaveLength(3);
    expect(recibos.map((r) => r.empleadoId).sort()).toEqual([1, 2, 3]);
    // Cada recibo trae totales enteros (redondearPeso ya se aplicó) y neto positivo.
    for (const r of recibos) {
      expect(r.totalDevengado % 1).toBe(0);
      expect(r.totalDeducido % 1).toBe(0);
      expect(r.neto).toBeGreaterThan(0);
    }
  });

  it("empleado con salarioBase ínfimo se rechaza por QA (NETO_BAJO_MINIMO + IBC_FUERA_DE_RANGO); los otros siguen liquidando", () => {
    const empleados = [
      empleado({ id: 1, nombre: "Ana Ok", salarioBase: 2_000_000 }),
      empleado({ id: 2, nombre: "Carlos Rechazado", salarioBase: 100 }),
      empleado({ id: 3, nombre: "Bob Ok", salarioBase: 2_500_000 }),
    ];
    const { recibos, rechazos } = calcularReciboLote(
      PERIODO_ID, PERIODO, empleados, [], REGLAS_JUL_2026, FESTIVOS_2026, resolutor
    );
    expect(recibos).toHaveLength(2);
    expect(recibos.map((r) => r.empleadoId).sort()).toEqual([1, 3]);
    expect(rechazos).toHaveLength(1);
    expect(rechazos[0]).toMatchObject({ empleadoId: 2, nombre: "Carlos Rechazado" });
    const codigos = rechazos[0].issues.map((i) => i.codigo).sort();
    // Salario 100 → IBC $100 < 1 SMLMV Y neto $92 < SMLMV — los dos códigos.
    expect(codigos).toContain("IBC_FUERA_DE_RANGO");
    expect(codigos).toContain("NETO_BAJO_MINIMO");
  });

  it("empleado por turnos con jornadas de 18h L-S es rechazado por HORAS_EXTRA_EXCEDIDAS (severidad error)", () => {
    const emp = empleado({ id: 10, nombre: "Turnos Extremos", tipoNomina: "turnos", salarioBase: 2_000_000 });
    // Lunes 6-jul a sábado 11-jul, 18h/día — cada día viola las 2h de HE
    // (D.L. 13 de 1967 art. 1) y la semana viola las 12h (Ley 6 de 1981).
    const turnos = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11"].map(
      (fecha) => ({ empleadoId: 10, fecha, horaInicio: "06:00", horaFin: "23:59" })
    );
    const { recibos, rechazos } = calcularReciboLote(
      PERIODO_ID, PERIODO, [emp], turnos, REGLAS_JUL_2026, FESTIVOS_2026, resolutor
    );
    // Los códigos HE día/semana son severidad "error", así que el empleado
    // sale a rechazos y NO produce recibo — el resto del lote sigue.
    expect(recibos).toEqual([]);
    expect(rechazos).toHaveLength(1);
    const codigos = rechazos[0].issues.map((i) => i.codigo);
    expect(codigos).toContain("HORAS_EXTRA_EXCEDIDAS_DIA");
    expect(codigos).toContain("HORAS_EXTRA_EXCEDIDAS_SEMANA");
  });

  it("aprendiz SENA lectivo cae en el gate QA por IBC=0 (hallazgo, ver #4)", () => {
    // Comportamiento actual: deduccionesDeLey(alcance="ninguno") no emite la
    // línea "Salud (aporte empleado)" → ibcDeLineas devuelve 0 → evaluarQA
    // dispara IBC_FUERA_DE_RANGO como error. Efecto: el aprendiz nunca liquida.
    // La ley (789/2002 art. 30) EXIME al aprendiz lectivo de cotizar — el gate
    // no debería aplicar validación IBC a contratos sin obligación de aportes.
    // Este test documenta el bug para no perderlo; el fix va en la tarea #4.
    const emp = empleado({
      id: 20,
      nombre: "Aprendiz Lectivo",
      salarioBase: 1_750_905, // 1 SMLMV
      tipoContrato: "aprendizaje_sena_lectiva",
    });
    const { recibos, rechazos } = calcularReciboLote(
      PERIODO_ID, PERIODO, [emp], [], REGLAS_JUL_2026, FESTIVOS_2026, resolutor
    );
    expect(recibos).toEqual([]);
    expect(rechazos).toHaveLength(1);
    expect(rechazos[0].issues.some((i) => i.codigo === "IBC_FUERA_DE_RANGO")).toBe(true);
  });

  it("lote vacío → recibos y rechazos vacíos (worker debe manejar el edge)", () => {
    const r = calcularReciboLote(PERIODO_ID, PERIODO, [], [], REGLAS_JUL_2026, FESTIVOS_2026, resolutor);
    expect(r.recibos).toEqual([]);
    expect(r.rechazos).toEqual([]);
  });
});

describe("calcularRecibosContratistas", () => {
  it("genera un recibo por contratista (no pasan por gate QA)", () => {
    const contratistas = [
      { id: 1, honorariosMensuales: 4_000_000 },
      { id: 2, honorariosMensuales: 5_500_000 },
    ];
    const recibos = calcularRecibosContratistas(
      PERIODO_ID, PERIODO, contratistas, REGLAS_JUL_2026, FESTIVOS_2026
    );
    expect(recibos).toHaveLength(2);
    expect(recibos.map((r) => r.contratistaId).sort()).toEqual([1, 2]);
    // No hay empleadoId — es la separación clave (SDD §07: contratista ≠ empleado).
    for (const r of recibos) {
      expect(r).not.toHaveProperty("empleadoId");
      expect(r.neto).toBeGreaterThan(0);
    }
  });
});
