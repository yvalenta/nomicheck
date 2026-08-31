import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { prisma } from "../lib/prisma.js";
import { ROLES, puede, type Permiso, type Rol } from "../lib/permisos.js";
import { registro } from "../lib/registro.js";

export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  /**
   * Rol EFECTIVO de este request. Con empresa activa sale de la MEMBRESÍA
   * (`MembresiaEmpresa.rol`), no de `Usuario.rol`: la misma cuenta puede ser
   * admin_empresa en una empresa y auditor en otra. Sin empresa activa es
   * `Usuario.rol` — el rol de cuenta (colaborador libre entre empresas,
   * individual, admin_plataforma).
   *
   * Sigue siendo `string` y no `Rol` a propósito: las dos columnas son `String`
   * en la base y nada impide una fila con un rol que no existe. Quien decide
   * sobre él lo estrecha antes (`esRol`, ver `requierePermiso`).
   */
  rol: string;
  /**
   * Rol de CUENTA (`Usuario.rol`), sin pisar por la membresía. Existe por el
   * «ver como» del admin_plataforma: parado en una empresa vía membresía
   * auditor, su rol efectivo es "auditor" y este campo es lo único que
   * permite saber (whoami → barra de la web) que la vista es de plataforma
   * y no de un auditor real. Mismo criterio de `rol`: `string`, no `Rol`.
   */
  rolCuenta: string;
  /**
   * Empresa activa YA validada contra la membresía. Si el puntero de
   * `Usuario.empresaId` no tenía membresía que lo respaldara, este request
   * nunca llegó a tener `req.usuario`: se fue en 403.
   */
  empresaId: number | null;
  /** Solo poblado para rol "colaborador" — Empleado.usuarioId → este Usuario. */
  empleadoId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

/** ¿El texto es uno de los seis roles declarados? `Usuario.rol` y
 * `MembresiaEmpresa.rol` son `String` en la base: un rol con typo, o uno que
 * se dejó de usar, entra igual a la aplicación. */
export function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor);
}

/**
 * Prisma cuando la TABLA no existe en la base (P2021). Es el único error que se
 * degrada al leer `MembresiaEmpresa`: cualquier otro —conexión caída, timeout,
 * deadlock— SIGUE PROPAGANDO. Un catch ancho acá convertiría "la base no
 * responde" en "entrá con el rol que dice tu fila", que es la peor forma
 * posible de fallar abierto.
 *
 * ACÁ ESTUVO `P2022` HASTA EL 2026-08-31, y era otra cosa disfrazada de la
 * misma. P2022 es *columna* inexistente: se dispara con la tabla PRESENTE Y
 * POBLADA, ante cualquier deriva de esquema futura —agregarle un campo al
 * modelo y desplegar antes de migrar, que pasa muchísimo más seguido que crear
 * una tabla—. Y ahí la degradación deja de ser "el comportamiento anterior":
 * con membresías ya escritas, `Usuario.rol` y `MembresiaEmpresa.rol` DIVERGEN,
 * así que volver a resolver por el puntero y el rol de cuenta concede accesos
 * que el modelo nuevo niega. P2021 es el único código donde "todavía no hay
 * membresías" y "degradar no concede nada que ayer no existiera" son la misma
 * frase — y esa equivalencia es toda la licencia que tiene este fallback.
 */
const CODIGOS_SIN_TABLA = new Set(["P2021"]);

/**
 * ¿Este error es "la tabla todavía no existe"? Se mira el `code` y no
 * `instanceof PrismaClientKnownRequestError`: lo que importa es el código, y
 * así la rama se puede probar sin levantar Prisma.
 *
 * Lo usa `membresiasDe` acá abajo y `empresasDeUsuario` en `authService.ts`:
 * las dos leen `MembresiaEmpresa` y las dos tienen que sobrevivir a la ventana
 * entre el deploy y `prisma migrate deploy`. El predicado vive en UN lugar
 * porque duplicar la lista de códigos es duplicar la decisión de qué se degrada
 * — y esa lista corta es justo lo que impide que un "la base no responde"
 * termine tratado como "la migración no corrió".
 *
 * OJO, EL PREDICADO NO TRAE EL RELOJ: el tope de tiempo (`GRACIA_SIN_TABLA_MS`)
 * vive en `membresiasDe`, no acá, así que `empresasDeUsuario` sigue degradando
 * sin caducidad. Es deliberado y es inofensivo en ese orden: `whoami` está
 * detrás de `requiereAuth`, o sea que cuando la ventana de la puerta se cierra
 * ningún request llega al selector. Si algún día `esTablaSinMigrar` se usa en
 * un camino que NO pase por `requiereAuth`, ese camino se queda sin tope y hay
 * que darle el suyo.
 */
