// Tests de `costosService.ts` — el panel de costos del empleador (SDD §13).
// Su modo de falla no es una excepción: es un total plausible y equivocado en
// la pantalla con la que la empresa presupuesta la nómina. Por eso el peso va
// en la composición de los totales: quién entra al factor, quién queda como
// salario plano (aprendiz SENA), y que los honorarios de contratistas NUNCA se
// mezclen con el costo laboral.
//
// El fixture legal NO es inventado: es `prisma/semillaLegal.ts`, la misma
// semilla que se siembra en la base (mismo criterio que batchPublicoService).
// El corte va en `lib/prisma.js` para que la suite pase con `env -u DATABASE_URL`.
//
// El servicio resuelve reglas con `new Date()` ("hoy"): se congela el reloj en
// 2026-08-05 para que los valores 2026 de la semilla sean deterministas.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FESTIVOS_SEMILLA, REGLAS_SEMILLA } from "../../../prisma/semillaLegal.js";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    reglaLegal: { findMany: vi.fn() },
    festivo: { findMany: vi.fn() },
    empleado: { findMany: vi.fn() },
    contratista: { findMany: vi.fn() },
  },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import { calcularCostosEmpresa } from "../costosService.js";
import { invalidarCacheReglas } from "../nominaService.js";

interface EmpleadoFixture {
  id: number;
  nombre: string;
  tipoContrato: string;
  salarioBase: number;
  auxilioTransporte: boolean;
  claseRiesgoArl: number;
}

