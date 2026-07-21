import { describe, expect, it } from "vitest";
import { CalculadoraPorTurnos } from "../calculadoraTurnos.js";
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

describe("CalculadoraPorTurnos — fixture Restaurante Resplandor (16–30 jun 2026)", () => {
  // Aritmética esperada, calculada a mano:
  //   base       = 1.750.905/30 × 15 días       = 875.452,50
  //   valorHora  = 1.750.905/220                =   7.958,66
  //   dominical  = 12 h (dom 21 y 28, 6 h c/u) × 7.958,66 × 0,80 = 76.403,13
  //   auxilio    = 249.095/30 × 15              = 124.547,50
  //   IBC        = 875.452,50 + 76.403,13       = 951.855,63
  //   salud/pensión = IBC × 4 %                 =  38.074,23 c/u
  //   neto       = 1.076.403,13 − 76.148,46     = 1.000.254,67
  // El lunes 29-jun es festivo (San Pedro y San Pablo) → descanso por defecto.
  const resultado = CalculadoraPorTurnos.calcular(datosBase(), REGLAS_JUL_2026, FESTIVOS_2026);

  it("paga el salario básico proporcional a los 15 días del periodo", () => {
    const base = resultado.lineas.find((l) => l.concepto.startsWith("Salario básico"));
    expect(base?.valorCalculado).toBeCloseTo(875452.5, -1);
  });

  it("genera solo el recargo dominical (12 h al 80%), sin pagar la hora base de nuevo", () => {
    const recargo = resultado.lineas.find((l) => l.concepto.startsWith("Recargo dominical"));
    expect(recargo?.horas).toBe(12);
    expect(recargo?.recargoPct).toBe(0.8);
    expect(recargo?.valorCalculado).toBeCloseTo(76403.13, 0);
    expect(resultado.lineas.some((l) => l.concepto.startsWith("Horas dominicales"))).toBe(false);
  });

  it("no genera recargo nocturno ni horas extra con el horario base", () => {
    const conceptos = resultado.lineas.map((l) => l.concepto);
    expect(conceptos.some((c) => c.startsWith("Recargo nocturno"))).toBe(false);
    expect(conceptos.some((c) => c.startsWith("Hora extra"))).toBe(false);
  });

  it("deduce salud y pensión automáticamente sobre el IBC (sin auxilio)", () => {
    const salud = resultado.lineas.find((l) => l.concepto.startsWith("Salud"));
    const pension = resultado.lineas.find((l) => l.concepto.startsWith("Pensión"));
    expect(salud?.valorCalculado).toBeCloseTo(38074.23, 0);
    expect(pension?.valorCalculado).toBeCloseTo(38074.23, 0);
    expect(salud?.base).toBeCloseTo(951855.63, 0); // IBC excluye auxilio
  });

  it("incluye auxilio de transporte proporcional", () => {
    const aux = resultado.lineas.find((l) => l.concepto === "Auxilio de transporte");
    expect(aux?.valorCalculado).toBeCloseTo(124547.5, -1);
  });

  it("neto esperado = devengos − deducciones (regresión completa)", () => {
    expect(resultado.totalDevengos).toBeCloseTo(1076403.13, 0);
    expect(resultado.totalDeducciones).toBeCloseTo(76148.46, 0);
    expect(resultado.netoEsperado).toBeCloseTo(1000254.67, 0);
  });

  it("expone valor día, valor hora ordinaria (divisor 220 en jun-2026) y días laborados", () => {
    expect(resultado.valorDia).toBe(Math.round(1750905 / 30));
    expect(resultado.valorHoraOrdinaria).toBe(Math.round(1750905 / 220));
    // 15 días calendario menos el lunes festivo 29-jun (descanso por defecto)
    // y los lunes de descanso del horario base.
    expect(resultado.diasLaborados).toBeGreaterThan(0);
    expect(resultado.diasLaborados!).toBeLessThan(15);
  });

  it("no genera advertencias (solo 2 domingos trabajados)", () => {
    expect(resultado.advertencias).toHaveLength(0);
  });
});

