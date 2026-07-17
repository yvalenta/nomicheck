import { describe, expect, it } from "vitest";
import { calcularPrestacionesSociales } from "../prestaciones.js";

describe("calcularPrestacionesSociales", () => {
  it("año completo (2026, no bisiesto), salario fijo, sin auxilio: cesantías/intereses/vacaciones/prima exactos", () => {
    const r = calcularPrestacionesSociales({
      fechaIngreso: "2026-01-01",
      fechaCorte: "2026-12-31",
      salarioBase: 2_000_000,
    });
    expect(r.diasTrabajadosAcumulado).toBe(365);
    expect(r.cesantias).toBe(2_027_778);
    expect(r.interesesCesantias).toBe(246_713);
    expect(r.vacaciones).toBe(1_013_889);
    // Prima: H1 (181 días) y H2 (184 días) topados a 180 c/u => 360 días => un mes completo.
    expect(r.prima).toBe(2_000_000);
  });

  it("salario variable (CST art. 253): usa el promedio de los devengos declarados, no el último mes", () => {
    const r = calcularPrestacionesSociales({
      fechaIngreso: "2026-01-01",
      fechaCorte: "2026-03-31",
      salarioBase: 999_999_999, // no debe usarse: hay devengosVariables
      devengosVariables: [
        { mes: "2026-01", valor: 900_000 },
        { mes: "2026-02", valor: 1_000_000 },
        { mes: "2026-03", valor: 1_100_000 },
      ],
    });
    // promedio = 1.000.000; 90 días (ene+feb+mar de un año no bisiesto)
    expect(r.diasTrabajadosAcumulado).toBe(90);
    expect(r.cesantias).toBe(250_000);
    expect(r.interesesCesantias).toBe(7_500);
    expect(r.vacaciones).toBe(125_000);
    expect(r.prima).toBe(250_000);
  });

  it("ingreso a mitad de año: prorratea los días trabajados y topa la prima al semestre servido", () => {
    const r = calcularPrestacionesSociales({
      fechaIngreso: "2026-07-01",
      fechaCorte: "2026-12-31",
      salarioBase: 1_500_000,
    });
    expect(r.diasTrabajadosAcumulado).toBe(184);
    expect(r.cesantias).toBe(766_667);
    expect(r.interesesCesantias).toBe(47_022);
    expect(r.vacaciones).toBe(383_333);
    // H2 real tiene 184 días pero la prima topa a 180.
    expect(r.prima).toBe(750_000);
  });

  it("suspensión disciplinaria: los días excluidos no causan ninguna de las 4 prestaciones", () => {
    const diasSuspension = Array.from({ length: 10 }, (_, i) => `2026-03-${String(i + 1).padStart(2, "0")}`);
    const r = calcularPrestacionesSociales({
      fechaIngreso: "2026-01-01",
      fechaCorte: "2026-12-31",
      salarioBase: 2_000_000,
      diasSuspension,
    });
    expect(r.diasTrabajadosAcumulado).toBe(355); // 365 - 10
    expect(r.cesantias).toBe(1_972_222);
    expect(r.interesesCesantias).toBe(233_380);
    expect(r.vacaciones).toBe(986_111);
    // H1 pasa de 181 a 171 días (bajo el tope de 180, cuenta completo); H2 sigue topado a 180.
    expect(r.prima).toBe(1_950_000);
  });

  it("el auxilio de transporte solo afecta la base de cesantías, NO prima ni vacaciones", () => {
    const conAuxilio = calcularPrestacionesSociales({
      fechaIngreso: "2026-01-01",
      fechaCorte: "2026-12-31",
      salarioBase: 1_000_000,
      auxilioTransporte: 200_000,
    });
    const sinAuxilio = calcularPrestacionesSociales({
      fechaIngreso: "2026-01-01",
      fechaCorte: "2026-12-31",
      salarioBase: 1_000_000,
    });
    expect(conAuxilio.cesantias).toBe(1_216_667);
    expect(conAuxilio.interesesCesantias).toBe(148_028);
    // Vacaciones y prima son idénticas con o sin auxilio: la base que usan es la misma.
    expect(conAuxilio.vacaciones).toBe(sinAuxilio.vacaciones);
    expect(conAuxilio.prima).toBe(sinAuxilio.prima);
    expect(conAuxilio.vacaciones).toBe(506_944);
    expect(conAuxilio.prima).toBe(1_000_000);
  });

  it("tope de 180 días por semestre: un semestre de 181 días reales da la misma prima que uno de exactamente 180", () => {
    const semestre180 = calcularPrestacionesSociales({
      fechaIngreso: "2026-01-01",
      fechaCorte: "2026-06-29", // 180 días reales, sin tope
      salarioBase: 1_000_000,
    });
    const semestre181 = calcularPrestacionesSociales({
      fechaIngreso: "2026-01-01",
      fechaCorte: "2026-06-30", // 181 días reales, topado a 180
      salarioBase: 1_000_000,
    });
    expect(semestre180.diasTrabajadosAcumulado).toBe(180);
    expect(semestre181.diasTrabajadosAcumulado).toBe(181);
    expect(semestre180.prima).toBe(semestre181.prima);
    expect(semestre180.prima).toBe(500_000);
  });

  it("año bisiesto (2028): el 29 de febrero cuenta como día real trabajado, pero el divisor de 360 no cambia", () => {
    // Idéntico rango de fechas (1 al 29/28 de febrero) en un año bisiesto vs uno normal:
    // el bisiesto acumula un día más porque rangoFechas cuenta el calendario real,
    // no porque DIAS_ANO_COMERCIAL (360) se ajuste — sigue fijo en ambos casos.
    const bisiesto = calcularPrestacionesSociales({
      fechaIngreso: "2028-02-01",
      fechaCorte: "2028-02-29",
      salarioBase: 3_600_000,
    });
    const normal = calcularPrestacionesSociales({
      fechaIngreso: "2027-02-01",
      fechaCorte: "2027-02-28",
      salarioBase: 3_600_000,
    });
    expect(bisiesto.diasTrabajadosAcumulado).toBe(29);
    expect(normal.diasTrabajadosAcumulado).toBe(28);
    expect(bisiesto.cesantias).toBe(290_000); // 3.600.000 * 29 / 360
    expect(normal.cesantias).toBe(280_000); // 3.600.000 * 28 / 360
  });

  it("fechaIngreso posterior a fechaCorte lanza error (reutiliza validarPeriodo)", () => {
    expect(() =>
      calcularPrestacionesSociales({
        fechaIngreso: "2026-06-01",
        fechaCorte: "2026-01-01",
        salarioBase: 1_000_000,
      })
    ).toThrow();
  });

  it("un solo día trabajado (ingreso == corte) no lanza error y da valores proporcionales sin redondear a cero", () => {
    const r = calcularPrestacionesSociales({
      fechaIngreso: "2026-05-15",
      fechaCorte: "2026-05-15",
      salarioBase: 1_000_000,
    });
    expect(r.diasTrabajadosAcumulado).toBe(1);
    expect(r.cesantias).toBe(2_778);
    expect(r.vacaciones).toBe(1_389);
    expect(r.prima).toBe(2_778);
  });
});
