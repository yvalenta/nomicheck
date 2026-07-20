import { calcularCostoEmpleador, type ResultadoCostoEmpleador } from "@pv/reglas";
import { prisma } from "../lib/prisma.js";
import { obtenerReglasYFestivos } from "./nominaService.js";

export interface CostoEmpleadoResumen {
  empleadoId: number;
  nombre: string;
  tipoContrato: string;
  salarioBase: number;
  costo: ResultadoCostoEmpleador | null; // null = aprendiz SENA (sin carga patronal plena, Ley 789 de 2002)
}

export interface CostosEmpresaResumen {
  exonerado: boolean;
  empleados: CostoEmpleadoResumen[];
  contratistas: { contratistaId: number; nombre: string; honorariosMensuales: number }[];
  totales: {
    nominaBaseMensual: number;
    costoTotalMensual: number;
    honorariosMensuales: number;
    factorPromedio: number;
  };
}

// Costo real del empleador para todos los empleados ACTIVOS (SDD §13, panel
// de costos). Aprendices SENA quedan listados con costo null (su auxilio de
// sostenimiento no genera la carga patronal plena — mismo criterio de
// liquidacionService); los contratistas solo aportan sus honorarios.
export async function calcularCostosEmpresa(
  empresaId: number,
  exoneradoParafiscales: boolean
): Promise<CostosEmpresaResumen> {
  const hoy = new Date().toISOString().slice(0, 10);
  const [{ reglas }, empleados, contratistas] = await Promise.all([
    obtenerReglasYFestivos(),
    prisma.empleado.findMany({ where: { empresaId, activo: true }, orderBy: { nombre: "asc" } }),
    prisma.contratista.findMany({ where: { empresaId, activo: true }, orderBy: { nombre: "asc" } }),
  ]);

  const filas: CostoEmpleadoResumen[] = empleados.map((e) => ({
    empleadoId: e.id,
    nombre: e.nombre,
    tipoContrato: e.tipoContrato,
    salarioBase: e.salarioBase,
    costo: e.tipoContrato.startsWith("aprendizaje_sena")
      ? null
      : calcularCostoEmpleador(e.salarioBase, reglas, {
          fecha: hoy,
          exoneradoParafiscales,
          recibeAuxilioTransporte: e.auxilioTransporte,
          claseRiesgoArl: e.claseRiesgoArl as 1 | 2 | 3 | 4 | 5,
        }),
  }));

  const nominaBaseMensual = filas.reduce((s, f) => s + f.salarioBase, 0);
  const costoTotalMensual = filas.reduce(
    (s, f) => s + (f.costo ? f.costo.costoTotalMensual : f.salarioBase),
    0
  );
  const honorariosMensuales = contratistas.reduce((s, c) => s + c.honorariosMensuales, 0);

  return {
    exonerado: exoneradoParafiscales,
    empleados: filas,
    contratistas: contratistas.map((c) => ({
      contratistaId: c.id,
      nombre: c.nombre,
      honorariosMensuales: c.honorariosMensuales,
    })),
    totales: {
      nominaBaseMensual,
      costoTotalMensual,
      honorariosMensuales,
      factorPromedio:
        nominaBaseMensual > 0 ? Math.round((costoTotalMensual / nominaBaseMensual) * 1000) / 1000 : 1,
    },
  };
}
