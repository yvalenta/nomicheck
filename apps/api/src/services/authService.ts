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
function esCorreoDuplicado(error: AuthError | null): boolean {
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
    const empresa = await prisma.empresa.create({ data: datos.empresa });
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
export async function invitarColaborador(empleadoId: number, email: string): Promise<ResultadoInvitacion> {
  const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId } });
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
    await prisma.empleado.update({
      where: { id: empleadoId },
      data: { usuarioId: cuenta.id, invitacionAceptadaEn: null },
    });
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
  await prisma.empleado.update({
    where: { id: empleadoId },
    data: { usuarioId: data.user.id, invitacionAceptadaEn: new Date() },
  });

  return { estado: "correo_enviado" };
}
