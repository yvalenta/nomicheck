// Seed de empresas reales + admin + trabajadores, con cuentas de acceso.
//
// Corre DENTRO del contenedor de producción (tiene el env y los node_modules):
//
//   scp apps/api/prisma/seedEmpresas.mjs ynt@18.191.129.33:/tmp/
//   ssh ynt@18.191.129.33 'docker cp /tmp/seedEmpresas.mjs nomicheck-api:/app/ \
//     && docker exec -w /app nomicheck-api node seedEmpresas.mjs; \
//     docker exec -u root nomicheck-api rm -f /app/seedEmpresas.mjs; rm -f /tmp/seedEmpresas.mjs'
//
// Las CONTRASEÑAS se generan acá en runtime y se imprimen UNA vez, en la
// terminal de quien lo corre — no viven en este archivo ni en ningún repo.
// Idempotente sin sorpresas: empresa existente (por NIT) se reutiliza; correo
// ya registrado en Auth se salta con aviso y NO se le cambia la contraseña.
// No borra nada, nunca.
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

// ── EDITAR: los datos reales van acá ────────────────────────────────────────
// NITs PROVISIONALES (prefijo PROV-): reemplazar por los reales cuando estén
// — se corrige con un UPDATE sobre Empresa.nit, nada más los referencia.
const EMPRESAS = [
  {
    nombre: "Advance Fitness",
    nit: "PROV-900100001",
    sector: "servicios",
    admin: { nombre: "Yonatan Valencia", email: "megaplex.med+advance@gmail.com" },
    empleados: [
      // nombres aleatorios — editables; documento es único por empresa
      { nombre: "Laura Cardona Pineda", documento: "PROV-1030000001",
        email: "megaplex.med+laura@gmail.com", salarioBase: 1_623_500,
        tipoNomina: "fijo", auxilioTransporte: true, fechaIngreso: "2026-01-01" },
    ],
  },
  {
    nombre: "Resplandor",
    nit: "PROV-900100002",
    sector: "tecnologia",
    // El correo pelado de Google: entra como admin con el botón de Google, sin contraseña
    admin: { nombre: "Yonatan Valencia", email: "megaplex.med@gmail.com" },
    empleados: [
      { nombre: "Andrés Zapata Gil", documento: "PROV-1030000002",
        email: "megaplex.med+andres@gmail.com", salarioBase: 1_623_500,
        tipoNomina: "fijo", auxilioTransporte: true, fechaIngreso: "2026-01-01" },
      { nombre: "Mariana Torres Vélez", documento: "PROV-1030000003",
        email: "megaplex.med+mariana@gmail.com", salarioBase: 1_623_500,
        tipoNomina: "fijo", auxilioTransporte: true, fechaIngreso: "2026-01-01" },
    ],
  },
  // Dimensión Funji — POR CONFIRMAR: descomentar y completar cuando haya datos.
  // {
  //   nombre: "Dimensión Funji",
  //   nit: "EDITAR",
  //   sector: "EDITAR",
  //   admin: { nombre: "EDITAR", email: "EDITAR" },
  //   empleados: [],
  // },
];
// ────────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const credenciales = [];

function contrasena() {
  // 16 caracteres URL-safe: suficiente entropía y se puede tipear
  return randomBytes(12).toString("base64url");
}

async function cuenta(email, nombre) {
  const pass = contrasena();
  const { data, error } = await supabase.auth.admin.createUser({
    email, password: pass, email_confirm: true, user_metadata: { nombre },
  });
  if (error) {
    // Correo ya registrado (p. ej. una cuenta nacida por login con Google):
    // se reutiliza y NO se toca su contraseña — el perfil se crea igual.
    const yaExiste = /already|exists|registered/i.test(error.message);
    if (!yaExiste) throw new Error(`Auth ${email}: ${error.message}`);
    const { data: lista, error: e2 } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (e2) throw new Error(`Auth listUsers: ${e2.message}`);
    const u = lista.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (!u) throw new Error(`${email}: Auth dice que existe pero no aparece al listar`);
    console.log(`  ~ ${email} ya tenía cuenta; contraseña sin cambios (o entra con Google)`);
    return { id: u.id, pass: "(la que ya tenía / Google)" };
  }
  return { id: data.user.id, pass };
}

