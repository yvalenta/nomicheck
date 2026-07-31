// Contrato de intake/export del wrapper stateless de LIQUIDACIÓN FINAL para
// Execution Market. Es el CONTRATO PÚBLICO — cualquier cambio incompatible
// sube la versión (`version: "1"` → "2"); los cambios aditivos se hacen
// dentro de v1.
//
// Por qué este listing y no uno de indemnización sola: `indemnizacion.ts`
// resuelve UNA clave del catálogo (`smlmv`), y cero en la rama de término
// fijo. Vender eso firmado sería cobrar por una división. La liquidación
// final sí usa el catálogo, es el documento que una terminación produce de
// verdad, y se traga la indemnización como una línea más.
//
// Diseño (RUMBO §2.2):
// - Un batch = una empresa + N personas que se retiran. Cada una trae su
//   propio historial de cortes; no hay periodo común, porque cada contrato
//   empieza y termina cuando le toca.
// - Cero persistencia: entra JSON, sale JSON. No usa Prisma.
// - `noExternalLlm: true` — el cálculo es determinístico (CST art. 249/306/
//   186 + Ley 52 de 1975), nunca llama IA.
//
// EL HISTORIAL ENTRA POR PARÁMETRO, y ahí está la diferencia con
// `liquidacionFinalService.ts`: ese lee los recibos previos de la empresa en
// Postgres para saber qué se provisionó. El comprador no tiene recibos
// nuestros, así que informa lo mismo que trae cualquier planilla colombiana:
// hasta cuándo se pagó la prima, hasta cuándo se consignaron las cesantías,
// cuántos días de vacaciones se disfrutaron. Lo que no informe se asume en el
// caso simple y **sale declarado en `supuestos`** — no se calla.
import { z } from "zod";
import { fecha } from "./comunes.js";
import type { FirmaOutput, HabeasDataConstancia } from "./batchPublico.js";

const walletEvm = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Wallet EVM inválida");

const devengoMensual = z.object({
  mes: z.string().min(1),
  valor: z.number().min(0),
});

// Los tipos que el motor de indemnización distingue. Los dos primeros se
// liquidan por los días que faltaban para el vencimiento (CST art. 64 num. 1);
// los otros dos por la escala de antigüedad.
const tipoContratoIndemnizacion = z.enum(["indefinido", "fijo", "obra_labor", "tiempo_parcial"]);

// El bloque de indemnización NO repite salario ni fechas: se derivan de los
// del propio empleado. Pedirlos dos veces abre la puerta a que se
// contradigan, y entonces habría que decidir cuál gana — una decisión que no
// debería existir.
const indemnizacionBatch = z.object({
  tipoContrato: tipoContratoIndemnizacion,
  conJustaCausa: z.boolean().default(false),
  /** CST art. 80 — base independiente de la justa causa: termina sin previo aviso y sin indemnización. */
  enPeriodoPrueba: z.boolean().default(false),
  /** Obligatoria en `fijo` y `obra_labor`: sin ella no hay plazo que romper. Se valida abajo. */
  fechaVencimientoPactada: fecha.optional(),
});

const empleadoLiquidacion = z
  .object({
    externalId: z.string().min(1),
    /** Opcionales a propósito: la liquidación se puede calcular sin saber quién es. Ver `habeasData`. */
    nombre: z.string().min(1).optional(),
    documento: z.string().min(1).optional(),
    salarioBase: z.number().positive(),
    /** `true` resuelve el monto vigente a la fecha de retiro contra el catálogo — no se manda el valor, se manda el derecho. */
    auxilioTransporte: z.boolean().default(false),
    fechaIngreso: fecha,
    fechaRetiro: fecha,
    /** Salario ordinario variable (comisiones, bonificaciones habituales). Entra a la base de las cuatro prestaciones. */
    devengosVariables: z.array(devengoMensual).optional(),
    /** Horas extra y trabajo en descanso obligatorio. CST art. 192 num. 1 los excluye de la base de vacaciones, pero hacen base de cesantías y prima. */
    devengosSuplementarios: z.array(devengoMensual).optional(),
    /** Hasta cuándo YA se pagó la prima. Si falta, se liquida desde el ingreso y se declara el supuesto. */
    cortePrima: fecha.optional(),
    /** Hasta cuándo YA se consignaron las cesantías. Si falta, se liquida desde el ingreso y se declara el supuesto. */
    corteCesantias: fecha.optional(),
    /** Días de vacaciones ya disfrutados. Si falta, se asume que no tomó ninguno y se declara. */
    diasVacacionesTomados: z.number().min(0).optional(),
    /** Fechas sin remuneración (suspensión, licencia no remunerada) que no causan prestaciones. */
    diasSuspension: z.array(fecha).optional(),
    /** Si se omite, no se calcula indemnización. Omitirla NO significa que sea cero: significa que no se pidió. */
    indemnizacion: indemnizacionBatch.optional(),
  })
  .refine((e) => e.fechaRetiro >= e.fechaIngreso, {
    message: "fechaRetiro no puede ser anterior a fechaIngreso",
    path: ["fechaRetiro"],
  })
  .refine(
    (e) =>
      !e.indemnizacion ||
      !["fijo", "obra_labor"].includes(e.indemnizacion.tipoContrato) ||
      // Con período de prueba o justa causa el motor resuelve en $0 antes de
      // mirar la fecha, así que exigirla ahí sería pedir un dato que no se usa.
      e.indemnizacion.enPeriodoPrueba ||
      e.indemnizacion.conJustaCausa ||
      !!e.indemnizacion.fechaVencimientoPactada,
    {
      message:
        "un contrato a término fijo o por obra requiere fechaVencimientoPactada para estimar la indemnización",
      path: ["indemnizacion", "fechaVencimientoPactada"],
    }
  );

export const batchLiquidacionFinalSchema = z.object({
  version: z.literal("1"),
  buyer: z.object({
    executorId: z.string().min(1).optional(),
    wallet: walletEvm.optional(),
    noExternalLlm: z.boolean().default(true),
  }),
  empresa: z.object({
    nombre: z.string().min(1),
    nit: z.string().min(1),
    sector: z.string().min(1).optional(),
  }),
  // Mismo tope que los otros listings: un order del marketplace es una unidad
  // de trabajo acotada, y evita un input abusivo contra un proceso CPU-bound.
  empleados: z.array(empleadoLiquidacion).min(1).max(500),
});

export type BatchLiquidacionFinalInput = z.infer<typeof batchLiquidacionFinalSchema>;

export interface LineaLiquidacion {
  codigo: string;
  concepto: string;
  valorCalculado: number;
  /** Cita legal puntual de esta línea. Es el primer eslabón de la cadena de procedencia. */
  ley?: string;
}

export interface ResultadoLiquidacionBatch {
  externalId: string;
  nombre?: string;
  documento?: string;
  fechaIngreso: string;
  fechaRetiro: string;
  lineas: LineaLiquidacion[];
  total: number;
  /** Defaults aplicados por falta de dato. Vacío = el comprador informó todo el historial. */
  supuestos: string[];
  advertencias: string[];
}

export interface BatchLiquidacionFinalOutput {
  version: "1";
  generadoEn: string;
  reglasVerificadasAl: string;
  reglasHash: string;
  disclaimer: string;
  habeasData: HabeasDataConstancia;
  empresa: { nombre: string; nit: string };
  resultados: ResultadoLiquidacionBatch[];
  signature: FirmaOutput;
}
