import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { conAuditoria } from "../lib/auditoria.js";
import { membresiasDe, revocarMembresia } from "../lib/membresias.js";
import type { TxAcotada } from "../lib/alcance.js";
import type { RespuestaPaginada } from "../lib/paginacion.js";
import type { empleadoSchema, empleadoUpdateSchema, retiroSchema } from "../validation/empresa.js";
import type { z } from "zod";

export interface FiltrosEmpleados {
  q?: string;
  sedeId?: number;
  activo?: boolean;
  tipoContrato?: string;
  page: number;
  limit: number;
  skip: number;
}

// Todo query filtrada por empresaId en código — RLS es la defensa adicional,
// no la única (SDD.md §05, doble capa de autorización).
// `sedes` = scoping por sede del analista_rrhh (SDD §15, pilar 1). null =
// sin scoping (admin_empresa/auditor/analista sin sedes) — ver auth.ts.
export async function listarEmpleados(
  empresaId: number,
  sedes: number[] | null = null,
  f: FiltrosEmpleados = { page: 1, limit: 25, skip: 0 }
): Promise<RespuestaPaginada<Awaited<ReturnType<typeof prisma.empleado.findFirst>>>> {
  const where: Prisma.EmpleadoWhereInput = { empresaId, eliminadoEn: null };
  // El filtro del usuario NARROWS dentro del alcance; nunca lo reemplaza.
  //
  // Antes eran dos asignaciones seguidas —`where.sedeId = {in: sedes}` y luego
  // `where.sedeId = f.sedeId`— y la segunda PISABA la primera: un analista_rrhh
  // limitado a la sede 10 pedía `?sedeId=11` y veía la sede 11 entera. Misma
  // empresa, sede fuera de su alcance: el bypass del pilar 1 del SDD §15.
  //
  // La intersección lo vuelve estructural en vez de dejarlo al orden de dos
  // líneas. Un filtro fuera del alcance da `{in: []}` — cero resultados, que es
  // la respuesta honesta ("nada que coincida DENTRO de lo tuyo") y no filtra si
  // esa sede existe o no. Ver docs/leyes/la-operacion-olvidada.md en el repo de
  // operación: el contraste está a treinta líneas de acá, en
  // `empleadoAccesible`, que sí valida la pertenencia a la sede.
  if (sedes) {
    where.sedeId = f.sedeId !== undefined
      ? { in: sedes.filter((s) => s === f.sedeId) }
      : { in: sedes };
  } else if (f.sedeId !== undefined) {
    where.sedeId = f.sedeId;
  }
  if (f.activo !== undefined) where.activo = f.activo;
  if (f.tipoContrato) where.tipoContrato = f.tipoContrato;
  if (f.q) {
    where.OR = [
      { nombre: { contains: f.q, mode: "insensitive" } },
      { documento: { contains: f.q, mode: "insensitive" } },
    ];
  }
  const [total, items] = await Promise.all([
    prisma.empleado.count({ where }),
    prisma.empleado.findMany({ where, orderBy: { nombre: "asc" }, skip: f.skip, take: f.limit }),
  ]);
  return { items, total, page: f.page, limit: f.limit };
}

// Verifica que un empleado exista, sea de la empresa y — si el usuario es
// un analista_rrhh con sedes — que caiga dentro de sus sedes asignadas.
// Cambio de bloque: analistas escoped no pueden tocar empleados fuera de
// su alcance.
async function empleadoAccesible(empresaId: number, empleadoId: number, sedes: number[] | null) {
  const empleado = await prisma.empleado.findFirst({ where: { id: empleadoId, empresaId, eliminadoEn: null } });
  if (!empleado) throw new Error("Empleado no encontrado");
  if (sedes && (empleado.sedeId === null || !sedes.includes(empleado.sedeId))) {
    throw new Error("Este colaborador está fuera de las sedes asignadas a tu usuario");
  }
  return empleado;
}

