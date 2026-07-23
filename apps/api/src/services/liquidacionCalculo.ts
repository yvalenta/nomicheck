// Cálculo puro de recibos, extraído de liquidacionService para que tanto el
// modo síncrono como el worker asíncrono usen exactamente la misma lógica.
// NO toca la BD: recibe empleados + turnos + reglas y devuelve los recibos
// listos para createMany + los rechazos que no pasaron QA.
import {
  calcularPrestacionesSociales,
  CalculadoraPorTurnos,
  CalculadoraSalarioFijo,
  CalculadoraServicios,
  evaluarQA,
  type IssueQA,
  type LineaResultado,
  type ResolutorReglas,
  type Festivo,
  type ReglaLegal,
  type ResultadoNomina,
  type ResultadoQA,
  type TipoContrato,
} from "@pv/reglas";
import type { Prisma } from "@prisma/client";

const SIN_HORARIO_BASE = [null, null, null, null, null, null, null] as const;

function ibcDeLineas(lineas: LineaResultado[]): number {
  return lineas.find((l) => l.concepto === "Salud (aporte empleado)")?.base ?? 0;
}

export interface DatosPeriodo {
  fechaInicio: string;
  fechaFin: string;
}

export interface EmpleadoLiquidable {
  id: number;
  nombre: string;
  salarioBase: number;
  auxilioTransporte: boolean;
  tipoNomina: string;
  tipoContrato: string;
}

export interface ContratistaLiquidable {
  id: number;
  honorariosMensuales: number;
}

