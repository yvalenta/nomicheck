// Cola de jobs sobre Postgres — pg-boss aprovecha SKIP LOCKED + LISTEN/NOTIFY
// del mismo Supabase Postgres que ya usa Prisma; no requiere Redis (SDD §04:
// "una imagen, un contenedor"). Se inicializa lazy la primera vez que alguien
// encola, y bootstrap.ts registra los handlers de los workers al arrancar el
// API.
import { PgBoss } from "pg-boss";

let boss: PgBoss | null = null;
let arrancando: Promise<PgBoss> | null = null;

// pg-boss usa su propio schema (`pgboss`) para no chocar con el schema `public`
// que administra Prisma. Reusa la misma DATABASE_URL — sin variables nuevas.
function urlDeConexion(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no configurada — pg-boss no puede arrancar");
  return url;
}

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  if (arrancando) return arrancando;
  arrancando = (async () => {
    const b = new PgBoss({ connectionString: urlDeConexion() });
    b.on("error", (err: unknown) => console.error("[pg-boss]", err));
    await b.start();
    boss = b;
    return b;
  })();
  return arrancando;
}

// Cierre limpio para tests o SIGTERM en producción — evita jobs en vuelo
// perdidos y cierra el pool subyacente.
export async function detenerBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ close: true, graceful: true });
    boss = null;
    arrancando = null;
  }
}

// Nombres de cola centralizados — un typo en una cadena mágica silenciaría
// el worker sin error obvio, así que los importa todo el mundo desde aquí.
export const COLA_LIQUIDACION = "liquidar-nomina" as const;

export interface DatosJobLiquidacion {
  empresaId: number;
  periodoId: number;
  usuarioId: string | null;
}
