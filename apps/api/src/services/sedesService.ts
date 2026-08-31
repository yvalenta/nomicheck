import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { conAuditoria } from "../lib/auditoria.js";
import { otorgarMembresia, revocarMembresia } from "../lib/membresias.js";

// CRUD de sedes (SDD §15, pilar 1). Solo admin_empresa lo puede tocar.
// Todo scoped por empresaId en código — RLS es defensa adicional (SDD §05).
//
// ───────────────────────────────────────────────────────────────────────────
// `UsuarioSede` es "la operación olvidada" en su forma nueva
// ───────────────────────────────────────────────────────────────────────────
//
// La tabla NO tiene `empresaId` propio: su dueño se deriva de `Sede`. Es
// exactamente la forma de los cuatro modelos de `lib/alcance.ts`, pero quedó
// fuera de ese embudo, así que acá el compilador no ayuda — hay que escribir
// el ancla a mano en TODA consulta:
//
//     where: { usuarioId, sede: { empresaId } }
//
// Mientras una cuenta pertenecía a una sola empresa, filtrar solo por
// `usuarioId` era inofensivo. Con membresías N:M dejó de serlo:
// `usuarioSede.deleteMany({ where: { usuarioId } })` borra las asignaciones de
// TODAS las empresas. Carla es analista de la empresa 3 restringida a la sede
// 10, y admin de su propia empresa 9; desde 9 se asigna a sí misma (o se
// quita) y de paso borra la fila de la sede 10 — que es de 3. Al volver a 3,
// `sedesDelUsuario` devuelve cero filas, y cero filas significa "sin scoping"
// por convención del middleware: pasó de una sede a la nómina entera de una
// empresa que no es la suya, sin que el admin de 3 ejecutara ni viera nada.
// El mismo ancla va en el `select` de `listarStaff`: sin él, el panel de A
// muestra ids de sedes de B.

export function listarSedes(empresaId: number) {
  return prisma.sede.findMany({
    where: { empresaId },
    orderBy: { nombre: "asc" },
    include: { _count: { select: { empleados: true, analistas: true } } },
  });
}

export class ErrorConflictoSede extends Error {}