describe("CalculadoraPorTurnos — novedades", () => {
  it("una novedad 'no trabajé' el domingo reduce el recargo dominical a 6 h", () => {
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ novedades: [{ fecha: "2026-06-21", trabajo: false }] }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const recargo = resultado.lineas.find((l) => l.concepto.startsWith("Recargo dominical"));
    expect(recargo?.horas).toBe(6);
  });

  it("una novedad con turno largo genera recargo nocturno y hora extra nocturna", () => {
    // Martes 16-jun 14:00–22:00 (8 h): ordinarias 14:00–21:00 (2 h nocturnas
    // desde las 19:00) + 1 h extra 21:00–22:00 (nocturna).
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [{ fecha: "2026-06-16", trabajo: true, horaInicio: "14:00", horaFin: "22:00" }],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const nocturno = resultado.lineas.find(
      (l) => l.concepto.startsWith("Recargo nocturno") && !l.concepto.includes("dominical")
    );
    const extraNocturna = resultado.lineas.find((l) => l.concepto.startsWith("Hora extra nocturna"));
    expect(nocturno?.horas).toBe(2);
    expect(nocturno?.recargoPct).toBe(0.35);
    expect(extraNocturna?.horas).toBe(1);
    expect(extraNocturna?.recargoPct).toBe(0.75);
  });

  it("trabajar un festivo (por novedad) genera recargo dominical/festivo", () => {
    // Lunes 29-jun es festivo — por defecto descanso; la novedad lo activa.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [{ fecha: "2026-06-29", trabajo: true, horaInicio: "10:00", horaFin: "16:00" }],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const recargo = resultado.lineas.find((l) => l.concepto.startsWith("Recargo dominical"));
    expect(recargo?.horas).toBe(18); // 12 h de domingos + 6 h del festivo
  });

  it("ausentismo no remunerado (Regla 2): el salario básico NUNCA se reduce en silencio — se agrega una línea de deducción explícita", () => {
    const conAusencia = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [
          { fecha: "2026-06-17", trabajo: false, remunerada: false },
          { fecha: "2026-06-18", trabajo: false, remunerada: false },
        ],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const sinAusencia = CalculadoraPorTurnos.calcular(datosBase(), REGLAS_JUL_2026, FESTIVOS_2026);

    const salarioBase = conAusencia.lineas.find((l) => l.concepto.startsWith("Salario básico"));
    // El salario básico sigue mostrando el pactado completo para los 15 días
    // del periodo — idéntico al caso sin ausencias.
    expect(salarioBase?.valorCalculado).toBe(
      sinAusencia.lineas.find((l) => l.concepto.startsWith("Salario básico"))?.valorCalculado
    );

    const ajuste = conAusencia.lineas.find((l) => l.concepto.startsWith("Ajuste por ausentismo"));
    expect(ajuste?.tipo).toBe("deduccion");
    expect(ajuste?.concepto).toBe("Ajuste por ausentismo (2 días no remunerados)");
    expect(ajuste?.valorCalculado).toBe(116727); // (1.750.905 / 30) × 2 días

    // El neto SÍ refleja la ausencia — la resta es visible, no silenciosa.
    expect(sinAusencia.netoEsperado - conAusencia.netoEsperado).toBe(116727);
  });

  it("una novedad trabajo=false SIN remunerada:false (descanso normal) no genera ningún ajuste de ausentismo", () => {
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ novedades: [{ fecha: "2026-06-17", trabajo: false }] }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    expect(resultado.lineas.some((l) => l.concepto.startsWith("Ajuste por ausentismo"))).toBe(false);
  });

  it("lanza error si la novedad dice trabajo=true sin horas", () => {
    expect(() =>
      CalculadoraPorTurnos.calcular(
        datosBase({ novedades: [{ fecha: "2026-06-16", trabajo: true }] }),
        REGLAS_JUL_2026,
        FESTIVOS_2026
      )
    ).toThrow();
  });
});

describe("CalculadoraPorTurnos — descanso compensatorio", () => {
  it("advierte cuando se trabajan 3 o más domingos en el periodo", () => {
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ periodoDesde: "2026-06-01", periodoHasta: "2026-06-30" }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    // Junio 2026 tiene domingos 7, 14, 21 y 28 — los 4 trabajados por defecto.
    expect(resultado.advertencias.some((a) => /compensatorio/.test(a))).toBe(true);
  });
});

