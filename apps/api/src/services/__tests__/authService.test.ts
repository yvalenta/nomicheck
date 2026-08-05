// Tests de `authService.ts` — el servicio que crea cuentas, las vincula a una
// empresa y reparte roles. Su modo de falla NO es una excepción: es dejar
// entrar a quien no debe, o dejar que alguien de la empresa A alcance datos de
// la B. Por eso el peso está en los casos negativos.
//
// NINGUNA PRUEBA TOCA LA BASE NI SUPABASE. `vitest.config.ts` dice que esta
// suite es "solo tests de módulos PUROS (sin BD/HTTP)", y el 2026-07-29 se
// descubrió que diez tests de `batchPublicoService` lo violaban en silencio
// (en local siempre había un `.env` a mano). El corte va en los dos clientes
// impuros —`lib/prisma.js` y `lib/supabaseAdmin.js`—, igual que allá.
//
// El corte en `supabaseAdmin` además es obligatorio: el módulo real hace
// `createClient(process.env.SUPABASE_URL!, ...)` en el import y explota con
// "supabaseUrl is required" sin variables. Que esta suite pase con
// `env -u DATABASE_URL` es parte del criterio de terminado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthError } from "@supabase/supabase-js";

const { prismaMock, authAdminMock } = vi.hoisted(() => ({
  prismaMock: {
    usuario: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    empleado: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    empresa: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  },
  authAdminMock: { createUser: vi.fn(), deleteUser: vi.fn(), inviteUserByEmail: vi.fn() },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../../lib/supabaseAdmin.js", () => ({ supabaseAdmin: { auth: { admin: authAdminMock } } }));

import {
  asegurarPerfilIndividual,
  crearEmpresaConAdmin,
  esAdminDeEmpresa,
  esCorreoDuplicado,
  invitarColaborador,
  quitarAdminEmpresa,
  reasignarAdminEmpresa,
  registrarEmpresa,
  registrarIndividual,
} from "../authService.js";
import { ErrorConflicto } from "../empleadosService.js";

// --- fixtures -------------------------------------------------------------

const EMPRESA_A = 1;
const EMPRESA_B = 2;
const UID_NUEVO = "11111111-1111-4111-8111-111111111111";
const UID_AJENO = "22222222-2222-4222-8222-222222222222";

/** Un AuthError de Supabase tiene más campos de los que el servicio mira; solo
 * el `code` decide, así que el resto es relleno honesto. */
function errorAuth(code: string | undefined, message = "boom"): AuthError {
  return { name: "AuthApiError", message, status: 422, code } as unknown as AuthError;
}

function empleadoFixture(over: Record<string, unknown> = {}) {
  return {
    id: 500,
    empresaId: EMPRESA_A,
    usuarioId: null,
    invitacionAceptadaEn: null,
    nombre: "Ana Empleada",
    documento: "1000000001",
    activo: true,
    ...over,
  };
}

function usuarioFixture(over: Record<string, unknown> = {}) {
  return {
    id: UID_AJENO,
    nombre: "Ana Cuenta",
    email: "ana@empresa.com",
    rol: "colaborador",
    empresaId: null,
    ...over,
  };
}

const datosRegistroEmpresa = {
  email: "jefe@acme.com",
  password: "contrasena-larga",
  nombre: "Jefe Acme",
  empresa: { nombre: "Acme", nit: "900123456-7", sector: "servicios" },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults benignos: cada test sobreescribe SOLO lo que le importa, así que
  // un camino que no debería ejecutarse queda visible como llamada de más.
  authAdminMock.createUser.mockResolvedValue({ data: { user: { id: UID_NUEVO } }, error: null });
  authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: { id: UID_NUEVO } }, error: null });
  authAdminMock.deleteUser.mockResolvedValue({ data: {}, error: null });
  prismaMock.usuario.findUnique.mockResolvedValue(null);
  prismaMock.usuario.create.mockImplementation(async ({ data }: { data: object }) => data);
  prismaMock.usuario.update.mockImplementation(async ({ data }: { data: object }) => data);
  prismaMock.usuario.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.empleado.findUnique.mockResolvedValue(null);
  prismaMock.empleado.findFirst.mockResolvedValue(null);
  prismaMock.empleado.update.mockImplementation(async ({ data }: { data: object }) => data);
  prismaMock.empresa.create.mockImplementation(async ({ data }: { data: object }) => ({ id: EMPRESA_A, ...data }));
  prismaMock.empresa.findUnique.mockResolvedValue({ id: EMPRESA_A, nombre: "Acme" });
  prismaMock.empresa.delete.mockResolvedValue({ id: EMPRESA_A });
});

