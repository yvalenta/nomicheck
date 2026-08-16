import { conAuditoria } from "../lib/auditoria.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { prisma } from "../lib/prisma.js";
import { ErrorConflicto } from "./empleadosService.js";
import type { registroSchema } from "../validation/empresa.js";
import type { registroIndividualSchema } from "../validation/liquidacion.js";
import type { z } from "zod";
import type { AuthError } from "@supabase/supabase-js";

// Supabase reporta el correo duplicado con code "email_exists" (createUser)
// o "user_already_exists" (inviteUserByEmail) — mensaje raw en inglés, sin
// distinguirlo de otros fallos. Lo traducimos a un conflicto explícito.
export function esCorreoDuplicado(error: AuthError | null): boolean {
  return error?.code === "email_exists" || error?.code === "user_already_exists";
}

// Crea el usuario en Supabase Auth + la Empresa + el perfil Usuario
// (rol admin_empresa) — si algo falla a mitad de camino, se revierte lo ya
// creado para no dejar registros huérfanos (SDD.md §09 POST /api/auth/registro).
export async function registrarEmpresa(datos: z.infer<typeof registroSchema>) {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: datos.email,
    password: datos.password,
    email_confirm: true,
  });
  if (esCorreoDuplicado(authError)) {
    throw new ErrorConflicto("Ya existe una cuenta con este correo. Inicia sesión en vez de registrarte.");
  }
  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "No se pudo crear el usuario");
  }

  try {
    const empresa = await prisma.empresa.create({
      data: { ...datos.empresa, origen: datos.origen ?? null },
    });
    const usuario = await prisma.usuario.create({
      data: {
        id: authData.user.id,
        nombre: datos.nombre,
        email: datos.email,
        rol: "admin_empresa",
        empresaId: empresa.id,
      },
    });
    return { usuario, empresa };
  } catch (err) {
    // Compensación: la creación en Postgres falló (p. ej. NIT duplicado) —
    // no dejamos un usuario de Auth sin perfil de dominio.
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw err;
  }
}

// Registro de una cuenta individual (verificador anónimo → "guardar mi
// liquidación"). Crea el usuario en Supabase Auth con email_confirm=true para
// que el cliente pueda iniciar sesión de inmediato (sin correo de confirmación)
// y el guardado diferido se dispare al toque. No crea Empresa.
export async function registrarIndividual(datos: z.infer<typeof registroIndividualSchema>) {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: datos.email,
    password: datos.password,
    email_confirm: true,
  });
  if (esCorreoDuplicado(authError)) {
    throw new ErrorConflicto("Ya existe una cuenta con este correo. Inicia sesión en vez de registrarte.");
  }
  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "No se pudo crear el usuario");
  }

  try {
    return await prisma.usuario.create({
      data: { id: authData.user.id, nombre: datos.nombre, email: datos.email, rol: "individual", empresaId: null },
    });
  } catch (err) {
    // Compensación: no dejamos un usuario de Auth sin perfil de dominio.
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw err;
  }
}

// Login con OAuth (Google): Supabase Auth crea el usuario directamente en el
// redirect, sin pasar por registrarIndividual — no hay perfil Usuario
// todavía. Se llama tras el primer login exitoso (idempotente: si el perfil
// ya existe, para cualquier rol, se devuelve tal cual sin tocarlo).
export async function asegurarPerfilIndividual(authUserId: string, email: string | undefined, nombreFallback: string) {
  const existente = await prisma.usuario.findUnique({ where: { id: authUserId } });
  if (existente) return existente;

  return prisma.usuario.create({
    data: { id: authUserId, nombre: nombreFallback, email: email ?? null, rol: "individual", empresaId: null },
  });
}

export type ResultadoInvitacion =
  // Cuenta nueva: se creó vía correo de Supabase y quedó unida (sin paso de aceptar).
  | { estado: "correo_enviado" }
  // Cuenta existente y libre: vínculo pendiente, le aparece como notificación in-app.
  | { estado: "pendiente_en_app" };