export interface TurnoLiquidable {
  empleadoId: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

export type ReciboEmpleadoInput = {
  empleadoId: number;
  periodoId: number;
  lineas: Prisma.InputJsonValue;
  advertencias: Prisma.InputJsonValue;
  totalDevengado: number;
  totalDeducido: number;
  neto: number;
  qaIssues?: Prisma.InputJsonValue;
};

export type ReciboContratistaInput = {
  contratistaId: number;
  periodoId: number;
  lineas: Prisma.InputJsonValue;
  advertencias: Prisma.InputJsonValue;
  totalDevengado: number;
  totalDeducido: number;
  neto: number;
};

export interface RechazoQA {
  empleadoId: number;
  nombre: string;
  issues: IssueQA[];
}

export interface ResultadoLote {
  recibos: ReciboEmpleadoInput[];
  rechazos: RechazoQA[];
}

/**
 * Calcula un LOTE de empleados: para cada uno arma el input del motor, corre
 * la calculadora que corresponde a su `tipoNomina`, evalúa QA y separa los
 * recibos aptos (aprobada / con_advertencias) de los rechazos.
 *
 * NO persiste. Los rechazos NO producen recibo — quedan reportados aparte
 * para que el orquestador los ponga en `PeriodoNomina.erroresLiquidacion`
 * (SDD §15, liquidación parcial con estado `liquidado_con_rechazos`).
 */
export function calcularReciboLote(
  periodoId: number,
  periodo: DatosPeriodo,
  empleados: EmpleadoLiquidable[],
  turnos: TurnoLiquidable[],
  reglas: ReglaLegal[],
  festivos: Festivo[],
  resolutor: ResolutorReglas
): ResultadoLote {
  const recibos: ReciboEmpleadoInput[] = [];
  const rechazos: RechazoQA[] = [];

  for (const empleado of empleados) {
    const tipoContrato = empleado.tipoContrato as TipoContrato;
    const resultado: ResultadoNomina =
      empleado.tipoNomina === "turnos"
        ? CalculadoraPorTurnos.calcular(
            {
              modo: "turnos",
              salarioBasicoMensual: empleado.salarioBase,
              recibeAuxilioTransporte: empleado.auxilioTransporte,
              periodoDesde: periodo.fechaInicio,
              periodoHasta: periodo.fechaFin,
              horarioBase: [...SIN_HORARIO_BASE],
              novedades: turnos
                .filter((t) => t.empleadoId === empleado.id)
                .map((t) => ({ fecha: t.fecha, trabajo: true as const, horaInicio: t.horaInicio, horaFin: t.horaFin })),
              tipoContrato,
            },
            reglas,
            festivos
          )
        : CalculadoraSalarioFijo.calcular(
            {
              modo: "salario-fijo",
              salarioBasicoMensual: empleado.salarioBase,
              recibeAuxilioTransporte: empleado.auxilioTransporte,
              periodoDesde: periodo.fechaInicio,
              periodoHasta: periodo.fechaFin,
              conceptos: [],
              tipoContrato,
            },
            reglas,
            festivos
          );

    // Provisión mensual de prestaciones sociales — igual que antes, salvo que
    // el contrato de aprendizaje (Ley 789/2002 art. 30) NO las genera.
    const lineasProvision: LineaResultado[] = tipoContrato?.startsWith("aprendizaje_sena")
      ? []
      : (() => {
          const prestaciones = calcularPrestacionesSociales({
            fechaIngreso: periodo.fechaInicio,
            fechaCorte: periodo.fechaFin,
            salarioBase: empleado.salarioBase,
            auxilioTransporte: empleado.auxilioTransporte
              ? resolutor.en("auxilio_transporte", periodo.fechaFin)
              : undefined,
          });
          return [
            { concepto: "Provisión cesantías", valorCalculado: prestaciones.cesantias, tipo: "provision", ley: "CST art. 249" },
            { concepto: "Provisión intereses a las cesantías", valorCalculado: prestaciones.interesesCesantias, tipo: "provision", ley: "Ley 52 de 1975, art. 1" },
            { concepto: "Provisión prima de servicios", valorCalculado: prestaciones.prima, tipo: "provision", ley: "CST art. 306" },
            { concepto: "Provisión vacaciones", valorCalculado: prestaciones.vacaciones, tipo: "provision", ley: "CST art. 186" },
          ];
        })();

    const novedadesQA = empleado.tipoNomina === "turnos"
      ? turnos.filter((t) => t.empleadoId === empleado.id).map((t) => ({ fecha: t.fecha, trabajo: true as const }))
      : undefined;

    const veredicto: ResultadoQA = evaluarQA(
      {
        fecha: periodo.fechaFin,
        periodoDesde: periodo.fechaInicio,
        periodoHasta: periodo.fechaFin,
        totalDevengado: resultado.totalDevengos,
        totalDeducciones: resultado.totalDeducciones,
        netoPagado: resultado.netoEsperado,
        ibcPeriodo: ibcDeLineas(resultado.lineas),
        issuesMotor: resultado.issues,
        novedades: novedadesQA,
      },
      resolutor
    );

    // A esta escala (1000+ empleados) el gate cambió de todo-o-nada a
    // per-empleado: los `rechazada` quedan reportados (sin recibo) y no
    // bloquean al resto. Ver SDD §15, decisión "liquidado_con_rechazos".
    if (veredicto.estado === "rechazada") {
      rechazos.push({ empleadoId: empleado.id, nombre: empleado.nombre, issues: veredicto.issues });
      continue;
    }

    const recibo: ReciboEmpleadoInput = {
      empleadoId: empleado.id,
      periodoId,
      lineas: [...resultado.lineas, ...lineasProvision] as unknown as Prisma.InputJsonValue,
      advertencias: resultado.advertencias as unknown as Prisma.InputJsonValue,
      totalDevengado: resultado.totalDevengos,
      totalDeducido: resultado.totalDeducciones,
      neto: resultado.netoEsperado,
    };
    if (veredicto.issues.length > 0) {
      recibo.qaIssues = veredicto.issues as unknown as Prisma.InputJsonValue;
    }
    recibos.push(recibo);
  }

  return { recibos, rechazos };
}

/** Los contratistas no pasan por gate de QA (SDD §07: no hay contrato laboral,
 * no hay tope de deducciones ni SMLMV a proteger) — siempre producen recibo. */
export function calcularRecibosContratistas(
  periodoId: number,
  periodo: DatosPeriodo,
  contratistas: ContratistaLiquidable[],
  reglas: ReglaLegal[],
  festivos: Festivo[]
): ReciboContratistaInput[] {
  return contratistas.map((c) => {
    const resultado = CalculadoraServicios.calcular(
      { modo: "servicios", honorariosMensuales: c.honorariosMensuales, periodoDesde: periodo.fechaInicio, periodoHasta: periodo.fechaFin },
      reglas,
      festivos
    );
    return {
      contratistaId: c.id,
      periodoId,
      lineas: resultado.lineas as unknown as Prisma.InputJsonValue,
      advertencias: resultado.advertencias as unknown as Prisma.InputJsonValue,
      totalDevengado: resultado.totalDevengos,
      totalDeducido: resultado.totalDeducciones,
      neto: resultado.netoEsperado,
    };
  });
}
