import { CalculadoraPorTurnos, CalculadoraSalarioFijo, type DatosNominaTurnos } from "@pv/reglas";
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

    return {
      empleadoId: empleado.id,
      periodoId,
      // Prisma tipa `Json` como InputJsonValue; LineaResultado[] es JSON
      // válido pero no estructuralmente compatible sin este round-trip.
      lineas: JSON.parse(JSON.stringify(resultado.lineas)),
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
