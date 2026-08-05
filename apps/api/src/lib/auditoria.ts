import { prisma } from "./prisma.js";
import type { TxAcotada } from "./alcance.js";

/** Ejecuta `fn` dentro de una transacción con `app.usuario_actual` seteada
 * al usuarioId — el trigger `fn_auditar_cambio` (SDD §15, pilar 1B) lo lee
 * con `current_setting('app.usuario_actual', true)` y lo persiste como
 * autor del cambio. Sin este wrapper el trigger registra `usuarioId = NULL`
 * (auth.uid() de Supabase no aplica porque Prisma conecta como superuser).
 *
 * SET LOCAL vive solo mientras dure la transacción — al terminar (commit o
 * rollback) la conexión vuelve limpia al pool, no hay que resetearla.
 * `SET LOCAL` requiere estar en transacción; por eso el helper envuelve
 * TODO en `$transaction`, incluso operaciones sueltas.
 */
export function conAuditoria<T>(
  usuarioId: string | null,
  fn: (tx: TxAcotada) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Parametrizar via set_config evita SQL injection — SET LOCAL en
    // $executeRawUnsafe requiere concatenar, esto es más seguro.
    await tx.$executeRaw`SELECT set_config('app.usuario_actual', ${usuarioId ?? ""}, true)`;
    return fn(tx);
  });
}
