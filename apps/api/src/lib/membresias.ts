import type { TxAcotada } from "./alcance.js";
import type { Rol } from "./permisos.js";

// ───────────────────────────────────────────────────────────────────────────
// El único lugar donde se otorga y se revoca la pertenencia a una empresa
// ───────────────────────────────────────────────────────────────────────────
//
// EL INVARIANTE QUE SOSTIENE ESTE ARCHIVO:
//
//   una membresía es la ÚNICA autorización de pertenencia; el puntero
//   (`Usuario.empresaId`) es solo la empresa activa y JAMÁS sobrevive a la
//   baja de su membresía.
//
// De un lado y del otro salen los dos bugs que esto viene a cerrar, que son
// el mismo hueco visto por sus dos caras: `MembresiaEmpresa` se LEÍA en tres
// lugares (`requiereAuth`, `empresasDeUsuario`, `cambiarEmpresaActiva`) y no
// se ESCRIBÍA en ninguno — la tabla era la foto congelada del backfill de
// `20260830120000_membresia_empresa`.
//
//   · Revocar no revocaba. Las bajas ponían `empresaId = null, rol =
//     "individual"` en `Usuario` y dejaban viva la membresía. Como el rol
//     efectivo sale de la membresía y `POST /auth/empresa-activa` es la única
//     ruta privada sin guarda de permiso (a propósito), la persona a la que
//     acababan de sacar se re-autorizaba sola con UN request: `whoami` le
//     seguía ofreciendo la empresa, y el cambio de empresa activa le devolvía
//     el rol que le habían quitado. Con `quitarAdminEmpresa` el rol que
//     recuperaba era `admin_empresa`.
//   · Ningún alta la creaba. Registrarse dejaba un puntero sin membresía, y
//     eso en `requiereAuth` es 403 en todos los endpoints —incluido `whoami`,
//     incluido el propio `empresa-activa` que sería el camino de vuelta—: la
//     cuenta nacía encerrada. Falla cerrado, pero es la misma pieza faltante.
//
// Diez rutas de alta y de baja necesitan este par de escrituras. Si cada una
// inventa la suya, la novena se olvida de mover el puntero y el invariante se
// rompe donde nadie mira. Por eso el par vive acá y las rutas lo llaman.
//
// TRES DECISIONES QUE NO SON OBVIAS LEYENDO EL CÓDIGO:
//
//  1. Reciben un `tx`, no abren transacción. La membresía y el puntero tienen
//     que moverse JUNTOS —un commit a medias deja exactamente el estado que
//     esto viene a prohibir— y las altas y bajas ya vienen envueltas en su
//     propia transacción (`prisma.$transaction`, `conAuditoria`). Recibir el
//     cliente transaccional es lo que permite componer con la que ya hay en
//     vez de anidar una segunda.
//
//     Y el wrapper correcto es `conAuditoria(actorId, tx => ...)`, no
//     `$transaction` pelado: `Usuario` está vigilado por `fn_auditar_cambio`
//     (migración `20260830140000_auditoria_usuario`), que lee el autor de
//     `app.usuario_actual`. Sin el wrapper el rastro queda con
//     `usuarioId = NULL` — constancia de que a alguien lo sacaron de una
//     empresa y ninguna de quién lo sacó.
//
//  2. NO degradan si la tabla no existe. `middleware/auth.ts` y
//     `empresasDeUsuario` sí lo hacen (P2021 y solo P2021 → se sigue con el
//     comportamiento anterior) porque son caminos de LECTURA y esa
//     degradación no abre ningún acceso nuevo. Acá es al revés: un otorgar o
//     un revocar que se traga el error deja la operación a medias creyendo
//     que la hizo, y la baja silenciosa es justo la que no se puede perdonar.
//     Si la migración no corrió, esto revienta y se ve.
//
//  3. `admin_plataforma` es intocable como rol de CUENTA. Su acceso no
//     depende de pertenecer a nada, y su "ver como" entra por una membresía
//     temporal de rol `auditor`: si `otorgarMembresia` le copiara ese rol
//     encima de `Usuario.rol`, el admin de la plataforma quedaría degradado a
//     auditor PARA SIEMPRE, y `revocarMembresia` lo dejaría en `individual`.
//     Ninguna de las dos toca el rol de esa cuenta — el puntero sí, porque el
//     puntero es de la sesión, no de la identidad.
//
//  4. El `rol` que se otorga tiene ALLOWLIST, y no es ceremonia de tipos.
//     `MembresiaEmpresa.rol` es una columna `String` y `otorgarMembresia` es
//     su ÚNICO escritor en todo `apps/api/src` (`grep "membresiaEmpresa\."`
//     fuera de pruebas: este upsert y el deleteMany de acá abajo). O sea que
//     lo que no se filtre acá queda escrito en la columna de la que
//     `requiereAuth` saca el rol EFECTIVO de cada request.
//
//     Hoy ningún camino HTTP mete texto libre —los llamadores pasan literales
//     y `asignarStaff` viene de un `z.enum` cerrado en `sedesController`— y
//     `requierePermiso` falla cerrado ante un rol que no conoce (`esRol` antes
//     de la matriz: sin celda, 403). Esto no tapa un agujero abierto: pone la
//     red UNA CAPA MÁS ABAJO, donde se ESCRIBE, que es donde el próximo
//     llamador —una semilla, un script de migración, una ruta nueva— no va a
//     tener que acordarse. Y cambia el modo de falla: un rol desconocido
//     revienta acá con nombre, en vez de convertirse en una cuenta que recibe
//     403 en todo y nadie sabe por qué.

