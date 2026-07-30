// Regresión: liquidarFinal calculaba el tramo NO provisionado (empleado que
// ingresa y se retira sin pasar por ningún periodo de nómina liquidado) sin
// pasar el auxilio de transporte a calcularPrestacionesSociales, a
// diferencia de calcularReciboLote (liquidacionCalculo.ts) que sí lo
// resuelve. Esto subliquidaba cesantías/prima/intereses de cualquier
// empleado con derecho a auxilio cuyo contrato terminara antes del primer
// corte de nómina. Ver apps/api/src/services/liquidacionFinalService.ts.
import { describe, expect, it, vi } from "vitest";

const REGLAS_FIXTURE = [
  { clave: "auxilio_transporte", valor: 249_095, vigenteDesde: "2026-01-01", vigenteHasta: null, fuente: null },
];

const EMPLEADO_FIXTURE = {
  id: 1,
  empresaId: 1,
  salarioBase: 1_850_000,
  auxilioTransporte: true,
  fechaIngreso: "2026-07-01",
  fechaRetiro: "2026-07-30",
  eliminadoEn: null,
};

let periodoCreado: unknown;
let reciboCreado: unknown;

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    empleado: { findFirst: vi.fn(async () => EMPLEADO_FIXTURE) },
    reciboPago: {
      findMany: vi.fn(async () => []), // sin periodos de nómina previos liquidados
      create: vi.fn(async (args: { data: unknown }) => {
        reciboCreado = args.data;
        return { ...args.data, id: 99 };
      }),
    },
    periodoNomina: {
      create: vi.fn(async (args: { data: unknown }) => {
        periodoCreado = args.data;
        return { ...args.data, id: 1 };
      }),
    },
    reglaLegal: { findMany: vi.fn(async () => REGLAS_FIXTURE) },
    festivo: { findMany: vi.fn(async () => []) },
  },
}));

const { liquidarFinal } = await import("../liquidacionFinalService.js");

describe("liquidarFinal — tramo no provisionado con auxilio de transporte", () => {
  it("incluye el auxilio de transporte en la base de cesantías/prima/intereses (no solo en vacaciones, que ya lo excluía)", async () => {
    const recibo = (await liquidarFinal(1, 1)) as unknown as {
      totalDevengado: number;
      lineas: { codigo: string; valorCalculado: number }[];
    };

    const porCodigo = Object.fromEntries(recibo.lineas.map((l) => [l.codigo, l.valorCalculado]));

    // Base con auxilio: (1.850.000 + 249.095) * 30/360 = 174.925
    expect(porCodigo.LIQUIDACION_FINAL_CESANTIAS).toBe(174_925);
    expect(porCodigo.LIQUIDACION_FINAL_PRIMA).toBe(174_925);
    // Intereses: 174.925 * 30 * 12% / 360 = 1.749
    expect(porCodigo.LIQUIDACION_FINAL_INTERESES_CESANTIAS).toBe(1_749);
    // Vacaciones NO llevan auxilio (correcto, sin cambios): 1.850.000*30/720 = 77.083
    expect(porCodigo.LIQUIDACION_FINAL_VACACIONES).toBe(77_083);

    expect(recibo.totalDevengado).toBe(174_925 + 174_925 + 1_749 + 77_083);
  });

  it("no incluye auxilio si el empleado no tiene derecho (regresión inversa: no romper el caso sin auxilio)", async () => {
    vi.resetModules();
    vi.doMock("../../lib/prisma.js", () => ({
      prisma: {
        empleado: { findFirst: vi.fn(async () => ({ ...EMPLEADO_FIXTURE, auxilioTransporte: false })) },
        reciboPago: {
          findMany: vi.fn(async () => []),
          create: vi.fn(async (args: { data: unknown }) => ({ ...args.data, id: 99 })),
        },
        periodoNomina: { create: vi.fn(async (args: { data: unknown }) => ({ ...args.data, id: 1 })) },
        reglaLegal: { findMany: vi.fn(async () => REGLAS_FIXTURE) },
        festivo: { findMany: vi.fn(async () => []) },
      },
    }));
    const { liquidarFinal: liquidarFinalSinAuxilio } = await import("../liquidacionFinalService.js");
    const recibo = (await liquidarFinalSinAuxilio(1, 1)) as unknown as {
      lineas: { codigo: string; valorCalculado: number }[];
    };
    const porCodigo = Object.fromEntries(recibo.lineas.map((l) => [l.codigo, l.valorCalculado]));
    // Sin auxilio: 1.850.000*30/360 = 154.167
    expect(porCodigo.LIQUIDACION_FINAL_CESANTIAS).toBe(154_167);
  });
});