export async function crearEmpleado(
  empresaId: number,
  datos: z.infer<typeof empleadoSchema>,
  usuarioId: string | null = null
) {
  try {
    return await conAuditoria(usuarioId, (tx) => tx.empleado.create({ data: { ...datos, empresaId } }));
  } catch (err) {
    // @@unique([empresaId, documento]) — incluye retirados: el documento de
    // un empleado retirado sigue reservado (su historial de nómina sigue
    // ligado a él), así que reintentar con el mismo documento debe fallar
    // como conflicto explícito, no como un 500 sin manejar.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ErrorConflicto(`Ya existe un colaborador con el documento "${datos.documento}" en tu empresa.`);
    }
    throw err;
  }
}

export async function actualizarEmpleado(
  empresaId: number,
  empleadoId: number,
  datos: z.infer<typeof empleadoUpdateSchema>,
  sedes: number[] | null = null,
  usuarioId: string | null = null
) {
  await empleadoAccesible(empresaId, empleadoId, sedes);
  return conAuditoria(usuarioId, (tx) => tx.empleado.update({ where: { id: empleadoId }, data: datos }));
}

// "Eliminar" es soft: marca eliminadoEn=now (registro invisible para todas las
// lecturas por default) en vez de DELETE físico. Con historial (recibos/turnos)
// seguimos rechazando con 409 y direccionando a "Retirar" — un empleado con
// historial que se elimine por error debería tener causal de retiro registrada,
// no ocultarse silenciosamente. Sin historial (caso "creado por error"), el
// soft delete lo saca de las listas y del @@unique(empresaId, documento) de
// facto (el unique sigue reservando el documento, pero el UI ya no lo muestra
// como conflicto).
export class ErrorConflicto extends Error {}

/** El rol de membresía que otorga `aceptarInvitacion`: el vínculo de NÓMINA.
 * Es el único que una baja de nómina termina — lo usan las DOS bajas,
 * `eliminarEmpleado` y `retirarEmpleado`, con el mismo criterio. */
const ROL_NOMINA = "colaborador";

/** La baja de nómina, compartida por las dos rutas que la ejecutan.
 *
 * SOLO EL VÍNCULO DE NÓMINA: si la cuenta además es staff de la empresa
 * (`admin_empresa`, `analista_rrhh`, `auditor`), esa membresía es otra cosa —la
 * otorga `asignarStaff`, la termina `quitarStaff`— y sacar a alguien de la
 * nómina no puede quitarle su silla de administración; el dueño que se retira a
 * sí mismo como empleado perdería su propia empresa, sin vuelta por API.
 *
 * Sin membresía en esta empresa la llamada no borra nada y lo único que hace es
 * SOLTAR el puntero si estaba parado acá — que es lo que el `updateMany`
 * anterior hacía, y lo que rescata a una cuenta que quedó apuntando a una
 * empresa de la que no es miembro (403 en todo).
 */
async function terminarVinculoDeNomina(tx: TxAcotada, usuarioId: string, empresaId: number) {
  const suya = (await membresiasDe(tx, usuarioId)).find((m) => m.empresaId === empresaId);
  if (suya === undefined || suya.rol === ROL_NOMINA) {
    await revocarMembresia(tx, { usuarioId, empresaId });
  }
}

