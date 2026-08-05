import { calcularPrestacionesSociales, reglaEn, type LineaResultado } from "@pv/reglas";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { obtenerReglasYFestivos } from "./nominaService.js";

// Códigos de las provisiones emitidas al liquidar cada periodo. Antes se
// agrupaba por el TEXTO del concepto — frágil: el mismo concepto se escribe
// "Provisión intereses a las cesantías" acá y "…sobre cesantías" en
// costoEmpleador.ts, y solo funcionaba porque el par correcto coincidía.
const CODIGOS_PROVISION = {
  cesantias: "PROVISION_CESANTIAS",
  intereses: "PROVISION_INTERESES_CESANTIAS",
  prima: "PROVISION_PRIMA",
  vacaciones: "PROVISION_VACACIONES",
} as const;

// Textos con que se guardaron las provisiones ANTES de que existiera el
// código. Los recibos viejos siguen en BD y esta función los suma para pagar
// la liquidación final: si se agrupara solo por código, esos periodos darían
// CERO y al trabajador se le pagaría de menos. El fallback no se puede
// quitar mientras queden recibos anteriores al cambio.
const CONCEPTOS_PROVISION_LEGACY = {
  cesantias: "Provisión cesantías",
  intereses: "Provisión intereses a las cesantías",
  prima: "Provisión prima de servicios",
  vacaciones: "Provisión vacaciones",
} as const;

type ClaveProvision = keyof typeof CODIGOS_PROVISION;

function esProvisionDe(linea: LineaResultado, clave: ClaveProvision): boolean {
  return linea.codigo
    ? linea.codigo === CODIGOS_PROVISION[clave]
    : linea.concepto === CONCEPTOS_PROVISION_LEGACY[clave];
}

function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Liquidación final al retiro (CST art. 249/306/186 + Ley 52 de 1975): suma
// TODO lo ya provisionado periodo a periodo (que hasta ahora era solo un
// pasivo informativo, nunca pagado) más el tramo entre el último periodo
// liquidado y la fecha de retiro, y lo convierte en un ReciboPago de cierre
// con esas 4 líneas como devengo real (dinero que el colaborador recibe).
export async function liquidarFinal(empresaId: number, empleadoId: number) {
  const empleado = await prisma.empleado.findFirst({ where: { id: empleadoId, empresaId, eliminadoEn: null } });
  if (!empleado) throw new Error("Empleado no encontrado");
  if (!empleado.fechaRetiro) {
    throw new Error("El empleado no tiene fecha de retiro registrada — usa /retirar primero");
  }

  const recibosPrevios = await prisma.reciboPago.findMany({
    where: { empleadoId, empleado: { empresaId } },
    include: { periodo: true },
    orderBy: { periodo: { fechaFin: "desc" } },
  });

  const yaLiquidadoFinal = recibosPrevios.some((r) =>
    (r.lineas as unknown as LineaResultado[]).some((l) => (l.codigo ? l.codigo.startsWith("LIQUIDACION_FINAL") : l.concepto.startsWith("Liquidación final")))
  );
  if (yaLiquidadoFinal) {
    throw new Error("Este empleado ya tiene una liquidación final registrada");
  }

  const acumulado = { cesantias: 0, intereses: 0, prima: 0, vacaciones: 0 };
  for (const recibo of recibosPrevios) {
    for (const linea of recibo.lineas as unknown as LineaResultado[]) {
      if (linea.tipo !== "provision") continue;
      if (esProvisionDe(linea, "cesantias")) acumulado.cesantias += linea.valorCalculado;
      else if (esProvisionDe(linea, "intereses")) acumulado.intereses += linea.valorCalculado;
      else if (esProvisionDe(linea, "prima")) acumulado.prima += linea.valorCalculado;
      else if (esProvisionDe(linea, "vacaciones")) acumulado.vacaciones += linea.valorCalculado;
    }
  }

  // Tramo aún no provisionado por ningún periodo liquidado: desde el día
  // siguiente al fin del último periodo (o desde el ingreso si nunca se
  // liquidó ninguno) hasta la fecha de retiro.
  const ultimaFechaFin = recibosPrevios[0]?.periodo.fechaFin;
  const inicioTramo = ultimaFechaFin ? diaSiguiente(ultimaFechaFin) : empleado.fechaIngreso;

  if (inicioTramo <= empleado.fechaRetiro) {
    // Mismo criterio que calcularReciboLote (liquidacionCalculo.ts): el
    // auxilio de transporte SÍ integra la base de cesantías/prima (Ley 1ª
    // de 1963, art. 7) — sin esto, el tramo final de un empleado que nunca
    // pasó por un periodo liquidado (ingreso y retiro en la misma
    // liquidación) se subliquidaba por el valor del auxilio.
    const { reglas } = await obtenerReglasYFestivos();
    const tramo = calcularPrestacionesSociales({
      fechaIngreso: inicioTramo,
      fechaCorte: empleado.fechaRetiro,
      salarioBase: empleado.salarioBase,
      auxilioTransporte: empleado.auxilioTransporte
        ? reglaEn(reglas, "auxilio_transporte", empleado.fechaRetiro)
        : undefined,
    });
    acumulado.cesantias += tramo.cesantias;
    acumulado.intereses += tramo.interesesCesantias;
    acumulado.prima += tramo.prima;
    acumulado.vacaciones += tramo.vacaciones;
  }

  const lineas: LineaResultado[] = [
    { codigo: "LIQUIDACION_FINAL_CESANTIAS", concepto: "Liquidación final — cesantías", tipo: "devengo", valorCalculado: acumulado.cesantias, ley: "CST art. 249" },
    { codigo: "LIQUIDACION_FINAL_INTERESES_CESANTIAS", concepto: "Liquidación final — intereses a las cesantías", tipo: "devengo", valorCalculado: acumulado.intereses, ley: "Ley 52 de 1975, art. 1" },
    { codigo: "LIQUIDACION_FINAL_PRIMA", concepto: "Liquidación final — prima de servicios", tipo: "devengo", valorCalculado: acumulado.prima, ley: "CST art. 306" },
    { codigo: "LIQUIDACION_FINAL_VACACIONES", concepto: "Liquidación final — vacaciones", tipo: "devengo", valorCalculado: acumulado.vacaciones, ley: "CST art. 186" },
  ];
  const total = acumulado.cesantias + acumulado.intereses + acumulado.prima + acumulado.vacaciones;

  const periodoCierre = await prisma.periodoNomina.create({
    data: { empresaId, fechaInicio: inicioTramo, fechaFin: empleado.fechaRetiro, estado: "liquidado" },
  });

  return prisma.reciboPago.create({
    data: {
      empleadoId,
      periodoId: periodoCierre.id,
      lineas: lineas as unknown as Prisma.InputJsonValue,
      totalDevengado: total,
      totalDeducido: 0,
      neto: total,
    },
    include: { empleado: true },
  });
}