describe("CalculadoraPorTurnos — cortes normativos", () => {
  it("separa el recargo dominical en tramos 80%/90% cuando el periodo cruza el 1-jul-2026", () => {
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ periodoDesde: "2026-06-28", periodoHasta: "2026-07-05" }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const recargos = resultado.lineas
      .filter((l) => l.concepto.startsWith("Recargo dominical"))
      .map((l) => l.recargoPct)
      .sort();
    expect(recargos).toEqual([0.8, 0.9]);
  });

  it("usa el divisor 210 (42 h/sem) para recargos posteriores al 15-jul-2026", () => {
    // Periodo 16–31 jul: domingos 19 y 26 (12 h); el festivo 20-jul es
    // descanso por defecto. Recargo = 12 h × (salario/210) × 0,90.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ periodoDesde: "2026-07-16", periodoHasta: "2026-07-31" }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const recargo = resultado.lineas.find((l) => l.concepto.startsWith("Recargo dominical"));
    const valorHora210 = 1750905 / 210;
    expect(recargo?.horas).toBe(12);
    expect(recargo?.valorCalculado).toBeCloseTo(12 * valorHora210 * 0.9, 0);
  });
});

describe("CalculadoraPorTurnos — aporte AFC (Fase 1, deducción por convenio)", () => {
  it("descuenta el AFC prorrateado del neto sin afectar el IBC de salud/pensión", () => {
    // AFC 200.000/mes × 15/30 días = 100.000. IBC (base salud/pensión) debe
    // seguir siendo el mismo que sin AFC: 951.855,63.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ aporteAfcMensual: 200000 }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const afc = resultado.lineas.find((l) => l.concepto === "Aporte AFC (convenio)");
    const salud = resultado.lineas.find((l) => l.concepto.startsWith("Salud"));
    expect(afc?.valorCalculado).toBeCloseTo(100000, 0);
    expect(afc?.tipo).toBe("deduccion");
    expect(salud?.base).toBeCloseTo(951855.63, 0);
    expect(resultado.advertencias).toHaveLength(0);
  });

  it("recorta el AFC (no salud/pensión) si el total de deducciones supera el 50% del devengado (CST art. 149)", () => {
    // Devengado ≈ 1.076.403,13; tope 50 % ≈ 538.201,57; salud+pensión ≈
    // 76.148,46 → AFC solicitado de 1.000.000 debe recortarse.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ aporteAfcMensual: 2000000 }), // 2.000.000/mes × 15/30 = 1.000.000 en el periodo
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const afc = resultado.lineas.find((l) => l.concepto === "Aporte AFC (convenio)");
    const salud = resultado.lineas.find((l) => l.concepto.startsWith("Salud"));
    const pension = resultado.lineas.find((l) => l.concepto.startsWith("Pensión"));
    expect(salud?.valorCalculado).toBeCloseTo(38074.23, 0);
    expect(pension?.valorCalculado).toBeCloseTo(38074.23, 0);
    expect(resultado.totalDeducciones).toBeLessThanOrEqual(resultado.totalDevengos * 0.5 + 1);
    expect(afc!.valorCalculado).toBeLessThan(1000000);
    expect(resultado.advertencias.some((a) => a.includes("AFC"))).toBe(true);
  });
});

describe("CalculadoraPorTurnos — tope de auxilio de transporte (2 SMLMV)", () => {
  it("no paga auxilio si el salario supera 2 SMLMV, aunque el usuario lo marque", () => {
    // 2 SMLMV = 3.501.810; salario de prueba por encima del tope.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ salarioBasicoMensual: 4000000, recibeAuxilioTransporte: true }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    expect(resultado.lineas.some((l) => l.concepto === "Auxilio de transporte")).toBe(false);
    expect(resultado.advertencias.some((a) => a.includes("auxilio de transporte"))).toBe(true);
  });

  it("sí paga auxilio si el salario es igual al tope de 2 SMLMV", () => {
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ salarioBasicoMensual: 3501810, recibeAuxilioTransporte: true }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    expect(resultado.lineas.some((l) => l.concepto === "Auxilio de transporte")).toBe(true);
  });
});