/** El rol de cuenta de quien no pertenece a ninguna empresa. No es un rol de
 * membresía: es lo que queda cuando no hay ninguna. */
const ROL_SIN_EMPRESA = "individual";

/** Ver la decisión 3 de la cabecera: este rol no sale nunca de una membresía,
 * así que ninguna membresía se lo puede pisar. */
const ROL_PLATAFORMA = "admin_plataforma";

/**
 * Los cuatro roles que una membresía PUEDE tener. No son los seis de
 * `lib/permisos.ts`, y los dos que faltan no faltan por olvido: ninguno
 * describe una pertenencia.
 *
 *   · `admin_plataforma` es rol de CUENTA — su acceso no depende de pertenecer
 *     a nada (decisión 3), y su "ver como" entra por una membresía de rol
 *     `auditor`, que sí está acá.
 *   · `individual` es lo que QUEDA cuando no hay ninguna membresía
 *     (`ROL_SIN_EMPRESA`): escribirlo en una fila de pertenencia sería una
 *     contradicción con forma de dato.
 *
 * El `satisfies` es lo que impide que esta lista se desincronice de la matriz
 * de permisos: un typo, o un rol que se retire de `ROLES`, no compila acá.
 */
export const ROLES_MEMBRESIA = [
  "admin_empresa",
  "analista_rrhh",
  "auditor",
  "colaborador",
] as const satisfies readonly Rol[];

export type RolMembresia = (typeof ROLES_MEMBRESIA)[number];

/** ¿El texto es uno de los cuatro roles de PERTENENCIA? Hermano de `esRol`
 * (`middleware/auth.ts`), que responde por los seis roles de cuenta: acá la
 * pregunta es más angosta porque la columna que se escribe es más angosta. */
export function esRolMembresia(valor: string): valor is RolMembresia {
  return (ROLES_MEMBRESIA as readonly string[]).includes(valor);
}

/**
 * Otorgar con un rol que no existe. Es una clase y no un `Error` pelado para
 * que la prueba negativa lo pueda fijar por TIPO y no por el texto del
 * mensaje — el mensaje está para la persona que lea el log, y cambiarlo no
 * debería poner nada en rojo.
 */