export async function crearSede(empresaId: number, nombre: string) {
  try {
    return await prisma.sede.create({ data: { empresaId, nombre } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ErrorConflictoSede(`Ya existe una sede llamada "${nombre}" en tu empresa.`);
    }
    throw err;
  }
}

export async function eliminarSede(empresaId: number, sedeId: number) {
  const sede = await prisma.sede.findFirst({ where: { id: sedeId, empresaId } });
  if (!sede) throw new Error("Sede no encontrada");
  // Deja los empleados sin sede en vez de bloquear el borrado — sin sede es
  // válido (empresa chica). La eliminación no se propaga a recibos porque
  // Empleado.sedeId no lo referencia (el snapshot ya está persistido).
  await prisma.$transaction(async (tx) => {
    await tx.empleado.updateMany({ where: { sedeId, empresaId }, data: { sedeId: null } });
    // El `sede: { empresaId }` es redundante con el findFirst de arriba, igual
    // que el `empresaId` del updateMany: es la misma doble capa. Y acá cuesta
    // menos escribirlo que decidir cada vez si esta consulta era de las que sí
    // podían filtrar solo por id.
    await tx.usuarioSede.deleteMany({ where: { sedeId, sede: { empresaId } } });
    await tx.sede.delete({ where: { id: sedeId } });
  });
}

// Asignación de staff empresarial a una empresa + sedes (SDD §15, pilar 1).
// Contrato: la cuenta destino DEBE existir en Supabase (se registró por su
// cuenta vía /login). El admin no crea usuarios — solo los liga a su empresa
// con un rol y opcionalmente restringe su alcance por sedes.
export class ErrorAsignacionStaff extends Error {}

/** Los roles que esta pantalla administra. `admin_empresa` no está: quitarlo
 * dejaría la empresa sin quien la administre, y esa operación es de
 * `admin_plataforma` (`reasignarAdminEmpresa`), no de acá.
 *
 * Lo hacen cumplir DOS guardas, una por operación: el filtro de `quitarStaff`
 * (dar de baja) y el de `asignarStaff` (cambiarle el rol a quien ya está). Sin
 * la segunda este comentario era una afirmación sin nada que la sostuviera —
 * ver `ROL_ADMIN_EMPRESA` acá abajo. */
const ROLES_STAFF = ["analista_rrhh", "auditor"];

/** El rol que esta pantalla no toca ni para dar ni para quitar. Aparte de
 * `ROLES_STAFF` porque las dos guardas preguntan cosas distintas: `quitarStaff`
 * exige que el rol ACTUAL esté en la lista blanca; `asignarStaff` solo tiene
 * que impedir que se pise ESTE. */
const ROL_ADMIN_EMPRESA = "admin_empresa";

/**
 * Vincula una cuenta existente a la empresa como staff, con rol y sedes.
 *
 * `actorId` es QUIÉN lo hace, no a quién: `Usuario` está vigilado por
 * `fn_auditar_cambio` (migración `20260830140000_auditoria_usuario`), que lee
 * el autor de `app.usuario_actual`. Por eso todo va dentro de `conAuditoria` y
 * no de un `prisma.$transaction` pelado — sin el wrapper queda constancia de
 * que a alguien lo hicieron analista de una empresa y ninguna de quién. Es
 * obligatorio a propósito: un default `null` haría que olvidarlo se vea igual
 * de bien que ponerlo.
 *
 * La membresía la escribe `otorgarMembresia`, que además decide si mover el
 * puntero (`Usuario.empresaId`/`rol`). Antes esta función escribía el puntero
 * y NO la membresía: la cuenta quedaba parada en una empresa a la que no
 * pertenecía y `requiereAuth` le respondía 403 en todos los endpoints —
 * incluidos `whoami` y el propio `empresa-activa` que sería el camino de
 * vuelta. Alta nueva = cuenta encerrada.
 */
export async function asignarStaff(
  empresaId: number,
  datos: { email: string; rol: "analista_rrhh" | "auditor"; sedeIds: number[] },
  actorId: string
) {
  const usuario = await prisma.usuario.findUnique({
    where: { email: datos.email.toLowerCase() },
    select: { id: true, email: true, nombre: true, empresaId: true },
  });
  if (!usuario) {
    throw new ErrorAsignacionStaff(
      `No hay una cuenta registrada con "${datos.email}". Pide a la persona que se registre primero vía /login.`
    );
  }

  // La pregunta "¿esta cuenta ya es de otro?" se le hace a la MEMBRESÍA, no al
  // puntero. Con el puntero se equivocaba en los dos sentidos: dejaba absorber
  // a quien pertenece a otra empresa pero está parado en ninguna, y rechazaba
  // re-asignarle el rol a un miembro propio que en ese momento estuviera
  // parado en otra de sus empresas (el caso de uso que las membresías vinieron
  // a habilitar: admin en una, auditor en otra).
  const membresias = await prisma.membresiaEmpresa.findMany({
    where: { usuarioId: usuario.id },
    select: { empresaId: true, rol: true },
  });
  // La de ESTA empresa, si la hay. El rol se lee de acá y no de `Usuario.rol`:
  // quien está parado en otra de sus empresas tiene el rol de aquella en la
  // cuenta, y el de esta solo en la fila de membresía.
  const propia = membresias.find((m) => m.empresaId === empresaId);
  const yaEsMiembro = propia !== undefined;
  // Para ENTRAR hace falta estar libre de verdad: sin ninguna membresía y sin
  // puntero. Un puntero en otra empresa sin membresía es el estado roto de la
  // migración a medias, y absorber esa cuenta la dejaría peor de lo que está.
  // Para RE-ASIGNAR (rol o sedes) basta con ser miembro de esta empresa, mire
  // a donde mire el puntero.
  if (!yaEsMiembro && (membresias.length > 0 || usuario.empresaId !== null)) {
    throw new ErrorAsignacionStaff(
      `La cuenta "${datos.email}" ya está vinculada a otra empresa — no se puede reasignar desde aquí.`
    );
  }

  // Y si YA es miembro, todavía falta preguntar CON QUÉ ROL. `otorgarMembresia`
  // es un upsert con `update: { rol }`: sin esta guarda pisa cualquier rol
  // existente, `admin_empresa` incluido. Un `admin_empresa` mandaba
  // `POST /empresa/staff {"email":"<el otro admin>","rol":"auditor"}` y lo
  // degradaba —o se degradaba solo, que es peor— y la degradación no tiene
  // vuelta por API: `reasignarAdminEmpresa` restaura por INVITACIÓN a un
  // correo, y un correo que ya existe responde 409. Una empresa se quedaba sin
  // administrador en un request, para siempre.
  //
  // La pregunta va anclada a la membresía DE ESTA EMPRESA, no a "¿es admin de
  // algo?": Beto es admin en B y auditor en A, y el admin de A tiene que poder
  // seguir cambiándole el rol en A. Mandar sobre el rol de Beto en B es lo que
  // no puede hacer, y eso lo decide la fila de B, que acá no se mira.
  //
  // No se filtró por `ROLES_STAFF` (que además dejaría afuera a `colaborador`)
  // a propósito: promover a analista a alguien que aceptó una invitación como
  // empleado es un alta legítima de esta pantalla, y prohibirla sería cerrar
  // una puerta que nadie pidió cerrar.
  if (propia?.rol === ROL_ADMIN_EMPRESA) {
    throw new ErrorAsignacionStaff(
      `La cuenta "${datos.email}" administra esta empresa: su rol no se cambia desde esta pantalla. ` +
        `Reasignar quién administra es una operación de admin_plataforma.`
    );
  }

  // PENDIENTE (consentimiento): una cuenta LIBRE se absorbe sabiendo su
  // correo, sin que la persona acepte nada. Es el mismo correo con el que
  // alguien usó el verificador anónimo: un `admin_empresa` cualquiera la
  // convierte en `auditor` de una empresa de la que nunca oyó hablar, y le
  // cambia el rol de cuenta y el puntero.
  //
  // Con la membresía ya no es lo que era: antes el puntero quedaba sin
  // membresía y eso es 403 en TODOS los endpoints —incluido el que serviría
  // para salir—, o sea un candado remoto sobre la cuenta de un tercero. Eso
  // está cerrado; lo que queda es el problema de consentimiento, que es real y
  // no se arregla acá: el arreglo es que esto cree una INVITACIÓN que la
  // persona acepte, como `invitarColaborador`, y esa es otra tarea (rediseñar
  // el flujo entero desde este servicio dejaría la mitad del camino hecha).
  //
  // Se evaluó exigir además que la cuenta "no esté verificada" y no se hizo:
  // no existe tal columna. Las credenciales viven en Supabase Auth y `Usuario`
  // solo tiene el correo denormalizado — el chequeo sería un campo nuevo, o
  // sea una migración, o sea la otra tarea otra vez. Lo que sí se hizo es
  // dejar la condición de entrada en su forma más angosta (libre = sin
  // membresías y sin puntero), con una prueba que la fija: ensancharla vuelve
  // a poner la suite en rojo y obliga a decidirlo a propósito.

  if (datos.sedeIds.length > 0) {
    const sedes = await prisma.sede.count({ where: { id: { in: datos.sedeIds }, empresaId } });
    if (sedes !== datos.sedeIds.length) {
      throw new ErrorAsignacionStaff("Alguna de las sedes seleccionadas no pertenece a tu empresa.");
    }
  }

  return conAuditoria(actorId, async (tx) => {
    await otorgarMembresia(tx, { usuarioId: usuario.id, empresaId, rol: datos.rol });
    // Reemplazo completo del scoping DE ESTA EMPRESA: las sedes que otra
    // empresa le haya puesto a esta persona no son de este admin.
    await tx.usuarioSede.deleteMany({ where: { usuarioId: usuario.id, sede: { empresaId } } });
    if (datos.sedeIds.length > 0) {
      await tx.usuarioSede.createMany({
        data: datos.sedeIds.map((sedeId) => ({ usuarioId: usuario.id, sedeId })),
      });
    }
    // El rol que se devuelve es el de la MEMBRESÍA, no `Usuario.rol`: si la
    // persona quedó parada en otra de sus empresas, su rol de cuenta no se
    // movió y devolverlo sería contarle a la pantalla una historia que no es
    // la de esta empresa.
    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: datos.rol,
      sedeIds: [...datos.sedeIds],
    };
  });
}

