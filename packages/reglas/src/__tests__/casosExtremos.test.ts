import { describe, expect, it } from "vitest";
import { CalculadoraPorTurnos } from "../calculadoraTurnos.js";
import { aplicarDeducciones, pctFondoSolidaridad } from "../deducciones.js";
import { HORARIO_BASE_DEFAULT } from "../constantes.js";
import type { DatosNominaTurnos } from "../types.js";
import { FESTIVOS_2026, REGLAS_JUL_2026 } from "./fixtures.js";

function datosBase(extra: Partial<DatosNominaTurnos> = {}): DatosNominaTurnos {
  return {
    modo: "turnos",
    salarioBasicoMensual: 1750905,
    recibeAuxilioTransporte: true,
    periodoDesde: "2026-06-16",
    periodoHasta: "2026-06-30",
    horarioBase: HORARIO_BASE_DEFAULT,
    novedades: [],
    ...extra,
  };
}

describe("Fondo de solidaridad — tramos altos (Ley 797 de 2003, art. 8) nunca antes ejercitados", () => {
  it("aplica el porcentaje escalonado correcto en cada tramo, con bordes inclusivos", () => {
    // Estructura: [desdeSmlmv inclusive → pct]. 4→1%, 16→1.2%, 17→1.4%,
    // 18→1.6%, 19→1.8%, 20+→2%.
    expect(pctFondoSolidaridad(3.99)).toBe(0);
    expect(pctFondoSolidaridad(4)).toBe(0.01);
    expect(pctFondoSolidaridad(15.99)).toBe(0.01);
    expect(pctFondoSolidaridad(16)).toBe(0.012);
    expect(pctFondoSolidaridad(17)).toBe(0.014);
    expect(pctFondoSolidaridad(18)).toBe(0.016);
    expect(pctFondoSolidaridad(19)).toBe(0.018);
    expect(pctFondoSolidaridad(20)).toBe(0.02);
    expect(pctFondoSolidaridad(50)).toBe(0.02); // sin tramos por encima: se queda en 2%
  });

  it("un IBC de 20 SMLMV genera la línea de fondo al 2% de punta a punta", () => {
    const smlmv = 1750905;
    const ibc = 20 * smlmv;
    const { lineas } = aplicarDeducciones(ibc, ibc, REGLAS_JUL_2026, "2026-06-30");
    const fondo = lineas.find((l) => l.concepto === "Fondo de solidaridad pensional");
    expect(fondo?.recargoPct).toBe(0.02);
    expect(fondo?.valorCalculado).toBe(Math.round(ibc * 0.02));
  });
});

describe("Festiva nocturna máxima — domingo 18:00→06:00 (12h: dominical + nocturna + extra + medianoche)", () => {
  it("divide 6h ordinarias dominicales (5 nocturnas) + 6h extra dominicales nocturnas", () => {
    // Domingo 21-jun 18:00→06:00: ordinarias 18:00-24:00 (6h, de las cuales
    // 19:00-24:00 = 5h nocturnas); extra 00:00-06:00 (6h, todas nocturnas).
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [{ fecha: "2026-06-21", trabajo: true, horaInicio: "18:00", horaFin: "06:00" }],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const valorHora = 1750905 / 220;

    // Recargo dominical sobre las 6h ordinarias del 21-jun + 6h del 28-jun (horario base).
    const dominical = resultado.lineas.find((l) => l.concepto.startsWith("Recargo dominical"));
    expect(dominical?.horas).toBe(12);

    // Recargo nocturno dominical: solo las 5h nocturnas ordinarias del 21-jun.
    const nocturnoDominical = resultado.lineas.find((l) =>
      l.concepto.startsWith("Recargo nocturno dominical")
    );
    expect(nocturnoDominical?.horas).toBe(5);

    // Extra dominical nocturna: 6h al factor 100% + 75% + 80% = 2.55.
    const extraNocturna = resultado.lineas.find((l) =>
      l.concepto.startsWith("Hora extra dominical/festiva nocturna")
    );
    expect(extraNocturna?.horas).toBe(6);
    expect(extraNocturna?.recargoPct).toBeCloseTo(1.55, 4);
    expect(extraNocturna?.valorCalculado).toBe(Math.round(6 * valorHora * 2.55));

    // No hay extra dominical diurna (todas las extra caen de noche).
    expect(
      resultado.lineas.some((l) => l.concepto.startsWith("Hora extra dominical/festiva diurna"))
    ).toBe(false);

    // 6h extra en un día → advertencia del tope diario (2h máx).
    expect(resultado.advertencias.some((a) => a.includes("h/día"))).toBe(true);
  });
});

