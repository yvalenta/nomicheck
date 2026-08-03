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

  it("un año servido causa 15 días de vacaciones (CST art. 186)", () => {
    const r = calcularPrestacionesSociales({
      fechaIngreso: "2026-01-01",
      fechaCorte: "2026-12-30", // 360 días comerciales exactos
      salarioBase: 2_000_000,
    });
    expect(r.diasTrabajadosAcumulado).toBe(364);
    // 364 días × 30 / 720 — algo más de 15 por los días calendario de más.
    expect(r.diasVacacionesCausados).toBeCloseTo(15.17, 2);
  });

  it("las vacaciones ya disfrutadas se restan: solo se liquida lo pendiente", () => {
    const base = {
      fechaIngreso: "2026-01-01",
      fechaCorte: "2026-12-31",
      salarioBase: 2_000_000,
    };
    const sinTomar = calcularPrestacionesSociales(base);
    const conSieteTomados = calcularPrestacionesSociales({ ...base, diasVacacionesTomados: 7 });

    // Cada día de vacación vale un día de salario: 2.000.000 / 30.
    expect(sinTomar.vacaciones - conSieteTomados.vacaciones).toBe(Math.round((2_000_000 / 30) * 7));
    expect(conSieteTomados.advertencias).toEqual([]);
    // Solo toca vacaciones — las otras tres prestaciones no se enteran.
    expect(conSieteTomados.cesantias).toBe(sinTomar.cesantias);
    expect(conSieteTomados.prima).toBe(sinTomar.prima);
    expect(conSieteTomados.interesesCesantias).toBe(sinTomar.interesesCesantias);
  });

  it("disfrutar más días de los causados liquida en cero y advierte, no en negativo", () => {
    const r = calcularPrestacionesSociales({
      fechaIngreso: "2026-01-01",
      fechaCorte: "2026-03-31", // ~7,6 días causados
      salarioBase: 2_000_000,
      diasVacacionesTomados: 15,
    });
    expect(r.vacaciones).toBe(0);
    expect(r.advertencias).toHaveLength(1);
    expect(r.advertencias[0]).toContain("no en negativo");
  });

  it("no pasar diasVacacionesTomados da exactamente lo mismo que pasar cero", () => {
    // La rama que resta usa otra ruta de punto flotante; esto fija que ninguna
    // liquidación existente se mueva un peso por haber agregado el campo.
    const base = { fechaIngreso: "2024-03-15", fechaCorte: "2026-07-30", salarioBase: 1_850_000 };
    expect(calcularPrestacionesSociales({ ...base, diasVacacionesTomados: 0 }).vacaciones).toBe(
      calcularPrestacionesSociales(base).vacaciones
    );
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

  it("el auxilio de transporte hace base de cesantías Y prima (Ley 1ª de 1963, art. 7), pero NO vacaciones", () => {
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
    // Vacaciones es idéntica con o sin auxilio (excluido por doctrina/jurisprudencia);
    // prima SÍ cambia — usa la misma base que cesantías (salario + auxilio).
    expect(conAuxilio.vacaciones).toBe(sinAuxilio.vacaciones);
    expect(conAuxilio.vacaciones).toBe(506_944);
    expect(conAuxilio.prima).toBe(1_200_000);
    expect(sinAuxilio.prima).toBe(1_000_000);
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

// El desglose por semestre es lo que hace visible el tope de 180 días: sin él,
// "días considerados" y días que liquidaron prima se leen como el mismo número
// y no siempre lo son.
describe("calcularPrestacionesSociales — desglose de prima por semestre", () => {
  it("separa un periodo que cruza el cambio de semestre", () => {
    const r = calcularPrestacionesSociales({
      fechaIngreso: "2026-05-01",
      fechaCorte: "2026-08-31",
      salarioBase: 2_000_000,
    });
    expect(r.semestresPrima.map((s) => [s.desde, s.dias])).toEqual([
      ["2026-01-01", 61], // mayo y junio
      ["2026-07-01", 62], // julio y agosto
    ]);
    expect(r.diasPrima).toBe(r.diasTrabajadosAcumulado);
    expect(r.semestresPrima.every((s) => !s.topado)).toBe(true);
  });

  it("topa cada semestre en 180 días y lo dice, aunque el calendario tenga más", () => {
    const r = calcularPrestacionesSociales({
      fechaIngreso: "2026-01-01",
      fechaCorte: "2026-12-31",
      salarioBase: 2_000_000,
    });
    expect(r.semestresPrima.map((s) => s.dias)).toEqual([180, 180]);
    expect(r.semestresPrima.every((s) => s.topado)).toBe(true);
    // 365 días servidos, 360 que liquidan prima: el tope dejó cinco afuera.
    expect(r.diasTrabajadosAcumulado).toBe(365);
    expect(r.diasPrima).toBe(360);
    expect(r.prima).toBe(2_000_000);
  });

  it("no emite semestres sin días causados", () => {
    const r = calcularPrestacionesSociales({
      fechaIngreso: "2026-08-01",
      fechaCorte: "2026-08-31",
      salarioBase: 2_000_000,
    });
    expect(r.semestresPrima).toHaveLength(1);
    expect(r.semestresPrima[0].desde).toBe("2026-07-01");
  });
});