export function esTablaSinMigrar(err: unknown): boolean {
  const codigo = (err as { code?: unknown }).code;
  return typeof codigo === "string" && CODIGOS_SIN_TABLA.has(codigo);
}

// ── La degradación tiene reloj ──────────────────────────────────────────────
//
// Cuánto se sigue resolviendo el rol con `Usuario` cuando `MembresiaEmpresa` no
// existe, contado desde el PRIMER request degradado de este proceso.
//
// POR QUÉ HAY UN TOPE. Hasta el 2026-08-31 la degradación era indefinida: si
// nadie leía los `warn`, la API entera seguía autorizando con la semántica
// anterior a las membresías para siempre — y eso no se ve desde afuera, porque
// todo responde 200, hasta que alguien cruza dos tenants. Una guarda de
// autorización degradada es un estado de emergencia, y un estado de emergencia
// sin vencimiento es el estado normal.
//
// EL TRATO ES EL MISMO que `nominaService` hace con el catálogo vencido: se
// aguanta la ventana que la operación de verdad necesita —acá, el rato entre
// `deploy.sh` y el `prisma migrate deploy`, que se corre A MANO y por eso no se
// mide en segundos— y más allá de eso la migración no corrió, punto: el P2021
// sube tal cual, cada request muere en 500 y no queda nada que interpretar.
//
// La asimetría es la buscada. Dentro de la ventana, equivocarse cuesta "alguien
// entra con el rol de su fila, como ayer". Pasada la ventana, seguir degradando
// costaría "la casa entera autoriza con el modelo viejo y nadie se enteró".
const GRACIA_SIN_TABLA_MS = 15 * 60 * 1000;

/** `Date.now()` del primer request degradado; `null` = la ventana no se abrió. */
let degradacionDesde: number | null = null;
/** Cuántos requests se resolvieron ya con el rol de `Usuario`. Va en cada
 * línea del log para que el aviso sea un contador que sube y no la misma
 * frase repetida, que es lo que se pierde en el ruido. */
let requestsDegradados = 0;

/**
 * Reabre la ventana. La usan SOLO las pruebas: el estado vive en el módulo
 * —igual que el caché de `nominaService`— y sin esto cada prueba heredaría el
 * reloj de la anterior.
 *
 * Que sea estado de proceso también es el hueco conocido de este mecanismo: N
 * réplicas son N ventanas, y un contenedor que reinicia estrena la suya. Un
 * deploy en bucle de reinicio podría reabrirla indefinidamente. Se acepta
 * porque la alternativa (guardar la marca en la base) exige justo la base que
 * en ese momento no tiene la tabla.
 */
export function reiniciarGraciaSinTabla(): void {
  degradacionDesde = null;
  requestsDegradados = 0;
}

/** Los dos 403 que puede dar la puerta. Se exportan porque `POST
 * /auth/empresa-activa` responde EXACTAMENTE lo mismo cuando rechaza un
 * cambio de empresa: si los textos vivieran en dos archivos, uno de los dos
 * envejecería y el cliente vería dos mensajes distintos para el mismo hecho. */
export const NO_PERTENECES = "No perteneces a esta empresa";
export const EMPRESA_SUSPENDIDA = "Esta empresa está suspendida — contacta al soporte de NomiCheck.";

interface MembresiaDeLaCuenta {
  empresaId: number;
  rol: string;
  empresa: { activa: boolean };
}

/**
 * Las membresías de la cuenta, o `null` si la tabla todavía no existe.
 *
 * COMPATIBILIDAD, decidida y escrita acá para que no haya que deducirla: si el
 * código se despliega antes de correr la migración `20260830120000_membresia_empresa`,
 * `requiereAuth` NO revienta y NO deniega — cae al comportamiento anterior (el
 * rol y la empresa salen de `Usuario`, que es exactamente lo que esta misma
 * API hacía hasta hoy: no se abre ningún acceso que antes no existiera) y
 * emite una línea `warn` POR REQUEST, con el contador de cuántos van y cuántos
 * minutos le quedan a la ventana.
 *
 * Y DURA LO QUE DURA. Vencida `GRACIA_SIN_TABLA_MS` el P2021 sube tal cual: se
 * emite una línea `nivel:"error"` —el que `registro.ts` documenta cómo
 * grepear— y el request muere en 500. Una degradación indefinida es
 * indistinguible de no tener la guarda, y `grep '"origen":"auth"'` solo sirve
 * si alguien lo corre; el vencimiento no depende de que nadie mire.
 */