// Vincula un Empleado con una cuenta por correo (SDD.md §08). Tres caminos:
//   - correo sin cuenta  → invitación nativa de Supabase + vínculo aceptado (unido).
//   - cuenta existente libre → vínculo PENDIENTE (notificación in-app, la acepta el colaborador).
//   - cuenta existente ya activa en otra empresa → se bloquea (409).
// `empresaId` es OBLIGATORIO y entra en el `where`, no se comprueba después.
// Hasta el 2026-08-05 esta era la ÚNICA operación sobre empleados sin scoping
// por empresa — actualizar, eliminar, retirar y liquidar ya iban todas por
// `req.usuario.empresaId`. El agujero era real: un admin_empresa de A, con el
// id de un empleado de B, dejaba una cuenta elegida por él como colaborador de
// B en una sola petición (la rama de correo nuevo acepta la invitación
// implícitamente), y esa cuenta leía la nómina de B. Se encontró escribiendo
// las pruebas del servicio, no en un incidente — por eso el guard vive acá y
// no en el controller: el scoping que depende de que cada llamador se acuerde
// ya falló una vez.
// `usuarioId` es el ADMIN que invita, y viaja hasta acá solo para que el
// trigger de auditoría pueda nombrarlo: `Empleado` está vigilado (SDD §15,
// pilar 1B) y sin `conAuditoria` el cambio queda registrado con
// `usuarioId = NULL`. Quedaba constancia de que a alguien lo invitaron y
// ninguna de quién lo invitó — que es justo lo que se le pregunta a una
// auditoría cuando aparece una cuenta que no debería estar.
export async function invitarColaborador(
  empleadoId: number,
  email: string,
  empresaId: number,
  usuarioId: string
): Promise<ResultadoInvitacion> {
  const empleado = await prisma.empleado.findFirst({ where: { id: empleadoId, empresaId } });
  if (!empleado) throw new Error("Empleado no encontrado");
  if (empleado.usuarioId) throw new Error("Este empleado ya tiene una cuenta vinculada");

  const cuenta = await prisma.usuario.findUnique({ where: { email } });

  if (cuenta) {
    // ¿Ya tiene una membresía activa aceptada en otra empresa? → bloquear.
    const activa = await prisma.empleado.findFirst({
      where: { usuarioId: cuenta.id, activo: true, invitacionAceptadaEn: { not: null } },
    });
    if (activa) {
      throw new ErrorConflicto(
        "Este correo ya pertenece a otra empresa activa en NomiCheck. La persona debe retirarse de ella antes de unirse a otra."
      );
    }
    // Cuenta libre: vínculo pendiente, sin correo — le llega como notificación.
    await conAuditoria(usuarioId, (tx) =>
      tx.empleado.update({
        where: { id: empleadoId },
        data: { usuarioId: cuenta.id, invitacionAceptadaEn: null },
      })
    );
    return { estado: "pendiente_en_app" };
  }

  // Sin cuenta: invitación nativa de Supabase (define su contraseña por correo) y
  // queda unido de una (aceptación implícita — decisión del usuario para cuentas nuevas).
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (esCorreoDuplicado(error)) {
    // Existe en Auth pero no en nuestra tabla (cuenta huérfana): tratamos como conflicto.
    throw new ErrorConflicto("Este correo ya tiene una cuenta en NomiCheck. Verifica que sea la persona correcta.");
  }
  if (error || !data.user) {
    throw new Error(error?.message ?? "No se pudo enviar la invitación");
  }

  await prisma.usuario.create({
    data: { id: data.user.id, nombre: empleado.nombre, email, rol: "colaborador", empresaId: empleado.empresaId },
  });
  // La otra rama de la invitación —cuenta nueva creada en Auth— escribe el
  // mismo `Empleado` vigilado, así que necesita el mismo wrapper. Arreglar solo
  // la primera habría dejado el rastro sin actor justo en el camino más común:
  // invitar a alguien que todavía no tiene cuenta.
  await conAuditoria(usuarioId, (tx) =>
    tx.empleado.update({
      where: { id: empleadoId },
      data: { usuarioId: data.user.id, invitacionAceptadaEn: new Date() },
    })
  );

  return { estado: "correo_enviado" };
}

// Onboarding manual por admin_plataforma: crea la Empresa y le manda al
// primer admin_empresa una invitación nativa de Supabase (define su propia
// contraseña por correo — a diferencia de registrarEmpresa, aquí quien crea
// la cuenta NO es la misma persona que va a usarla, así que no tiene
// sentido pedirle una contraseña de una vez). Compensa hacia atrás si algo
// falla a mitad de camino (mismo criterio que registrarEmpresa/invitarColaborador).
export async function crearEmpresaConAdmin(datos: {
  empresa: { nombre: string; nit: string; sector: string };
  nombreAdmin: string;
  emailAdmin: string;
}) {
  const empresa = await prisma.empresa.create({ data: datos.empresa });

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(datos.emailAdmin);
  if (esCorreoDuplicado(error)) {
    await prisma.empresa.delete({ where: { id: empresa.id } });
    throw new ErrorConflicto("Ya existe una cuenta con este correo. Verifica que sea la persona correcta.");
  }
  if (error || !data.user) {
    await prisma.empresa.delete({ where: { id: empresa.id } });
    throw new Error(error?.message ?? "No se pudo enviar la invitación");
  }

  try {
    const usuario = await prisma.usuario.create({
      data: { id: data.user.id, nombre: datos.nombreAdmin, email: datos.emailAdmin, rol: "admin_empresa", empresaId: empresa.id },
    });
    return { empresa, usuario };
  } catch (err) {
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    await prisma.empresa.delete({ where: { id: empresa.id } });
    throw err;
  }
}