// --- esCorreoDuplicado ----------------------------------------------------

describe("esCorreoDuplicado", () => {
  it("reconoce los dos códigos que Supabase usa para el correo repetido", () => {
    // createUser dice "email_exists"; inviteUserByEmail dice
    // "user_already_exists". Son el mismo hecho con dos nombres.
    expect(esCorreoDuplicado(errorAuth("email_exists"))).toBe(true);
    expect(esCorreoDuplicado(errorAuth("user_already_exists"))).toBe(true);
  });

  it("no confunde ausencia de error con duplicado", () => {
    // `error?.code` sobre null da undefined, y undefined nunca es igual a un
    // string. Si esto devolviera true, todo registro exitoso terminaría en 409.
    expect(esCorreoDuplicado(null)).toBe(false);
  });

  it("compara el código completo y exacto: ni mayúsculas, ni prefijos, ni contains", () => {
    // La comparación tiene que seguir siendo `===` sobre el string entero. Un
    // `includes()` o un case-fold "amable" haría que otros errores de Auth se
    // reporten como 409 "ya existe la cuenta", ocultando el fallo real
    // (contraseña débil, rate limit) detrás de un mensaje que invita a
    // "iniciar sesión" con una cuenta que no existe.
    expect(esCorreoDuplicado(errorAuth("EMAIL_EXISTS"))).toBe(false);
    expect(esCorreoDuplicado(errorAuth("email_exists_soft"))).toBe(false);
    expect(esCorreoDuplicado(errorAuth(" email_exists"))).toBe(false);
    expect(esCorreoDuplicado(errorAuth("weak_password"))).toBe(false);
  });

  it("un error sin campo `code` no es duplicado (campo ausente ≠ coincidencia)", () => {
    // El mensaje crudo de Supabase viene en inglés y sí contiene el texto; la
    // decisión no puede apoyarse en él.
    expect(esCorreoDuplicado(errorAuth(undefined, "email_exists"))).toBe(false);
  });
});

// --- registrarEmpresa -----------------------------------------------------

