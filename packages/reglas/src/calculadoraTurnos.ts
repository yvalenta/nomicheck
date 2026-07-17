import type {
  CalculadoraNomina,
  DatosNominaTurnos,
  Festivo,
  HorarioDia,
  LineaResultado,
  NovedadDia,
} from "./types.js";
import { diaSemana, esDomingo, rangoFechas, reglaEn } from "./utils.js";
import { redondearPeso } from "./numero.js";
import { aplicarDeducciones } from "./deducciones.js";
import {
  DIAS_MES_COMERCIAL,
  HORA_FIN_JORNADA_NOCTURNA,
  HORA_INICIO_JORNADA_NOCTURNA,
  JORNADA_DOMINICAL_HORAS,
  JORNADA_HABIL_HORAS,
  MINUTOS_POR_DIA,
  MINUTOS_POR_HORA,
} from "./constantes.js";

interface DiaTrabajado {
  fecha: string;
  esDominicalFestivo: boolean;
  ordinariaDiurna: number;
  ordinariaNocturna: number;
  extraDiurna: number;
  extraNocturna: number;
}

function hhmmAMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * MINUTOS_POR_HORA + m;
}

// Minutos de un tramo [inicioMin, inicioMin+duracionMin) que caen en jornada
// nocturna (HORA_INICIO_JORNADA_NOCTURNA–HORA_FIN_JORNADA_NOCTURNA). Recorre
// minuto a minuto: los turnos son cortos (horas), así que el costo es
// despreciable y evita errores de aritmética modular con fracciones de hora.
function minutosNocturnosEnTramo(inicioMin: number, duracionMin: number): number {
  let count = 0;
  for (let m = 0; m < duracionMin; m++) {
    const hora = Math.floor(((inicioMin + m) % MINUTOS_POR_DIA) / MINUTOS_POR_HORA);
    if (hora >= HORA_INICIO_JORNADA_NOCTURNA || hora < HORA_FIN_JORNADA_NOCTURNA) count++;
  }
  return count;
}

// Divide un turno [horaInicio, horaFin) en horas ordinarias/extra y
// diurnas/nocturnas. Las primeras `jornadaOrdinariaHoras` horas del turno son
// ordinarias; el resto es extra.
function dividirTurno(horaInicio: string, horaFin: string, jornadaOrdinariaHoras: number) {
  const inicioMin = hhmmAMinutos(horaInicio);
  const finMin = hhmmAMinutos(horaFin);
  let totalMin = finMin - inicioMin;
  if (totalMin <= 0) totalMin += MINUTOS_POR_DIA; // turno cruza medianoche

  const ordinariaMin = Math.min(totalMin, jornadaOrdinariaHoras * MINUTOS_POR_HORA);
  const extraMin = totalMin - ordinariaMin;

  const nocturnaOrdinariaMin = minutosNocturnosEnTramo(inicioMin, ordinariaMin);
  const diurnaOrdinariaMin = ordinariaMin - nocturnaOrdinariaMin;
  const nocturnaExtraMin = minutosNocturnosEnTramo(
    (inicioMin + ordinariaMin) % MINUTOS_POR_DIA,
    extraMin
  );
  const diurnaExtraMin = extraMin - nocturnaExtraMin;

  return {
    ordinariaDiurna: diurnaOrdinariaMin / MINUTOS_POR_HORA,
    ordinariaNocturna: nocturnaOrdinariaMin / MINUTOS_POR_HORA,
    extraDiurna: diurnaExtraMin / MINUTOS_POR_HORA,
    extraNocturna: nocturnaExtraMin / MINUTOS_POR_HORA,
  };
}

// Horario efectivo de un día. Prioridad: novedad declarada → festivo
// (descanso) → horario base semanal (null = descanso).
function horarioDelDia(
  fecha: string,
  horarioBase: (HorarioDia | null)[],
  novedades: NovedadDia[],
  festivos: Festivo[]
): HorarioDia | null {
  const novedad = novedades.find((n) => n.fecha === fecha);
  if (novedad) {
    if (!novedad.trabajo) return null;
    if (!novedad.horaInicio || !novedad.horaFin) {
      throw new Error(`La novedad del ${fecha} indica trabajo pero no tiene horas`);
    }
    return { horaInicio: novedad.horaInicio, horaFin: novedad.horaFin };
  }

  const esFestivo = festivos.some((f) => f.fecha === fecha);
  if (esFestivo) return null;

  return horarioBase[diaSemana(fecha)] ?? null;
}