function empleado(over: Partial<EmpleadoFixture> = {}): EmpleadoFixture {
  return {
    id: 1,
    nombre: "Ana Base",
    tipoContrato: "indefinido",
    salarioBase: 2_000_000,
    auxilioTransporte: true,
    claseRiesgoArl: 1,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));
  // El caché de reglas es global al módulo nominaService: se invalida para que
  // cada test lea de este mock y no del residuo del test anterior.
  invalidarCacheReglas();
  prismaMock.reglaLegal.findMany
    .mockReset()
    .mockResolvedValue(
      REGLAS_SEMILLA.map((r) => ({ ...r, vigenteHasta: r.vigenteHasta ?? null, fuente: r.fuente ?? null }))
    );
  prismaMock.festivo.findMany.mockReset().mockResolvedValue(FESTIVOS_SEMILLA);
  prismaMock.empleado.findMany.mockReset().mockResolvedValue([]);
  prismaMock.contratista.findMany.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calcularCostosEmpresa — totales", () => {
  it("empresa sin empleados ni contratistas: totales en 0 y factorPromedio 1, no NaN", async () => {
    // Con nominaBase 0 el factor sería 0/0 = NaN — un NaN serializado a JSON
    // llega como null a la UI y el panel muestra un guion donde iba el factor.
    const r = await calcularCostosEmpresa(1, true);
    expect(r.empleados).toEqual([]);
    expect(r.contratistas).toEqual([]);
    expect(r.totales).toEqual({
      nominaBaseMensual: 0,
      costoTotalMensual: 0,
      honorariosMensuales: 0,
      factorPromedio: 1,
    });
  });

  it("empleado exonerado con auxilio: el costo real de $2.000.000 es $3.060.209 (factor 1,53)", async () => {
    // Derivación con la semilla 2026 (auxilio 249.095, exonerado Ley 1607):
    //   salario 2.000.000 + auxilio 249.095 + pensión 12% 240.000
    //   + ARL I 0,522% 10.440 + caja 4% 80.000
    //   + cesantías (2.249.095×30/360) 187.425 + intereses 12% 22.491
    //   + prima 187.425 + vacaciones (2.000.000×30/720) 83.333 = 3.060.209.
    // Si alguien toca un factor o quita un redondeo, este número deja de dar.
    prismaMock.empleado.findMany.mockResolvedValue([empleado()]);
    const r = await calcularCostosEmpresa(1, true);
    expect(r.totales.nominaBaseMensual).toBe(2_000_000);
    expect(r.totales.costoTotalMensual).toBe(3_060_209);
    expect(r.totales.factorPromedio).toBe(1.53);
    // Exonerado: sin salud patronal, SENA ni ICBF en las líneas.
    const conceptos = r.empleados[0]!.costo!.lineas.map((l) => l.concepto);
    expect(conceptos).not.toContain("Salud (aporte empleador)");
    expect(conceptos).not.toContain("SENA");
    expect(conceptos).not.toContain("ICBF");
  });

  it("sin exoneración se suman salud patronal (8,5%), SENA (2%) e ICBF (3%)", async () => {
    // 2.000.000 × (0,085 + 0,02 + 0,03) = 270.000 más que el caso exonerado.
    prismaMock.empleado.findMany.mockResolvedValue([empleado()]);
    const r = await calcularCostosEmpresa(1, false);
    expect(r.exonerado).toBe(false);
    expect(r.totales.costoTotalMensual).toBe(3_060_209 + 270_000);
    const porConcepto = Object.fromEntries(
      r.empleados[0]!.costo!.lineas.map((l) => [l.concepto, l.valor])
    );
    expect(porConcepto["Salud (aporte empleador)"]).toBe(170_000);
    expect(porConcepto["SENA"]).toBe(40_000);
    expect(porConcepto["ICBF"]).toBe(60_000);
  });

  it("aprendiz SENA (lectiva y práctica) queda con costo null pero su auxilio entra plano al total", async () => {
    // El aprendiz no genera carga patronal plena (Ley 789 de 2002): si se le
    // aplicara el factor, el panel sobrecostearía cada aprendiz en ~50%.
    prismaMock.empleado.findMany.mockResolvedValue([
      empleado({ id: 1, tipoContrato: "aprendizaje_sena_lectiva", salarioBase: 1_750_905 }),
      empleado({ id: 2, tipoContrato: "aprendizaje_sena_practica", salarioBase: 1_750_905 }),
    ]);
    const r = await calcularCostosEmpresa(1, true);
    expect(r.empleados.map((e) => e.costo)).toEqual([null, null]);
    expect(r.totales.nominaBaseMensual).toBe(2 * 1_750_905);
    // Salario plano, sin factor: costo == nómina base.
    expect(r.totales.costoTotalMensual).toBe(2 * 1_750_905);
    expect(r.totales.factorPromedio).toBe(1);
  });

  it("los honorarios de contratistas NO contaminan ni el costo laboral ni el factor", async () => {
    // Mezclarlos inflaría el costo laboral y desviaría el factor promedio —
    // el contratista no genera aportes patronales (Ley 1819 de 2016, art. 244).
    prismaMock.empleado.findMany.mockResolvedValue([empleado()]);
    prismaMock.contratista.findMany.mockResolvedValue([
      { id: 7, nombre: "Bob Servicios", honorariosMensuales: 3_000_000 },
      { id: 8, nombre: "Cleo Servicios", honorariosMensuales: 1_500_000 },
    ]);
    const r = await calcularCostosEmpresa(1, true);
    expect(r.totales.honorariosMensuales).toBe(4_500_000);
    expect(r.totales.nominaBaseMensual).toBe(2_000_000);
    expect(r.totales.costoTotalMensual).toBe(3_060_209);
    expect(r.totales.factorPromedio).toBe(1.53);
    expect(r.contratistas).toEqual([
      { contratistaId: 7, nombre: "Bob Servicios", honorariosMensuales: 3_000_000 },
      { contratistaId: 8, nombre: "Cleo Servicios", honorariosMensuales: 1_500_000 },
    ]);
  });

  it("mixto: el total es la suma exacta de costo real + salario plano del aprendiz", async () => {
    prismaMock.empleado.findMany.mockResolvedValue([
      empleado({ id: 1 }),
      empleado({ id: 2, tipoContrato: "aprendizaje_sena_lectiva", salarioBase: 1_000_000 }),
    ]);
    const r = await calcularCostosEmpresa(1, true);
    expect(r.totales.nominaBaseMensual).toBe(3_000_000);
    expect(r.totales.costoTotalMensual).toBe(3_060_209 + 1_000_000);
    // factor = round((4.060.209 / 3.000.000) × 1000) / 1000 = 1,353 — a TRES
    // decimales exactos: sin el redondeo daría 1,353403 y la UI mostraría ruido.
    expect(r.totales.factorPromedio).toBe(1.353);
  });

  it("salario ≥ 10 SMLMV: la exoneración pedida no aplica y se advierte", async () => {
    // Umbral Ley 1607: exonerar un salario alto por error le esconde a la
    // empresa 13,5 puntos de carga patronal en su empleado más caro.
    prismaMock.empleado.findMany.mockResolvedValue([
      empleado({ salarioBase: 20_000_000, auxilioTransporte: false }),
    ]);
    const r = await calcularCostosEmpresa(1, true);
    const costo = r.empleados[0]!.costo!;
    const conceptos = costo.lineas.map((l) => l.concepto);
    expect(conceptos).toContain("Salud (aporte empleador)");
    expect(conceptos).toContain("SENA");
    expect(conceptos).toContain("ICBF");
    expect(costo.advertencias.join(" ")).toContain("Ley 1607");
  });

  it("consulta solo empleados y contratistas ACTIVOS de ESA empresa", async () => {
    // Colar un inactivo (o a la empresa vecina) produce un presupuesto
    // plausible e inflado — nadie nota una fila de más en 40.
    await calcularCostosEmpresa(123, true);
    expect(prismaMock.empleado.findMany.mock.calls[0][0].where).toEqual({
      empresaId: 123,
      activo: true,
    });
    expect(prismaMock.contratista.findMany.mock.calls[0][0].where).toEqual({
      empresaId: 123,
      activo: true,
    });
  });
});
