// Cobertura temporal del catálogo de reglas.
//
// El resolutor LANZA cuando no encuentra vigencia, y las calculadoras
// resuelven varias claves de forma incondicional al abrir cada tramo de días
// (calculadoraTurnos.ts) — antes de saber si el concepto siquiera aplica. Una
// clave con la ventana cerrada no produce un número raro: tumba la
// liquidación completa. Y falla por la fecha del PERIODO, no por la de hoy,
// así que el bug se queda dormido hasta que alguien liquida un mes viejo.
//
// Caso que motivó estos tests: `recargo_dominical` tenía sembrados solo los
// tramos de 2025-07-01 a 2027-06-30. Toda liquidación por turnos fechada
// fuera de esa ventana lanzaba, hubiera o no trabajo dominical — y el
// 1-jul-2027 se caía la nómina entera.
import { describe, expect, it } from "vitest";
import { auditarVigencias, crearResolutorReglas } from "../utils.js";
import { REGLAS_JUL_2026 } from "./fixtures.js";
import type { ReglaLegal } from "../types.js";

/** Las claves que `calculadoraTurnos` resuelve sin condición previa. */
const CLAVES_INCONDICIONALES = [
  "divisor_hora_ordinaria",
  "recargo_dominical",
  "recargo_nocturno",
  "hora_extra_diurna",
  "hora_extra_nocturna",
];

/**
 * Claves cuyo valor lo fija un decreto o resolución cada año. A diferencia de
 * las de arriba, su historia no se puede deducir: hace falta el valor real de
 * cada norma. Son las que fijan el piso de lo liquidable.
 */
const CLAVES_ANUALES = ["smlmv", "auxilio_transporte", "uvt"];

describe("auditarVigencias", () => {
  it("no reporta huecos cuando los tramos son contiguos y el último es abierto", () => {
    const reglas: ReglaLegal[] = [
      { clave: "x", valor: 1, vigenteDesde: "2020-01-01", vigenteHasta: "2020-12-31" },
      { clave: "x", valor: 2, vigenteDesde: "2021-01-01" },
    ];
    expect(auditarVigencias(reglas, "2020-01-01", "2030-12-31")).toEqual([]);
  });

  it("detecta el hueco anterior al primer tramo", () => {
    const reglas: ReglaLegal[] = [{ clave: "x", valor: 1, vigenteDesde: "2025-07-01" }];
    expect(auditarVigencias(reglas, "2020-01-01", "2030-12-31")).toEqual([
      { clave: "x", desde: "2020-01-01", hasta: "2025-07-01", motivo: "antes-del-primer-tramo" },
    ]);
  });

  it("detecta el hueco posterior al último tramo cerrado", () => {
    const reglas: ReglaLegal[] = [
      { clave: "x", valor: 1, vigenteDesde: "2020-01-01", vigenteHasta: "2027-06-30" },
    ];
    expect(auditarVigencias(reglas, "2020-01-01", "2030-12-31")).toEqual([
      { clave: "x", desde: "2027-07-01", hasta: null, motivo: "despues-del-ultimo-tramo" },
    ]);
  });

  it("detecta el hueco entre dos tramos no contiguos", () => {
    const reglas: ReglaLegal[] = [
      { clave: "x", valor: 1, vigenteDesde: "2020-01-01", vigenteHasta: "2022-12-31" },
      { clave: "x", valor: 2, vigenteDesde: "2024-01-01" },
    ];
    expect(auditarVigencias(reglas, "2020-01-01", "2030-12-31")).toEqual([
      { clave: "x", desde: "2023-01-01", hasta: "2024-01-01", motivo: "entre-tramos" },
    ]);
  });

  it("reporta la clave ausente como hueco del rango completo", () => {
    expect(auditarVigencias([], "2020-01-01", "2030-12-31", ["x"])).toEqual([
      { clave: "x", desde: "2020-01-01", hasta: "2030-12-31", motivo: "antes-del-primer-tramo" },
    ]);
  });

  it("reproduce el bug original: dos tramos cerrados dejan hueco a ambos lados", () => {
    const soloTramosDeLaVentana: ReglaLegal[] = [
      { clave: "recargo_dominical", valor: 0.8, vigenteDesde: "2025-07-01", vigenteHasta: "2026-06-30" },
      { clave: "recargo_dominical", valor: 0.9, vigenteDesde: "2026-07-01", vigenteHasta: "2027-06-30" },
    ];
    const huecos = auditarVigencias(soloTramosDeLaVentana, "2021-01-01", "2030-12-31");
    expect(huecos.map((h) => h.motivo)).toEqual([
      "antes-del-primer-tramo",
      "despues-del-ultimo-tramo",
    ]);
  });
});