describe("Periodo cruzando el corte 15-jul-2026 (divisor 220→210) con extras en ambos tramos", () => {
  it("genera líneas de extra separadas por tramo, cada una con su valor hora", () => {
    // 13-jul (lunes, tramo 220) y 16-jul (jueves, tramo 210), ambos con
    // turno 10:00-19:00 = 7h ord + 2h extra diurnas... 17:00-19:00 diurnas.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        periodoDesde: "2026-07-13",
        periodoHasta: "2026-07-16",
        horarioBase: [null, null, null, null, null, null, null],
        novedades: [
          { fecha: "2026-07-13", trabajo: true, horaInicio: "10:00", horaFin: "19:00" },
          { fecha: "2026-07-16", trabajo: true, horaInicio: "10:00", horaFin: "19:00" },
        ],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const extras = resultado.lineas.filter((l) => l.concepto.startsWith("Hora extra diurna"));
    expect(extras).toHaveLength(2);

    const valores = extras.map((l) => l.valorCalculado).sort((a, b) => a - b);
    // 2h × (salario/220) × 1.25 < 2h × (salario/210) × 1.25 — el divisor
    // menor encarece la hora.
    expect(valores[0]).toBe(Math.round(2 * (1750905 / 220) * 1.25));
    expect(valores[1]).toBe(Math.round(2 * (1750905 / 210) * 1.25));
  });
});

describe("Embargo ordinario — borde exacto de inembargabilidad", () => {
  it("con devengado igual al SMLMV prorrateado, el embargable es exactamente $0", () => {
    // aplicarDeducciones directo para controlar el devengado al peso:
    // factorPeriodo 0.5 (quincena) ⇒ SMLMV prorrateado = 875.452,5.
    const smlmvProrrateado = 1750905 / 2;
    const { lineas, advertencias } = aplicarDeducciones(
      smlmvProrrateado,
      smlmvProrrateado,
      REGLAS_JUL_2026,
      "2026-06-30",
      { descuentoJudicial: { tipo: "ordinario", valorMensual: 100000 } },
      0.5
    );
    const embargo = lineas.find((l) => l.concepto.startsWith("Embargo judicial"));
    expect(embargo?.valorCalculado).toBe(0);
    expect(advertencias.some((a) => a.includes("embargo"))).toBe(true);
  });
});

describe("Embargo + convenio simultáneos — cada uno respeta su propio tope", () => {
  it("el convenio se recorta al 50% del devengado y el embargo por alimentos se suma aparte hasta su 50%", () => {
    // Devengado 1.000.000: tope convenio (CST 149) = 500.000; ley (salud+
    // pensión sobre IBC 1.000.000) = 80.000 → convenio disponible 420.000.
    // Embargo alimentos solicitado 600.000 → tope propio 50% = 500.000.
    const { lineas, totalDeducciones, advertencias } = aplicarDeducciones(
      1000000,
      1000000,
      REGLAS_JUL_2026,
      "2026-06-30",
      {
        deduccionesConvenio: [{ codigo: "APORTE_AFC", concepto: "Aporte AFC (convenio)", valorMensual: 900000 }],
        descuentoJudicial: { tipo: "alimentos_o_cooperativa", valorMensual: 600000 },
      },
      1
    );
    const afc = lineas.find((l) => l.concepto === "Aporte AFC (convenio)");
    const embargo = lineas.find((l) => l.concepto.startsWith("Embargo judicial"));

    expect(afc?.valorCalculado).toBe(420000); // recortado al disponible del 50%
    expect(embargo?.valorCalculado).toBe(500000); // recortado a su propio 50%
    // Total = 80.000 ley + 420.000 convenio + 500.000 embargo = 1.000.000.
    // El neto puede llegar a $0 en este extremo: cada tope se respeta por
    // separado (así opera la ley — el embargo por alimentos tiene prioridad
    // constitucional y no comparte el tope del art. 149).
    expect(totalDeducciones).toBe(1000000);
    expect(advertencias.length).toBeGreaterThanOrEqual(2); // recorte convenio + recorte embargo
  });
});