async function membresiasDe(usuarioId: string): Promise<MembresiaDeLaCuenta[] | null> {
  try {
    return await prisma.membresiaEmpresa.findMany({
      where: { usuarioId },
      // `empresa.activa` viaja acá adentro para que el chequeo de suspensión
      // no cueste un round-trip aparte (ver `requiereAuth`).
      select: { empresaId: true, rol: true, empresa: { select: { activa: true } } },
    });
  } catch (err) {
    if (!esTablaSinMigrar(err)) throw err;

    const ahora = Date.now();
    degradacionDesde ??= ahora;
    const transcurridoMs = ahora - degradacionDesde;

    if (transcurridoMs > GRACIA_SIN_TABLA_MS) {
      // Se avisa en CADA request y no una sola vez, igual que el catálogo
      // vencido de `nominaService`: acá no hay a quién avisarle una vez: si la
      // línea saliera sola la primera vez, el resto de la caída se vería como
      // un 500 anónimo más.
      registro.error(
        "auth",
        "MembresiaEmpresa sigue sin existir pasada la ventana de gracia: se DEJA de degradar y todo request cae en 500 hasta que corra la migración",
        err,
        { requestsDegradados, minutosDeGracia: GRACIA_SIN_TABLA_MS / 60_000 }
      );
      throw err;
    }

    requestsDegradados += 1;
    registro.warn(
      "auth",
      "MembresiaEmpresa no existe todavía: el rol y la empresa salen de Usuario (migración sin aplicar)",
      {
        codigo: (err as { code?: unknown }).code,
        requestsDegradados,
        minutosRestantes: Math.ceil((GRACIA_SIN_TABLA_MS - transcurridoMs) / 60_000),
      }
    );
    return null;
  }
}

