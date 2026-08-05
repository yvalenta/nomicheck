// Tests de `pilaService.ts` — la liquidación PILA "exacta" de un periodo ya
// liquidado (SDD §14). A diferencia del estimado gerencial de costosService,
// acá el IBC se LEE del ReciboPago persistido (campo `base` de la línea de
// salud), no se recalcula. El modo de falla es doble y silencioso: leer la
// línea equivocada produce aportes plausibles sobre un IBC ajeno, y resolver
// las reglas con la fecha equivocada aplica el SMLMV de otro año al umbral de
// exoneración. Ninguno de los dos revienta — solo pagan mal la PILA.
//
// Fixture legal: `prisma/semillaLegal.ts` (la misma semilla de la base).
// El corte va en `lib/prisma.js` para que la suite pase con `env -u DATABASE_URL`.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FESTIVOS_SEMILLA, REGLAS_SEMILLA } from "../../../prisma/semillaLegal.js";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    reglaLegal: { findMany: vi.fn() },
    festivo: { findMany: vi.fn() },
    periodoNomina: { findFirst: vi.fn() },
    reciboPago: { findMany: vi.fn() },
  },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import { calcularLiquidacionPilaPeriodo } from "../pilaService.js";
import { invalidarCacheReglas } from "../nominaService.js";

const PERIODO = {
  id: 55,
  empresaId: 1,
  estado: "liquidado",
  fechaInicio: "2026-07-01",
  fechaFin: "2026-07-15",
};

interface LineaFixture {
  codigo?: string;
  concepto: string;
  base?: number;
  valorCalculado: number;
  tipo: string;
}

function empleadoFixture(over: Record<string, unknown> = {}) {
  return {
    id: 10,
    nombre: "Ana Base",
    tipoContrato: "indefinido",
    claseRiesgoArl: 1,
    salarioBase: 2_000_000,
    ...over,
  };
}

// Recibo como lo persiste el worker: el IBC real vive en `base` de la línea
// SALUD_EMPLEADO (deduccionesDeLey lo escribe ahí — ver nota del servicio).
function recibo(lineas: LineaFixture[], empleado = empleadoFixture()) {
  return { id: 1, periodoId: PERIODO.id, empleadoId: empleado.id, lineas, empleado };
}

function lineaSalud(ibc: number): LineaFixture {
  return {
    codigo: "SALUD_EMPLEADO",
    concepto: "Salud (aporte empleado)",
    base: ibc,
    valorCalculado: Math.round(ibc * 0.04),
    tipo: "deduccion",
  };
}

function lineaAuxilio(valor: number): LineaFixture {
  return {
    codigo: "AUXILIO_TRANSPORTE",
    concepto: "Auxilio de transporte",
    valorCalculado: valor,
    tipo: "devengo",
  };
}

beforeEach(() => {
  invalidarCacheReglas();
  prismaMock.reglaLegal.findMany
    .mockReset()
    .mockResolvedValue(
      REGLAS_SEMILLA.map((r) => ({ ...r, vigenteHasta: r.vigenteHasta ?? null, fuente: r.fuente ?? null }))
    );
  prismaMock.festivo.findMany.mockReset().mockResolvedValue(FESTIVOS_SEMILLA);
  prismaMock.periodoNomina.findFirst.mockReset().mockResolvedValue(PERIODO);
  prismaMock.reciboPago.findMany.mockReset().mockResolvedValue([]);
});

describe("calcularLiquidacionPilaPeriodo — guardas", () => {
  it("periodo inexistente (o de otra empresa) lanza, no devuelve una PILA vacía", async () => {
    // findFirst filtra por { id, empresaId }: un periodo ajeno responde null y
    // eso DEBE ser error — una PILA en ceros de otra empresa parecería válida.
    prismaMock.periodoNomina.findFirst.mockResolvedValue(null);
    await expect(calcularLiquidacionPilaPeriodo(1, 999, true)).rejects.toThrow("Periodo no encontrado");
    expect(prismaMock.periodoNomina.findFirst.mock.calls[0][0].where).toEqual({
      id: 999,
      empresaId: 1,
    });
  });

  it("periodo en borrador lanza: sin recibos no hay IBC real que liquidar", async () => {
    prismaMock.periodoNomina.findFirst.mockResolvedValue({ ...PERIODO, estado: "borrador" });
    await expect(calcularLiquidacionPilaPeriodo(1, 55, true)).rejects.toThrow(
      /todavía no está liquidado/
    );
  });

  it("solo consulta recibos de empleados (contratistas no generan aportes patronales)", async () => {
    await calcularLiquidacionPilaPeriodo(1, 55, true);
    expect(prismaMock.reciboPago.findMany.mock.calls[0][0].where).toEqual({
      periodoId: 55,
      periodo: { empresaId: 1 },
      empleadoId: { not: null },
    });
  });
});