describe("CalculadoraPorTurnos — embargo judicial", () => {
  it("embargo ordinario: solo 1/5 del excedente sobre el SMLMV prorrateado del periodo", () => {
    // Periodo de 15 días ⇒ SMLMV prorrateado = 1.750.905/2 = 875.452,5.
    // Devengado del periodo ≈ 1.076.403,13 ⇒ excedente ≈ 200.950,63 ⇒
    // embargable = 20% × 200.950,63 ≈ 40.190,13 (menor a los 100.000
    // solicitados, prorrateados de 200.000/mes).
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ descuentoJudicial: { tipo: "ordinario", valorMensual: 200000 } }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const embargo = resultado.lineas.find((l) => l.concepto.startsWith("Embargo judicial"));
    expect(embargo?.valorCalculado).toBeCloseTo(40190.13, 0);
    expect(resultado.advertencias.some((a) => a.includes("embargo"))).toBe(true);
  });

  it("embargo por alimentos: se recorta al 50% del devengado si se solicita más", () => {
    // Devengado del periodo ≈ 1.076.403,13 → tope 50% ≈ 538.201,57.
    // Solicitado (prorrateado 15/30 de 4.000.000/mes) = 2.000.000, muy por
    // encima del tope: debe recortarse exactamente al 50% del devengado.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ descuentoJudicial: { tipo: "alimentos_o_cooperativa", valorMensual: 4000000 } }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const embargo = resultado.lineas.find((l) => l.concepto.startsWith("Embargo judicial"));
    expect(embargo!.valorCalculado).toBeCloseTo(resultado.totalDevengos * 0.5, -1);
    expect(resultado.advertencias.some((a) => a.includes("embargo"))).toBe(true);
  });
});

describe("CalculadoraPorTurnos — caso RESPLANDOR: cierre nocturno en domingo", () => {
  it("acumula recargo dominical Y recargo nocturno dominical cuando el cierre pasa de las 19:00", () => {
    // Mesera con horario base dominical 10:00-16:00 (default); el domingo
    // 21-jun tuvo un cierre especial 14:00-20:00 (novedad), 6h ordinarias
    // dominicales de las cuales 1h (19:00-20:00) cae en jornada nocturna.
    // El otro domingo (28-jun) sigue el horario base sin nocturnidad.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [{ fecha: "2026-06-21", trabajo: true, horaInicio: "14:00", horaFin: "20:00" }],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const valorHora = 1750905 / 220;

    const dominical = resultado.lineas.find((l) => l.concepto.startsWith("Recargo dominical"));
    expect(dominical?.horas).toBe(12); // 6h (21-jun) + 6h (28-jun)
    expect(dominical?.recargoPct).toBe(0.8);
    expect(dominical?.valorCalculado).toBeCloseTo(12 * valorHora * 0.8, 0);

    const nocturnoDominical = resultado.lineas.find((l) =>
      l.concepto.startsWith("Recargo nocturno dominical")
    );
    expect(nocturnoDominical?.horas).toBe(1); // 19:00-20:00
    expect(nocturnoDominical?.recargoPct).toBe(0.35);
    expect(nocturnoDominical?.valorCalculado).toBeCloseTo(1 * valorHora * 0.35, 0);
    expect(nocturnoDominical?.ley).toContain("Ley 2466 de 2025");
  });

  it("la hora extra dominical nocturna usa el factor 75% (2.55), no el diurno 25% (2.05)", () => {
    // Domingo 21-jun con turno especial 14:00-22:00 (8h): 6h ordinarias
    // dominicales (5 diurnas + 1 nocturna 19:00-20:00) + 2h extra, TODAS
    // nocturnas (20:00-22:00) — deben pagarse al factor 2.55 (100% + 75%
    // extra nocturna + 80% recargo dominical), no al 2.05 diurno.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [{ fecha: "2026-06-21", trabajo: true, horaInicio: "14:00", horaFin: "22:00" }],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const valorHora = 1750905 / 220;

    const extraNocturna = resultado.lineas.find((l) =>
      l.concepto.startsWith("Hora extra dominical/festiva nocturna")
    );
    expect(extraNocturna?.horas).toBe(2);
    expect(extraNocturna?.recargoPct).toBeCloseTo(1.55, 4); // 0.8 + 0.75
    expect(extraNocturna?.valorCalculado).toBeCloseTo(2 * valorHora * 2.55, 0);

    // No debe existir una línea "diurna" en este caso (las 2h extra son
    // 100% nocturnas) — antes se fusionaban aquí, subpagando la hora.
    const extraDiurna = resultado.lineas.find((l) =>
      l.concepto.startsWith("Hora extra dominical/festiva diurna")
    );
    expect(extraDiurna).toBeUndefined();
  });
});

