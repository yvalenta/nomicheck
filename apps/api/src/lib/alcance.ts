import type { Prisma, PrismaClient } from "@prisma/client";

// ───────────────────────────────────────────────────────────────────────────
// Los cuatro modelos que no saben de quién son
// ───────────────────────────────────────────────────────────────────────────
//
// `Turno`, `ReciboPago`, `PeriodoNominaEmpleado` y `PagoItem` NO tienen columna
// `empresaId`: su dueño se deriva del padre. Por eso esta consulta
//
//     prisma.turno.findMany({ where: { periodoId } })
//
// es sintácticamente impecable, pasa el typecheck, pasa la prueba de camino
// feliz — y devuelve la nómina de cualquier empresa que tenga ese id. No hay
// nada "faltante" que ver al leerla: el `where` está completo respecto de lo
// que la tabla ofrece.
//
// Se coló dos veces con dos meses de diferencia (`0750834`, `53a3c07`), y las
// dos veces las funciones vecinas del mismo archivo sí filtraban — que es
// justo lo que lo hace invisible: la vista completa el patrón.
//
// `lib/prisma.ts` ya no expone esos cuatro modelos crudos. La única puerta es
// este archivo, y el `where` de toda lectura o borrado tiene que traer el
// ANCLA: la relación que amarra la fila a su dueño, dentro de la misma
// consulta. Olvidarlo dejó de depender de que alguien se acuerde de escribir
// la prueba — ahora no compila.
//
// Lo que este archivo NO promete: que el ancla sea la correcta. Anclar al
// periodo equivocado sigue siendo posible, y para eso siguen estando las
// pruebas que intentan el abuso (`docs/leyes/la-operacion-olvidada`). Lo que
// cierra es el olvido completo, que es la forma que se dio las dos veces.

declare const acotadoEnOtroLado: unique symbol;

/**
 * Escotilla explícita: el `where` se acota por un id cuya pertenencia YA se
 * comprobó unas líneas más arriba, en la misma función.
 *
 * Existe porque hay casos legítimos donde el ancla no es la empresa —el portal
 * del colaborador acota por el `empleadoId` de la sesión, y ahí el dueño es la
 * persona, no la compañía— y porque obligar a un JOIN inútil después de un
 * `findFirst` que ya validó sería ceremonia.
 *
 * El motivo es un `string` que nadie lee en runtime, y ese es el punto: obliga
 * a escribir dónde se verificó, y `grep acotadoAparte src/` lista de una todas
 * las excepciones que existen. Una lista corta que se puede auditar entera es
 * lo contrario de un olvido que no se ve.
 */
export type Acotado = { readonly [acotadoEnOtroLado]: true };

export function acotadoAparte<W extends object>(donde: W, porque: string): W & Acotado {
  void porque; // documenta para quien lee; el motor nunca lo ve
  return donde as W & Acotado;
}

/** `Turno` cuelga de un periodo y de un empleado; ambos sí tienen `empresaId`. */
export type AnclaTurno =
  | { periodo: { empresaId: number } }
  | { empleado: { empresaId: number } }
  | Acotado;

/** `ReciboPago` cuelga del periodo y de empleado O contratista (uno de los dos). */
export type AnclaRecibo =
  | { periodo: { empresaId: number } }
  | { empleado: { empresaId: number } }
  | { contratista: { empresaId: number } }
  | Acotado;

export type AnclaPeriodoEmpleado =
  | { periodo: { empresaId: number } }
  | { empleado: { empresaId: number } }
  | Acotado;

/** `PagoItem` cuelga del lote, que sí lleva `empresaId` propio. */
export type AnclaPagoItem = { batch: { empresaId: number } } | Acotado;

// ───────────────────────────────────────────────────────────────────────────
// Los delegados acotados
// ───────────────────────────────────────────────────────────────────────────
//
// Solo se declaran las operaciones que la app de verdad hace sobre estas
// tablas. La lista corta es deliberada: agregar una obliga a decidir, ahí
// mismo, cómo se ancla. Y leerla entera es la enumeración que la ley pide —
// "¿cuál de todas no filtra?" se contesta mirando este archivo, no diez.
//
// `create`/`createMany` pasan derecho: no llevan `where`, no leen nada y la
// FK va explícita en el `data`. No hay nada que puedan devolver de otro dueño.

