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
  pila: ResultadoLiquidacionPila | null;
  /**
   * Presente exactamente cuando `pila` es null: por qué ESE recibo no liquida.
   *
   * Antes el null viajaba sin motivo y la UI lo rotulaba "Aprendiz SENA" para
   * todos — así que un recibo histórico incompleto se le mostraba a la empresa
   * como un aprendiz que no tiene. El dato de "no hay PILA" es barato; el caro
   * es "por qué", y era justo el que se tiraba.
   */
  sinPila?: string;
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

function ibcDeRecibo(lineas: LineaReciboJson[]): unknown {
  return buscarLinea(lineas, "SALUD_EMPLEADO", "Salud (aporte empleado)")?.base;
}

// `LineaReciboJson` es una AFIRMACIÓN nuestra sobre bytes guardados en una
// columna Json, no algo que TypeScript haya verificado: el recibo se lee con
// un `as` y la base acepta cualquier cosa que quepa en JSON. Por eso acá se
// comprueba el valor, no el tipo.
//
// El umbral es el mismo invariante que el motor exige (`ibcPeriodo > 0`), y
// escrito así —negando `> 0` en vez de comparar contra 0— también atrapa
// negativos, NaN y strings.
function ibcUtilizable(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0;
}

const SIN_LINEA_DE_SALUD =
  "El recibo no registra IBC (sin línea de salud, o sin base en ella). " +
  "Es lo esperable en un aprendiz SENA en etapa lectiva, cuya afiliación gestiona el SENA.";

const IBC_NO_LIQUIDABLE =
  "El recibo registra un IBC que no permite liquidar aportes — revisa el recibo de este colaborador.";

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
      where: { periodoId, periodo: { empresaId }, empleadoId: { not: null } },
      include: { empleado: true },
    }),
  ]);

  // Un recibo que no se puede liquidar se SALTA, no tumba el periodo.
  //
  // El motor exige `ibcPeriodo > 0` y lanza si no. Como el IBC sale de un
  // recibo ya persistido, un solo recibo con la base en 0 hacía explotar este
  // map entero: la petición terminaba en 422 y la empresa se quedaba sin la
  // PILA de TODOS sus colaboradores por el dato de uno.
  //
  // Lo que NO se atrapa a propósito es el fallo de alcance del periodo (que no
  // haya regla vigente para `fechaFin`, por ejemplo): eso no es de un recibo,
  // es de la corrida, y afecta a todos por igual. Tragárselo devolvería un 200
  // con la lista completa en "sin PILA" y los totales en $0 — una planilla que
  // parece liquidada y vale cero. Un 422 es la respuesta honesta ahí.
  const empleados: PilaEmpleadoResumen[] = recibos
    .filter((r) => r.empleado)
    .map((r) => {
      const empleado = r.empleado!;
      const lineas = r.lineas as unknown as LineaReciboJson[];
      const ibcPeriodo = ibcDeRecibo(lineas);
      const comun = {
        empleadoId: empleado.id,
        nombre: empleado.nombre,
        tipoContrato: empleado.tipoContrato,
        claseRiesgoArl: empleado.claseRiesgoArl,
      };
      if (ibcPeriodo === undefined || ibcPeriodo === null) {
        return { ...comun, pila: null, sinPila: SIN_LINEA_DE_SALUD };
      }
      if (!ibcUtilizable(ibcPeriodo)) {
        return { ...comun, pila: null, sinPila: IBC_NO_LIQUIDABLE };
      }
      return {
        ...comun,
        pila: calcularLiquidacionPilaEmpleado(
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