export class ErrorRolMembresiaDesconocido extends Error {
  constructor(rol: string) {
    super(
      `"${rol}" no es un rol de membresía. Los válidos son: ${ROLES_MEMBRESIA.join(", ")}. ` +
        `Esa columna es de la que sale el rol efectivo de cada request: no acepta texto libre.`
    );
    this.name = "ErrorRolMembresiaDesconocido";
  }
}

export interface DatosOtorgar {
  usuarioId: string;
  empresaId: number;
  /** El rol EN ESA empresa. La misma cuenta puede tener otro distinto en otra.
   * Estrecho a propósito, y además comprobado en tiempo de ejecución: ver la
   * decisión 4 de la cabecera. */
  rol: RolMembresia;
}

export interface DatosRevocar {
  usuarioId: string;
  empresaId: number;
}

/** Una membresía viva de la cuenta, con el estado de su empresa al lado — que
 * es lo que hace falta para elegir a dónde mandar el puntero sin un
 * round-trip por empresa. */
export interface MembresiaViva {
  empresaId: number;
  rol: string;
  /** `false` = empresa suspendida por `admin_plataforma`. */
  activa: boolean;
}

/**
 * A qué empresas pertenece esta cuenta AHORA, dentro de esta transacción.
 *
 * Orden estable —la más vieja primero— y no por gusto: es el que decide a
 * cuál empresa cae el puntero cuando se revoca la activa, y un desempate que
 * dependa del orden físico de las filas haría que la misma baja termine en
 * empresas distintas según cuándo se corra.
 *
 * A diferencia de `empresasDeUsuario` (que sirve el selector del header y por
 * eso ordena por nombre y degrada si la tabla no existe), esta lectura es
 * parte de una ESCRITURA: no ordena para que se lea lindo y no se traga
 * ningún error. Ver decisión 2 de la cabecera.
 */
export async function membresiasDe(tx: TxAcotada, usuarioId: string): Promise<MembresiaViva[]> {
  const filas = await tx.membresiaEmpresa.findMany({
    where: { usuarioId },
    select: { empresaId: true, rol: true, empresa: { select: { activa: true } } },
    orderBy: [{ creadoEn: "asc" }, { empresaId: "asc" }],
  });
  return filas.map((m) => ({ empresaId: m.empresaId, rol: m.rol, activa: m.empresa.activa }));
}

/**
 * Otorga (o actualiza) la pertenencia de una cuenta a una empresa.
 *
 * Es un upsert: dar de alta dos veces a la misma persona no revienta con
 * P2002, y cambiarle el rol es la misma operación que dárselo. Las altas de
 * este repo se repiten de verdad —`asignarStaff` re-asigna rol y sedes de
 * alguien que ya está, y aceptar una invitación puede llegar sobre una
 * membresía que el backfill ya creó—, así que la idempotencia no es
 * ceremonia defensiva: es el caso normal.
 *
 * EL PUNTERO se mueve solo "cuando corresponde", y corresponde en dos casos:
 *
 *   · La cuenta no está parada en ninguna empresa (`empresaId === null`) →
 *     entra a esta. Si no, quedaría autorizada sin estar en ningún lado y
 *     tendría que adivinar que existe `POST /auth/empresa-activa`.
 *   · Ya está parada en ESTA empresa → se le sincroniza el rol de cuenta con
 *     el de la membresía, para que las dos columnas no cuenten historias
 *     distintas sobre la misma persona.
 *
 * Y NO corresponde cuando está parada en OTRA: sumar a alguien a una segunda
 * empresa no puede sacarlo de la que está usando en este momento — eso lo
 * decide la persona, con el selector del header. (Ese es justo el caso de uso
 * que las membresías vinieron a habilitar: admin en una, auditor en otra.)
 */