// Valida el JWT de Supabase Auth en cada request protegido y adjunta el
// perfil de dominio (Usuario) — nunca confía en el rol declarado por el
// cliente (SDD.md §08).
export async function requiereAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Falta el header Authorization" });
    return;
  }

  // `getClaims` verifica la firma del JWT LOCALMENTE contra el JWKS del
  // proyecto (ES256, cacheado por el cliente) — antes cada request protegido
  // pagaba una ida HTTP a Supabase Auth (`getUser`) solo para validar el
  // token. Si el token viniera firmado con la llave simétrica legacy, el SDK
  // cae solo al camino remoto, así que no hay tokens que antes pasaran y
  // ahora no. El trade-off real: una sesión revocada sigue siendo válida
  // hasta que expire el access token (~1h) — aceptable porque suspender
  // empresas (el único kill-switch del producto) se chequea abajo contra la
  // BD en cada request, igual que siempre.
  const { data, error } = await supabaseAdmin.auth.getClaims(token);
  const usuarioId = data?.claims.sub;
  if (error || !usuarioId) {
    res.status(401).json({ error: "Sesión inválida o expirada" });
    return;
  }

  // Las tres consultas solo dependen del id del token — en paralelo, un solo
  // round-trip a la base en vez de tres encadenados.
  //
  // usuarioId ya no es único (una cuenta puede tener varios Empleado:
  // historial + invitaciones pendientes). El empleado "actual" es el activo
  // y aceptado.
  //
  // Las membresías se piden TODAS, no la del puntero: pedir solo esa exigiría
  // conocer `perfil.empresaId` primero, o sea encadenar una consulta más por
  // request. Son pocas filas (a cuántas empresas pertenece una persona) y las
  // sirve el prefijo de la PK `(usuarioId, empresaId)`.
  const [perfil, empleadoActivo, membresias] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: usuarioId } }),
    prisma.empleado.findFirst({
      where: { usuarioId, activo: true, invitacionAceptadaEn: { not: null } },
      select: { id: true },
    }),
    membresiasDe(usuarioId),
  ]);
  if (!perfil) {
    res.status(403).json({ error: "El usuario no tiene un perfil en NomiCheck" });
    return;
  }

  // ── Empresa activa y rol efectivo ─────────────────────────────────────────
  //
  // `Usuario.empresaId` es solo un PUNTERO ("en cuál de mis empresas estoy
  // parado ahora"). La pertenencia vive en MembresiaEmpresa, y de ahí sale el
  // rol con el que se resuelve este request. Un puntero sin membresía no es un
  // acceso degradado: es 403.
  let rol = perfil.rol;
  let empresaId = perfil.empresaId;
  let empresaSuspendida = false;

  if (empresaId !== null) {
    const membresia = membresias?.find((m) => m.empresaId === empresaId) ?? null;

    if (membresia) {
      rol = membresia.rol;
      // Sin consulta extra: `activa` vino en la misma lectura de membresías.
      empresaSuspendida = !membresia.empresa.activa;
    } else if (membresias === null) {
      // Migración sin aplicar (ver `membresiasDe`). Se acepta el puntero como
      // antes y el rol sigue saliendo de `Usuario` — pero la suspensión SE
      // SIGUE CHEQUEANDO con la consulta que este middleware hacía hasta hoy:
      // el kill-switch del producto no puede quedar colgando del camino
      // degradado.
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { activa: true },
      });
      empresaSuspendida = empresa ? !empresa.activa : false;
    } else if (perfil.rol === "admin_plataforma") {
      // Un admin_plataforma NUNCA debería tener puntero, y el backfill de la
      // migración lo excluye a propósito (su acceso no depende de pertenecer a
      // nada). Si una fila vieja lo tiene, 403 lo dejaría afuera de la
      // plataforma ENTERA por un dato que no usa para nada — así que el
      // puntero se ignora (no hay empresa que ver sin membresía) y queda
      // dicho en el log, porque es una invariante rota que alguien tiene que
      // arreglar en la fila.
      registro.warn("auth", "admin_plataforma con puntero de empresa sin membresía: se ignora el puntero", {
        usuarioId,
        empresaId,
      });
      empresaId = null;
    } else {
      // El caso que esta guarda existe para cerrar: el puntero apunta a una
      // empresa de la que esta cuenta no es miembro (o dejó de serlo). No hay
      // "entrar igual pero sin empresa": no se adjunta `req.usuario` y el
      // request muere acá.
      res.status(403).json({ error: NO_PERTENECES });
      return;
    }
  }

  // Suspender una empresa (admin_plataforma) bloquea de verdad el acceso de
  // su admin_empresa y colaboradores (SDD.md §03 Módulo D). La única
  // excepción es la cuenta admin_plataforma misma: con el «ver como» SÍ
  // puede tener puntero (membresía auditor), y si la empresa que está
  // mirando se suspende —otro admin de plataforma, por ejemplo— un 403 acá
  // la encerraría afuera de TODO (ni /admin ni el propio «salir» responden).
  // Se le ignora el puntero, como en la rama de la fila vieja: vuelve a ser
  // plataforma y puede reactivar o salir de la vista.
  if (empresaSuspendida) {
    if (perfil.rol === "admin_plataforma") {
      registro.warn("auth", "admin_plataforma con vista sobre empresa suspendida: se ignora el puntero", {
        usuarioId,
        empresaId,
      });
      rol = perfil.rol;
      empresaId = null;
    } else {
      res.status(403).json({ error: EMPRESA_SUSPENDIDA });
      return;
    }
  }

  req.usuario = {
    id: perfil.id,
    nombre: perfil.nombre,
    rol,
    rolCuenta: perfil.rol,
    empresaId,
    empleadoId: empleadoActivo?.id ?? null,
  };
  next();
}

/**
 * Lo que una guarda exige, declarado por la guarda misma.
 *
 * No es introspección por gusto: `routes/__tests__/guardas.test.ts` recorre las
 * capas del router de verdad y exige que TODA ruta de empresa, colaborador y
 * plataforma monte `requiereAuth` más una de estas. Sin la marca, esa prueba
 * tendría que adivinar por el nombre de la función —`<anonymous>` para las dos
 * fábricas— y una ruta nueva sin guarda pasaría por guardada.
 */
export type Exigencia = { permiso: Permiso } | { roles: readonly string[] };

export interface Guarda {
  (req: Request, res: Response, next: NextFunction): void;
  exige: Exigencia;
}

/** ¿Esta capa del router es una guarda declarada? */
export function esGuarda(fn: unknown): fn is Guarda {
  return typeof fn === "function" && typeof (fn as Partial<Guarda>).exige === "object";
}

