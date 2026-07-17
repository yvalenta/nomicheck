import {
  calcularPrestacionesSociales,
  CalculadoraPorTurnos,
  CalculadoraSalarioFijo,
  crearResolutorReglas,
  type DatosNominaTurnos,
  type LineaResultado,
} from "@pv/reglas";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { obtenerReglasYFestivos } from "./nominaService.js";
import { obtenerPeriodo } from "./periodosService.js";

// Horario base "todo descanso": cada Turno capturado ya trae sus propias
// horaInicio/horaFin explícitas (SDD.md §07 Turno) — no hay horario
// implícito que aplicar a los días sin turno registrado.
const SIN_HORARIO_BASE: DatosNominaTurnos["horarioBase"] = [null, null, null, null, null, null, null];

// Liquida un periodo: por cada empleado activo de la empresa, arma los datos
// de entrada del motor a partir de lo capturado (Turno para tipo "turnos";
// solo el básico + deducciones de ley para tipo "fijo", ya que los conceptos
// extralegales llegan por extracción, no por captura manual de empresa) y
// genera su ReciboPago — snapshot, no se recalcula si cambian las reglas
// después (SDD.md §07 ReciboPago).
export async function liquidarPeriodo(empresaId: number, periodoId: number) {
  const periodo = await obtenerPeriodo(empresaId, periodoId);
  if (periodo.estado !== "borrador") {
    throw new Error(`El periodo ya está en estado "${periodo.estado}"`);
  }

  const [empleados, turnos, { reglas, festivos }] = await Promise.all([
    prisma.empleado.findMany({ where: { empresaId, activo: true } }),
    prisma.turno.findMany({ where: { periodoId } }),
    obtenerReglasYFestivos(),
  ]);

  const resolutor = crearResolutorReglas(reglas);

  const recibos = empleados.map((empleado) => {
    const resultado =
      empleado.tipoNomina === "turnos"
        ? CalculadoraPorTurnos.calcular(
            {
              modo: "turnos",
              salarioBasicoMensual: empleado.salarioBase,
              recibeAuxilioTransporte: empleado.auxilioTransporte,
              periodoDesde: periodo.fechaInicio,
              periodoHasta: periodo.fechaFin,
              horarioBase: SIN_HORARIO_BASE,
              novedades: turnos
                .filter((t) => t.empleadoId === empleado.id)
                .map((t) => ({ fecha: t.fecha, trabajo: true as const, horaInicio: t.horaInicio, horaFin: t.horaFin })),
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
            },
            reglas,
            festivos
          );

    // Provisión mensual de prestaciones sociales (cesantías, intereses,
    // prima, vacaciones) — ventana de ESTE periodo únicamente (no desde
    // fechaIngreso): son montos incrementales, no el acumulado de carrera.
    // Se listan como líneas informativas tipo "provision" (pasivo del
    // empleador) que NO afectan totalDevengado/totalDeducido/neto — el
    // colaborador no recibe ese dinero hoy.
    const prestaciones = calcularPrestacionesSociales({
      fechaIngreso: periodo.fechaInicio,
      fechaCorte: periodo.fechaFin,
      salarioBase: empleado.salarioBase,
      auxilioTransporte: empleado.auxilioTransporte
        ? resolutor.en("auxilio_transporte", periodo.fechaFin)
        : undefined,
    });
    const lineasProvision: LineaResultado[] = [
      { concepto: "Provisión cesantías", valorCalculado: prestaciones.cesantias, tipo: "provision", ley: "CST art. 249" },
      { concepto: "Provisión intereses a las cesantías", valorCalculado: prestaciones.interesesCesantias, tipo: "provision", ley: "Ley 52 de 1975, art. 1" },
      { concepto: "Provisión prima de servicios", valorCalculado: prestaciones.prima, tipo: "provision", ley: "CST art. 306" },
      { concepto: "Provisión vacaciones", valorCalculado: prestaciones.vacaciones, tipo: "provision", ley: "CST art. 186" },
    ];

    return {
      empleadoId: empleado.id,
      periodoId,
      // Prisma tipa `Json` como InputJsonValue; LineaResultado[] es JSON
      // plano (solo strings/números/undefined opcionales) — el cast evita
      // el round-trip por JSON.parse(JSON.stringify()).
      lineas: [...resultado.lineas, ...lineasProvision] as unknown as Prisma.InputJsonValue,
      totalDevengado: resultado.totalDevengos,
      totalDeducido: resultado.totalDeducciones,
      neto: resultado.netoEsperado,
    };
  });

  await prisma.$transaction([
    prisma.reciboPago.createMany({ data: recibos }),
    prisma.periodoNomina.update({ where: { id: periodoId }, data: { estado: "liquidado" } }),
  ]);

  return prisma.reciboPago.findMany({ where: { periodoId }, include: { empleado: true } });
}

export function listarRecibos(empresaId: number, periodoId?: number) {
  return prisma.reciboPago.findMany({
    where: { periodo: { empresaId }, ...(periodoId ? { periodoId } : {}) },
    include: { empleado: true },
    orderBy: { liquidadoEn: "desc" },
  });
}