export async function otorgarMembresia(
  tx: TxAcotada,
  { usuarioId, empresaId, rol }: DatosOtorgar
): Promise<void> {
  // La allowlist va ANTES del upsert y no después: el punto es que nada se
  // escriba. El tipo del parámetro ya lo exige, pero el compilador no está
  // mirando cuando el `rol` llega de un `JSON.parse`, de una semilla `.mjs`,
  // de un `as` o de una ruta que todavía no existe — y esta función es el
  // único escritor de la columna que manda el control de acceso (decisión 4).
  if (!esRolMembresia(rol)) throw new ErrorRolMembresiaDesconocido(rol);

  await tx.membresiaEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId, empresaId } },
    create: { usuarioId, empresaId, rol },
    update: { rol },
  });

  const perfil = await tx.usuario.findUnique({
    where: { id: usuarioId },
    select: { rol: true, empresaId: true },
  });
  // Sin cuenta no hay puntero que sostener (y el upsert de arriba ya habría
  // fallado por la FK: no es un caso alcanzable, es no asumir que no lo es).
  if (!perfil) return;
  if (perfil.rol === ROL_PLATAFORMA) return;
  if (perfil.empresaId !== null && perfil.empresaId !== empresaId) return;
  // Ya coherente: no se escribe. El UPDATE de más no cambiaría nada pero sí
  // dejaría una línea en la auditoría — un cambio de rol que nunca ocurrió.
  if (perfil.empresaId === empresaId && perfil.rol === rol) return;

  await tx.usuario.update({ where: { id: usuarioId }, data: { empresaId, rol } });
}

/**
 * Revoca la pertenencia de una cuenta a una empresa. LA corrección del
 * agujero: sacar a alguien tiene que dejarlo sin forma de volver.
 *
 * Dos escrituras, en este orden y en la misma transacción:
 *
 *  1. Se borra la membresía — la autorización. Con `deleteMany` y no
 *     `delete`, porque revocar dos veces (o revocar a quien nunca estuvo) es
 *     una baja que ya está hecha, no un P2025 en la cara del admin.
 *  2. Si el puntero apuntaba a ESA empresa, se lo mueve. Si apuntaba a otra,
 *     no se toca: quitarle a alguien la membresía de la empresa 3 no puede
 *     desloguearlo de la 9, donde sigue siendo miembro.
 *
 * A dónde se lo mueve: a la membresía viva más antigua cuya empresa esté
 * ACTIVA. La suspensión importa acá porque `requiereAuth` responde 403 antes
 * de adjuntar `req.usuario` cuando la empresa activa está suspendida —
 * incluido el request que intentara salir—, así que dejar el puntero en una
 * empresa suspendida encierra la cuenta sin salida por la API. Sin ninguna
 * empresa activa donde pararse, el puntero queda en `null` y el rol de cuenta
 * en `individual`: la persona conserva sus membresías suspendidas y vuelve
 * sola con `POST /auth/empresa-activa` el día que la empresa se reactive.
 */
export async function revocarMembresia(
  tx: TxAcotada,
  { usuarioId, empresaId }: DatosRevocar
): Promise<void> {
  await tx.membresiaEmpresa.deleteMany({ where: { usuarioId, empresaId } });

  const perfil = await tx.usuario.findUnique({
    where: { id: usuarioId },
    select: { rol: true, empresaId: true },
  });
  if (!perfil) return;
  // El puntero estaba en otra empresa: la baja no lo alcanza.
  if (perfil.empresaId !== empresaId) return;

  // Un admin_plataforma con puntero es o una fila vieja rota (el backfill lo
  // excluye) o el «ver como» en curso (tarea 2026-08-31: entrar pone puntero
  // + membresía auditor, y este revocar es su salida). Se le limpia el
  // puntero, que es lo que la baja pide, y NO se le toca el rol: degradarlo a
  // `individual` lo dejaría fuera de la plataforma entera.
  if (perfil.rol === ROL_PLATAFORMA) {
    await tx.usuario.update({ where: { id: usuarioId }, data: { empresaId: null } });
    return;
  }

  const restantes = await membresiasDe(tx, usuarioId);
  const destino = restantes.find((m) => m.activa);

  await tx.usuario.update({
    where: { id: usuarioId },
    data: destino
      ? { empresaId: destino.empresaId, rol: destino.rol }
      : { empresaId: null, rol: ROL_SIN_EMPRESA },
  });
}