describe("calcularLiquidacionPilaPeriodo — el IBC sale del recibo, no se recalcula", () => {
  it("quincena exonerada: aportes exactos sobre el IBC persistido de $1.000.000", async () => {
    // Derivación con la semilla (fechaFin 2026-07-15, exonerado Ley 1607):
    //   pensión 12% 120.000 + ARL I 0,522% 5.220 + caja 4% 40.000
    //   + auxilio 124.548 + cesantías (1.124.548×30/360) 93.712
    //   + intereses 12% 11.245 + prima 93.712 + vacaciones (1.000.000×30/720) 41.667
    //   → costoTotalPeriodo = 1.000.000 + esas líneas = 1.530.104.
    prismaMock.reciboPago.findMany.mockResolvedValue([
      recibo([lineaSalud(1_000_000), lineaAuxilio(124_548)]),
    ]);
    const r = await calcularLiquidacionPilaPeriodo(1, 55, true);
    expect(r.empleados).toHaveLength(1);
    const pila = r.empleados[0]!.pila!;
    expect(pila.ibcPeriodo).toBe(1_000_000);
    const porConcepto = Object.fromEntries(pila.lineas.map((l) => [l.concepto, l.valor]));
    expect(porConcepto["Pensión (aporte empleador)"]).toBe(120_000);
    expect(porConcepto["ARL (clase de riesgo I)"]).toBe(5_220);
    expect(porConcepto["Caja de compensación familiar"]).toBe(40_000);
    expect(porConcepto["Auxilio de transporte"]).toBe(124_548);
    expect(porConcepto["Salud (aporte empleador)"]).toBeUndefined(); // exonerado
    expect(pila.costoTotalPeriodo).toBe(1_530_104);
    expect(r.totales).toEqual({ ibcTotal: 1_000_000, costoTotalPeriodo: 1_530_104 });
  });

  it("recibo legacy sin `codigo`: cae al texto exacto y encuentra el mismo IBC", async () => {
    // Hay recibos en BD anteriores a que existiera `codigo` — se liquidan
    // PILAs de periodos ya cerrados, el fallback no se puede quitar.
    prismaMock.reciboPago.findMany.mockResolvedValue([
      recibo([
        { concepto: "Salud (aporte empleado)", base: 800_000, valorCalculado: 32_000, tipo: "deduccion" },
        { concepto: "Auxilio de transporte", valorCalculado: 100_000, tipo: "devengo" },
      ]),
    ]);
    const r = await calcularLiquidacionPilaPeriodo(1, 55, true);
    expect(r.empleados[0]!.pila!.ibcPeriodo).toBe(800_000);
    const porConcepto = Object.fromEntries(r.empleados[0]!.pila!.lineas.map((l) => [l.concepto, l.valor]));
    expect(porConcepto["Auxilio de transporte"]).toBe(100_000);
  });

  it("una línea CON codigo distinto no se rescata por el texto: sin IBC, pila null", async () => {
    // Si el recibo trae códigos, el código manda. Rescatar por texto una línea
    // con código ajeno tomaría como IBC la base de cualquier concepto renombrado.
    prismaMock.reciboPago.findMany.mockResolvedValue([
      recibo([
        { codigo: "OTRO_CODIGO", concepto: "Salud (aporte empleado)", base: 999_999, valorCalculado: 1, tipo: "deduccion" },
      ]),
    ]);
    const r = await calcularLiquidacionPilaPeriodo(1, 55, true);
    expect(r.empleados[0]!.pila).toBeNull();
    expect(r.totales).toEqual({ ibcTotal: 0, costoTotalPeriodo: 0 });
  });

  it("aprendiz etapa lectiva (recibo sin línea de salud): pila null y excluido de los totales", async () => {
    // El SENA gestiona su afiliación — inventarle un IBC duplicaría aportes.
    prismaMock.reciboPago.findMany.mockResolvedValue([
      recibo([lineaSalud(1_000_000), lineaAuxilio(124_548)], empleadoFixture({ id: 10 })),
      recibo(
        [{ codigo: "AUXILIO_SOSTENIMIENTO", concepto: "Auxilio de sostenimiento", valorCalculado: 875_453, tipo: "devengo" }],
        empleadoFixture({ id: 11, nombre: "Aprendiz Lectiva", tipoContrato: "aprendizaje_sena_lectiva" })
      ),
    ]);
    const r = await calcularLiquidacionPilaPeriodo(1, 55, true);
    expect(r.empleados).toHaveLength(2);
    expect(r.empleados[1]!.pila).toBeNull();
    // Los totales solo suman al que sí cotiza.
    expect(r.totales.ibcTotal).toBe(1_000_000);
    expect(r.totales.costoTotalPeriodo).toBe(1_530_104);
  });

  it("línea de salud sin `base` (recibo viejo incompleto): pila null, no inventa IBC 0", async () => {
    prismaMock.reciboPago.findMany.mockResolvedValue([
      recibo([{ codigo: "SALUD_EMPLEADO", concepto: "Salud (aporte empleado)", valorCalculado: 0, tipo: "deduccion" }]),
    ]);
    const r = await calcularLiquidacionPilaPeriodo(1, 55, true);
    expect(r.empleados[0]!.pila).toBeNull();
    expect(r.empleados[0]!.sinPila).toMatch(/no registra IBC/);
  });

  it("un recibo con IBC 0 se salta: NO se lleva por delante la PILA de los demás", async () => {
    // El motor exige IBC > 0 y lanza si no. Como el IBC sale de un recibo ya
    // persistido, un solo recibo malo hacía explotar el map entero: la empresa
    // se quedaba sin la PILA de TODOS sus colaboradores por el dato de uno, y
    // el controlador lo servía como 422 de todo el periodo.
    //
    // `base: 0` no lo atrapaba el `?? null` de antes: `0 ?? null` es 0.
    prismaMock.reciboPago.findMany.mockResolvedValue([
      recibo([lineaSalud(0)], empleadoFixture({ id: 10, nombre: "Cero Base" })),
      recibo([lineaSalud(1_000_000), lineaAuxilio(124_548)], empleadoFixture({ id: 11, nombre: "Ana Base" })),
    ]);
    const r = await calcularLiquidacionPilaPeriodo(1, 55, true);

    expect(r.empleados[0]!.pila).toBeNull();
    expect(r.empleados[0]!.sinPila).toMatch(/no permite liquidar/);
    // El otro liquida completo, y los totales son los suyos: el recibo malo
    // no aporta 0 a un promedio, queda afuera.
    expect(r.empleados[1]!.pila!.ibcPeriodo).toBe(1_000_000);
    expect(r.totales).toEqual({ ibcTotal: 1_000_000, costoTotalPeriodo: 1_530_104 });
  });

  it("un IBC negativo o no numérico tampoco liquida — y tampoco tumba el periodo", async () => {
    // El tipo `LineaReciboJson` es una afirmación sobre una columna Json, no
    // una verificación: la base acepta cualquier cosa que quepa en JSON. Un
    // negativo invertiría el signo de cada aporte; un string se multiplicaría
    // por los porcentajes hasta salir NaN y viajar como aportes "calculados".
    prismaMock.reciboPago.findMany.mockResolvedValue([
      recibo([lineaSalud(-1_000_000)], empleadoFixture({ id: 10, nombre: "Negativo" })),
      recibo(
        [{ codigo: "SALUD_EMPLEADO", concepto: "Salud (aporte empleado)", base: "1000000" as unknown as number, valorCalculado: 40_000, tipo: "deduccion" }],
        empleadoFixture({ id: 11, nombre: "Texto" })
      ),
      recibo([lineaSalud(1_000_000), lineaAuxilio(124_548)], empleadoFixture({ id: 12, nombre: "Sana" })),
    ]);
    const r = await calcularLiquidacionPilaPeriodo(1, 55, true);
    expect(r.empleados.map((e) => e.pila === null)).toEqual([true, true, false]);
    expect(r.totales).toEqual({ ibcTotal: 1_000_000, costoTotalPeriodo: 1_530_104 });
  });

  it("un fallo de la CORRIDA (sin regla vigente) sí tumba el periodo — no se disfraza de PILA en ceros", async () => {
    // La contracara de lo anterior, y es deliberada: si falta la regla para
    // `fechaFin`, el fallo no es de un recibo, es de todos. Atraparlo por
    // empleado devolvería un 200 con la lista entera en "sin PILA" y los
    // totales en $0 — una planilla que parece liquidada y vale cero. Es peor
    // que el error: se puede citar.
    prismaMock.reglaLegal.findMany.mockResolvedValue([]);
    prismaMock.reciboPago.findMany.mockResolvedValue([recibo([lineaSalud(1_000_000)])]);
    await expect(calcularLiquidacionPilaPeriodo(1, 55, true)).rejects.toThrow();
  });

  it("sin línea de auxilio, el auxilio del periodo es 0 — no null ni NaN", async () => {
    prismaMock.reciboPago.findMany.mockResolvedValue([recibo([lineaSalud(1_000_000)])]);
    const r = await calcularLiquidacionPilaPeriodo(1, 55, true);
    const conceptos = r.empleados[0]!.pila!.lineas.map((l) => l.concepto);
    expect(conceptos).not.toContain("Auxilio de transporte");
    // Sin auxilio la base de cesantías baja a solo el IBC:
    //   1.000.000 + pensión 120.000 + ARL 5.220 + caja 40.000
    //   + cesantías 83.333 + intereses 10.000 + prima 83.333 + vacaciones 41.667.
    expect(r.empleados[0]!.pila!.costoTotalPeriodo).toBe(1_383_553);
  });
});