/** Extraído de `quitarAdminEmpresa` para poder probar LA decisión de scoping
 * sin base de datos. Dos propiedades que no se negocian:
 *
 *  1. Allowlist estricta de rol: solo `admin_empresa`. Cualquier otro rol
 *     —incluido uno que se agregue en el futuro— cae en `false`. No es una
 *     denylist de roles conocidos.
 *  2. Pertenencia a ESA empresa, con `===`: un admin_empresa de la empresa 1
 *     no es admin de la 2 aunque el rol alcance.
 *
 * El guard de `empresaId` no estaba en el original: sin él,
 * `usuario.empresaId === empresaId` da `true` cuando ambos son `undefined`
 * (el patrón `nil == nil` que ya causó un fail-open en este repo) y el
 * predicado deja pasar a un no-admin. Hoy el único llamador pasa
 * `Number(req.params.id)` —NaN en el peor caso, que ya fallaba cerrado—, así
 * que ninguna ruta alcanzable cambia de comportamiento: solo se cierra el
 * caso que los tipos declaran imposible.
 */
export function esAdminDeEmpresa(
  usuario: { rol?: string | null; empresaId?: number | null } | null | undefined,
  empresaId: number
): boolean {
  if (!usuario) return false;
  if (typeof empresaId !== "number" || !Number.isFinite(empresaId)) return false;
  return usuario.rol === "admin_empresa" && usuario.empresaId === empresaId;
}

// Desvincula al admin_empresa indicado (NO borra su cuenta ni su fila
// Usuario — solo pierde el rol operativo y el empresaId, queda como
// "individual", igual que cualquier cuenta sin empresa). Reversible: se
// puede volver a invitar/asignar más adelante. Valida que el usuario
// realmente sea admin_empresa DE ESA empresa antes de tocar nada, para que
// un admin_plataforma no pueda desvincular por error (o URL manipulada) a
// alguien de otra empresa.
export async function quitarAdminEmpresa(empresaId: number, usuarioId: string): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!esAdminDeEmpresa(usuario, empresaId)) {
    throw new Error("Ese usuario no es el admin_empresa de esta empresa");
  }
  await prisma.usuario.update({ where: { id: usuarioId }, data: { rol: "individual", empresaId: null } });
}

// Reasignar = reemplazar: invita a un admin_empresa nuevo y desvincula a
// cualquier admin_empresa actual de esta empresa (mismo efecto que
// quitarAdminEmpresa) — la empresa nunca queda con más de un admin_empresa
// a la vez. Se crea primero el reemplazo y solo después se desvincula al
// anterior: si la invitación o la creación fallan, el admin actual queda
// intacto (nada que compensar); si falla después de crear el reemplazo, sí
// se compensa borrando la cuenta de Auth recién invitada.
export async function reasignarAdminEmpresa(
  empresaId: number,
  datos: { nombreAdmin: string; emailAdmin: string }
) {
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) throw new Error("Empresa no encontrada");

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(datos.emailAdmin);
  if (esCorreoDuplicado(error)) {
    throw new ErrorConflicto("Ya existe una cuenta con este correo. Verifica que sea la persona correcta.");
  }
  if (error || !data.user) {
    throw new Error(error?.message ?? "No se pudo enviar la invitación");
  }

  try {
    const usuario = await prisma.usuario.create({
      data: {
        id: data.user.id,
        nombre: datos.nombreAdmin,
        email: datos.emailAdmin,
        rol: "admin_empresa",
        empresaId,
      },
    });
    await prisma.usuario.updateMany({
      where: { empresaId, rol: "admin_empresa", NOT: { id: usuario.id } },
      data: { rol: "individual", empresaId: null },
    });
    return usuario;
  } catch (err) {
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    throw err;
  }
}