// La PERTENENCIA. `Usuario.empresaId` de acá abajo es solo el puntero a la
// empresa activa: quien manda es esta fila, y `requiereAuth` saca de ella el rol
// con el que resuelve cada request. Sin membresía, un puntero es 403 en TODOS
// los endpoints —`whoami` incluido, y el propio `POST /auth/empresa-activa` que
// sería la salida—, así que una semilla sin esto no deja un entorno a medias:
// deja uno donde ninguna de las cuentas que acaba de imprimir puede entrar.
//
// Upsert por la PK del par, como todo lo demás en este archivo: correrlo dos
// veces es inocuo y sobre una base que ya tenía la membresía (la creó el
// backfill de `20260830120000_membresia_empresa`) solo confirma el rol.
async function membresia(usuarioId, empresaId, rol) {
  await prisma.membresiaEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId, empresaId } },
    create: { usuarioId, empresaId, rol },
    update: { rol },
  });
}

for (const e of EMPRESAS) {
  const editables = JSON.stringify(e);
  if (editables.includes("EDITAR")) {
    console.log(`SALTADA ${e.nombre}: aún tiene campos EDITAR sin completar`);
    continue;
  }

  const empresa = await prisma.empresa.upsert({
    where: { nit: e.nit },
    create: { nombre: e.nombre, nit: e.nit, sector: e.sector },
    update: {},
  });
  console.log(`Empresa ${empresa.nombre} (id ${empresa.id})`);

  const adm = await cuenta(e.admin.email, e.admin.nombre);
  await prisma.usuario.upsert({
    where: { id: adm.id },
    create: { id: adm.id, nombre: e.admin.nombre, email: e.admin.email,
              rol: "admin_empresa", empresaId: empresa.id },
    update: { rol: "admin_empresa", empresaId: empresa.id },
  });
  await membresia(adm.id, empresa.id, "admin_empresa");
  credenciales.push([e.nombre, "admin_empresa", e.admin.email, adm.pass]);

  for (const t of e.empleados) {
    const cu = await cuenta(t.email, t.nombre);
    await prisma.usuario.upsert({
      where: { id: cu.id },
      create: { id: cu.id, nombre: t.nombre, email: t.email,
                rol: "colaborador", empresaId: empresa.id },
      update: {},
    });
    // Va aunque el `update: {}` de arriba no haya tocado nada: una cuenta que ya
    // existía (p. ej. nacida por login con Google) tiene su puntero puesto y le
    // falta justo esto. El rol de la membresía es el de ESTA empresa; el de la
    // cuenta no se pisa, que es lo que el `update: {}` viene diciendo.
    await membresia(cu.id, empresa.id, "colaborador");
    await prisma.empleado.upsert({
      where: { empresaId_documento: { empresaId: empresa.id, documento: t.documento } },
      create: { empresaId: empresa.id, usuarioId: cu.id, invitacionAceptadaEn: new Date(),
                nombre: t.nombre, documento: t.documento, salarioBase: t.salarioBase,
                tipoNomina: t.tipoNomina, auxilioTransporte: t.auxilioTransporte,
                fechaIngreso: t.fechaIngreso },
      update: { usuarioId: cu.id, invitacionAceptadaEn: new Date() },
    });
    credenciales.push([e.nombre, "colaborador", t.email, cu.pass]);
  }
}

console.log("\n=== CREDENCIALES (única vez que se imprimen — guardalas ya) ===");
for (const [emp, rol, email, pass] of credenciales) {
  console.log(`${emp.padEnd(18)} ${rol.padEnd(14)} ${email.padEnd(40)} ${pass}`);
}
console.log("\nEntrada: https://nomicheck.ynt.codes/empresa (admins) · /colaborador (trabajadores)");

await prisma.$disconnect();
