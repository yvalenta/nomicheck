import {
  calcularPrestacionesSociales,
  CalculadoraPorTurnos,
  CalculadoraSalarioFijo,
  CalculadoraServicios,
  crearResolutorReglas,
  type DatosNominaTurnos,
  type LineaResultado,
  type TipoContrato,
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

  const [empleados, contratistas, turnos, { reglas, festivos }] = await Promise.all([
    // Solo los empleados seleccionados para ESTE periodo (PeriodoNominaEmpleado,
    // autopoblada con los activos al crear el periodo, ajustable en borrador) —
    // y siguen requiriendo estar activos por si se retiraron después.
    prisma.empleado.findMany({
      where: { empresaId, activo: true, periodosIncluido: { some: { periodoId } } },
    }),
    prisma.contratista.findMany({ where: { empresaId, activo: true } }),
    prisma.turno.findMany({ where: { periodoId } }),
    obtenerReglasYFestivos(),
  ]);

  const resolutor = crearResolutorReglas(reglas);

  const recibos = empleados.map((empleado) => {
    const tipoContrato = empleado.tipoContrato as TipoContrato;
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

    // Provisión mensual de prestaciones sociales (cesantías, intereses,
    // prima, vacaciones) — ventana de ESTE periodo únicamente (no desde
    // fechaIngreso): son montos incrementales, no el acumulado de carrera.
    // Se listan como líneas informativas tipo "provision" (pasivo del
    // empleador) que NO afectan totalDevengado/totalDeducido/neto — el
    // colaborador no recibe ese dinero hoy. El contrato de aprendizaje
    // (Ley 789 de 2002, art. 30) NO genera estas prestaciones — se omiten.
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

  // Contratistas de servicios: NO son Empleado (SDD §07) — sin turnos, sin
  // provisión de prestaciones, sin deducciones retenidas (CalculadoraServicios
  // ya deja los aportes del independiente solo como advertencia).
  const recibosContratistas = contratistas.map((contratista) => {
    const resultado = CalculadoraServicios.calcular(
      {
        modo: "servicios",
        honorariosMensuales: contratista.honorariosMensuales,
        periodoDesde: periodo.fechaInicio,
        periodoHasta: periodo.fechaFin,
      },
      reglas,
      festivos
    );
    return {
      contratistaId: contratista.id,
      periodoId,
      lineas: resultado.lineas as unknown as Prisma.InputJsonValue,
      totalDevengado: resultado.totalDevengos,
      totalDeducido: resultado.totalDeducciones,
      neto: resultado.netoEsperado,
    };
  });

  await prisma.$transaction([
    prisma.reciboPago.createMany({ data: [...recibos, ...recibosContratistas] }),
    prisma.periodoNomina.update({ where: { id: periodoId }, data: { estado: "liquidado" } }),
  ]);

  return prisma.reciboPago.findMany({ where: { periodoId }, include: { empleado: true, contratista: true } });
}

export function listarRecibos(empresaId: number, periodoId?: number) {
  return prisma.reciboPago.findMany({
    where: { periodo: { empresaId }, ...(periodoId ? { periodoId } : {}) },
    include: { empleado: true, contratista: true },
    orderBy: { liquidadoEn: "desc" },
  });
}

export async function revertirABorrador(empresaId: number, periodoId: number) {
  const periodo = await obtenerPeriodo(empresaId, periodoId);
  if (periodo.estado !== "liquidado") {
    throw new Error(`El periodo está en estado "${periodo.estado}" y no puede revertirse a borrador`);
  }

  // Esto fallará automáticamente por restricción de llave foránea de Prisma
  // si existen ReporteDiscrepancia apuntando a los ReciboPago de este periodo,
  // lo cual es correcto: no se debe borrar si el empleado ya reportó un problema.
  await prisma.$transaction([
    prisma.reciboPago.deleteMany({ where: { periodoId } }),
    prisma.periodoNomina.update({ where: { id: periodoId }, data: { estado: "borrador" } }),
  ]);
}