describe("CalculadoraPorTurnos — deducciones por convenio (AFC, préstamo, ahorro, reproceso)", () => {
  it("cada deducción es una línea independiente, sin afectar el IBC", () => {
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ aporteAfcMensual: 100000, prestamoMensual: 60000, ahorroMensual: 40000, reprocesoMensual: 20000 }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const salud = resultado.lineas.find((l) => l.concepto.startsWith("Salud"));
    expect(salud?.base).toBeCloseTo(951855.63, 0); // IBC sin cambios

    // Prorrateo 15/30: 100.000→50.000, 60.000→30.000, 40.000→20.000, 20.000→10.000.
    expect(resultado.lineas.find((l) => l.concepto === "Aporte AFC (convenio)")?.valorCalculado).toBeCloseTo(50000, 0);
    expect(resultado.lineas.find((l) => l.concepto === "Préstamo (convenio)")?.valorCalculado).toBeCloseTo(30000, 0);
    expect(resultado.lineas.find((l) => l.concepto === "Ahorro (convenio)")?.valorCalculado).toBeCloseTo(20000, 0);
    expect(resultado.lineas.find((l) => l.concepto === "Reproceso")?.valorCalculado).toBeCloseTo(10000, 0);
  });

  it("recorta TODAS las deducciones por convenio proporcionalmente si juntas superan el 50% del devengado", () => {
    // Devengado del periodo ≈ 1.076.403,13 → tope 50% ≈ 538.201,57;
    // ley (salud+pensión) ≈ 76.148,46 → disponible para convenio ≈ 462.053,11.
    // Solicitado: AFC 500.000 + préstamo 300.000 + ahorro 200.000 (prorrateados
    // 15/30 de 1.000.000/600.000/400.000 por mes) = 1.000.000 solicitado.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ aporteAfcMensual: 1000000, prestamoMensual: 600000, ahorroMensual: 400000 }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const afc = resultado.lineas.find((l) => l.concepto === "Aporte AFC (convenio)")!.valorCalculado;
    const prestamo = resultado.lineas.find((l) => l.concepto === "Préstamo (convenio)")!.valorCalculado;
    const ahorro = resultado.lineas.find((l) => l.concepto === "Ahorro (convenio)")!.valorCalculado;

    // Proporción solicitada 5:3:2 debe conservarse tras el recorte.
    expect(afc / prestamo).toBeCloseTo(500000 / 300000, 0);
    expect(afc / ahorro).toBeCloseTo(500000 / 200000, 0);
    expect(resultado.totalDeducciones).toBeCloseTo(resultado.totalDevengos * 0.5, -1);
    expect(resultado.advertencias.some((a) => a.includes("convenio"))).toBe(true);
    // Issue tipado equivalente (SDD §15 pilar 2): el recorte emite
    // TOPE_DEDUCCIONES_SUPERADO como advertencia, no error.
    const tope = resultado.issues.find((i) => i.codigo === "TOPE_DEDUCCIONES_SUPERADO");
    expect(tope?.severidad).toBe("advertencia");
    expect(tope?.referenciaLegal).toBe("CST art. 149");
  });
});

describe("CalculadoraPorTurnos — prorrateo dinámico por días del periodo (nunca asume 15 días fijos)", () => {
  it("un periodo de 14 días (ingreso tardío o cierre anticipado) prorratea el básico, el auxilio y el IBC sobre 14, no sobre 15", () => {
    // periodoDesde se corre un día (17-jun en vez de 16-jun) — el motor lee
    // rangoFechas(desde, hasta).length dinámicamente, nunca asume 15.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ periodoDesde: "2026-06-17", periodoHasta: "2026-06-30" }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const base = resultado.lineas.find((l) => l.concepto.startsWith("Salario básico"));
    const aux = resultado.lineas.find((l) => l.concepto === "Auxilio de transporte");
    const salud = resultado.lineas.find((l) => l.concepto.startsWith("Salud"));

    expect(base?.concepto).toBe("Salario básico (14 días)");
    expect(base?.valorCalculado).toBeCloseTo((1750905 / 30) * 14, -1);
    expect(aux?.valorCalculado).toBeCloseTo((249095 / 30) * 14, -1);
    // El IBC (base de salud/pensión) también debe reflejar los 14 días, no
    // los 15 del fixture original (951.855,63) — debe ser menor.
    expect(salud!.base!).toBeLessThan(951855.63);
  });
});

