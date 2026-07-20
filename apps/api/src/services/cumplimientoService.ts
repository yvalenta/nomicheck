import { advertenciaPatronAprendiz, advertenciaSalarioBajoMinimo, crearResolutorReglas } from "@pv/reglas";
import { prisma } from "../lib/prisma.js";
import { obtenerReglasYFestivos } from "./nominaService.js";

export interface AlertaEmpleado {
  empleadoId: number;
  nombre: string;
  mensaje: string;
}

export interface AlertaHorasExtra extends AlertaEmpleado {
  periodoId: number;
  fechaInicio: string;
  fechaFin: string;
}

export type NivelSemaforo = "verde" | "amarillo" | "rojo";

export interface SemaforoCumplimiento {
  nivel: NivelSemaforo;
  aprendicesMalClasificados: AlertaEmpleado[];
  salariosBajoMinimo: AlertaEmpleado[];
  horasExtraExcedidas: AlertaHorasExtra[];
}

// Cuántos periodos liquidados recientes revisar en busca de horas extra
// excedidas — suficiente para una foto reciente de cumplimiento sin escanear
// todo el historial de la empresa en cada carga del panel.
const PERIODOS_RECIENTES = 6;

// Marcador estable: calculadoraTurnos.ts SIEMPRE arma estas advertencias con
// esta frase fija (solo cambian los números interpolados) — coincidir por
// substring es seguro porque la fuente es nuestro propio motor, no texto
// libre de un tercero.
const MARCA_HORAS_EXTRA = "supera el máximo legal de";

// Semáforo de cumplimiento (SDD.md §14): NO duplica la lógica de detección
// — reusa las mismas funciones puras del motor (advertenciaPatronAprendiz,
// advertenciaSalarioBajoMinimo) contra el estado ACTUAL de los empleados
// activos, y para horas extra excedidas (que sí depende de turnos de un
// periodo, no del Empleado en sí) escanea las advertencias YA persistidas
// en los ReciboPago de los últimos periodos liquidados — evita volver a
// ejecutar calculadoraTurnos completo solo para leer un semáforo.
export async function calcularSemaforoCumplimiento(empresaId: number): Promise<SemaforoCumplimiento> {
  const [{ reglas }, empleados, periodos] = await Promise.all([
    obtenerReglasYFestivos(),
    prisma.empleado.findMany({ where: { empresaId, activo: true } }),
    prisma.periodoNomina.findMany({
      where: { empresaId, estado: { in: ["liquidado", "pagado"] } },
      orderBy: { fechaFin: "desc" },
      take: PERIODOS_RECIENTES,
      include: { recibos: { where: { empleadoId: { not: null } }, include: { empleado: true } } },
    }),
  ]);

  const resolutor = crearResolutorReglas(reglas);
  const hoy = new Date().toISOString().slice(0, 10);

  const aprendicesMalClasificados: AlertaEmpleado[] = [];
  const salariosBajoMinimo: AlertaEmpleado[] = [];

  for (const e of empleados) {
    const tipoContrato = e.tipoContrato as Parameters<typeof advertenciaPatronAprendiz>[1];
    const msgAprendiz = advertenciaPatronAprendiz(e.salarioBase, tipoContrato, resolutor, hoy);
    if (msgAprendiz) aprendicesMalClasificados.push({ empleadoId: e.id, nombre: e.nombre, mensaje: msgAprendiz });

    const msgMinimo = advertenciaSalarioBajoMinimo(e.salarioBase, tipoContrato, resolutor, hoy);
    if (msgMinimo) salariosBajoMinimo.push({ empleadoId: e.id, nombre: e.nombre, mensaje: msgMinimo });
  }

  const horasExtraExcedidas: AlertaHorasExtra[] = [];
  for (const periodo of periodos) {
    for (const recibo of periodo.recibos) {
      if (!recibo.empleado) continue;
      const advertencias = (recibo.advertencias as string[] | null) ?? [];
      for (const mensaje of advertencias) {
        if (!mensaje.includes(MARCA_HORAS_EXTRA)) continue;
        horasExtraExcedidas.push({
          empleadoId: recibo.empleado.id,
          nombre: recibo.empleado.nombre,
          mensaje,
          periodoId: periodo.id,
          fechaInicio: periodo.fechaInicio,
          fechaFin: periodo.fechaFin,
        });
      }
    }
  }

  const nivel: NivelSemaforo =
    aprendicesMalClasificados.length > 0 || salariosBajoMinimo.length > 0
      ? "rojo"
      : horasExtraExcedidas.length > 0
        ? "amarillo"
        : "verde";

  return { nivel, aprendicesMalClasificados, salariosBajoMinimo, horasExtraExcedidas };
}