/**
 * Lista el staff empresarial (analistas/auditores) con sus sedes asignadas.
 *
 * Pregunta por MEMBRESÍA, no por `Usuario.empresaId`/`Usuario.rol`. Con el
 * filtro viejo, quien fuera analista acá y admin en otra empresa DESAPARECÍA
 * de esta lista en cuanto cambiara de empresa activa: el admin no lo veía, no
 * lo podía quitar (`quitarStaff` buscaba con el mismo criterio) y la persona
 * volvía cuando quisiera con `POST /auth/empresa-activa`. Un miembro invisible
 * e inextirpable.
 */
export async function listarStaff(empresaId: number) {
  const miembros = await prisma.membresiaEmpresa.findMany({
    where: { empresaId, rol: { in: ROLES_STAFF } },
    select: {
      rol: true,
      usuario: {
        select: {
          id: true,
          email: true,
          nombre: true,
          // Solo las sedes DE ESTA EMPRESA (ver la cabecera del archivo).
          sedesAsignadas: { where: { sede: { empresaId } }, select: { sedeId: true } },
        },
      },
    },
    orderBy: { usuario: { nombre: "asc" } },
  });
  return miembros.map((m) => ({
    id: m.usuario.id,
    email: m.usuario.email,
    nombre: m.usuario.nombre,
    rol: m.rol,
    sedeIds: m.usuario.sedesAsignadas.map((a) => a.sedeId),
  }));
}