describe("calcularLiquidacionPilaPeriodo — umbral de exoneración y fecha", () => {
  it("el umbral (10 SMLMV) se evalúa contra el salario PACTADO, no contra el IBC quincenal", async () => {
    // Salario pactado 18.000.000 (≥ 10 × 1.750.905): aunque el IBC de la
    // quincena sea 9.000.000 (que aislado parecería exonerable), se cobran
    // salud patronal, SENA e ICBF. Evaluar contra el IBC del periodo
    // exoneraría de facto a todo salario alto pagado por quincenas.
    prismaMock.reciboPago.findMany.mockResolvedValue([
      recibo([lineaSalud(9_000_000)], empleadoFixture({ salarioBase: 18_000_000 })),
    ]);
    const r = await calcularLiquidacionPilaPeriodo(1, 55, true);
    const porConcepto = Object.fromEntries(r.empleados[0]!.pila!.lineas.map((l) => [l.concepto, l.valor]));
    expect(porConcepto["Salud (aporte empleador)"]).toBe(765_000); // 8,5% de 9.000.000
    expect(porConcepto["SENA"]).toBe(180_000);
    expect(porConcepto["ICBF"]).toBe(270_000);
  });

  it("borde exacto del umbral: pactado == 10 SMLMV ya NO es exonerado", async () => {
    // La ley exonera a quien gana MENOS de 10 SMLMV — el igual queda afuera.
    // 10 × 1.750.905 = 17.509.050 (SMLMV 2026, vigente a fechaFin).
    prismaMock.reciboPago.findMany.mockResolvedValue([
      recibo([lineaSalud(8_754_525)], empleadoFixture({ salarioBase: 17_509_050 })),
    ]);
    const enElBorde = await calcularLiquidacionPilaPeriodo(1, 55, true);
    expect(
      enElBorde.empleados[0]!.pila!.lineas.some((l) => l.concepto === "Salud (aporte empleador)")
    ).toBe(true);

    // Un peso por debajo del umbral: exonerado.
    prismaMock.reciboPago.findMany.mockResolvedValue([
      recibo([lineaSalud(8_754_525)], empleadoFixture({ salarioBase: 17_509_049 })),
    ]);
    const debajo = await calcularLiquidacionPilaPeriodo(1, 55, true);
    expect(
      debajo.empleados[0]!.pila!.lineas.some((l) => l.concepto === "Salud (aporte empleador)")
    ).toBe(false);
  });

  it("las reglas se resuelven a fechaFin: un periodo que cruza el año usa el SMLMV nuevo", async () => {
    // Periodo 2025-12-16 → 2026-01-15, pactado 15.000.000:
    //   con SMLMV 2025 (1.423.500) el umbral es 14.235.000 → NO exonerado;
    //   con SMLMV 2026 (1.750.905) el umbral es 17.509.050 → exonerado.
    // La PILA se liquida al cierre del periodo, así que manda fechaFin. Si el
    // servicio pasara fechaInicio, este empleado pagaría 13,5 puntos de más.
    prismaMock.periodoNomina.findFirst.mockResolvedValue({
      ...PERIODO,
      fechaInicio: "2025-12-16",
      fechaFin: "2026-01-15",
    });
    prismaMock.reciboPago.findMany.mockResolvedValue([
      recibo([lineaSalud(7_500_000)], empleadoFixture({ salarioBase: 15_000_000 })),
    ]);
    const r = await calcularLiquidacionPilaPeriodo(1, 55, true);
    expect(
      r.empleados[0]!.pila!.lineas.some((l) => l.concepto === "Salud (aporte empleador)")
    ).toBe(false);
  });

  it("exoneradoParafiscales=false se respeta aunque el salario sea bajo, y se ecoa en la salida", async () => {
    prismaMock.reciboPago.findMany.mockResolvedValue([recibo([lineaSalud(1_000_000)])]);
    const r = await calcularLiquidacionPilaPeriodo(1, 55, false);
    expect(r.exonerado).toBe(false);
    const porConcepto = Object.fromEntries(r.empleados[0]!.pila!.lineas.map((l) => [l.concepto, l.valor]));
    expect(porConcepto["Salud (aporte empleador)"]).toBe(85_000);
  });

  it("periodo liquidado sin recibos: resumen vacío con totales en 0, no un error", async () => {
    const r = await calcularLiquidacionPilaPeriodo(1, 55, true);
    expect(r.empleados).toEqual([]);
    expect(r.totales).toEqual({ ibcTotal: 0, costoTotalPeriodo: 0 });
    expect(r.periodoId).toBe(55);
    expect(r.fechaInicio).toBe("2026-07-01");
    expect(r.fechaFin).toBe("2026-07-15");
  });
});
