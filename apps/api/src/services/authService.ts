import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { prisma } from "../lib/prisma.js";
import type { registroSchema } from "../validation/empresa.js";
import type { z } from "zod";

// Crea el usuario en Supabase Auth + la Empresa + el perfil Usuario
// (rol admin_empresa) — si algo falla a mitad de camino, se revierte lo ya
// creado para no dejar registros huérfanos (SDD.md §09 POST /api/auth/registro).
export async function registrarEmpresa(datos: z.infer<typeof registroSchema>) {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: datos.email,
    password: datos.password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "No se pudo crear el usuario");
  }

  try {
    const empresa = await prisma.empresa.create({ data: datos.empresa });
    const usuario = await prisma.usuario.create({
      data: {
        id: authData.user.id,
        nombre: datos.nombre,
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

// Genera la invitación nativa de Supabase Auth ligada a un Empleado — el
// colaborador define su propia contraseña al aceptar (SDD.md §08).
export async function invitarColaborador(empleadoId: number, email: string) {
  const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId } });
  if (!empleado) throw new Error("Empleado no encontrado");
  if (empleado.usuarioId) throw new Error("Este empleado ya tiene una cuenta vinculada");

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (error || !data.user) {
    throw new Error(error?.message ?? "No se pudo enviar la invitación");
  }

  await prisma.usuario.create({
    data: { id: data.user.id, nombre: empleado.nombre, rol: "colaborador", empresaId: empleado.empresaId },
  });
  await prisma.empleado.update({ where: { id: empleadoId }, data: { usuarioId: data.user.id } });

  return data.user;
}
