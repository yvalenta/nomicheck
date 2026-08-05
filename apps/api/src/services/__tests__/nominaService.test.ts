// Tests de `nominaService.ts` — la puerta entre el catálogo legal en BD y el
// motor de reglas. `nominaService.reglas.test.ts` ya cubre la degradación
// cuando la base FALLA; acá se cubre lo que falta y que también paga nómina:
//   - el borde exacto del TTL del caché (servir viejo un ms de más es servir
//     un catálogo derogado como si fuera el vigente),
//   - que invalidar el caché sirva el catálogo NUEVO y no el de la invocación
//     anterior (contrato del CRUD admin de reglas),
//   - el mapeo null→undefined que el motor exige (Prisma habla null, el motor
//     TS puro habla undefined — un null que se cuele rompe las vigencias),
//   - y el despacho de calcularNomina: cada modo a SU calculadora. Despachar
//     al modo equivocado no lanza: produce un neto plausible y equivocado.
//
// Fixture legal: `prisma/semillaLegal.ts`. El corte va en `lib/prisma.js`
// para que la suite pase con `env -u DATABASE_URL`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FESTIVOS_SEMILLA, REGLAS_SEMILLA } from "../../../prisma/semillaLegal.js";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    reglaLegal: { findMany: vi.fn() },
    festivo: { findMany: vi.fn() },
  },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import { calcularNomina, invalidarCacheReglas, obtenerReglasYFestivos } from "../nominaService.js";

function semillaComoDb() {
  return REGLAS_SEMILLA.map((r) => ({
    ...r,
    vigenteHasta: r.vigenteHasta ?? null,
    fuente: r.fuente ?? null,
  }));
}