export function requiereRol(...roles: string[]): Guarda {
  return Object.assign(
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.usuario || !roles.includes(req.usuario.rol)) {
        res.status(403).json({ error: "No tienes permiso para esta acción" });
        return;
      }
      next();
    },
    { exige: { roles } as Exigencia }
  );
}

/**
 * La misma guarda, preguntándole a la MATRIZ (`lib/permisos.ts`) en vez de
 * enumerar roles en cada ruta. Una ruta que pide `requierePermiso("nomina.pagar")`
 * ya no puede divergir de lo que la web dibuja: las dos leen la misma celda.
 *
 * Responde EXACTO igual que `requiereRol` —mismo 403, mismo cuerpo— para que
 * migrar una ruta de una a la otra no cambie nada de lo que ve el cliente.
 *
 * Desde el 2026-08-31 NINGUNA ruta enumera roles: las de empresa, colaborador
 * y plataforma pasan todas por acá (`routes/index.ts`), y `guardas.test.ts` lo
 * exige. `requiereRol` queda como la primitiva sobre la que esto está
 * construido, no como una alternativa disponible.
 */
export function requierePermiso(permiso: Permiso): Guarda {
  return Object.assign(
    (req: Request, res: Response, next: NextFunction) => {
      const rol = req.usuario?.rol;
      // `esRol` no es ceremonia: el rol viene de una columna `String`. Uno que
      // no está en la matriz no tiene el permiso — no hay celda que consultar.
      if (!rol || !esRol(rol) || !puede(rol, permiso)) {
        res.status(403).json({ error: "No tienes permiso para esta acción" });
        return;
      }
      next();
    },
    { exige: { permiso } as Exigencia }
  );
}

/**
 * Sedes visibles para el usuario cuando se trata de un analista_rrhh. Null
 * = sin scoping (admin_empresa, auditor, o analista sin sedes asignadas EN LA
 * EMPRESA ACTIVA — por convención vacío = ve toda la empresa, útil en empresas
 * chicas).
 *
 * EL `where` LLEVA ANCLA DE EMPRESA, y no es adorno. `UsuarioSede` no tiene
 * `empresaId` propio: su dueño se deriva de `Sede`. Es exactamente la forma de
 * los cuatro modelos de `lib/alcance.ts` —un `where` sintácticamente completo
 * respecto de lo que la tabla ofrece, sobre una tabla cuyo dueño está en el
 * padre— pero fuera del embudo del compilador, así que acá el ancla la pone
 * quien escribe. Filtrar solo por `usuarioId` era inofensivo mientras una
 * cuenta pertenecía a UNA empresa; con `MembresiaEmpresa` deja de serlo, en las
 * dos direcciones:
 *
 *   · de más: la analista restringida a la sede 10 de la empresa 3 se lleva esa
 *     restricción a la empresa 9, donde el id 10 no significa nada — y el
 *     conjunto que devuelve mezcla sedes de tenants distintos.
 *   · de menos: si sus sedes están todas en OTRA empresa, la consulta sin ancla
 *     nunca da cero, así que la convención "cero sedes = ve toda la empresa"
 *     jamás se aplica donde sí corresponde.
 *
 * QUEDA UN HUECO CONOCIDO, y no se cierra desde acá: cero filas sigue
 * significando "ve toda la empresa". Con el ancla ese cero ya solo puede venir
 * de la empresa activa, pero si alguien BORRA las asignaciones de esta empresa
 * la analista se amplía de una sede a la nómina entera, en silencio. Que ese
 * borrado no pueda venir de otro tenant es responsabilidad del `deleteMany` de
 * `sedesService`, que también tiene que ir anclado.
 */
export async function sedesDelUsuario(usuario: UsuarioAutenticado): Promise<number[] | null> {
  if (usuario.rol !== "analista_rrhh") return null;
  // Un analista_rrhh sin empresa activa no tiene ninguna sede que ver: no hay
  // empresa contra la cual anclar, y `null` acá diría "sin scoping", que es lo
  // contrario. La lista vacía es el lado cerrado —`{ sedeId: { in: [] } }` no
  // devuelve nada y `empleadoAccesible` rechaza—, que es donde hay que
  // equivocarse.
  if (usuario.empresaId === null) return [];
  const filas = await prisma.usuarioSede.findMany({
    where: { usuarioId: usuario.id, sede: { empresaId: usuario.empresaId } },
    select: { sedeId: true },
  });
  if (filas.length === 0) return null;
  return filas.map((f) => f.sedeId);
}