describe("registrarEmpresa", () => {
  it("crea la Empresa y el perfil con rol admin_empresa ligado a ESA empresa", async () => {
    prismaMock.empresa.create.mockResolvedValue({ id: 77, nombre: "Acme" });
    await registrarEmpresa(datosRegistroEmpresa);
    expect(prismaMock.usuario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: UID_NUEVO, rol: "admin_empresa", empresaId: 77 }),
    });
  });

  it("el rol NO se toma del payload: un body con rol admin_plataforma se ignora", async () => {
    // El schema de zod no tiene campo `rol`, pero un objeto extra sobrevive a
    // `safeParse` si algún día se pasa a `.passthrough()`. El rol se escribe
    // literal en el servicio, y esta prueba es la que lo mantiene así: es la
    // diferencia entre registrarse y volverse dueño de la plataforma.
    const conBasura = { ...datosRegistroEmpresa, rol: "admin_plataforma", empresaId: EMPRESA_B };
    await registrarEmpresa(conBasura as unknown as typeof datosRegistroEmpresa);
    const args = prismaMock.usuario.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(args.data.rol).toBe("admin_empresa");
    expect(args.data.empresaId).toBe(EMPRESA_A);
  });

  it("correo ya registrado: 409 y no se crea NADA en Postgres", async () => {
    authAdminMock.createUser.mockResolvedValue({ data: { user: null }, error: errorAuth("email_exists") });
    await expect(registrarEmpresa(datosRegistroEmpresa)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.empresa.create).not.toHaveBeenCalled();
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("otro error de Auth (no duplicado) aborta antes de tocar Postgres", async () => {
    authAdminMock.createUser.mockResolvedValue({ data: { user: null }, error: errorAuth("weak_password") });
    await expect(registrarEmpresa(datosRegistroEmpresa)).rejects.not.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.empresa.create).not.toHaveBeenCalled();
  });

  it("Auth sin error pero SIN usuario: aborta, no crea un perfil con id undefined", async () => {
    // El caso de campo ausente. Si la guarda fuera solo `if (authError)`, esto
    // seguiría de largo y escribiría `id: undefined` en Usuario. Ese perfil
    // no pertenece a nadie —o peor, colisiona con otro— y quien tenga ese id
    // en su JWT hereda la empresa.
    authAdminMock.createUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(registrarEmpresa(datosRegistroEmpresa)).rejects.toThrow("No se pudo crear el usuario");
    expect(prismaMock.empresa.create).not.toHaveBeenCalled();
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("si el perfil falla, compensa borrando la cuenta de Auth recién creada", async () => {
    prismaMock.usuario.create.mockRejectedValue(new Error("NIT duplicado"));
    await expect(registrarEmpresa(datosRegistroEmpresa)).rejects.toThrow("NIT duplicado");
    expect(authAdminMock.deleteUser).toHaveBeenCalledWith(UID_NUEVO);
  });
});

// --- registrarIndividual --------------------------------------------------

describe("registrarIndividual", () => {
  it("siempre rol individual y SIN empresa, aunque el payload traiga otra cosa", async () => {
    // Este endpoint es público y sin autenticar (el verificador anónimo que
    // quiere guardar su liquidación). Si heredara rol o empresaId del body,
    // cualquiera se registraría dentro de la empresa que eligiera.
    const datos = { email: "x@y.com", password: "contrasena-larga", nombre: "X" };
    const sucio = { ...datos, rol: "admin_empresa", empresaId: EMPRESA_B };
    await registrarIndividual(sucio as unknown as typeof datos);
    expect(prismaMock.usuario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: UID_NUEVO, rol: "individual", empresaId: null }),
    });
  });

  it("Auth sin usuario: aborta sin crear perfil", async () => {
    authAdminMock.createUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(
      registrarIndividual({ email: "x@y.com", password: "contrasena-larga", nombre: "X" })
    ).rejects.toThrow("No se pudo crear el usuario");
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("correo repetido: 409 y no queda perfil a medias", async () => {
    authAdminMock.createUser.mockResolvedValue({ data: { user: null }, error: errorAuth("user_already_exists") });
    await expect(
      registrarIndividual({ email: "x@y.com", password: "contrasena-larga", nombre: "X" })
    ).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("si el perfil falla, borra la cuenta de Auth (no deja cuenta sin dueño)", async () => {
    prismaMock.usuario.create.mockRejectedValue(new Error("correo duplicado en Usuario"));
    await expect(
      registrarIndividual({ email: "x@y.com", password: "contrasena-larga", nombre: "X" })
    ).rejects.toThrow("correo duplicado");
    expect(authAdminMock.deleteUser).toHaveBeenCalledWith(UID_NUEVO);
  });
});

// --- asegurarPerfilIndividual --------------------------------------------

describe("asegurarPerfilIndividual", () => {
  it("busca el perfil por el id de Auth, NUNCA por el correo", async () => {
    // El id de Auth lo emite Supabase y viaja firmado en el JWT; el correo es
    // un campo denormalizado en nuestra tabla. Si esta búsqueda pasara a ser
    // por correo, cualquiera que lograra registrar en un proveedor OAuth un
    // correo que ya existe en NomiCheck entraría directo al perfil ajeno —con
    // su rol y su empresa. La aserción es sobre el `where` a propósito.
    await asegurarPerfilIndividual(UID_NUEVO, "ana@empresa.com", "Ana");
    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({ where: { id: UID_NUEVO } });
  });

  it("es idempotente y NO degrada: un admin_empresa que entra con Google sigue siendo admin", async () => {
    // Es el único punto donde un login OAuth escribe en Usuario. Si en vez de
    // devolver el perfil existente hiciera un upsert a rol "individual",
    // bastaría con que un admin usara el botón de Google para perder su
    // empresa entera. Tampoco puede elevar: se devuelve tal cual.
    const perfil = usuarioFixture({ id: UID_NUEVO, rol: "admin_empresa", empresaId: EMPRESA_B });
    prismaMock.usuario.findUnique.mockResolvedValue(perfil);
    const resultado = await asegurarPerfilIndividual(UID_NUEVO, "otro@correo.com", "Nombre Nuevo");
    expect(resultado).toBe(perfil);
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });

  it("perfil nuevo: rol individual, sin empresa, jamás heredada", async () => {
    await asegurarPerfilIndividual(UID_NUEVO, "ana@empresa.com", "Ana");
    expect(prismaMock.usuario.create).toHaveBeenCalledWith({
      data: { id: UID_NUEVO, nombre: "Ana", email: "ana@empresa.com", rol: "individual", empresaId: null },
    });
  });

  it("sin correo en el proveedor guarda null, no la cadena \"undefined\"", async () => {
    // `email` es @unique: escribir el string "undefined" convertiría el
    // segundo login sin correo en un choque de unicidad contra el primero, y
    // peor, haría que una búsqueda por correo (ver arriba) empatara dos
    // cuentas distintas.
    await asegurarPerfilIndividual(UID_NUEVO, undefined, "Ana");
    const args = prismaMock.usuario.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(args.data.email).toBeNull();
  });
});

// --- invitarColaborador ---------------------------------------------------

describe("invitarColaborador", () => {
  // Desde el 2026-08-05 el empleado se busca con `findFirst({ id, empresaId })`
  // — la MISMA tabla y el MISMO método que la consulta de membresía activa, así
  // que los mocks van con `mockResolvedValueOnce` en orden: primera llamada el
  // empleado, segunda la membresía.

  it("empleado inexistente: falla sin mandarle correo a nadie", async () => {
    await expect(invitarColaborador(999, "ana@empresa.com", EMPRESA_A)).rejects.toThrow("Empleado no encontrado");
    expect(authAdminMock.inviteUserByEmail).not.toHaveBeenCalled();
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("CERRADO 2026-08-05: un empleado de OTRA empresa es indistinguible de uno inexistente", async () => {
    // Este test era "FAIL-OPEN VIGENTE" y afirmaba el agujero: el empleado se
    // buscaba solo por id, sin empresa, y el controlador pasaba
    // `Number(req.params.id)` crudo. Un admin_empresa de A, con el id de un
    // empleado de B, dejaba una cuenta elegida por él como colaborador de B en
    // una sola petición — la rama de correo nuevo acepta implícitamente — y esa
    // cuenta leía la nómina de B. Se encontró escribiendo estas pruebas.
    //
    // El arreglo: el scoping vive EN EL WHERE, no en una comprobación después.
    // Un empleado de otra empresa no "existe y está prohibido": no existe, y la
    // respuesta no filtra que el id era real.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(null); // B no aparece con empresaId=A
    await expect(invitarColaborador(500, "atacante@evil.com", EMPRESA_A)).rejects.toThrow("Empleado no encontrado");
    expect(prismaMock.empleado.findFirst).toHaveBeenCalledWith({ where: { id: 500, empresaId: EMPRESA_A } });
    expect(authAdminMock.inviteUserByEmail).not.toHaveBeenCalled();
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("el empresaId del invitante entra en el WHERE, no se comprueba despues", async () => {
    // Afirmar el `where` es afirmar la decisión de seguridad: si alguien
    // "optimiza" esto de vuelta a `findUnique({ id })` con un if después, la
    // ventana entre las dos consultas y el olvido del if son el agujero de
    // nuevo. El where es la única forma sin ventana.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture());
    await invitarColaborador(500, "nueva@empresa.com", EMPRESA_A);
    const primera = prismaMock.empleado.findFirst.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(Object.keys(primera.where).sort()).toEqual(["empresaId", "id"]);
  });

  it("empleado ya vinculado: no se le roba el registro a la cuenta que lo tiene", async () => {
    // Sin esta guarda, reinvitar a otro correo reescribiría `usuarioId` y la
    // persona anterior perdería sus recibos mientras la nueva los hereda.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture({ usuarioId: UID_AJENO }));
    await expect(invitarColaborador(500, "otra@empresa.com", EMPRESA_A)).rejects.toThrow("ya tiene una cuenta vinculada");
    expect(authAdminMock.inviteUserByEmail).not.toHaveBeenCalled();
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("cuenta con membresía ACTIVA en otra empresa: 409 y el empleado no se toca", async () => {
    // La regla "una empresa activa por cuenta". Si el update se ejecutara
    // igual, la persona quedaría enganchada a dos empresas y su `empresaId`
    // saltaría de una a otra al aceptar.
    prismaMock.empleado.findFirst
      .mockResolvedValueOnce(empleadoFixture())
      .mockResolvedValueOnce({ id: 900, empresaId: EMPRESA_B });
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture());
    await expect(invitarColaborador(500, "ana@empresa.com", EMPRESA_A)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
    expect(authAdminMock.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("la consulta de membresía activa exige cuenta + activo + invitación aceptada", async () => {
    // Las tres condiciones juntas son el significado de "activa". Si se cayera
    // `usuarioId` el bloqueo aplicaría a cualquiera; si se cayera `activo` o
    // `invitacionAceptadaEn`, un histórico o una invitación pendiente pasarían
    // por membresía real. Se afirma el `where` porque es la decisión, no un
    // detalle de implementación.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture());
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture());
    await invitarColaborador(500, "ana@empresa.com", EMPRESA_A);
    expect(prismaMock.empleado.findFirst).toHaveBeenNthCalledWith(2, {
      where: { usuarioId: UID_AJENO, activo: true, invitacionAceptadaEn: { not: null } },
    });
  });

  it("cuenta libre: vínculo PENDIENTE (sin aceptar) y sin correo de Supabase", async () => {
    // Aceptar es del colaborador, no del admin. `invitacionAceptadaEn: null`
    // es lo único que impide que el admin de una empresa meta a una persona
    // en su nómina sin que ella lo sepa.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture());
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture());
    const resultado = await invitarColaborador(500, "ana@empresa.com", EMPRESA_A);
    expect(resultado).toEqual({ estado: "pendiente_en_app" });
    expect(prismaMock.empleado.update).toHaveBeenCalledWith({
      where: { id: 500 },
      data: { usuarioId: UID_AJENO, invitacionAceptadaEn: null },
    });
    expect(authAdminMock.inviteUserByEmail).not.toHaveBeenCalled();
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("correo sin cuenta: crea el perfil como colaborador de la empresa del empleado (= la del invitante)", async () => {
    // Antes del arreglo, "la empresa DEL EMPLEADO" era la frase clave del
    // exploit: el empresaId del perfil salía del empleado, no de quien invita.
    // Con el scoping en el where las dos ya no pueden diferir.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture({ empresaId: EMPRESA_B }));
    const resultado = await invitarColaborador(500, "nueva@empresa.com", EMPRESA_B);
    expect(resultado).toEqual({ estado: "correo_enviado" });
    expect(prismaMock.usuario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: UID_NUEVO, rol: "colaborador", empresaId: EMPRESA_B }),
    });
  });

  it("Supabase reporta duplicado al invitar: 409 sin crear perfil ni vincular", async () => {
    // Cuenta huérfana (existe en Auth, no en nuestra tabla). El vínculo NO
    // puede quedar hecho: apuntaría a un id de Auth que nadie controla.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture());
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: errorAuth("user_already_exists") });
    await expect(invitarColaborador(500, "huerfana@empresa.com", EMPRESA_A)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("invitación sin error pero SIN usuario: aborta antes de vincular", async () => {
    // Mismo patrón de campo ausente que en el registro: `data.user!.id` sería
    // undefined y el Empleado quedaría vinculado a un usuarioId inexistente.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture());
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: null });
    await expect(invitarColaborador(500, "nueva@empresa.com", EMPRESA_A)).rejects.toThrow("No se pudo enviar la invitación");
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });

  it("el correo se busca literal: otra capitalización NO encuentra la cuenta existente", async () => {
    // CARACTERIZACIÓN DE UN BORDE REAL, no un deseo. `findUnique({where:{email}})`
    // es igualdad exacta en Postgres y el servicio no normaliza. Con
    // "ANA@Empresa.com" la cuenta guardada como "ana@empresa.com" no aparece,
    // y el bloqueo "ya pertenece a otra empresa activa" se saltea entero.
    // Hoy no es un bypass SOLO porque Supabase sí normaliza y responde
    // `user_already_exists` — una segunda capa, en otro sistema, es todo lo
    // que separa esto de meter a una persona en dos empresas a la vez.
    // Si alguien "arregla" esto con una comparación laxa del lado nuestro, que
    // sea a propósito y con la normalización hecha en los dos lados.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture());
    prismaMock.usuario.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
      where.email === "ana@empresa.com" ? usuarioFixture() : null
    );
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: errorAuth("user_already_exists") });

    await expect(invitarColaborador(500, "ANA@Empresa.com", EMPRESA_A)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({ where: { email: "ANA@Empresa.com" } });
    // La membresía activa nunca se consultó: findFirst corrió UNA sola vez (el
    // empleado). La rama que la mira quedó afuera.
    expect(prismaMock.empleado.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.empleado.update).not.toHaveBeenCalled();
  });
});

// --- esAdminDeEmpresa / quitarAdminEmpresa -------------------------------

describe("esAdminDeEmpresa", () => {
  it("acepta únicamente al admin_empresa de ESA empresa", () => {
    expect(esAdminDeEmpresa({ rol: "admin_empresa", empresaId: EMPRESA_A }, EMPRESA_A)).toBe(true);
  });

  it("rechaza cross-tenant: admin_empresa de la A no manda en la B", () => {
    // La prueba de scoping. Un admin_plataforma con una URL manipulada no
    // puede desvincular al admin de una empresa que no es la del path.
    expect(esAdminDeEmpresa({ rol: "admin_empresa", empresaId: EMPRESA_A }, EMPRESA_B)).toBe(false);
    expect(esAdminDeEmpresa({ rol: "admin_empresa", empresaId: null }, EMPRESA_A)).toBe(false);
  });

  it.each([
    ["admin_plataforma"],
    ["analista_rrhh"],
    ["auditor"],
    ["colaborador"],
    ["individual"],
  ])("rechaza el rol %s aunque la empresa coincida", (rol) => {
    // Roles reales del producto que NO alcanzan para esta operación. El
    // analista_rrhh es el caso interesante: opera casi todo dentro de su
    // empresa, pero no reparte el rol de admin.
    expect(esAdminDeEmpresa({ rol, empresaId: EMPRESA_A }, EMPRESA_A)).toBe(false);
  });

  it("un rol inventado a futuro no cae en el caso permisivo", () => {
    // Allowlist, no denylist: agregar "supervisor_regional" al producto no
    // puede darle este poder por omisión.
    expect(esAdminDeEmpresa({ rol: "supervisor_regional", empresaId: EMPRESA_A }, EMPRESA_A)).toBe(false);
    expect(esAdminDeEmpresa({ rol: "", empresaId: EMPRESA_A }, EMPRESA_A)).toBe(false);
  });

  it("el rol se compara exacto: espacios y mayúsculas no pasan", () => {
    expect(esAdminDeEmpresa({ rol: "Admin_Empresa", empresaId: EMPRESA_A }, EMPRESA_A)).toBe(false);
    expect(esAdminDeEmpresa({ rol: " admin_empresa", empresaId: EMPRESA_A }, EMPRESA_A)).toBe(false);
    expect(esAdminDeEmpresa({ rol: "admin_empresa ", empresaId: EMPRESA_A }, EMPRESA_A)).toBe(false);
  });

  it("usuario ausente o sin rol no pasa por omisión", () => {
    // `nil == nil` es true: si la comparación fuera laxa, un objeto vacío
    // contra un empresaId undefined daría permiso. Cada caso de acá es un
    // campo que falta, no un valor equivocado.
    expect(esAdminDeEmpresa(null, EMPRESA_A)).toBe(false);
    expect(esAdminDeEmpresa(undefined, EMPRESA_A)).toBe(false);
    expect(esAdminDeEmpresa({}, EMPRESA_A)).toBe(false);
    expect(esAdminDeEmpresa({ rol: null, empresaId: null }, EMPRESA_A)).toBe(false);
    expect(esAdminDeEmpresa({ rol: "admin_empresa" }, EMPRESA_A)).toBe(false);
  });

  it("empresaId ausente en los DOS lados sigue siendo un rechazo", () => {
    // El fail-open exacto que motivó el guard extraído: sin él,
    // `undefined === undefined` daba true y el predicado autorizaba.
    expect(esAdminDeEmpresa({ rol: "admin_empresa" }, undefined as unknown as number)).toBe(false);
    expect(esAdminDeEmpresa({ rol: "admin_empresa", empresaId: null }, null as unknown as number)).toBe(false);
  });

  it("empresaId no numérico o NaN se rechaza (id de URL basura)", () => {
    // El controlador hace `Number(req.params.id)`: "abc" llega como NaN.
    expect(esAdminDeEmpresa({ rol: "admin_empresa", empresaId: EMPRESA_A }, NaN)).toBe(false);
    expect(esAdminDeEmpresa({ rol: "admin_empresa", empresaId: EMPRESA_A }, "1" as unknown as number)).toBe(false);
  });

  it("el empresaId del usuario tampoco se coacciona: \"1\" no es 1", () => {
    // Agregada porque la mutación `==` en lugar de `===` sobrevivió a la
    // primera tanda: el guard numérico ya cubre el lado del argumento, así que
    // el único síntoma que queda de una comparación laxa está del lado del
    // usuario —un empresaId que llega como string (query cruda, JSON de un
    // caché, un `select` armado a mano)—. Con `==`, "1" abriría la empresa 1.
    expect(esAdminDeEmpresa({ rol: "admin_empresa", empresaId: "1" as unknown as number }, 1)).toBe(false);
    expect(esAdminDeEmpresa({ rol: "admin_empresa", empresaId: "" as unknown as number }, 0)).toBe(false);
  });
});

describe("quitarAdminEmpresa", () => {
  it("degrada al admin correcto a individual y sin empresa", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(
      usuarioFixture({ id: UID_AJENO, rol: "admin_empresa", empresaId: EMPRESA_A })
    );
    await quitarAdminEmpresa(EMPRESA_A, UID_AJENO);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: UID_AJENO },
      data: { rol: "individual", empresaId: null },
    });
  });

  it("no borra la cuenta: la operación es reversible", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(
      usuarioFixture({ id: UID_AJENO, rol: "admin_empresa", empresaId: EMPRESA_A })
    );
    await quitarAdminEmpresa(EMPRESA_A, UID_AJENO);
    expect(authAdminMock.deleteUser).not.toHaveBeenCalled();
  });

  it("usuario inexistente: falla y no escribe", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    await expect(quitarAdminEmpresa(EMPRESA_A, UID_AJENO)).rejects.toThrow("no es el admin_empresa de esta empresa");
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });

  it("admin de OTRA empresa: falla y no escribe (scoping de verdad, no solo el mensaje)", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(
      usuarioFixture({ id: UID_AJENO, rol: "admin_empresa", empresaId: EMPRESA_B })
    );
    await expect(quitarAdminEmpresa(EMPRESA_A, UID_AJENO)).rejects.toThrow("no es el admin_empresa de esta empresa");
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });

  it("rol insuficiente en la misma empresa: falla y no escribe", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(
      usuarioFixture({ id: UID_AJENO, rol: "analista_rrhh", empresaId: EMPRESA_A })
    );
    await expect(quitarAdminEmpresa(EMPRESA_A, UID_AJENO)).rejects.toThrow("no es el admin_empresa de esta empresa");
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });
});