export interface TurnosAcotados {
  findMany<T extends Prisma.TurnoFindManyArgs>(
    args: T & { where: Prisma.TurnoWhereInput & AnclaTurno }
  ): Prisma.PrismaPromise<Array<Prisma.TurnoGetPayload<T>>>;
  count(args: { where: Prisma.TurnoWhereInput & AnclaTurno }): Prisma.PrismaPromise<number>;
  deleteMany(args: {
    where: Prisma.TurnoWhereInput & AnclaTurno;
  }): Prisma.PrismaPromise<Prisma.BatchPayload>;
  createMany(args: Prisma.TurnoCreateManyArgs): Prisma.PrismaPromise<Prisma.BatchPayload>;
}

export interface RecibosAcotados {
  findMany<T extends Prisma.ReciboPagoFindManyArgs>(
    args: T & { where: Prisma.ReciboPagoWhereInput & AnclaRecibo }
  ): Prisma.PrismaPromise<Array<Prisma.ReciboPagoGetPayload<T>>>;
  findFirst<T extends Prisma.ReciboPagoFindFirstArgs>(
    args: T & { where: Prisma.ReciboPagoWhereInput & AnclaRecibo }
  ): Prisma.PrismaPromise<Prisma.ReciboPagoGetPayload<T> | null>;
  count(args: { where: Prisma.ReciboPagoWhereInput & AnclaRecibo }): Prisma.PrismaPromise<number>;
  deleteMany(args: {
    where: Prisma.ReciboPagoWhereInput & AnclaRecibo;
  }): Prisma.PrismaPromise<Prisma.BatchPayload>;
  create<T extends Prisma.ReciboPagoCreateArgs>(
    args: T
  ): Prisma.PrismaPromise<Prisma.ReciboPagoGetPayload<T>>;
  createMany(args: Prisma.ReciboPagoCreateManyArgs): Prisma.PrismaPromise<Prisma.BatchPayload>;
}

export interface PeriodoEmpleadosAcotados {
  findMany<T extends Prisma.PeriodoNominaEmpleadoFindManyArgs>(
    args: T & { where: Prisma.PeriodoNominaEmpleadoWhereInput & AnclaPeriodoEmpleado }
  ): Prisma.PrismaPromise<Array<Prisma.PeriodoNominaEmpleadoGetPayload<T>>>;
  deleteMany(args: {
    where: Prisma.PeriodoNominaEmpleadoWhereInput & AnclaPeriodoEmpleado;
  }): Prisma.PrismaPromise<Prisma.BatchPayload>;
  createMany(
    args: Prisma.PeriodoNominaEmpleadoCreateManyArgs
  ): Prisma.PrismaPromise<Prisma.BatchPayload>;
}

export interface PagoItemsAcotados {
  findMany<T extends Prisma.PagoItemFindManyArgs>(
    args: T & { where: Prisma.PagoItemWhereInput & AnclaPagoItem }
  ): Prisma.PrismaPromise<Array<Prisma.PagoItemGetPayload<T>>>;
  createMany(args: Prisma.PagoItemCreateManyArgs): Prisma.PrismaPromise<Prisma.BatchPayload>;
}

type ModelosDerivados = "turno" | "reciboPago" | "periodoNominaEmpleado" | "pagoItem";

interface Derivados {
  turno: TurnosAcotados;
  reciboPago: RecibosAcotados;
  periodoNominaEmpleado: PeriodoEmpleadosAcotados;
  pagoItem: PagoItemsAcotados;
}

/**
 * El cliente transaccional acotado. `$transaction` del cliente entrega ESTE
 * tipo, no `Prisma.TransactionClient` — si no, la escritura dentro de una
 * transacción sería el agujero de siempre con un `tx.` adelante.
 */
export type TxAcotada = Omit<Prisma.TransactionClient, ModelosDerivados> & Derivados;

export type ClienteAcotado = Omit<PrismaClient, ModelosDerivados | "$transaction"> &
  Derivados & {
    $transaction<P extends Prisma.PrismaPromise<unknown>[]>(
      operaciones: [...P]
    ): Promise<{ [K in keyof P]: Awaited<P[K]> }>;
    $transaction<R>(
      fn: (tx: TxAcotada) => Promise<R>,
      opciones?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }
    ): Promise<R>;
  };