/**
 * Saca a alguien del staff de la empresa.
 *
 * Lo que hace que esto sea una revocación y no un gesto: `revocarMembresia`
 * borra la AUTORIZACIÓN. La versión anterior ponía `empresaId = null, rol =
 * "individual"` en `Usuario` y dejaba viva la membresía — y como el rol
 * efectivo sale de la membresía, la persona a la que acababan de sacar volvía
 * sola con un `POST /auth/empresa-activa`: `whoami` le seguía ofreciendo la
 * empresa y el cambio de empresa activa le devolvía el rol que le habían
 * quitado.
 *
 * `actorId`: igual que en `asignarStaff`, y acá pesa más — el trigger escribe
 * `AuditoriaCambio` y una baja sin autor es la que nadie puede reclamar.
 */
export async function quitarStaff(empresaId: number, usuarioId: string, actorId: string) {
  const membresia = await prisma.membresiaEmpresa.findUnique({
    where: { usuarioId_empresaId: { usuarioId, empresaId } },
    select: { rol: true },
  });
  if (!membresia || !ROLES_STAFF.includes(membresia.rol)) {
    throw new Error("Usuario staff no encontrado en tu empresa");
  }
  await conAuditoria(actorId, async (tx) => {
    await tx.usuarioSede.deleteMany({ where: { usuarioId, sede: { empresaId } } });
    await revocarMembresia(tx, { usuarioId, empresaId });
  });
}