export const CalculadoraPorTurnos: CalculadoraNomina = {
  calcular(datos, reglas, festivos) {
    if (datos.modo !== "turnos") {
      throw new Error("CalculadoraPorTurnos solo acepta datos en modo 'turnos'");
    }
    const d = datos as DatosNominaTurnos;
    if (d.horarioBase.length !== 7) {
      throw new Error("horarioBase debe tener 7 posiciones (domingo a sábado)");
    }
    const advertencias: string[] = [];
    const fechas = rangoFechas(d.periodoDesde, d.periodoHasta);

    const dias: DiaTrabajado[] = [];
    for (const fecha of fechas) {
      const horario = horarioDelDia(fecha, d.horarioBase, d.novedades, festivos);
      if (!horario) continue;

      const esFestivo = festivos.some((f) => f.fecha === fecha);
      const esDominicalFestivo = esDomingo(fecha) || esFestivo;
      const jornadaOrdinariaHoras = esDominicalFestivo
        ? JORNADA_DOMINICAL_HORAS
        : JORNADA_HABIL_HORAS;
      const partes = dividirTurno(horario.horaInicio, horario.horaFin, jornadaOrdinariaHoras);

      dias.push({ fecha, esDominicalFestivo, ...partes });
    }

    // Derecho a descanso compensatorio: 3+ domingos trabajados en el periodo
    // (CST art. 181; reiterado por la Ley 2466 de 2025).
    const domingosTrabajados = dias.filter((dia) => esDomingo(dia.fecha)).length;
    if (domingosTrabajados >= 3) {
      advertencias.push(
        `Trabajaste ${domingosTrabajados} domingos en este periodo: además del recargo, tienes derecho a un día de descanso compensatorio remunerado en la semana siguiente (CST art. 181).`
      );
    }

    // Agrupar en tramos por combinación de reglas vigentes (divisor + recargo
    // dominical) para presentar por separado si el periodo cruza un corte
    // normativo.
    const claveTramo = (fecha: string) =>
      `${reglaEn(reglas, "divisor_hora_ordinaria", fecha)}|${reglaEn(reglas, "recargo_dominical", fecha)}`;

    const tramos = new Map<string, DiaTrabajado[]>();
    for (const dia of dias) {
      const clave = claveTramo(dia.fecha);
      if (!tramos.has(clave)) tramos.set(clave, []);
      tramos.get(clave)!.push(dia);
    }
    const multiTramo = tramos.size > 1;

    const lineas: LineaResultado[] = [];

    // Devengo base: salario proporcional a los días calendario del periodo
    // (modelo estándar de nómina colombiana: el salario mensual pactado cubre
    // la jornada ordinaria; los turnos solo generan recargos y extras).
    const diasPeriodo = Math.min(fechas.length, DIAS_MES_COMERCIAL);
    const salarioBase = (d.salarioBasicoMensual / DIAS_MES_COMERCIAL) * diasPeriodo;
    lineas.push({
      concepto: `Salario básico (${diasPeriodo} días)`,
      base: redondearPeso(d.salarioBasicoMensual),
      valorCalculado: redondearPeso(salarioBase),
      tipo: "devengo",
      ley: "Contrato de trabajo; CST art. 127",
    });

    for (const diasTramo of tramos.values()) {
      const fechaRef = diasTramo[0].fecha;
      const divisor = reglaEn(reglas, "divisor_hora_ordinaria", fechaRef);
      const recargoDominical = reglaEn(reglas, "recargo_dominical", fechaRef);
      const recargoNocturno = reglaEn(reglas, "recargo_nocturno", fechaRef);
      const extraDiurnaPct = reglaEn(reglas, "hora_extra_diurna", fechaRef);
      const extraNocturnaPct = reglaEn(reglas, "hora_extra_nocturna", fechaRef);
      const valorHora = d.salarioBasicoMensual / divisor;

      const primeraFecha = diasTramo[0].fecha;
      const ultimaFecha = diasTramo[diasTramo.length - 1].fecha;
      const sufijo = multiTramo ? ` (${primeraFecha}–${ultimaFecha})` : "";

      let ordinariaHabilNocturna = 0;
      let ordinariaDominical = 0;
      let ordinariaDominicalNocturna = 0;
      let extraDiurna = 0;
      let extraNocturna = 0;
      let extraDominicalDiurna = 0;
      let extraDominicalNocturna = 0;

      for (const dia of diasTramo) {
        if (dia.esDominicalFestivo) {
          ordinariaDominical += dia.ordinariaDiurna + dia.ordinariaNocturna;
          ordinariaDominicalNocturna += dia.ordinariaNocturna;
          extraDominicalDiurna += dia.extraDiurna;
          extraDominicalNocturna += dia.extraNocturna;
        } else {
          ordinariaHabilNocturna += dia.ordinariaNocturna;
          extraDiurna += dia.extraDiurna;
          extraNocturna += dia.extraNocturna;
        }
      }

      // Recargos: solo el porcentaje adicional — la hora base ya está cubierta
      // por el salario proporcional.
      if (ordinariaHabilNocturna > 0) {
        lineas.push({
          concepto: `Recargo nocturno${sufijo}`,
          horas: redondearPeso(ordinariaHabilNocturna),
          recargoPct: recargoNocturno,
          valorCalculado: redondearPeso(ordinariaHabilNocturna * valorHora * recargoNocturno),
          tipo: "devengo",
          ley: "Ley 2466 de 2025, art. 3",
        });
      }

      if (ordinariaDominical > 0) {
        lineas.push({
          concepto: `Recargo dominical/festivo${sufijo}`,
          horas: redondearPeso(ordinariaDominical),
          recargoPct: recargoDominical,
          valorCalculado: redondearPeso(ordinariaDominical * valorHora * recargoDominical),
          tipo: "devengo",
          ley: "Ley 2466 de 2025, art. 2",
        });
      }

      if (ordinariaDominicalNocturna > 0) {
        lineas.push({
          concepto: `Recargo nocturno dominical/festivo${sufijo}`,
          horas: redondearPeso(ordinariaDominicalNocturna),
          recargoPct: recargoNocturno,
          valorCalculado: redondearPeso(ordinariaDominicalNocturna * valorHora * recargoNocturno),
          tipo: "devengo",
          ley: "Ley 2466 de 2025, art. 3",
        });
      }

      // Horas extra: fuera de la jornada ordinaria, NO están cubiertas por el
      // salario base — se pagan completas (hora + recargo).
      if (extraDiurna > 0) {
        lineas.push({
          concepto: `Hora extra diurna${sufijo}`,
          horas: redondearPeso(extraDiurna),
          recargoPct: extraDiurnaPct,
          valorCalculado: redondearPeso(extraDiurna * valorHora * (1 + extraDiurnaPct)),
          tipo: "devengo",
          ley: "CST art. 168",
        });
      }

      if (extraNocturna > 0) {
        lineas.push({
          concepto: `Hora extra nocturna${sufijo}`,
          horas: redondearPeso(extraNocturna),
          recargoPct: extraNocturnaPct,
          valorCalculado: redondearPeso(extraNocturna * valorHora * (1 + extraNocturnaPct)),
          tipo: "devengo",
          ley: "CST art. 168",
        });
      }

      // Hora extra dominical: diurna y nocturna se pagan con factores
      // distintos (100% + 25%/75% + recargo dominical vigente) — antes se
      // fusionaban en una sola línea con el factor diurno (25%) incluso
      // para las horas que caían de noche, subpagando esas horas.
      if (extraDominicalDiurna > 0) {
        const pct = recargoDominical + extraDiurnaPct;
        lineas.push({
          concepto: `Hora extra dominical/festiva diurna${sufijo}`,
          horas: redondearPeso(extraDominicalDiurna),
          recargoPct: pct,
          valorCalculado: redondearPeso(extraDominicalDiurna * valorHora * (1 + pct)),
          tipo: "devengo",
          ley: "Ley 2466 de 2025; CST art. 168",
        });
      }

      if (extraDominicalNocturna > 0) {
        const pct = recargoDominical + extraNocturnaPct;
        lineas.push({
          concepto: `Hora extra dominical/festiva nocturna${sufijo}`,
          horas: redondearPeso(extraDominicalNocturna),
          recargoPct: pct,
          valorCalculado: redondearPeso(extraDominicalNocturna * valorHora * (1 + pct)),
          tipo: "devengo",
          ley: "Ley 2466 de 2025; CST art. 168",
        });
      }
    }

    // IBC = devengado salarial acumulado hasta aquí; el auxilio de transporte
    // NO hace base para salud/pensión.
    const ibc = lineas.reduce((s, l) => s + l.valorCalculado, 0);

    if (d.recibeAuxilioTransporte) {
      const smlmv = reglaEn(reglas, "smlmv", d.periodoHasta);
      const topeSmlmv = reglaEn(reglas, "auxilio_transporte_tope_smlmv", d.periodoHasta);
      if (d.salarioBasicoMensual <= smlmv * topeSmlmv) {
        const auxilioMensual = reglaEn(reglas, "auxilio_transporte", d.periodoHasta);
        lineas.push({
          concepto: "Auxilio de transporte",
          valorCalculado: redondearPeso((auxilioMensual / DIAS_MES_COMERCIAL) * diasPeriodo),
          tipo: "devengo",
          ley: "Decreto de salario mínimo vigente",
        });
      } else {
        advertencias.push(
          `No se reconoce auxilio de transporte: el salario ($${d.salarioBasicoMensual.toLocaleString("es-CO")}) supera ${topeSmlmv} SMLMV ($${redondearPeso(smlmv * topeSmlmv).toLocaleString("es-CO")}) — Decreto de salario mínimo vigente.`
        );
      }
    }

    const totalDevengos = redondearPeso(
      lineas.filter((l) => l.tipo === "devengo").reduce((s, l) => s + l.valorCalculado, 0)
    );

    // Deducciones de ley + convenio (AFC, préstamo, ahorro, reproceso) +
    // embargo judicial — el usuario nunca declara salud/pensión/fondo,
    // solo los montos autorizados/ordenados si aplican. Todas se
    // prorratean por días del periodo igual que el auxilio de transporte.
    const prorratear = (mensual: number | undefined) =>
      ((mensual ?? 0) / DIAS_MES_COMERCIAL) * diasPeriodo;
    const deduccionesConvenio = [
      {
        concepto: "Aporte AFC (convenio)",
        valorMensual: prorratear(d.aporteAfcMensual),
        ley: "E.T. art. 126-4 — deducción por convenio, no afecta IBC (Fase 1: sin declaración de renta)",
      },
      { concepto: "Préstamo (convenio)", valorMensual: prorratear(d.prestamoMensual) },
      { concepto: "Ahorro (convenio)", valorMensual: prorratear(d.ahorroMensual) },
      { concepto: "Reproceso", valorMensual: prorratear(d.reprocesoMensual) },
    ];
    const embargoPeriodo = d.descuentoJudicial
      ? {
          tipo: d.descuentoJudicial.tipo,
          valorMensual: (d.descuentoJudicial.valorMensual / DIAS_MES_COMERCIAL) * diasPeriodo,
        }
      : undefined;
    const { lineas: lineasDeduccion, totalDeducciones, advertencias: advertenciasDeducciones } =
      aplicarDeducciones(
        totalDevengos,
        ibc,
        reglas,
        d.periodoHasta,
        { deduccionesConvenio, descuentoJudicial: embargoPeriodo },
        diasPeriodo / DIAS_MES_COMERCIAL
      );
    lineas.push(...lineasDeduccion);
    advertencias.push(...advertenciasDeducciones);

    return {
      modo: "turnos",
      periodoDesde: d.periodoDesde,
      periodoHasta: d.periodoHasta,
      salarioBasicoMensual: d.salarioBasicoMensual,
      lineas,
      totalDevengos,
      totalDeducciones,
      netoEsperado: redondearPeso(totalDevengos - totalDeducciones),
      advertencias,
    };
  },
};