// --- crearEmpresaConAdmin -------------------------------------------------

const datosCrearEmpresa = {
  empresa: { nombre: "Beta", nit: "900999888-1", sector: "manufactura" },
  nombreAdmin: "Admin Beta",
  emailAdmin: "admin@beta.com",
};

describe("crearEmpresaConAdmin", () => {
  it("el invitado queda como admin_empresa de la empresa recién creada", async () => {
    prismaMock.empresa.create.mockResolvedValue({ id: 42, nombre: "Beta" });
    await crearEmpresaConAdmin(datosCrearEmpresa);
    expect(prismaMock.usuario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: UID_NUEVO, rol: "admin_empresa", empresaId: 42 }),
    });
  });

  it("correo duplicado: 409 y la empresa se borra (no queda una empresa sin dueño)", async () => {
    // Una empresa huérfana no es solo basura: aparece en el listado de
    // admin_plataforma y puede recibir empleados antes de tener admin.
    prismaMock.empresa.create.mockResolvedValue({ id: 42, nombre: "Beta" });
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: errorAuth("email_exists") });
    await expect(crearEmpresaConAdmin(datosCrearEmpresa)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.empresa.delete).toHaveBeenCalledWith({ where: { id: 42 } });
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("invitación sin error pero SIN usuario: revierte la empresa y aborta", async () => {
    prismaMock.empresa.create.mockResolvedValue({ id: 42, nombre: "Beta" });
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: null });
    await expect(crearEmpresaConAdmin(datosCrearEmpresa)).rejects.toThrow("No se pudo enviar la invitación");
    expect(prismaMock.empresa.delete).toHaveBeenCalledWith({ where: { id: 42 } });
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("si el perfil falla, compensa las dos cosas: cuenta de Auth y empresa", async () => {
    prismaMock.empresa.create.mockResolvedValue({ id: 42, nombre: "Beta" });
    prismaMock.usuario.create.mockRejectedValue(new Error("choque de unicidad"));
    await expect(crearEmpresaConAdmin(datosCrearEmpresa)).rejects.toThrow("choque de unicidad");
    expect(authAdminMock.deleteUser).toHaveBeenCalledWith(UID_NUEVO);
    expect(prismaMock.empresa.delete).toHaveBeenCalledWith({ where: { id: 42 } });
  });
});

