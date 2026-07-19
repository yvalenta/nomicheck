import type {
  CalculadoraNomina,
  DatosNominaTurnos,
  Festivo,
  HorarioDia,
  LineaResultado,
  NovedadDia,
} from "./types.js";
import { crearResolutorReglas, diaSemana, esDomingo, esFechaValida, rangoFechas, validarPeriodo } from "./utils.js";
import {
  advertenciaIbcTiempoParcial,
  advertenciaPatronAprendiz,
  advertenciaTerminoNoIndefinido,
} from "./advertenciasContrato.js";
import { redondearPeso } from "./numero.js";
import { aplicarDeducciones } from "./deducciones.js";
import { ensamblarResultado } from "./ensamblarResultado.js";
import { calcularAuxilioTransporte } from "./auxilio.js";
import { lineasRecargos, type HorasRecargo } from "./recargos.js";
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

// Lunes de la semana calendario a la que pertenece la fecha (la semana
// laboral colombiana se cuenta de lunes a domingo para el tope de extras).
function lunesDeLaSemana(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  const retroceso = (d.getUTCDay() + 6) % 7; // dom=6, lun=0, mar=1…
  d.setUTCDate(d.getUTCDate() - retroceso);
  return d.toISOString().slice(0, 10);
}

// Horas con hasta 2 decimales para mensajes de advertencia (las horas no
// son pesos — redondearPeso las dejaría en enteros y "1.5 h" se perdería).
function redondearHoras(horas: number): number {
  return Math.round(horas * 100) / 100;
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
  if (horaInicio === horaFin) {
    // Ambiguo: ¿0 horas o 24 horas? Antes se interpretaba en silencio como
    // 24h (turno "10:00→10:00" = jornada completa de un día). Se exige que
    // el llamador sea explícito.
    throw new Error(
      `Turno ambiguo: hora de inicio y fin iguales (${horaInicio}) — no se puede distinguir entre 0 y 24 horas`
    );
  }
  const inicioMin = hhmmAMinutos(horaInicio);
  const finMin = hhmmAMinutos(horaFin);
  let totalMin = finMin - inicioMin;
  if (totalMin < 0) totalMin += MINUTOS_POR_DIA; // turno cruza medianoche

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
    validarPeriodo(d.periodoDesde, d.periodoHasta);
    if (!(d.salarioBasicoMensual > 0)) {
      throw new Error(`El salario básico mensual debe ser mayor que cero (recibido: ${d.salarioBasicoMensual})`);
    }
    const fechasNovedades = new Set<string>();
    for (const n of d.novedades) {
      if (!esFechaValida(n.fecha)) {
        throw new Error(`Fecha inválida o inexistente en una novedad: "${n.fecha}"`);
      }
      if (fechasNovedades.has(n.fecha)) {
        throw new Error(`Hay dos novedades para la misma fecha (${n.fecha}) — elimina la duplicada`);
      }
      fechasNovedades.add(n.fecha);
    }
    const advertencias: string[] = [];
    // Índice + cache de reglas compartido por todo el cálculo (~40 consultas).
    const r = crearResolutorReglas(reglas);
    const fechas = rangoFechas(d.periodoDesde, d.periodoHasta);

    const advertenciaAprendiz = advertenciaPatronAprendiz(d.salarioBasicoMensual, d.tipoContrato, r, d.periodoDesde);
    if (advertenciaAprendiz) advertencias.push(advertenciaAprendiz);
    const advertenciaTermino = advertenciaTerminoNoIndefinido(d.tipoContrato);
    if (advertenciaTermino) advertencias.push(advertenciaTermino);
    const advertenciaIbc = advertenciaIbcTiempoParcial(d.salarioBasicoMensual, d.tipoContrato, r, d.periodoDesde);
    if (advertenciaIbc) advertencias.push(advertenciaIbc);

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

    // Tope legal de trabajo suplementario (D.L. 13 de 1967 art. 1: 2h/día;
    // Ley 6 de 1981: 12h/semana). NO se recorta el pago — primacía de la
    // realidad: las horas trabajadas se deben — pero se advierte la
    // infracción para que empresa y trabajador la detecten.
    const extrasPorSemana = new Map<string, number>();
    for (const dia of dias) {
      const extrasDia = dia.extraDiurna + dia.extraNocturna;
      if (extrasDia === 0) continue;

      const maxDia = r.en("max_horas_extra_dia", dia.fecha);
      if (extrasDia > maxDia) {
        advertencias.push(
          `El ${dia.fecha} trabajaste ${redondearHoras(extrasDia)} horas extra — supera el máximo legal de ${maxDia} h/día (D.L. 13 de 1967, art. 1). Se pagan completas, pero la jornada excede lo permitido.`
        );
      }

      const semana = lunesDeLaSemana(dia.fecha);
      extrasPorSemana.set(semana, (extrasPorSemana.get(semana) ?? 0) + extrasDia);
    }
    for (const [semana, extrasSemana] of extrasPorSemana) {
      const maxSemana = r.en("max_horas_extra_semana", semana);
      if (extrasSemana > maxSemana) {
        advertencias.push(
          `En la semana del ${semana} acumulaste ${redondearHoras(extrasSemana)} horas extra — supera el máximo legal de ${maxSemana} h/semana (Ley 6 de 1981). Se pagan completas, pero la jornada excede lo permitido.`
        );
      }
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
      `${r.en("divisor_hora_ordinaria", fecha)}|${r.en("recargo_dominical", fecha)}`;

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
    // Aprendizaje SENA (Ley 789 de 2002, art. 30): sigue trabajando por
    // turnos, pero el devengo base no es "salario" y las deducciones de
    // ley cambian según la etapa (ver más abajo, junto al auxilio).
    const esAprendiz = d.tipoContrato?.startsWith("aprendizaje_sena");
    const alcanceDeduccionesLey =
      d.tipoContrato === "aprendizaje_sena_lectiva"
        ? "ninguno"
        : d.tipoContrato === "aprendizaje_sena_practica"
          ? "solo_salud"
          : "completo";
    lineas.push({
      concepto: esAprendiz ? `Auxilio de sostenimiento (${diasPeriodo} días)` : `Salario básico (${diasPeriodo} días)`,
      base: redondearPeso(d.salarioBasicoMensual),
      valorCalculado: redondearPeso(salarioBase),
      tipo: "devengo",
      ley: esAprendiz ? "Ley 789 de 2002, art. 30" : "Contrato de trabajo; CST art. 127",
    });

    // Transparencia en ausentismos: el salario básico de arriba SIEMPRE
    // muestra el pactado completo para los días del periodo — nunca se
    // reduce en silencio. Si hubo días no trabajados y explícitamente
    // marcados como no remunerados, se resta con su propia línea visible.
    const diasAusenciaNoRemunerada = d.novedades.filter(
      (n) => !n.trabajo && n.remunerada === false && n.fecha >= d.periodoDesde && n.fecha <= d.periodoHasta
    ).length;
    const valorAusentismo = redondearPeso(
      (d.salarioBasicoMensual / DIAS_MES_COMERCIAL) * diasAusenciaNoRemunerada
    );
    if (diasAusenciaNoRemunerada > 0) {
      lineas.push({
        concepto: `Ajuste por ausentismo (${diasAusenciaNoRemunerada} día${diasAusenciaNoRemunerada === 1 ? "" : "s"} no remunerado${diasAusenciaNoRemunerada === 1 ? "" : "s"})`,
        base: redondearPeso(d.salarioBasicoMensual),
        valorCalculado: valorAusentismo,
        tipo: "deduccion",
        ley: "CST art. 140 (a contrario) — el ausentismo no remunerado no genera derecho al salario de esos días",
      });
    }

    for (const diasTramo of tramos.values()) {
      const fechaRef = diasTramo[0].fecha;
      const divisor = r.en("divisor_hora_ordinaria", fechaRef);
      const recargoDominical = r.en("recargo_dominical", fechaRef);
      const recargoNocturno = r.en("recargo_nocturno", fechaRef);
      const extraDiurnaPct = r.en("hora_extra_diurna", fechaRef);
      const extraNocturnaPct = r.en("hora_extra_nocturna", fechaRef);
      const valorHora = d.salarioBasicoMensual / divisor;

      const primeraFecha = diasTramo[0].fecha;
      const ultimaFecha = diasTramo[diasTramo.length - 1].fecha;
      const sufijo = multiTramo ? ` (${primeraFecha}–${ultimaFecha})` : "";

      const horas: HorasRecargo = {
        nocturnas: 0,
        dominicalesDiurnas: 0,
        dominicalesNocturnas: 0,
        extrasDiurnas: 0,
        extrasNocturnas: 0,
        extrasDominicalesDiurnas: 0,
        extrasDominicalesNocturnas: 0,
      };
      for (const dia of diasTramo) {
        if (dia.esDominicalFestivo) {
          horas.dominicalesDiurnas! += dia.ordinariaDiurna;
          horas.dominicalesNocturnas! += dia.ordinariaNocturna;
          horas.extrasDominicalesDiurnas! += dia.extraDiurna;
          horas.extrasDominicalesNocturnas! += dia.extraNocturna;
        } else {
          horas.nocturnas! += dia.ordinariaNocturna;
          horas.extrasDiurnas! += dia.extraDiurna;
          horas.extrasNocturnas! += dia.extraNocturna;
        }
      }

      lineas.push(
        ...lineasRecargos(
          valorHora,
          horas,
          { recargoNocturno, recargoDominical, extraDiurnaPct, extraNocturnaPct },
          sufijo
        )
      );
    }

    // IBC = devengado salarial acumulado hasta aquí; el auxilio de transporte
    // NO hace base para salud/pensión. Filtra por tipo "devengo" explícito
    // (no solo lo acumulado hasta aquí): el ajuste por ausentismo de arriba
    // ya es una línea "deduccion" en `lineas` y no debe sumarse aquí.
    const ibc = lineas.filter((l) => l.tipo === "devengo").reduce((s, l) => s + l.valorCalculado, 0);

    if (d.recibeAuxilioTransporte && !esAprendiz) {
      const auxilio = calcularAuxilioTransporte(
        d.salarioBasicoMensual,
        diasPeriodo,
        r,
        d.periodoHasta
      );
      if (auxilio.linea) lineas.push(auxilio.linea);
      if (auxilio.advertencia) advertencias.push(auxilio.advertencia);
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
        r,
        d.periodoHasta,
        { deduccionesConvenio, descuentoJudicial: embargoPeriodo, alcanceDeduccionesLey },
        diasPeriodo / DIAS_MES_COMERCIAL
      );
    lineas.push(...lineasDeduccion);
    advertencias.push(...advertenciasDeducciones);

    return ensamblarResultado({
      modo: "turnos",
      periodoDesde: d.periodoDesde,
      periodoHasta: d.periodoHasta,
      salarioBasicoMensual: d.salarioBasicoMensual,
      lineas,
      advertencias,
      // Cabecera del comprobante: valor día/hora con el divisor vigente al
      // CIERRE del periodo (si cruza el corte de la Ley 2101, las líneas por
      // tramo ya muestran cada divisor — esto es solo el dato de referencia).
      valorDia: redondearPeso(d.salarioBasicoMensual / DIAS_MES_COMERCIAL),
      valorHoraOrdinaria: redondearPeso(
        d.salarioBasicoMensual / r.en("divisor_hora_ordinaria", d.periodoHasta)
      ),
      diasLaborados: dias.length,
      // Las deducciones ya vienen totalizadas con topes aplicados; se suma
      // el ajuste por ausentismo (no pasa por aplicarDeducciones — no tiene
      // tope legal, es simplemente el pago de los días no remunerados).
      totalDeducciones: redondearPeso(totalDeducciones + valorAusentismo),
    });
  },
};
