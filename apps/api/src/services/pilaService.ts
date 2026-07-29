import { calcularLiquidacionPilaEmpleado, type ResultadoLiquidacionPila } from "@pv/reglas";
import { prisma } from "../lib/prisma.js";
import { obtenerReglasYFestivos } from "./nominaService.js";

interface LineaReciboJson {
  /** Opcional a propósito: los recibos guardados ANTES de que existiera el
   *  código no lo traen. Por eso `buscarLinea` cae al texto legacy. */
  codigo?: string;
  concepto: string;
  base?: number;
  valorCalculado: number;
  tipo: "devengo" | "deduccion" | "provision";
}

export interface PilaEmpleadoResumen {
  empleadoId: number;
  nombre: string;
  tipoContrato: string;
  claseRiesgoArl: number;
  pila: ResultadoLiquidacionPila | null; // null = aprendiz SENA etapa lectiva (sin IBC, SENA gestiona su afiliación)
}

export interface PilaPeriodoResumen {
  periodoId: number;
  fechaInicio: string;
  fechaFin: string;
  exonerado: boolean;
  empleados: PilaEmpleadoResumen[];
  totales: {
    ibcTotal: number;
    costoTotalPeriodo: number;
  };
}

// IBC real usado por el motor al liquidar: deduccionesDeLey() persiste el
// IBC exacto en el campo `base` de la línea "Salud (aporte empleado)"
// (packages/reglas/src/deducciones.ts) — leerlo de ahí es más confiable que
// sumar líneas de devengo (que pueden incluir conceptos extralegales que NO
// hacen IBC, ver calculadoraSalarioFijo.ts). Sin esa línea (aprendiz etapa
// lectiva, alcance "ninguno" — SENA gestiona su afiliación) no hay IBC: la
// PILA de ese recibo no aplica.
// Busca por código y, si el recibo es anterior a que el código existiera,
// cae al texto con el que se guardó. El fallback NO se puede quitar mientras
// haya recibos históricos en BD: se liquidan PILAs de periodos ya cerrados.
function buscarLinea(
  lineas: LineaReciboJson[],
  codigo: string,
  conceptoLegacy: string
): LineaReciboJson | undefined {
  return lineas.find((l) => (l.codigo ? l.codigo === codigo : l.concepto === conceptoLegacy));
}

function ibcDeRecibo(lineas: LineaReciboJson[]): number | null {
  return buscarLinea(lineas, "SALUD_EMPLEADO", "Salud (aporte empleado)")?.base ?? null;
}

function auxilioDeRecibo(lineas: LineaReciboJson[]): number {
  return (
    buscarLinea(lineas, "AUXILIO_TRANSPORTE", "Auxilio de transporte")?.valorCalculado ?? 0
  );
}

// Liquidación PILA "exacta" de un periodo ya liquidado (SDD.md §14): a
// diferencia del estimado gerencial de costosService.ts (salario mensual
// plano, mismo cada mes), usa el IBC REAL de cada ReciboPago ya persistido
// — refleja los días efectivamente trabajados sin volver a prorratear nada
// (ver nota de diseño en calcularLiquidacionPilaEmpleado). Solo empleados
// (contratistas no generan aportes patronales — Ley 1819 de 2016, art. 244).
export async function calcularLiquidacionPilaPeriodo(
  empresaId: number,
  periodoId: number,
  exoneradoParafiscales: boolean
): Promise<PilaPeriodoResumen> {
  const periodo = await prisma.periodoNomina.findFirst({ where: { id: periodoId, empresaId } });
  if (!periodo) throw new Error("Periodo no encontrado");
  if (periodo.estado === "borrador") {
    throw new Error("El periodo todavía no está liquidado — no hay recibos con IBC real que usar.");
  }

  const [{ reglas }, recibos] = await Promise.all([
    obtenerReglasYFestivos(),
    prisma.reciboPago.findMany({
      where: { periodoId, empleadoId: { not: null } },
      include: { empleado: true },
    }),
  ]);

  const empleados: PilaEmpleadoResumen[] = recibos
    .filter((r) => r.empleado)
    .map((r) => {
      const empleado = r.empleado!;
      const lineas = r.lineas as unknown as LineaReciboJson[];
      const ibcPeriodo = ibcDeRecibo(lineas);
      return {
        empleadoId: empleado.id,
        nombre: empleado.nombre,
        tipoContrato: empleado.tipoContrato,
        claseRiesgoArl: empleado.claseRiesgoArl,
        pila:
          ibcPeriodo === null
            ? null
            : calcularLiquidacionPilaEmpleado(
                {
                  ibcPeriodo,
                  auxilioTransportePeriodo: auxilioDeRecibo(lineas),
                  salarioMensualPactado: empleado.salarioBase,
                  claseRiesgoArl: empleado.claseRiesgoArl as 1 | 2 | 3 | 4 | 5,
                },
                reglas,
                { exoneradoParafiscales, fecha: periodo.fechaFin }
              ),
      };
    });

  const ibcTotal = empleados.reduce((s, e) => s + (e.pila?.ibcPeriodo ?? 0), 0);
  const costoTotalPeriodo = empleados.reduce((s, e) => s + (e.pila?.costoTotalPeriodo ?? 0), 0);

  return {
    periodoId: periodo.id,
    fechaInicio: periodo.fechaInicio,
    fechaFin: periodo.fechaFin,
    exonerado: exoneradoParafiscales,
    empleados,
    totales: { ibcTotal, costoTotalPeriodo },
  };
}
