import { conAuditoria } from "../lib/auditoria.js";
import { otorgarMembresia, revocarMembresia } from "../lib/membresias.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { prisma } from "../lib/prisma.js";
import { registro } from "../lib/registro.js";
import { esTablaSinMigrar } from "../middleware/auth.js";
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

// Crea el usuario en Supabase Auth + la Empresa + el perfil Usuario + LA
// MEMBRESÍA (rol admin_empresa) — si algo falla a mitad de camino, se revierte
// lo ya creado para no dejar registros huérfanos (SDD.md §09 POST /api/auth/registro).
//
// La membresía NO es un extra: `requiereAuth` saca el rol efectivo de ella y un
// puntero sin membresía es 403 en TODOS los endpoints —`whoami` incluido, o sea
// que el portal ni puede resolver a dónde mandar a la persona, e incluido el
// propio `POST /auth/empresa-activa` que sería el camino de vuelta—. Sin esta
// escritura, registrarse en NomiCheck deja de funcionar el minuto en que se
// aplica la migración de `MembresiaEmpresa`: la cuenta nace encerrada.
//
// Las tres escrituras van en UNA transacción, y es `conAuditoria` y no
// `$transaction` pelado: `Empresa` y `Usuario` están vigilados por
// `fn_auditar_cambio`, que lee el autor de `app.usuario_actual`. El autor acá
// es la cuenta recién creada —en un registro no hay nadie más: la persona se
// dio de alta a sí misma—, así que el alta queda firmada en vez de con
// `usuarioId = NULL`. El id se saca de Auth ANTES de entrar al closure porque
// el estrechamiento de `authData.user` no sobrevive a la función de adentro.
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
  const authUserId = authData.user.id;

  try {
    return await conAuditoria(authUserId, async (tx) => {
      const empresa = await tx.empresa.create({
        data: { ...datos.empresa, origen: datos.origen ?? null },
      });
      const usuario = await tx.usuario.create({
        data: {
          id: authUserId,
          nombre: datos.nombre,
          email: datos.email,
          rol: "admin_empresa",
          empresaId: empresa.id,
        },
      });
      await otorgarMembresia(tx, { usuarioId: usuario.id, empresaId: empresa.id, rol: "admin_empresa" });
      return { usuario, empresa };
    });
  } catch (err) {
    // Compensación: la creación en Postgres falló (p. ej. NIT duplicado) —
    // no dejamos un usuario de Auth sin perfil de dominio. La Empresa ya no
    // hace falta compensarla a mano: entró en la misma transacción que el
    // perfil, así que un fallo la revierte sola (antes quedaba huérfana).
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
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

export interface EmpresaDeLaCuenta {
  id: number;
  nombre: string;
  /** El rol EN ESA empresa, no el de la cuenta: la misma persona puede ser
   * admin_empresa en una y auditor en otra. */
  rol: string;
}

/**
 * A qué empresas pertenece esta cuenta y con qué rol en cada una — lo que
 * dibuja el selector del header y lo que `whoami` devuelve.
 *
 * Degrada igual que `requiereAuth` si la migración de `MembresiaEmpresa` no
 * corrió: devuelve la lista VACÍA y lo dice en el log, en vez de reventar. Un
 * 500 acá tumbaría el login entero (todos los portales llaman a `whoami` para
 * saber a dónde ir), y la lista vacía es exactamente lo que había antes de que
 * existieran las membresías: una cuenta, una empresa, sin selector.
 */
export async function empresasDeUsuario(usuarioId: string): Promise<EmpresaDeLaCuenta[]> {
  try {
    const filas = await prisma.membresiaEmpresa.findMany({
      where: { usuarioId },
      select: { rol: true, empresa: { select: { id: true, nombre: true } } },
      // Por nombre: el selector es una lista que la persona lee, y el orden de
      // inserción no significa nada para ella.
      orderBy: { empresa: { nombre: "asc" } },
    });
    return filas.map((m) => ({ id: m.empresa.id, nombre: m.empresa.nombre, rol: m.rol }));
  } catch (err) {
    if (esTablaSinMigrar(err)) {
      registro.warn("auth", "MembresiaEmpresa no existe todavía: whoami devuelve la cuenta sin empresas", {
        codigo: (err as { code?: unknown }).code,
      });
      return [];
    }
    throw err;
  }
}

export type ResultadoCambioEmpresa =
  // El puntero se movió: `Usuario.empresaId` ya apunta a esta empresa y el
  // próximo request se resuelve con este rol.
  | { estado: "ok"; empresaId: number; rol: string }
  // No hay membresía para el par (cuenta, empresa). Es el MISMO resultado que
  // para una empresa que no existe, y a propósito: la respuesta no puede ser
  // un oráculo que confirme qué ids de empresa hay en la plataforma.
  | { estado: "sin_membresia" }
  // Es miembro, pero la empresa está suspendida.
  | { estado: "suspendida" };

/**
 * Cambiar de empresa activa sin re-login (SDD §15 — paso 5).
 *
 * Tres cosas que no se negocian:
 *
 *  1. El `empresaId` del body NUNCA llega a `Usuario.empresaId` sin pasar por
 *     `MembresiaEmpresa`. Sin esa consulta, este endpoint sería "elegí de qué
 *     empresa querés ser admin": el puntero es lo que `requiereAuth` usa para
 *     resolver el rol de cada request.
 *  2. La consulta es por el PAR (usuarioId, empresaId) — la PK de la tabla. Ni
 *     por empresa sola (autorizaría a cualquiera) ni por usuario y un filtro
 *     después (la ventana entre las dos operaciones).
 *  3. Se rechaza la empresa suspendida ANTES de mover el puntero. Si el puntero
 *     entrara a una empresa suspendida, `requiereAuth` respondería 403 en cada
 *     request siguiente — incluido el que intentara volver — y la cuenta
 *     quedaría encerrada sin forma de salir por la API.
 *
 * Todo va dentro de `conAuditoria`: `Usuario` está vigilado por el trigger
 * `fn_auditar_cambio` (migración `20260830140000_auditoria_usuario`) y sin el
 * wrapper el cambio quedaría registrado con `usuarioId = NULL` — un salto de
 * empresa sin autor es justo lo que no sirve en una auditoría. Leer la
 * membresía DENTRO de la misma transacción es lo que hace que el par
 * "compruebo y escribo" no tenga hueco.
 */
export async function cambiarEmpresaActiva(
  usuarioId: string,
  empresaId: number
): Promise<ResultadoCambioEmpresa> {
  return conAuditoria(usuarioId, async (tx) => {
    const membresia = await tx.membresiaEmpresa.findUnique({
      where: { usuarioId_empresaId: { usuarioId, empresaId } },
      select: { rol: true, empresa: { select: { activa: true } } },
    });
    if (!membresia) return { estado: "sin_membresia" };
    if (!membresia.empresa.activa) return { estado: "suspendida" };

    await tx.usuario.update({ where: { id: usuarioId }, data: { empresaId } });
    return { estado: "ok", empresaId, rol: membresia.rol };
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
    // Acá NO se otorga membresía a propósito: la invitación todavía no está
    // aceptada y la membresía es la autorización. Otorgarla ahora sería meter a
    // una persona en la empresa sin que ella lo sepa, que es justo lo que
    // `invitacionAceptadaEn: null` existe para impedir. La otorga
    // `aceptarInvitacion` cuando ella acepta.
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

  // La otra rama de la invitación —cuenta nueva creada en Auth— escribe el
  // mismo `Empleado` vigilado, así que necesita el mismo wrapper. Arreglar solo
  // la primera habría dejado el rastro sin actor justo en el camino más común:
  // invitar a alguien que todavía no tiene cuenta.
  //
  // El perfil se crea DENTRO de esa misma transacción, junto con su membresía:
  // esta rama acepta la invitación implícitamente (`invitacionAceptadaEn` con
  // fecha), así que la cuenta queda parada en la empresa desde el primer login
  // — y un puntero sin membresía es 403 en todos los endpoints. Las tres
  // escrituras juntas o ninguna: un commit a medias deja a la persona con
  // acceso a la nómina sin pertenecer, o encerrada sin poder entrar.
  const nuevoUsuarioId = data.user.id;
  await conAuditoria(usuarioId, async (tx) => {
    await tx.usuario.create({
      data: { id: nuevoUsuarioId, nombre: empleado.nombre, email, rol: "colaborador", empresaId: empleado.empresaId },
    });
    await otorgarMembresia(tx, {
      usuarioId: nuevoUsuarioId,
      empresaId: empleado.empresaId,
      rol: "colaborador",
    });
    await tx.empleado.update({
      where: { id: empleadoId },
      data: { usuarioId: nuevoUsuarioId, invitacionAceptadaEn: new Date() },
    });
  });

  return { estado: "correo_enviado" };
}

// Onboarding manual por admin_plataforma: crea la Empresa y le manda al
// primer admin_empresa una invitación nativa de Supabase (define su propia
// contraseña por correo — a diferencia de registrarEmpresa, aquí quien crea
// la cuenta NO es la misma persona que va a usarla, así que no tiene
// sentido pedirle una contraseña de una vez). Compensa hacia atrás si algo
// falla a mitad de camino (mismo criterio que registrarEmpresa/invitarColaborador).
//
// El perfil y su membresía van juntos, por la misma razón que en el registro:
// la cuenta que nace con puntero y sin membresía nace en 403 permanente.
//
// `actorId` es el admin_plataforma que hace el onboarding, y viaja hasta acá
// solo para que el trigger pueda nombrarlo (mismo motivo y misma forma que el
// `usuarioId` de `invitarColaborador`). `empresasAdminController` lo pasa
// siempre; queda opcional para los llamadores de dentro del repo que no tienen
// actor (semilla, scripts), donde `null` deja el rastro sin autor en vez de
// romper. Nunca se usa para decidir nada.
export async function crearEmpresaConAdmin(
  datos: {
    empresa: { nombre: string; nit: string; sector: string };
    nombreAdmin: string;
    emailAdmin: string;
  },
  actorId?: string | null
) {
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

  const nuevoAdminId = data.user.id;
  try {
    const usuario = await conAuditoria(actorId ?? null, async (tx) => {
      const creado = await tx.usuario.create({
        data: { id: nuevoAdminId, nombre: datos.nombreAdmin, email: datos.emailAdmin, rol: "admin_empresa", empresaId: empresa.id },
      });
      await otorgarMembresia(tx, { usuarioId: creado.id, empresaId: empresa.id, rol: "admin_empresa" });
      return creado;
    });
    return { empresa, usuario };
  } catch (err) {
    await supabaseAdmin.auth.admin.deleteUser(nuevoAdminId);
    await prisma.empresa.delete({ where: { id: empresa.id } });
    throw err;
  }
}

/** El id de empresa llega de la URL (`Number(req.params.id)`): "abc" entra como
 * NaN, y un `undefined` sobrevive a los tipos si algún llamador futuro se
 * saltea la validación. Se comprueba ANTES de consultar —para que un id basura
 * falle cerrado sin llegar a la base ni devolver el error crudo de Prisma— y
 * otra vez dentro del predicado, que es donde vive la comparación. */
function esIdDeEmpresa(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

/** El mismo mensaje para las tres razones de rechazo —no hay membresía, la
 * membresía no es de admin, el id no es un id— a propósito: la respuesta no
 * puede decirle a quien sondea la ruta cuál de las tres fue. */
const NO_ES_ADMIN = "Ese usuario no es el admin_empresa de esta empresa";

/** Extraído de `quitarAdminEmpresa` para poder probar LA decisión de scoping
 * sin base de datos. Dos propiedades que no se negocian:
 *
 *  1. Allowlist estricta de rol: solo `admin_empresa`. Cualquier otro rol
 *     —incluido uno que se agregue en el futuro— cae en `false`. No es una
 *     denylist de roles conocidos.
 *  2. Pertenencia a ESA empresa, con `===`: un admin_empresa de la empresa 1
 *     no es admin de la 2 aunque el rol alcance.
 *
 * A QUIÉN SE LE PREGUNTA CAMBIÓ: el argumento es la MEMBRESÍA del par (cuenta,
 * empresa), no la fila `Usuario`. Mirando `Usuario.rol` y `Usuario.empresaId`
 * —el rol de cuenta y el puntero, los dos GLOBALES— el predicado se equivocaba
 * en los dos sentidos en cuanto una cuenta pertenece a dos empresas: el
 * admin_empresa de la 3 que está parado en la 9 no era admin de ninguna para
 * esta función (inextirpable: nadie podía quitarlo de la 3, y él volvía cuando
 * quisiera), y una cuenta con el puntero en la 3 pero sin membresía sí lo era.
 * El rol efectivo de cada request sale de la membresía (`requiereAuth`);
 * preguntarle a otra columna era preguntarle a un dato que ya no manda.
 *
 * El guard de `empresaId` no estaba en el original: sin él,
 * `membresia.empresaId === empresaId` da `true` cuando ambos son `undefined`
 * (el patrón `nil == nil` que ya causó un fail-open en este repo) y el
 * predicado deja pasar a un no-admin.
 */
export function esAdminDeEmpresa(
  membresia: { rol?: string | null; empresaId?: number | null } | null | undefined,
  empresaId: number
): boolean {
  if (!membresia) return false;
  if (!esIdDeEmpresa(empresaId)) return false;
  return membresia.rol === "admin_empresa" && membresia.empresaId === empresaId;
}

// Desvincula al admin_empresa indicado (NO borra su cuenta ni su fila
// Usuario — solo pierde la pertenencia a esta empresa). Reversible: se
// puede volver a invitar/asignar más adelante. Valida contra la MEMBRESÍA que
// el usuario realmente sea admin_empresa DE ESA empresa antes de tocar nada,
// para que un admin_plataforma no pueda desvincular por error (o URL
// manipulada) a alguien de otra empresa.
//
// LO QUE SE BORRA ES LA MEMBRESÍA, no el puntero. Poner `rol = "individual",
// empresaId = null` y dejar viva la fila de `MembresiaEmpresa` no era una baja:
// `whoami` le seguía ofreciendo la empresa con el rol que había perdido, y un
// solo `POST /auth/empresa-activa` —la única ruta privada sin guarda de
// permiso, a propósito— se lo devolvía. Un admin degradado se re-promovía a
// `admin_empresa` con un request, o sea que ni el admin_plataforma podía
// desalojarlo. `revocarMembresia` borra la autorización y reapunta el puntero
// (a otra empresa suya que esté activa, o a null) en la misma transacción.
//
// `actorId` es el admin_plataforma que ejecuta la baja: `Usuario` está vigilado
// por `fn_auditar_cambio` y sin él el rastro queda con `usuarioId = NULL` —
// constancia de que a alguien lo sacaron y ninguna de quién lo sacó. El
// controlador lo pasa siempre; sigue siendo opcional por la misma razón que en
// `crearEmpresaConAdmin`. Nunca se usa para decidir nada.
export async function quitarAdminEmpresa(
  empresaId: number,
  usuarioId: string,
  actorId?: string | null
): Promise<void> {
  // Id de URL basura: falla cerrado sin abrir transacción y sin consultar.
  if (!esIdDeEmpresa(empresaId)) throw new Error(NO_ES_ADMIN);

  await conAuditoria(actorId ?? null, async (tx) => {
    // Por la PK del par, dentro de la misma transacción que la baja: es la
    // consulta que no deja ventana entre comprobar y escribir.
    const membresia = await tx.membresiaEmpresa.findUnique({
      where: { usuarioId_empresaId: { usuarioId, empresaId } },
      select: { rol: true, empresaId: true },
    });
    if (!esAdminDeEmpresa(membresia, empresaId)) throw new Error(NO_ES_ADMIN);

    await revocarMembresia(tx, { usuarioId, empresaId });
  });
}

// Reasignar = reemplazar: invita a un admin_empresa nuevo y desvincula a
// cualquier admin_empresa actual de esta empresa (mismo efecto que
// quitarAdminEmpresa) — la empresa nunca queda con más de un admin_empresa
// a la vez. Se crea primero el reemplazo y solo después se desvincula al
// anterior: si la invitación o la creación fallan, el admin actual queda
// intacto (nada que compensar); si falla después de crear el reemplazo, sí
// se compensa borrando la cuenta de Auth recién invitada.
//
// A los anteriores se los busca por MEMBRESÍA de esta empresa, no por
// `Usuario.empresaId + Usuario.rol`. El `updateMany` de antes fallaba de las
// dos maneras: al admin parado en otra empresa suya no lo alcanzaba (seguía
// siendo admin de esta para siempre), y al que sí degradaba le dejaba la
// membresía viva, con lo cual volvía a `admin_empresa` con un solo
// `POST /auth/empresa-activa`. La reasignación no reasignaba nada.
export async function reasignarAdminEmpresa(
  empresaId: number,
  datos: { nombreAdmin: string; emailAdmin: string },
  actorId?: string | null
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

  const nuevoAdminId = data.user.id;
  try {
    return await conAuditoria(actorId ?? null, async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          id: nuevoAdminId,
          nombre: datos.nombreAdmin,
          email: datos.emailAdmin,
          rol: "admin_empresa",
          empresaId,
        },
      });
      await otorgarMembresia(tx, { usuarioId: usuario.id, empresaId, rol: "admin_empresa" });

      // Las dos condiciones del `where` son de seguridad, no de estilo:
      //   - sin `empresaId`, esto revocaría a los admins de TODAS las empresas
      //     del sistema en una sola petición;
      //   - sin el `NOT`, el reemplazo se revocaría a sí mismo y la empresa
      //     quedaría sin nadie que pueda invitar ni liquidar.
      const anteriores = await tx.membresiaEmpresa.findMany({
        where: { empresaId, rol: "admin_empresa", NOT: { usuarioId: usuario.id } },
        select: { usuarioId: true },
      });
      // De a uno y no con un `deleteMany`: cada baja tiene que reapuntar el
      // puntero de ESA persona a otra empresa suya que esté activa (o a null),
      // y eso depende de las membresías que le queden a cada una.
      for (const anterior of anteriores) {
        await revocarMembresia(tx, { usuarioId: anterior.usuarioId, empresaId });
      }
      return usuario;
    });
  } catch (err) {
    await supabaseAdmin.auth.admin.deleteUser(nuevoAdminId);
    throw err;
  }
}