describe("CalculadoraPorTurnos — tope legal de horas extra (pagar + advertir)", () => {
  it("advierte cuando un día supera 2h extra, pero las paga completas", () => {
    // Martes 16-jun 10:00-21:00 (11h): 7h ordinarias + 4h extra (2 diurnas
    // 17:00-19:00 + 2 nocturnas 19:00-21:00) — supera el tope diario de 2h.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [{ fecha: "2026-06-16", trabajo: true, horaInicio: "10:00", horaFin: "21:00" }],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    expect(resultado.advertencias.some((a) => a.includes("2026-06-16") && a.includes("máximo legal de 2 h/día"))).toBe(true);
    // También emite el issue tipado equivalente (SDD §15 pilar 2) —
    // el gate de QA lo lee directo sin re-parsear el string de arriba.
    const issueDia = resultado.issues.find((i) => i.codigo === "HORAS_EXTRA_EXCEDIDAS_DIA");
    expect(issueDia?.referenciaLegal).toBe("D.L. 13 de 1967, art. 1");
    expect(issueDia?.detalles.contexto).toBe("2026-06-16");
    expect(issueDia?.detalles.valorLimite).toBe(2);
    // Las 4h extra se pagan completas (2 diurnas + 2 nocturnas):
    const extraDiurna = resultado.lineas.find((l) => l.concepto.startsWith("Hora extra diurna"));
    const extraNocturna = resultado.lineas.find((l) => l.concepto.startsWith("Hora extra nocturna"));
    expect((extraDiurna?.horas ?? 0) + (extraNocturna?.horas ?? 0)).toBe(4);
  });

  it("NO advierte con exactamente 2h extra en el día (borde inclusivo)", () => {
    // Martes 16-jun 10:00-19:00 (9h): 7h ordinarias + exactamente 2h extra.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [{ fecha: "2026-06-16", trabajo: true, horaInicio: "10:00", horaFin: "19:00" }],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    expect(resultado.advertencias.some((a) => a.includes("h/día"))).toBe(false);
  });

  it("advierte cuando la semana acumula más de 12h extra aunque ningún día supere 2h", () => {
    // Semana lun 22-jun a dom 28-jun: mar-sáb (23-27) con turnos de 9h
    // (7 ord + 2 extra c/u = 10h extra) + domingo 28 con novedad 08:00-16:30
    // (6 ord + 2.5 extra) = 12.5h extra en la semana. Ningún día supera 2h
    // extra hábiles... el domingo tiene 2.5 (dispara también la diaria, así
    // que usamos solo días de 2h y sumamos con el domingo al límite justo).
    // Mejor: 6 días × 2h extra + domingo 2h extra = 14h > 12h.
    const novedades = ["2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26", "2026-06-27"].map(
      (fecha) => ({ fecha, trabajo: true as const, horaInicio: "10:00", horaFin: "19:00" })
    );
    // Domingo 28-jun: 6h ordinarias + 2h extra (08:00-16:00).
    novedades.push({ fecha: "2026-06-28", trabajo: true as const, horaInicio: "08:00", horaFin: "16:00" });
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ novedades }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    // 5 días hábiles × 2h + domingo 2h = 12h... exactamente el tope: NO advierte.
    expect(resultado.advertencias.some((a) => a.includes("h/semana"))).toBe(false);

    // Ahora empujamos el sábado a 3h extra (10:00-20:00): total semanal 13h.
    const novedades13 = novedades.map((n) =>
      n.fecha === "2026-06-27" ? { ...n, horaFin: "20:00" } : n
    );
    const resultado13 = CalculadoraPorTurnos.calcular(
      datosBase({ novedades: novedades13 }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    expect(resultado13.advertencias.some((a) => a.includes("máximo legal de 12 h/semana"))).toBe(true);
  });
});

describe("CalculadoraPorTurnos — validaciones de entrada", () => {
  it("rechaza un periodo invertido (desde > hasta) en vez de devolver $0 silencioso", () => {
    expect(() =>
      CalculadoraPorTurnos.calcular(
        datosBase({ periodoDesde: "2026-01-15", periodoHasta: "2026-01-01" }),
        REGLAS_JUL_2026,
        FESTIVOS_2026
      )
    ).toThrow(/invertido/);
  });

  it("rechaza fechas inexistentes en el calendario (2026-02-30 desbordaría a marzo)", () => {
    for (const hasta of ["2026-02-30", "2026-13-01", "2027-02-29"]) {
      expect(() =>
        CalculadoraPorTurnos.calcular(
          datosBase({ periodoDesde: "2026-02-01", periodoHasta: hasta }),
          REGLAS_JUL_2026,
          FESTIVOS_2026
        )
      ).toThrow(/inexistente|inválida/i);
    }
  });

  it("un turno que cruza medianoche (22:00→06:00) divide bien ordinarias/extra/nocturnas", () => {
    // Martes 16-jun: 8h totales, jornada hábil 7h → 7 ordinarias (22:00-05:00,
    // todas nocturnas) + 1 extra (05:00-06:00, nocturna).
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [{ fecha: "2026-06-16", trabajo: true, horaInicio: "22:00", horaFin: "06:00" }],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const nocturno = resultado.lineas.find(
      (l) => l.concepto.startsWith("Recargo nocturno") && !l.concepto.includes("dominical")
    );
    const extraNocturna = resultado.lineas.find((l) => l.concepto.startsWith("Hora extra nocturna"));
    expect(nocturno?.horas).toBe(7);
    expect(extraNocturna?.horas).toBe(1);
  });

  it("un turno de 2 minutos a caballo de las 19:00 genera exactamente 1 minuto nocturno", () => {
    // Martes 16-jun 18:59→19:01: 2 min ordinarios, 1 de ellos nocturno.
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({
        novedades: [{ fecha: "2026-06-16", trabajo: true, horaInicio: "18:59", horaFin: "19:01" }],
      }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    const nocturno = resultado.lineas.find(
      (l) => l.concepto.startsWith("Recargo nocturno") && !l.concepto.includes("dominical")
    );
    expect(nocturno?.horas).toBeCloseTo(1 / 60, 2);
  });

  it("rechaza un turno con inicio y fin iguales (ambiguo entre 0 y 24 horas)", () => {
    expect(() =>
      CalculadoraPorTurnos.calcular(
        datosBase({
          novedades: [{ fecha: "2026-06-16", trabajo: true, horaInicio: "10:00", horaFin: "10:00" }],
        }),
        REGLAS_JUL_2026,
        FESTIVOS_2026
      )
    ).toThrow(/ambiguo/i);
  });

  it("rechaza salario 0 o negativo (la DB puede traer basura sin pasar por zod)", () => {
    for (const salario of [0, -1, NaN]) {
      expect(() =>
        CalculadoraPorTurnos.calcular(
          datosBase({ salarioBasicoMensual: salario }),
          REGLAS_JUL_2026,
          FESTIVOS_2026
        )
      ).toThrow(/mayor que cero/);
    }
  });

  it("no crashea con el salario extremo mínimo de $1", () => {
    const resultado = CalculadoraPorTurnos.calcular(
      datosBase({ salarioBasicoMensual: 1 }),
      REGLAS_JUL_2026,
      FESTIVOS_2026
    );
    expect(resultado.netoEsperado).toBeGreaterThanOrEqual(0);
    expect(resultado.totalDeducciones).toBeGreaterThanOrEqual(0);
  });

  it("rechaza dos novedades para la misma fecha", () => {
    expect(() =>
      CalculadoraPorTurnos.calcular(
        datosBase({
          novedades: [
            { fecha: "2026-06-16", trabajo: false },
            { fecha: "2026-06-16", trabajo: true, horaInicio: "10:00", horaFin: "14:00" },
          ],
        }),
        REGLAS_JUL_2026,
        FESTIVOS_2026
      )
    ).toThrow(/2026-06-16.*duplicada/);
  });

  it("rechaza una novedad con fecha inexistente", () => {
    expect(() =>
      CalculadoraPorTurnos.calcular(
        datosBase({
          novedades: [{ fecha: "2026-06-31", trabajo: false }],
        }),
        REGLAS_JUL_2026,
        FESTIVOS_2026
      )
    ).toThrow(/inexistente|inválida/i);
  });

  it("rechaza un horarioBase que no tenga 7 posiciones", () => {
    expect(() =>
      CalculadoraPorTurnos.calcular(
        datosBase({ horarioBase: [null, null] }),
        REGLAS_JUL_2026,
        FESTIVOS_2026
      )
    ).toThrow(/7 posiciones/);
  });
});
