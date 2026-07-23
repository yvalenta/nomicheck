// Tests del wrapper stateless (RUMBO §3.4). Ejercitan el pipeline sin BD
// del buyer — usan `obtenerReglasYFestivos` que lee el catálogo público
// cacheado (no es tenant, es el mismo set del verificador anónimo).
import { describe, expect, it } from "vitest";
import { ejecutarBatchPublico } from "../batchPublicoService.js";
import { hashCatalogo, obtenerLedgerReglas, REGLAS_VERIFICADAS_AL } from "../reglasVerificadasService.js";
import { batchToCsv } from "../batchCsvService.js";
import { obtenerReglasYFestivos } from "../nominaService.js";
import type { BatchLiquidarInput } from "../../validation/batchPublico.js";

function baseInput(): BatchLiquidarInput {
  return {
    version: "1",
    buyer: { noExternalLlm: true },
    empresa: { nombre: "Buyer Test", nit: "900123456-7", sector: "servicios" },
    periodo: { fechaInicio: "2026-07-01", fechaFin: "2026-07-15" },
    empleados: [],
    contratistas: [],
    turnos: [],
  };
}

describe("ejecutarBatchPublico", () => {
  it("responde con contrato v1 y disclaimer aun sin recibos", async () => {
    const salida = await ejecutarBatchPublico(baseInput());
    expect(salida.version).toBe("1");
    expect(salida.reglasVerificadasAl).toBe(REGLAS_VERIFICADAS_AL);
    expect(salida.reglasHash).toMatch(/^[0-9a-f]{64}$/);
    expect(salida.disclaimer).toContain("informativo");
    expect(salida.disclaimer).toContain("Ley 1581");
    expect(salida.habeasData.persistidoEnBd).toBe(false);
    expect(salida.habeasData.procesadoPorLlmExterno).toBe(false);
    expect(salida.habeasData.norma).toContain("Ley 1581");
    expect(salida.recibos).toEqual([]);
    expect(salida.rechazos).toEqual([]);
  });

  it("liquida un empleado fijo y devuelve su externalId con recibo válido", async () => {
    const input = baseInput();
    input.empleados = [
      {
        externalId: "EMP-42",
        nombre: "Ana Test",
        documento: "1000000001",
        salarioBase: 2_000_000,
        tipoNomina: "fijo",
        tipoContrato: "indefinido",
        auxilioTransporte: true,
        claseRiesgoArl: 1,
      },
    ];
    const salida = await ejecutarBatchPublico(input);
    expect(salida.recibos).toHaveLength(1);
    const r = salida.recibos[0]!;
    expect(r.externalId).toBe("EMP-42");
    expect(r.tipo).toBe("empleado");
    expect(r.neto).toBeGreaterThan(0);
    // Cada línea del motor debe traer su referencia legal cuando el motor
    // la emite — parte del compromiso del listing 5/8a.
    const conLey = r.lineas.filter((l) => l.referenciaLegal);
    expect(conLey.length).toBeGreaterThan(0);
  });

  it("liquida un contratista de servicios sin gate de QA", async () => {
    const input = baseInput();
    input.contratistas = [
      {
        externalId: "CT-1",
        nombre: "Bob Servicios",
        documento: "2000000002",
        honorariosMensuales: 3_000_000,
      },
    ];
    const salida = await ejecutarBatchPublico(input);
    expect(salida.recibos).toHaveLength(1);
    expect(salida.recibos[0]!.tipo).toBe("contratista");
    expect(salida.recibos[0]!.externalId).toBe("CT-1");
    expect(salida.rechazos).toEqual([]);
  });

  it("rechaza al empleado con salario ínfimo sin bloquear al resto (gate por-empleado)", async () => {
    const input = baseInput();
    input.empleados = [
      {
        externalId: "OK-1",
        nombre: "Ana OK",
        documento: "1000000001",
        salarioBase: 2_000_000,
        tipoNomina: "fijo",
        tipoContrato: "indefinido",
        auxilioTransporte: true,
        claseRiesgoArl: 1,
      },
      {
        externalId: "BAD-1",
        nombre: "Carlos Bajo",
        documento: "1000000002",
        salarioBase: 100,
        tipoNomina: "fijo",
        tipoContrato: "indefinido",
        auxilioTransporte: false,
        claseRiesgoArl: 1,
      },
    ];
    const salida = await ejecutarBatchPublico(input);
    expect(salida.recibos.map((r) => r.externalId)).toEqual(["OK-1"]);
    expect(salida.rechazos).toHaveLength(1);
    expect(salida.rechazos[0]!.externalId).toBe("BAD-1");
    expect(salida.rechazos[0]!.issues.length).toBeGreaterThan(0);
  });

  it("el reglasHash es determinista y coincide con el del ledger público", async () => {
    const { reglas, festivos } = await obtenerReglasYFestivos();
    const a = hashCatalogo(reglas, festivos);
    const b = hashCatalogo(reglas, festivos);
    expect(a).toBe(b);
    const ledger = await obtenerLedgerReglas();
    expect(ledger.hash).toBe(a);
    expect(ledger.fecha).toBe(REGLAS_VERIFICADAS_AL);
    expect(ledger.totalReglas).toBeGreaterThan(0);
    const salida = await ejecutarBatchPublico(baseInput());
    expect(salida.reglasHash).toBe(a);
  });

  it("batchToCsv incluye cabecera con hash, disclaimer y filas por línea", async () => {
    const input = baseInput();
    input.empleados = [
      {
        externalId: "E-CSV",
        nombre: "Ana CSV",
        documento: "1000",
        salarioBase: 2_000_000,
        tipoNomina: "fijo",
        tipoContrato: "indefinido",
        auxilioTransporte: true,
        claseRiesgoArl: 1,
      },
    ];
    const salida = await ejecutarBatchPublico(input);
    const csv = batchToCsv(salida);
    expect(csv).toContain(`# reglas_hash: ${salida.reglasHash}`);
    expect(csv).toContain("# habeas_data: Ley 1581");
    expect(csv).toContain("external_id,tipo,nombre,documento,concepto");
    expect(csv).toContain("E-CSV,empleado,Ana CSV,1000,");
  });

  it("no ligada a Prisma: procesa el mismo input dos veces con salida idéntica en montos", async () => {
    const input = baseInput();
    input.empleados = [
      {
        externalId: "SAME",
        nombre: "Same",
        documento: "3000000003",
        salarioBase: 2_500_000,
        tipoNomina: "fijo",
        tipoContrato: "indefinido",
        auxilioTransporte: true,
        claseRiesgoArl: 1,
      },
    ];
    const a = await ejecutarBatchPublico(input);
    const b = await ejecutarBatchPublico(input);
    expect(a.recibos[0]!.neto).toBe(b.recibos[0]!.neto);
    expect(a.recibos[0]!.totalDevengado).toBe(b.recibos[0]!.totalDevengado);
  });
});