beforeEach(() => {
  invalidarCacheReglas();
  prismaMock.reglaLegal.findMany.mockReset().mockResolvedValue(semillaComoDb());
  prismaMock.festivo.findMany.mockReset().mockResolvedValue(FESTIVOS_SEMILLA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("obtenerReglasYFestivos — frontera Prisma → motor", () => {
  it("convierte los null de Prisma en undefined: el motor no entiende null", async () => {
    // El resolutor de vigencias compara `vigenteHasta === undefined` para
    // saber si un tramo sigue abierto. Un null filtrado convierte el tramo
    // vigente en uno cerrado y el motor lanza "no hay regla vigente".
    const { reglas } = await obtenerReglasYFestivos();
    const abierta = reglas.find((r) => r.clave === "smlmv" && r.vigenteDesde === "2026-01-01")!;
    expect(abierta.vigenteHasta).toBeUndefined();
    expect(abierta.vigenteHasta).not.toBeNull();
    // Y ninguna regla del catálogo mapeado expone null en los opcionales.
    for (const r of reglas) {
      expect(r.vigenteHasta === null).toBe(false);
      expect(r.fuente === null).toBe(false);
    }
  });

  it("un ms antes del TTL sigue sirviendo de memoria; en el TTL exacto ya refresca", async () => {
    // El borde importa: `Date.now() < expira` con `<=` serviría un catálogo
    // vencido justo en el instante en que un decreto nuevo entra a la base.
    vi.useFakeTimers();
    await obtenerReglasYFestivos();
    expect(prismaMock.reglaLegal.findMany).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    await obtenerReglasYFestivos();
    expect(prismaMock.reglaLegal.findMany).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1); // exactamente 5 minutos desde la primera lectura
    await obtenerReglasYFestivos();
    expect(prismaMock.reglaLegal.findMany).toHaveBeenCalledTimes(2);
  });

  it("tras vencer el TTL sirve el catálogo NUEVO, no el de la invocación anterior", async () => {
    // Escenario real: cambia el SMLMV por decreto y se siembra. El caché puede
    // demorar el cambio 5 minutos, pero pasado el TTL servir el valor viejo
    // liquidaría toda la nómina siguiente con el mínimo derogado.
    vi.useFakeTimers();
    const antes = await obtenerReglasYFestivos();
    expect(antes.reglas.find((r) => r.clave === "smlmv" && !r.vigenteHasta)!.valor).toBe(1_750_905);

    prismaMock.reglaLegal.findMany.mockResolvedValue([
      { clave: "smlmv", valor: 1_900_000, vigenteDesde: "2027-01-01", vigenteHasta: null, fuente: null },
    ]);
    vi.advanceTimersByTime(6 * 60 * 1000);
    const despues = await obtenerReglasYFestivos();
    expect(despues.reglas).toHaveLength(1);
    expect(despues.reglas[0]!.valor).toBe(1_900_000);
  });

  it("invalidarCacheReglas fuerza la relectura inmediata (contrato del CRUD admin)", async () => {
    await obtenerReglasYFestivos();
    prismaMock.reglaLegal.findMany.mockResolvedValue([
      { clave: "smlmv", valor: 2_000_000, vigenteDesde: "2026-01-01", vigenteHasta: null, fuente: null },
    ]);

    // Sin invalidar: sigue la foto anterior (eso es lo esperado del caché).
    const cacheado = await obtenerReglasYFestivos();
    expect(cacheado.reglas.length).toBe(REGLAS_SEMILLA.length);

    invalidarCacheReglas();
    const fresco = await obtenerReglasYFestivos();
    expect(fresco.reglas).toHaveLength(1);
    expect(fresco.reglas[0]!.valor).toBe(2_000_000);
  });
});

describe("calcularNomina — despacho por modo", () => {
  it("salario-fijo, mes completo jul-2026: neto exacto $2.089.095", async () => {
    // 2.000.000 + auxilio 249.095 − salud 4% 80.000 − pensión 4% 80.000.
    // El 4% se aplica sobre el IBC (sin auxilio): si el auxilio entrara al
    // IBC, el neto daría 9.964 pesos menos y nadie lo notaría a simple vista.
    const r = await calcularNomina({
      modo: "salario-fijo",
      salarioBasicoMensual: 2_000_000,
      recibeAuxilioTransporte: true,
      periodoDesde: "2026-07-01",
      periodoHasta: "2026-07-30",
      conceptos: [],
    });
    expect(r.modo).toBe("salario-fijo");
    expect(r.totalDevengos).toBe(2_249_095);
    expect(r.totalDeducciones).toBe(160_000);
    expect(r.netoEsperado).toBe(2_089_095);
    // Total y líneas cuadran al peso: la suma de lo impreso ES el total.
    const devengos = r.lineas.filter((l) => l.tipo === "devengo").reduce((s, l) => s + l.valorCalculado, 0);
    expect(devengos).toBe(r.totalDevengos);
  });

  it("servicios: honorarios sin auxilio ni deducciones retenidas — el neto es el honorario", async () => {
    // El contratista paga su propia PILA (Ley 1819 de 2016, art. 244): si el
    // despacho cayera en la calculadora laboral, le retendría un 8% que el
    // pagador NO debe descontar.
    const r = await calcularNomina({
      modo: "servicios",
      honorariosMensuales: 3_000_000,
      periodoDesde: "2026-07-01",
      periodoHasta: "2026-07-30",
    });
    expect(r.modo).toBe("servicios");
    expect(r.totalDeducciones).toBe(0);
    expect(r.netoEsperado).toBe(3_000_000);
    expect(r.lineas.some((l) => l.codigo === "AUXILIO_TRANSPORTE")).toBe(false);
    // La advertencia de PILA propia (IBC 40%) sí viaja — es informativa.
    expect(r.advertencias.join(" ")).toContain("40%");
  });

  it("turnos: clasifica el tiempo declarado (el neto sale del horario, no de un salario plano)", async () => {
    // Semana simple L-V de 8h diurnas, quincena 1-15 jul 2026 sin novedades.
    const dia = { horaInicio: "08:00", horaFin: "16:00" };
    const r = await calcularNomina({
      modo: "turnos",
      salarioBasicoMensual: 2_000_000,
      recibeAuxilioTransporte: false,
      periodoDesde: "2026-07-01",
      periodoHasta: "2026-07-15",
      horarioBase: [null, dia, dia, dia, dia, dia, null],
      novedades: [],
    });
    expect(r.modo).toBe("turnos");
    // Media quincena de un salario de 2M no puede acercarse al mes completo:
    // piso y techo groseros que un despacho equivocado sí violaría.
    expect(r.netoEsperado).toBeGreaterThan(0);
    expect(r.netoEsperado).toBeLessThan(2_000_000);
    expect(r.totalDevengos - r.totalDeducciones).toBe(r.netoEsperado);
  });

  it("las dos llamadas seguidas comparten catálogo: una sola consulta a la base", async () => {
    // /nomina/calcular es un endpoint anónimo: sin caché, cada verificación
    // dispararía dos queries a Supabase.
    await calcularNomina({
      modo: "servicios",
      honorariosMensuales: 1_000_000,
      periodoDesde: "2026-07-01",
      periodoHasta: "2026-07-30",
    });
    await calcularNomina({
      modo: "servicios",
      honorariosMensuales: 2_000_000,
      periodoDesde: "2026-07-01",
      periodoHasta: "2026-07-30",
    });
    expect(prismaMock.reglaLegal.findMany).toHaveBeenCalledTimes(1);
  });
});