export async function eliminarEmpleado(
  empresaId: number,
  empleadoId: number,
  sedes: number[] | null = null,
  usuarioId: string | null = null
) {
  const empleado = await empleadoAccesible(empresaId, empleadoId, sedes);

  const [recibos, turnos] = await Promise.all([
    prisma.reciboPago.count({ where: { empleadoId, empleado: { empresaId } } }),
    prisma.turno.count({ where: { empleadoId, empleado: { empresaId } } }),
  ]);
  if (recibos + turnos > 0) {
    throw new ErrorConflicto(
      "El empleado tiene historial de nómina (recibos o turnos registrados) y no puede eliminarse: los registros de nómina deben conservarse. Usa 'Retirar' para desactivarlo conservando el historial."
    );
  }
  return conAuditoria(usuarioId, async (tx) => {
    const actualizado = await tx.empleado.update({
      where: { id: empleadoId },
      data: { eliminadoEn: new Date(), activo: false },
    });
    // La baja MÁS dura de las dos también revoca. Que `retirarEmpleado` lo
    // hiciera y esta no era la peor forma de la incoherencia: eliminar es lo
    // que se usa para el "creado por error", o sea justo el caso donde la
    // persona nunca debió pertenecer.
    //
    // El hueco que cierra: si la cuenta había ACEPTADO la invitación
    // (`aceptarInvitacion` otorga la membresía `colaborador`) y todavía no
    // tiene recibos ni turnos —que es exactamente la condición para poder
    // eliminar—, el soft delete dejaba viva la membresía. `requiereAuth`
    // resuelve `empleadoId` con `activo: true`, así que sus recibos no se
    // abren; lo que queda es una membresía que dice "pertenece" de alguien
    // cuyo registro se borró: `whoami` le sigue ofreciendo la empresa en el
    // selector, conserva `invitaciones.*` y `empresas.propias.ver` sobre ella,
    // y `listarStaff` no la muestra (solo lista analistas y auditores), o sea
    // que no hay ninguna ruta por la que el admin pueda sacarla. Miembro
    // invisible e inextirpable, igual que el que arreglaron `listarStaff` y
    // `quitarStaff`.
    if (empleado.usuarioId) {
      await terminarVinculoDeNomina(tx, empleado.usuarioId, empresaId);
    }
    return actualizado;
  });
}

// Marca el retiro: el empleado deja de aparecer en periodos futuros
// (liquidarPeriodo solo toma `activo: true`) pero queda disponible para
// liquidacionFinalService.liquidarFinal — no se borra su historial.
export async function retirarEmpleado(
  empresaId: number,
  empleadoId: number,
  datos: z.infer<typeof retiroSchema>,
  sedes: number[] | null = null,
  usuarioId: string | null = null
) {
  const empleado = await empleadoAccesible(empresaId, empleadoId, sedes);
  if (datos.fechaRetiro < empleado.fechaIngreso) {
    throw new Error("La fecha de retiro no puede ser anterior a la fecha de ingreso");
  }
  return conAuditoria(usuarioId, async (tx) => {
    const actualizado = await tx.empleado.update({
      where: { id: empleadoId },
      data: { fechaRetiro: datos.fechaRetiro, activo: false },
    });
    // Si este empleado era la pertenencia de una cuenta, el retiro la TERMINA:
    // se borra la membresía y el puntero se va con ella. El Empleado retirado
    // conserva su `usuarioId` como historial — la nómina vieja sigue siendo de
    // esa persona; lo que se acaba es que siga perteneciendo a la empresa.
    //
    // Antes esto era un `usuario.updateMany({ ... }, { empresaId: null })` y
    // nada más: dejaba viva la fila de `MembresiaEmpresa`. Y ahí la baja no era
    // una baja — `whoami` le seguía ofreciendo la empresa, `POST
    // /auth/empresa-activa` le devolvía el puntero con el rol de la membresía, y
    // la persona retirada seguía figurando como miembro en la pantalla de Roles
    // de la empresa, para siempre y sin ninguna ruta que la sacara
    // (`quitarStaff` solo mira `analista_rrhh` y `auditor`).
    //
    // POR QUÉ SE REVOCA AUNQUE EL RETIRADO NO GANE NINGÚN DATO CON LA MEMBRESÍA:
    // el acceso a sus recibos históricos ya se lo corta `requiereAuth`, que
    // resuelve `empleadoId` con `activo: true` — retirado, `/colaborador/recibos`
    // responde "Tu cuenta no está vinculada a ningún colaborador" con o sin
    // membresía. O sea que hoy lo único que sostiene la baja es el flag de OTRA
    // tabla, no la tabla de autorización. Una membresía que dice "pertenece" de
    // alguien que ya no pertenece es una mentira en la única tabla que esta
    // entrega puso a mandar.
    //
    // El criterio de qué membresía termina una baja de nómina —solo la de
    // `colaborador`— vive en `terminarVinculoDeNomina`, compartido con
    // `eliminarEmpleado`. Las dos bajas tienen que decidir lo mismo: si cada
    // una llevara su copia, la que se toque después se separaría de la otra sin
    // que nada lo avise.
    if (empleado.usuarioId) {
      await terminarVinculoDeNomina(tx, empleado.usuarioId, empresaId);
    }
    return actualizado;
  });
}