describe("el catálogo no deja sin cubrir ninguna fecha liquidable", () => {
  // 2021 arranca la Ley 2101; 2030 da margen holgado hacia adelante. Si el
  // rango se amplía y aparecen huecos, la respuesta correcta es sembrar el
  // tramo histórico, no encoger el rango.
  it("todas las claves incondicionales cubren 2021-2030 sin huecos", () => {
    const huecos = auditarVigencias(REGLAS_JUL_2026, "2021-01-01", "2030-12-31", CLAVES_INCONDICIONALES);
    expect(huecos, "claves que tumbarían una liquidación por su fecha").toEqual([]);
  });

  it("ninguna clave del catálogo tiene la ventana cerrada hacia el futuro", () => {
    const cerradas = auditarVigencias(REGLAS_JUL_2026, "2026-01-01", "2030-12-31").filter(
      (h) => h.motivo === "despues-del-ultimo-tramo"
    );
    expect(cerradas, "claves que dejan de resolver en una fecha futura conocida").toEqual([]);
  });

  it("las claves anuales cubren sin huecos desde 2020, año por año", () => {
    // Un hueco de un solo día entre dos tramos anuales (p. ej. olvidar el
    // 31-dic) tumbaría la liquidación de ese día y de ningún otro — el peor
    // tipo de bug para encontrar a mano.
    const huecos = auditarVigencias(REGLAS_JUL_2026, "2020-01-01", "2030-12-31", CLAVES_ANUALES);
    expect(huecos, "años sin valor sembrado en las claves de decreto anual").toEqual([]);
  });

  // El catálogo tiene DOS pisos, y son distintos a propósito:
  //
  //   nómina    → 2020-01-01. Toda clave que una liquidación de salario
  //               necesita está sembrada desde ahí.
  //   retención → 2023-01-01. Los topes del art. 336 los cambió la Ley 2277
  //               de 2022 (el tope anual bajó de 5.040 a 1.340 UVT), y esa
  //               misma ley unificó la tabla de tarifas marginales del art.
  //               383. Esa tabla es una constante ESTRUCTURAL del motor
  //               (`TABLA_RETENCION_FUENTE_ART_383` en constantes.ts), no una
  //               clave con vigencia — así que sembrar los topes viejos no
  //               alcanzaría para recalcular una retención de 2022: saldría
  //               con los topes de entonces y las tarifas de ahora. Preferimos
  //               que lance antes que devolver un número plausible y falso.
  const CLAVES_RETENCION = ["limite_rentas_exentas_porcentaje", "limite_rentas_exentas_uvt_anual"];

  it("todas las claves de nómina arrancan en 2020 o antes", () => {
    // Basta UNA que arranque después para que 2020 sea inliquidable: el
    // resolutor lanza por la primera que no encuentre.
    const tardias = auditarVigencias(REGLAS_JUL_2026, "2020-01-01", "2030-12-31")
      .filter((h) => h.motivo === "antes-del-primer-tramo")
      .map((h) => h.clave)
      .filter((c) => !CLAVES_RETENCION.includes(c));
    expect(tardias, "claves de nómina que arrancan después de 2020").toEqual([]);
  });

  it("las claves de retención arrancan en 2023, el piso que fijó la Ley 2277", () => {
    // Se afirma el límite en vez de ignorarlo: si alguien siembra los topes
    // pre-2023 sin migrar también la tabla del art. 383, este test falla y
    // obliga a leer el comentario de arriba antes de seguir.
    const desde2023 = auditarVigencias(REGLAS_JUL_2026, "2023-01-01", "2030-12-31", CLAVES_RETENCION);
    expect(desde2023, "los topes de retención deben cubrir 2023 en adelante").toEqual([]);
  });
});

describe("los cuatro tramos del recargo dominical resuelven", () => {
  const r = crearResolutorReglas(REGLAS_JUL_2026);

  it.each([
    ["2024-03-10", 0.75, "antes de la Ley 2466"],
    ["2025-06-30", 0.75, "último día del tramo del 75%"],
    ["2025-07-01", 0.8, "primer día del tramo del 80%"],
    ["2026-06-30", 0.8, "último día del tramo del 80%"],
    ["2026-07-01", 0.9, "primer día del tramo del 90%"],
    ["2027-06-30", 0.9, "último día del tramo del 90%"],
    ["2027-07-01", 1.0, "el día que antes tumbaba la nómina"],
    ["2029-12-31", 1.0, "tramo final, abierto"],
  ])("%s → %s (%s)", (fecha, esperado) => {
    expect(r.en("recargo_dominical", fecha as string)).toBe(esperado);
  });
});

describe("el divisor de hora ordinaria sigue los escalones de la Ley 2101", () => {
  const r = crearResolutorReglas(REGLAS_JUL_2026);

  it.each([
    ["2022-05-10", 240, "jornada de 48 horas"],
    ["2023-07-14", 240, "último día de las 48 horas"],
    ["2023-07-15", 235, "primer día de las 47 horas"],
    ["2024-07-15", 230, "jornada de 46 horas"],
    ["2025-07-15", 220, "jornada de 44 horas"],
    ["2026-07-14", 220, "último día de las 44 horas"],
    ["2026-07-15", 210, "jornada de 42 horas"],
  ])("%s → %s (%s)", (fecha, esperado) => {
    expect(r.en("divisor_hora_ordinaria", fecha as string)).toBe(esperado);
  });
});