// --- reasignarAdminEmpresa ------------------------------------------------

describe("reasignarAdminEmpresa", () => {
  const datosAdmin = { nombreAdmin: "Nuevo Admin", emailAdmin: "nuevo@acme.com" };

  it("empresa inexistente: falla ANTES de mandarle un correo a un tercero", async () => {
    // Un id de URL equivocado no puede terminar en una invitación real a una
    // persona que nunca va a tener a dónde entrar.
    prismaMock.empresa.findUnique.mockResolvedValue(null);
    await expect(reasignarAdminEmpresa(999, datosAdmin)).rejects.toThrow("Empresa no encontrada");
    expect(authAdminMock.inviteUserByEmail).not.toHaveBeenCalled();
    expect(prismaMock.usuario.updateMany).not.toHaveBeenCalled();
  });

  it("degrada a los admins viejos SOLO de esa empresa y sin tocar al nuevo", async () => {
    // Las dos condiciones del `where` son de seguridad, no de estilo:
    //   - sin `empresaId`, un updateMany dejaría sin admin a TODAS las
    //     empresas del sistema de una sola petición;
    //   - sin el `NOT`, el reemplazo se degradaría a sí mismo y la empresa
    //     quedaría sin nadie que pueda invitar ni liquidar.
    prismaMock.usuario.create.mockResolvedValue(usuarioFixture({ id: UID_NUEVO, rol: "admin_empresa", empresaId: EMPRESA_A }));
    await reasignarAdminEmpresa(EMPRESA_A, datosAdmin);
    expect(prismaMock.usuario.updateMany).toHaveBeenCalledWith({
      where: { empresaId: EMPRESA_A, rol: "admin_empresa", NOT: { id: UID_NUEVO } },
      data: { rol: "individual", empresaId: null },
    });
  });

  it("correo duplicado: 409 y el admin actual queda intacto", async () => {
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: errorAuth("email_exists") });
    await expect(reasignarAdminEmpresa(EMPRESA_A, datosAdmin)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    expect(prismaMock.usuario.updateMany).not.toHaveBeenCalled();
  });

  it("invitación sin usuario: aborta sin degradar a nadie", async () => {
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: null });
    await expect(reasignarAdminEmpresa(EMPRESA_A, datosAdmin)).rejects.toThrow("No se pudo enviar la invitación");
    expect(prismaMock.usuario.updateMany).not.toHaveBeenCalled();
  });

  it("si el perfil nuevo falla, el admin actual sobrevive y se borra la cuenta invitada", async () => {
    // El orden importa: crear primero y degradar después es lo que hace que un
    // fallo a mitad de camino deje a la empresa CON admin en vez de sin
    // ninguno.
    prismaMock.usuario.create.mockRejectedValue(new Error("correo ya usado en Usuario"));
    await expect(reasignarAdminEmpresa(EMPRESA_A, datosAdmin)).rejects.toThrow("correo ya usado");
    expect(prismaMock.usuario.updateMany).not.toHaveBeenCalled();
    expect(authAdminMock.deleteUser).toHaveBeenCalledWith(UID_NUEVO);
  });
});
