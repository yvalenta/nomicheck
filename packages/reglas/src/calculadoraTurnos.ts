import type {
  CalculadoraNomina,
  DatosNominaTurnos,
  ExcepcionTurno,
  Festivo,
  LineaResultado,
} from "./types.js";
import { esDomingo, esLunes, rangoFechas, reglaEn } from "./utils.js";
import { round2 } from "./numero.js";
import {
  DIAS_MES_COMERCIAL,
  HORARIO_DOMINICAL_FIN,
  HORARIO_DOMINICAL_INICIO,
  HORARIO_HABIL_FIN,
  HORARIO_HABIL_INICIO,
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
// ordinarias; el resto es extra (spec calculo-turnos, requisito 7).
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

// Horario del día: excepción declarada, o el horario base por defecto
// (spec calculo-turnos, requisito 2). Lunes y festivos sin excepción = descanso.
function horarioDelDia(
  fecha: string,
  excepciones: ExcepcionTurno[],
  festivos: Festivo[]
): { horaInicio: string; horaFin: string } | null {
  const excepcion = excepciones.find((e) => e.fecha === fecha);
  if (excepcion) return { horaInicio: excepcion.horaInicio, horaFin: excepcion.horaFin };

  const esFestivo = festivos.some((f) => f.fecha === fecha);
  if (esLunes(fecha) || esFestivo) return null;
  if (esDomingo(fecha)) return { horaInicio: HORARIO_DOMINICAL_INICIO, horaFin: HORARIO_DOMINICAL_FIN };
  return { horaInicio: HORARIO_HABIL_INICIO, horaFin: HORARIO_HABIL_FIN };
}

export const CalculadoraPorTurnos: CalculadoraNomina = {
  calcular(datos, reglas, festivos) {
    if (datos.modo !== "turnos") {
      throw new Error("CalculadoraPorTurnos solo acepta datos en modo 'turnos'");
    }
    const d = datos as DatosNominaTurnos;
    const advertencias: string[] = [];
    const fechas = rangoFechas(d.periodoDesde, d.periodoHasta);

    // Coherencia: domingos declarados vs. domingos reales del rango (req. 9)
    const domingosReales = fechas.filter((f) => esDomingo(f)).length;
    if (d.dominicosTrabajaos > domingosReales) {
      advertencias.push(
        `Declaraste ${d.dominicosTrabajaos} domingos trabajados, pero el rango ${d.periodoDesde} a ${d.periodoHasta} solo tiene ${domingosReales} domingos.`
      );
    }

    const dias: DiaTrabajado[] = [];
    for (const fecha of fechas) {
      const horario = horarioDelDia(fecha, d.excepciones, festivos);
      if (!horario) continue;

      const esFestivo = festivos.some((f) => f.fecha === fecha);
      const esDominicalFestivo = esDomingo(fecha) || esFestivo;
      const jornadaOrdinariaHoras = esDominicalFestivo
        ? JORNADA_DOMINICAL_HORAS
        : JORNADA_HABIL_HORAS;
      const partes = dividirTurno(horario.horaInicio, horario.horaFin, jornadaOrdinariaHoras);

      dias.push({ fecha, esDominicalFestivo, ...partes });
    }

    // Agrupar en tramos por combinación de reglas vigentes (divisor + recargo
    // dominical) para presentar por separado si el periodo cruza un corte
    // normativo (req. 4).
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
    let totalDevengos = 0;

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

      let ordinariaHabil = 0;
      let ordinariaHabilNocturna = 0;
      let ordinariaDominical = 0;
      let ordinariaDominicalNocturna = 0;
      let extraDiurna = 0;
      let extraNocturna = 0;
      let extraDominical = 0;

      for (const dia of diasTramo) {
        if (dia.esDominicalFestivo) {
          ordinariaDominical += dia.ordinariaDiurna + dia.ordinariaNocturna;
          ordinariaDominicalNocturna += dia.ordinariaNocturna;
          extraDominical += dia.extraDiurna + dia.extraNocturna;
        } else {
          ordinariaHabil += dia.ordinariaDiurna + dia.ordinariaNocturna;
          ordinariaHabilNocturna += dia.ordinariaNocturna;
          extraDiurna += dia.extraDiurna;
          extraNocturna += dia.extraNocturna;
        }
      }

      if (ordinariaHabil > 0) {
        const valor = ordinariaHabil * valorHora;
        lineas.push({
          concepto: `Horas ordinarias${sufijo}`,
          horas: round2(ordinariaHabil),
          base: round2(valorHora),
          valorCalculado: round2(valor),
          tipo: "devengo",
          ley: "CST art. 160; Ley 2101 de 2021",
        });
        totalDevengos += valor;
      }

      if (ordinariaHabilNocturna > 0) {
        const valor = ordinariaHabilNocturna * valorHora * recargoNocturno;
        lineas.push({
          concepto: `Recargo nocturno${sufijo}`,
          horas: round2(ordinariaHabilNocturna),
          recargoPct: recargoNocturno,
          valorCalculado: round2(valor),
          tipo: "devengo",
          ley: "Ley 2466 de 2025, art. 3",
        });
        totalDevengos += valor;
      }

      if (ordinariaDominical > 0) {
        const valorBase = ordinariaDominical * valorHora;
        const valorRecargo = ordinariaDominical * valorHora * recargoDominical;
        lineas.push({
          concepto: `Horas dominicales/festivas${sufijo}`,
          horas: round2(ordinariaDominical),
          base: round2(valorHora),
          valorCalculado: round2(valorBase),
          tipo: "devengo",
          ley: "CST art. 179",
        });
        lineas.push({
          concepto: `Recargo dominical/festivo${sufijo}`,
          horas: round2(ordinariaDominical),
          recargoPct: recargoDominical,
          valorCalculado: round2(valorRecargo),
          tipo: "devengo",
          ley: "Ley 2466 de 2025, art. 2",
        });
        totalDevengos += valorBase + valorRecargo;
      }

      if (ordinariaDominicalNocturna > 0) {
        const valor = ordinariaDominicalNocturna * valorHora * recargoNocturno;
        lineas.push({
          concepto: `Recargo nocturno dominical/festivo${sufijo}`,
          horas: round2(ordinariaDominicalNocturna),
          recargoPct: recargoNocturno,
          valorCalculado: round2(valor),
          tipo: "devengo",
          ley: "Ley 2466 de 2025, art. 3",
        });
        totalDevengos += valor;
      }

      if (extraDiurna > 0) {
        const valor = extraDiurna * valorHora * (1 + extraDiurnaPct);
        lineas.push({
          concepto: `Hora extra diurna${sufijo}`,
          horas: round2(extraDiurna),
          recargoPct: extraDiurnaPct,
          valorCalculado: round2(valor),
          tipo: "devengo",
          ley: "CST art. 168",
        });
        totalDevengos += valor;
      }

      if (extraNocturna > 0) {
        const valor = extraNocturna * valorHora * (1 + extraNocturnaPct);
        lineas.push({
          concepto: `Hora extra nocturna${sufijo}`,
          horas: round2(extraNocturna),
          recargoPct: extraNocturnaPct,
          valorCalculado: round2(valor),
          tipo: "devengo",
          ley: "CST art. 168",
        });
        totalDevengos += valor;
      }

      if (extraDominical > 0) {
        const pct = recargoDominical + extraDiurnaPct;
        const valor = extraDominical * valorHora * (1 + pct);
        lineas.push({
          concepto: `Hora extra dominical/festiva${sufijo}`,
          horas: round2(extraDominical),
          recargoPct: pct,
          valorCalculado: round2(valor),
          tipo: "devengo",
          ley: "Ley 2466 de 2025; CST art. 168",
        });
        totalDevengos += valor;
      }
    }

    if (d.recibeAuxilioTransporte) {
      const auxilioMensual = reglaEn(reglas, "auxilio_transporte", d.periodoHasta);
      const diasPeriodo = fechas.length;
      const valor = (auxilioMensual / DIAS_MES_COMERCIAL) * diasPeriodo;
      lineas.push({
        concepto: "Auxilio de transporte",
        valorCalculado: round2(valor),
        tipo: "devengo",
        ley: "Decreto de salario mínimo vigente",
      });
      totalDevengos += valor;
    }

    const totalDeducciones = 0;
    const netoEsperado = round2(totalDevengos - totalDeducciones);

    return {
      modo: "turnos",
      periodoDesde: d.periodoDesde,
      periodoHasta: d.periodoHasta,
      salarioBasicoMensual: d.salarioBasicoMensual,
      lineas,
      totalDevengos: round2(totalDevengos),
      totalDeducciones,
      netoEsperado,
      advertencias,
    };
  },
};
