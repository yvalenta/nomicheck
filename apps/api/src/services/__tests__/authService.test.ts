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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthError } from "@supabase/supabase-js";

const { prismaMock, txMock, authAdminMock } = vi.hoisted(() => {
  // `invitarColaborador` escribe `Empleado` dentro de `conAuditoria`, que abre
  // una transaccion y setea `app.usuario_actual` — es de ahi que el trigger de
  // auditoria lee el actor. El wrapper corre DE VERDAD acá: mockearlo probaria
  // el mock, no que el actor llegue. `cambiarEmpresaActiva` usa el mismo
  // wrapper para mover `Usuario.empresaId`, y por eso el `tx` también tiene
  // `usuario` y `membresiaEmpresa`.
  //
  // Desde el 2026-08-31 el `tx` es casi toda la superficie de este servicio: las
  // altas crean Empresa + Usuario + MEMBRESÍA juntas y las bajas revocan la
  // membresía y reapuntan el puntero, todo en UNA transacción. `lib/membresias.js`
  // tampoco se mockea —por la misma razón que `conAuditoria`—, así que lo que
  // se ve en `txMock.membresiaEmpresa` son las escrituras de verdad; su
  // comportamiento contra una mini-base vive en `lib/__tests__/membresias.test.ts`.
  const txMock = {
    empresa: { create: vi.fn() },
    empleado: { update: vi.fn() },
    usuario: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    membresiaEmpresa: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    $executeRaw: vi.fn(),
  };
  return {
    txMock,
    prismaMock: {
      usuario: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      empleado: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      empresa: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
      membresiaEmpresa: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    },
    authAdminMock: { createUser: vi.fn(), deleteUser: vi.fn(), inviteUserByEmail: vi.fn() },
  };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../../lib/supabaseAdmin.js", () => ({ supabaseAdmin: { auth: { admin: authAdminMock } } }));

import {
  asegurarPerfilIndividual,
  cambiarEmpresaActiva,
  crearEmpresaConAdmin,
  empresasDeUsuario,
  esAdminDeEmpresa,
  esCorreoDuplicado,
  invitarColaborador,
  quitarAdminEmpresa,
  reasignarAdminEmpresa,
  registrarEmpresa,
  registrarIndividual,
} from "../authService.js";
import { ErrorConflicto } from "../empleadosService.js";
import { usarEmisor, type LineaDeRegistro } from "../../lib/registro.js";

// --- fixtures -------------------------------------------------------------

// El admin que invita (o el admin_plataforma que da de alta y de baja). Viaja
// hasta el servicio solo para que el trigger de auditoria pueda nombrarlo: sin
// el, el rastro del vinculo queda sin actor.
const UID_ADMIN = "11111111-1111-4111-8111-111111111111";
const EMPRESA_A = 1;
const EMPRESA_B = 2;
// La cuenta que crea Supabase Auth. Distinta del actor a propósito: cuando las
// dos eran el mismo uuid, la aserción "el rastro lleva al ADMIN que invitó" se
// cumplía también si el servicio firmaba con el invitado.
const UID_NUEVO = "33333333-3333-4333-8333-333333333333";
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
  prismaMock.membresiaEmpresa.findMany.mockResolvedValue([]);
  // El lado transaccional: acá pasan las altas (Empresa + Usuario + membresía)
  // y las bajas (revocar + reapuntar el puntero).
  txMock.empresa.create.mockImplementation(async ({ data }: { data: object }) => ({ id: EMPRESA_A, ...data }));
  txMock.usuario.create.mockImplementation(async ({ data }: { data: object }) => data);
  txMock.usuario.update.mockImplementation(async ({ data }: { data: object }) => data);
  txMock.usuario.findUnique.mockResolvedValue(null);
  txMock.empleado.update.mockImplementation(async ({ data }: { data: object }) => data);
  txMock.membresiaEmpresa.findUnique.mockResolvedValue(null);
  txMock.membresiaEmpresa.findMany.mockResolvedValue([]);
  txMock.membresiaEmpresa.upsert.mockImplementation(async ({ create }: { create: object }) => create);
  txMock.membresiaEmpresa.deleteMany.mockResolvedValue({ count: 1 });
});

/** Lo que `otorgarMembresia` le manda al upsert para el par (cuenta, empresa):
 * la fila nueva y, si ya estaba, el rol pisado. Se afirma entero porque el
 * `where` es la PK del par —una membresía por cuenta y empresa— y el rol es lo
 * que `requiereAuth` va a leer en cada request de esa persona. */
function altaDeMembresia(usuarioId: string, empresaId: number, rol: string) {
  return {
    where: { usuarioId_empresaId: { usuarioId, empresaId } },
    create: { usuarioId, empresaId, rol },
    update: { rol },
  };
}

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
    txMock.empresa.create.mockResolvedValue({ id: 77, nombre: "Acme" });
    await registrarEmpresa(datosRegistroEmpresa);
    expect(txMock.usuario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: UID_NUEVO, rol: "admin_empresa", empresaId: 77 }),
    });
  });

  it("H2 — la cuenta nace CON su membresía: sin ella el registro entrega un 403 permanente", async () => {
    // El puntero solo dice "en cuál de mis empresas estoy parado"; la
    // autorización es la membresía. Una cuenta con puntero y sin membresía
    // recibe 403 en TODOS los endpoints —incluido `whoami`, así que el portal
    // ni sabe a dónde mandarla, e incluido `POST /auth/empresa-activa`, que
    // sería el camino de vuelta—: registrarse dejaba de funcionar el minuto en
    // que se aplicaba la migración.
    txMock.empresa.create.mockResolvedValue({ id: 77, nombre: "Acme" });
    txMock.usuario.findUnique.mockResolvedValue({ rol: "admin_empresa", empresaId: 77 });
    await registrarEmpresa(datosRegistroEmpresa);
    expect(txMock.membresiaEmpresa.upsert).toHaveBeenCalledWith(altaDeMembresia(UID_NUEVO, 77, "admin_empresa"));
    // El perfil ya nació coherente con la membresía: no hay un UPDATE de más
    // que deje una línea de auditoría de un cambio que nunca ocurrió.
    expect(txMock.usuario.update).not.toHaveBeenCalled();
  });

  it("H2 — Empresa, perfil y membresía van en UNA transacción, no por el cliente raíz", async () => {
    // Un commit a medias deja exactamente lo que esto viene a prohibir: la
    // empresa creada y su dueño sin poder entrar, o al revés.
    await registrarEmpresa(datosRegistroEmpresa);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.empresa.create).not.toHaveBeenCalled();
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("H7 — el alta queda firmada por la cuenta que se registró, no con autor NULL", async () => {
    // `Empresa` y `Usuario` están vigilados por `fn_auditar_cambio`, que lee el
    // autor de `app.usuario_actual`. En un registro no hay nadie más que la
    // propia persona: sin el wrapper, el alta de una empresa entera quedaba sin
    // decir quién la creó.
    await registrarEmpresa(datosRegistroEmpresa);
    expect(txMock.$executeRaw.mock.calls[0]).toContain(UID_NUEVO);
  });

  it("el rol NO se toma del payload: un body con rol admin_plataforma se ignora", async () => {
    // El schema de zod no tiene campo `rol`, pero un objeto extra sobrevive a
    // `safeParse` si algún día se pasa a `.passthrough()`. El rol se escribe
    // literal en el servicio, y esta prueba es la que lo mantiene así: es la
    // diferencia entre registrarse y volverse dueño de la plataforma.
    const conBasura = { ...datosRegistroEmpresa, rol: "admin_plataforma", empresaId: EMPRESA_B };
    await registrarEmpresa(conBasura as unknown as typeof datosRegistroEmpresa);
    const args = txMock.usuario.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(args.data.rol).toBe("admin_empresa");
    expect(args.data.empresaId).toBe(EMPRESA_A);
    // Y la membresía tampoco: el rol de la empresa sale del servicio, no del body.
    expect(txMock.membresiaEmpresa.upsert).toHaveBeenCalledWith(
      altaDeMembresia(UID_NUEVO, EMPRESA_A, "admin_empresa")
    );
  });

  it("correo ya registrado: 409 y no se crea NADA en Postgres", async () => {
    authAdminMock.createUser.mockResolvedValue({ data: { user: null }, error: errorAuth("email_exists") });
    await expect(registrarEmpresa(datosRegistroEmpresa)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.empresa.create).not.toHaveBeenCalled();
    expect(txMock.usuario.create).not.toHaveBeenCalled();
    expect(txMock.membresiaEmpresa.upsert).not.toHaveBeenCalled();
  });

  it("otro error de Auth (no duplicado) aborta antes de tocar Postgres", async () => {
    authAdminMock.createUser.mockResolvedValue({ data: { user: null }, error: errorAuth("weak_password") });
    await expect(registrarEmpresa(datosRegistroEmpresa)).rejects.not.toBeInstanceOf(ErrorConflicto);
    expect(txMock.empresa.create).not.toHaveBeenCalled();
  });

  it("Auth sin error pero SIN usuario: aborta, no crea un perfil con id undefined", async () => {
    // El caso de campo ausente. Si la guarda fuera solo `if (authError)`, esto
    // seguiría de largo y escribiría `id: undefined` en Usuario. Ese perfil
    // no pertenece a nadie —o peor, colisiona con otro— y quien tenga ese id
    // en su JWT hereda la empresa.
    authAdminMock.createUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(registrarEmpresa(datosRegistroEmpresa)).rejects.toThrow("No se pudo crear el usuario");
    expect(txMock.empresa.create).not.toHaveBeenCalled();
    expect(txMock.usuario.create).not.toHaveBeenCalled();
  });

  it("si el perfil falla, compensa borrando la cuenta de Auth recién creada", async () => {
    txMock.usuario.create.mockRejectedValue(new Error("NIT duplicado"));
    await expect(registrarEmpresa(datosRegistroEmpresa)).rejects.toThrow("NIT duplicado");
    expect(authAdminMock.deleteUser).toHaveBeenCalledWith(UID_NUEVO);
  });

  it("si la MEMBRESÍA falla, se compensa igual: no queda una empresa con un dueño en 403", async () => {
    // La escritura nueva es parte del alta, no un extra opcional. Si reventara
    // y el servicio siguiera de largo, el resultado sería un registro
    // "exitoso" que nadie puede usar — el bug de arriba con otro disfraz.
    txMock.membresiaEmpresa.upsert.mockRejectedValue(new Error("MembresiaEmpresa no existe"));
    await expect(registrarEmpresa(datosRegistroEmpresa)).rejects.toThrow("MembresiaEmpresa no existe");
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

// --- empresasDeUsuario ----------------------------------------------------

describe("empresasDeUsuario", () => {
  let lineas: LineaDeRegistro[] = [];
  beforeEach(() => {
    lineas = [];
    usarEmisor((l) => lineas.push(l));
  });
  afterEach(() => usarEmisor(() => {}));

  it("devuelve id, nombre y el rol DE CADA EMPRESA (no el de la cuenta)", async () => {
    // Es lo que dibuja el selector del header: la misma persona puede aparecer
    // como admin_empresa en una y auditor en otra, y el selector tiene que
    // decirlo — si mostrara el rol de `Usuario`, mentiría en al menos una.
    prismaMock.membresiaEmpresa.findMany.mockResolvedValue([
      { rol: "admin_empresa", empresa: { id: EMPRESA_A, nombre: "Acme" } },
      { rol: "auditor", empresa: { id: EMPRESA_B, nombre: "Beta" } },
    ]);
    expect(await empresasDeUsuario(UID_AJENO)).toEqual([
      { id: EMPRESA_A, nombre: "Acme", rol: "admin_empresa" },
      { id: EMPRESA_B, nombre: "Beta", rol: "auditor" },
    ]);
  });

  it("pregunta SOLO por las membresías de esa cuenta", async () => {
    // El `where` es la decisión: sin `usuarioId`, whoami devolvería el
    // directorio de empresas de la plataforma entera a cualquiera con sesión.
    await empresasDeUsuario(UID_AJENO);
    const args = prismaMock.membresiaEmpresa.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(args.where).toEqual({ usuarioId: UID_AJENO });
  });

  it("sin membresías devuelve la lista vacía, no null", async () => {
    expect(await empresasDeUsuario(UID_AJENO)).toEqual([]);
  });

  it("la tabla sin migrar degrada a lista vacía y lo dice, en vez de tumbar el login", async () => {
    // Todos los portales llaman a whoami al arrancar: un 500 acá durante la
    // ventana entre el deploy y `prisma migrate deploy` deja a todo el mundo
    // afuera. La lista vacía es lo que había antes de las membresías.
    prismaMock.membresiaEmpresa.findMany.mockRejectedValue(
      Object.assign(new Error("The table `MembresiaEmpresa` does not exist"), { code: "P2021" })
    );
    expect(await empresasDeUsuario(UID_AJENO)).toEqual([]);
    const aviso = lineas.find((l) => l.origen === "auth" && l.nivel === "warn");
    expect(aviso).toBeDefined();
    expect(aviso?.codigo).toBe("P2021");
  });

  it("cualquier OTRO error de la base propaga: no se disfraza de 'no tiene empresas'", async () => {
    // Si "la base no responde" se tradujera a lista vacía, el header mostraría
    // a un admin sin ninguna empresa y el bug parecería de datos.
    prismaMock.membresiaEmpresa.findMany.mockRejectedValue(
      Object.assign(new Error("Can't reach database server"), { code: "P1001" })
    );
    await expect(empresasDeUsuario(UID_AJENO)).rejects.toThrow("Can't reach database server");
    expect(lineas).toHaveLength(0);
  });
});

// --- cambiarEmpresaActiva -------------------------------------------------

describe("cambiarEmpresaActiva", () => {
  const membresia = (over: Partial<{ rol: string; activa: boolean }> = {}) => ({
    rol: over.rol ?? "admin_empresa",
    empresa: { activa: over.activa ?? true },
  });

  it("con membresía mueve el puntero y devuelve el rol de ESA empresa", async () => {
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(membresia({ rol: "auditor" }));
    const resultado = await cambiarEmpresaActiva(UID_AJENO, EMPRESA_B);
    expect(resultado).toEqual({ estado: "ok", empresaId: EMPRESA_B, rol: "auditor" });
    expect(txMock.usuario.update).toHaveBeenCalledWith({
      where: { id: UID_AJENO },
      data: { empresaId: EMPRESA_B },
    });
  });

  it("el cambio queda en la auditoría CON autor", async () => {
    // `Usuario` está vigilado por el trigger (migración
    // 20260830140000_auditoria_usuario) y el actor sale de
    // `app.usuario_actual`, que setea `conAuditoria`. Sin el wrapper, el salto
    // de empresa quedaría registrado con usuarioId NULL: constancia de que
    // alguien cambió de empresa y ninguna de quién.
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(membresia());
    await cambiarEmpresaActiva(UID_AJENO, EMPRESA_B);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.$executeRaw.mock.calls[0]).toContain(UID_AJENO);
    // Y el UPDATE va por el `tx`, no por el cliente raíz: fuera de esa
    // transacción el `SET LOCAL` no aplica y el trigger no vería al autor.
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });

  it("SIN membresía no toca el puntero", async () => {
    // El agujero que esta función existe para no abrir: `empresaId` viene del
    // body, y el puntero es de donde `requiereAuth` saca el rol de cada
    // request. Escribirlo sin comprobar pertenencia sería "elegí de qué
    // empresa querés ser admin".
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(null);
    expect(await cambiarEmpresaActiva(UID_AJENO, EMPRESA_B)).toEqual({ estado: "sin_membresia" });
    expect(txMock.usuario.update).not.toHaveBeenCalled();
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });

  it("una empresa que no existe es INDISTINGUIBLE de una sin membresía", async () => {
    // Las dos son "no hay fila para este par": el servicio nunca consulta
    // Empresa, así que la respuesta no puede funcionar como oráculo de qué ids
    // existen en la plataforma.
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(null);
    expect(await cambiarEmpresaActiva(UID_AJENO, 99999)).toEqual({ estado: "sin_membresia" });
    expect(prismaMock.empresa.findUnique).not.toHaveBeenCalled();
  });

  it("la membresía se busca por el PAR (cuenta, empresa), que es la PK", async () => {
    // Se afirma el `where` porque es la decisión de seguridad. Buscar por
    // empresa sola autorizaría a cualquiera; buscar por cuenta y filtrar
    // después abre la ventana entre las dos operaciones.
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(membresia());
    await cambiarEmpresaActiva(UID_AJENO, EMPRESA_B);
    const args = txMock.membresiaEmpresa.findUnique.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(args.where).toEqual({ usuarioId_empresaId: { usuarioId: UID_AJENO, empresaId: EMPRESA_B } });
  });

  it("una empresa suspendida se rechaza ANTES de mover el puntero", async () => {
    // Si el puntero entrara a una empresa suspendida, `requiereAuth` daría 403
    // en TODOS los requests siguientes —incluido el que intentara volver— y la
    // cuenta quedaría encerrada sin salida por la API.
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(membresia({ activa: false }));
    expect(await cambiarEmpresaActiva(UID_AJENO, EMPRESA_B)).toEqual({ estado: "suspendida" });
    expect(txMock.usuario.update).not.toHaveBeenCalled();
  });
});

// --- invitarColaborador ---------------------------------------------------

describe("invitarColaborador", () => {
  // Desde el 2026-08-05 el empleado se busca con `findFirst({ id, empresaId })`
  // — la MISMA tabla y el MISMO método que la consulta de membresía activa, así
  // que los mocks van con `mockResolvedValueOnce` en orden: primera llamada el
  // empleado, segunda la membresía.

  it("empleado inexistente: falla sin mandarle correo a nadie", async () => {
    await expect(invitarColaborador(999, "ana@empresa.com", EMPRESA_A, UID_ADMIN)).rejects.toThrow("Empleado no encontrado");
    expect(authAdminMock.inviteUserByEmail).not.toHaveBeenCalled();
    expect(txMock.usuario.create).not.toHaveBeenCalled();
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
    await expect(invitarColaborador(500, "atacante@evil.com", EMPRESA_A, UID_ADMIN)).rejects.toThrow("Empleado no encontrado");
    expect(prismaMock.empleado.findFirst).toHaveBeenCalledWith({ where: { id: 500, empresaId: EMPRESA_A } });
    expect(authAdminMock.inviteUserByEmail).not.toHaveBeenCalled();
    expect(txMock.usuario.create).not.toHaveBeenCalled();
    expect(txMock.membresiaEmpresa.upsert).not.toHaveBeenCalled();
    expect(txMock.empleado.update).not.toHaveBeenCalled();
  });

  it("el empresaId del invitante entra en el WHERE, no se comprueba despues", async () => {
    // Afirmar el `where` es afirmar la decisión de seguridad: si alguien
    // "optimiza" esto de vuelta a `findUnique({ id })` con un if después, la
    // ventana entre las dos consultas y el olvido del if son el agujero de
    // nuevo. El where es la única forma sin ventana.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture());
    await invitarColaborador(500, "nueva@empresa.com", EMPRESA_A, UID_ADMIN);
    const primera = prismaMock.empleado.findFirst.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(Object.keys(primera.where).sort()).toEqual(["empresaId", "id"]);
  });

  it("empleado ya vinculado: no se le roba el registro a la cuenta que lo tiene", async () => {
    // Sin esta guarda, reinvitar a otro correo reescribiría `usuarioId` y la
    // persona anterior perdería sus recibos mientras la nueva los hereda.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture({ usuarioId: UID_AJENO }));
    await expect(invitarColaborador(500, "otra@empresa.com", EMPRESA_A, UID_ADMIN)).rejects.toThrow("ya tiene una cuenta vinculada");
    expect(authAdminMock.inviteUserByEmail).not.toHaveBeenCalled();
    expect(txMock.empleado.update).not.toHaveBeenCalled();
  });

  it("cuenta con membresía ACTIVA en otra empresa: 409 y el empleado no se toca", async () => {
    // La regla "una empresa activa por cuenta". Si el update se ejecutara
    // igual, la persona quedaría enganchada a dos empresas y su `empresaId`
    // saltaría de una a otra al aceptar.
    prismaMock.empleado.findFirst
      .mockResolvedValueOnce(empleadoFixture())
      .mockResolvedValueOnce({ id: 900, empresaId: EMPRESA_B });
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture());
    await expect(invitarColaborador(500, "ana@empresa.com", EMPRESA_A, UID_ADMIN)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(txMock.empleado.update).not.toHaveBeenCalled();
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
    await invitarColaborador(500, "ana@empresa.com", EMPRESA_A, UID_ADMIN);
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
    const resultado = await invitarColaborador(500, "ana@empresa.com", EMPRESA_A, UID_ADMIN);
    expect(resultado).toEqual({ estado: "pendiente_en_app" });
    // Por el `tx` de `conAuditoria`, no por el cliente raíz: `Empleado` está
    // vigilado por el trigger, y sin el wrapper el vínculo quedaba registrado
    // sin decir qué admin lo creó — justo lo que se le pregunta a la auditoría
    // cuando aparece una cuenta que no debería estar.
    expect(txMock.empleado.update).toHaveBeenCalledWith({
      where: { id: 500 },
      data: { usuarioId: UID_AJENO, invitacionAceptadaEn: null },
    });
    expect(txMock.$executeRaw.mock.calls[0]).toContain(UID_ADMIN);
    expect(authAdminMock.inviteUserByEmail).not.toHaveBeenCalled();
    expect(txMock.usuario.create).not.toHaveBeenCalled();
  });

  it("la invitación PENDIENTE no otorga membresía: aceptar es del colaborador, no del admin", async () => {
    // La contracara de H2: el alta de membresía va donde la persona ENTRA a la
    // empresa, no donde la invitan. Otorgarla acá metería a alguien en una
    // nómina ajena sin que se entere, que es exactamente lo que
    // `invitacionAceptadaEn: null` existe para impedir.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture());
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture());
    await invitarColaborador(500, "ana@empresa.com", EMPRESA_A, UID_ADMIN);
    expect(txMock.membresiaEmpresa.upsert).not.toHaveBeenCalled();
    expect(txMock.usuario.update).not.toHaveBeenCalled();
  });

  it("correo sin cuenta: crea el perfil como colaborador de la empresa del empleado (= la del invitante)", async () => {
    // Antes del arreglo, "la empresa DEL EMPLEADO" era la frase clave del
    // exploit: el empresaId del perfil salía del empleado, no de quien invita.
    // Con el scoping en el where las dos ya no pueden diferir.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture({ empresaId: EMPRESA_B }));
    const resultado = await invitarColaborador(500, "nueva@empresa.com", EMPRESA_B, UID_ADMIN);
    expect(resultado).toEqual({ estado: "correo_enviado" });
    expect(txMock.usuario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: UID_NUEVO, rol: "colaborador", empresaId: EMPRESA_B }),
    });
  });

  it("H2 — la cuenta nueva nace CON membresía de colaborador, en la MISMA transacción que el vínculo", async () => {
    // Esta rama acepta la invitación implícitamente (`invitacionAceptadaEn` con
    // fecha) y deja el puntero puesto: sin membresía, la persona entra por el
    // correo de Supabase y se choca con un 403 en todos lados, sin salida.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture({ empresaId: EMPRESA_B }));
    await invitarColaborador(500, "nueva@empresa.com", EMPRESA_B, UID_ADMIN);
    expect(txMock.membresiaEmpresa.upsert).toHaveBeenCalledWith(
      altaDeMembresia(UID_NUEVO, EMPRESA_B, "colaborador")
    );
    // Una sola transacción para perfil + membresía + vínculo, y ninguna
    // escritura por el cliente raíz: a medias, la persona queda con acceso sin
    // pertenecer, o encerrada.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    expect(txMock.empleado.update).toHaveBeenCalledWith({
      where: { id: 500 },
      data: { usuarioId: UID_NUEVO, invitacionAceptadaEn: expect.any(Date) },
    });
  });

  it("H7 — el alta de la cuenta nueva la firma el ADMIN que invitó, no el invitado", async () => {
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture());
    await invitarColaborador(500, "nueva@empresa.com", EMPRESA_A, UID_ADMIN);
    expect(txMock.$executeRaw.mock.calls[0]).toContain(UID_ADMIN);
    expect(txMock.$executeRaw.mock.calls[0]).not.toContain(UID_NUEVO);
  });

  it("Supabase reporta duplicado al invitar: 409 sin crear perfil ni vincular", async () => {
    // Cuenta huérfana (existe en Auth, no en nuestra tabla). El vínculo NO
    // puede quedar hecho: apuntaría a un id de Auth que nadie controla.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture());
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: errorAuth("user_already_exists") });
    await expect(invitarColaborador(500, "huerfana@empresa.com", EMPRESA_A, UID_ADMIN)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(txMock.usuario.create).not.toHaveBeenCalled();
    expect(txMock.membresiaEmpresa.upsert).not.toHaveBeenCalled();
    expect(txMock.empleado.update).not.toHaveBeenCalled();
  });

  it("invitación sin error pero SIN usuario: aborta antes de vincular", async () => {
    // Mismo patrón de campo ausente que en el registro: `data.user!.id` sería
    // undefined y el Empleado quedaría vinculado a un usuarioId inexistente.
    prismaMock.empleado.findFirst.mockResolvedValueOnce(empleadoFixture());
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: null });
    await expect(invitarColaborador(500, "nueva@empresa.com", EMPRESA_A, UID_ADMIN)).rejects.toThrow("No se pudo enviar la invitación");
    expect(txMock.usuario.create).not.toHaveBeenCalled();
    expect(txMock.membresiaEmpresa.upsert).not.toHaveBeenCalled();
    expect(txMock.empleado.update).not.toHaveBeenCalled();
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

    await expect(invitarColaborador(500, "ANA@Empresa.com", EMPRESA_A, UID_ADMIN)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({ where: { email: "ANA@Empresa.com" } });
    // La membresía activa nunca se consultó: findFirst corrió UNA sola vez (el
    // empleado). La rama que la mira quedó afuera.
    expect(prismaMock.empleado.findFirst).toHaveBeenCalledTimes(1);
    expect(txMock.empleado.update).not.toHaveBeenCalled();
  });
});

// --- esAdminDeEmpresa / quitarAdminEmpresa -------------------------------

// Lo que recibe el predicado es la MEMBRESÍA del par (cuenta, empresa) — la
// fila de `MembresiaEmpresa`, no la de `Usuario`. Con el rol de cuenta y el
// puntero, los dos globales, se equivocaba en los dos sentidos apenas una
// cuenta pertenece a dos empresas (ver el describe de `quitarAdminEmpresa`).
// Los casos de acá siguen valiendo igual: cambia de dónde sale el dato, no qué
// se exige de él.
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

  it("membresía ausente o sin rol no pasa por omisión", () => {
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

  it("el empresaId de la membresía tampoco se coacciona: \"1\" no es 1", () => {
    // Agregada porque la mutación `==` en lugar de `===` sobrevivió a la
    // primera tanda: el guard numérico ya cubre el lado del argumento, así que
    // el único síntoma que queda de una comparación laxa está del lado de la
    // fila —un empresaId que llega como string (query cruda, JSON de un
    // caché, un `select` armado a mano)—. Con `==`, "1" abriría la empresa 1.
    expect(esAdminDeEmpresa({ rol: "admin_empresa", empresaId: "1" as unknown as number }, 1)).toBe(false);
    expect(esAdminDeEmpresa({ rol: "admin_empresa", empresaId: "" as unknown as number }, 0)).toBe(false);
  });
});

describe("quitarAdminEmpresa", () => {
  /** La fila de `MembresiaEmpresa` del par: lo ÚNICO que autoriza la baja. */
  const membresiaAdmin = (empresaId = EMPRESA_A) => ({ rol: "admin_empresa", empresaId });
  /** Dónde está parada la cuenta y con qué rol de cuenta — el puntero, que la
   * baja mueve pero al que ya no le pregunta nada. */
  const parada = (empresaId: number | null, rol = "admin_empresa") => ({ rol, empresaId });

  it("H1 — BORRA la membresía: sin eso el degradado se re-promueve con un POST /auth/empresa-activa", async () => {
    // El agujero: la baja ponía `rol=individual, empresaId=null` y dejaba viva
    // la fila de MembresiaEmpresa. `whoami` le seguía ofreciendo la empresa con
    // el rol perdido y `POST /auth/empresa-activa` —la única ruta privada sin
    // guarda de permiso— se lo devolvía. Ni el admin_plataforma podía desalojar
    // a un admin: lo degradaba y el degradado volvía solo.
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(membresiaAdmin());
    txMock.usuario.findUnique.mockResolvedValue(parada(EMPRESA_A));

    await quitarAdminEmpresa(EMPRESA_A, UID_AJENO, UID_ADMIN);

    expect(txMock.membresiaEmpresa.deleteMany).toHaveBeenCalledWith({
      where: { usuarioId: UID_AJENO, empresaId: EMPRESA_A },
    });
    // Y el puntero se cae con ella: sin otra membresía viva donde pararse,
    // queda en null con rol de cuenta individual.
    expect(txMock.usuario.update).toHaveBeenCalledWith({
      where: { id: UID_AJENO },
      data: { empresaId: null, rol: "individual" },
    });
  });

  it("H4 — al admin parado en OTRA empresa también se lo puede quitar, y no se lo desaloja de la otra", async () => {
    // El caso de uso que las membresías vinieron a habilitar, visto desde el
    // panel: alguien es admin_empresa en la A y está trabajando en la B.
    // Preguntándole al puntero global, para esta función no era admin de
    // ninguna —"ese usuario no es el admin_empresa de esta empresa"— y no había
    // forma, ni por API ni por UI, de sacarlo de la A mientras él volvía cuando
    // quisiera. Preguntándole a la membresía, sale.
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(membresiaAdmin(EMPRESA_A));
    txMock.usuario.findUnique.mockResolvedValue(parada(EMPRESA_B, "auditor"));

    await quitarAdminEmpresa(EMPRESA_A, UID_AJENO, UID_ADMIN);

    expect(txMock.membresiaEmpresa.deleteMany).toHaveBeenCalledWith({
      where: { usuarioId: UID_AJENO, empresaId: EMPRESA_A },
    });
    // La baja en la A no lo saca de la B, donde sigue siendo miembro.
    expect(txMock.usuario.update).not.toHaveBeenCalled();
  });

  it("H4 — el puntero global ya no autoriza: sin membresía se rechaza aunque Usuario diga admin_empresa", async () => {
    // El otro sentido del mismo error. Una fila `Usuario` con el puntero en la
    // empresa y rol admin_empresa, pero sin membresía, no es miembro de nada:
    // `requiereAuth` le responde 403 en cada request. Autorizar una baja con
    // ese dato es autorizarla con lo que quedó de la foto vieja.
    prismaMock.usuario.findUnique.mockResolvedValue(
      usuarioFixture({ id: UID_AJENO, rol: "admin_empresa", empresaId: EMPRESA_A })
    );
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(null);

    await expect(quitarAdminEmpresa(EMPRESA_A, UID_AJENO, UID_ADMIN)).rejects.toThrow(
      "no es el admin_empresa de esta empresa"
    );
    expect(txMock.membresiaEmpresa.deleteMany).not.toHaveBeenCalled();
    expect(txMock.usuario.update).not.toHaveBeenCalled();
    // Ni siquiera le preguntó a `Usuario`: la decisión sale de la membresía.
    expect(prismaMock.usuario.findUnique).not.toHaveBeenCalled();
  });

  it("la membresía se busca por el PAR (cuenta, empresa), que es la PK, y en la misma transacción que la baja", async () => {
    // Se afirma el `where` porque es la decisión de seguridad: por empresa sola
    // autorizaría a cualquiera, y por cuenta con un filtro después abre la
    // ventana entre comprobar y escribir.
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(membresiaAdmin());
    txMock.usuario.findUnique.mockResolvedValue(parada(EMPRESA_A));

    await quitarAdminEmpresa(EMPRESA_A, UID_AJENO, UID_ADMIN);

    expect(txMock.membresiaEmpresa.findUnique).toHaveBeenCalledWith({
      where: { usuarioId_empresaId: { usuarioId: UID_AJENO, empresaId: EMPRESA_A } },
      select: { rol: true, empresaId: true },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("no borra la cuenta: la operación es reversible", async () => {
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(membresiaAdmin());
    txMock.usuario.findUnique.mockResolvedValue(parada(EMPRESA_A));
    await quitarAdminEmpresa(EMPRESA_A, UID_AJENO, UID_ADMIN);
    expect(authAdminMock.deleteUser).not.toHaveBeenCalled();
  });

  it("cuenta sin membresía en esa empresa (o inexistente): falla y no escribe", async () => {
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(null);
    await expect(quitarAdminEmpresa(EMPRESA_A, UID_AJENO, UID_ADMIN)).rejects.toThrow(
      "no es el admin_empresa de esta empresa"
    );
    expect(txMock.membresiaEmpresa.deleteMany).not.toHaveBeenCalled();
  });

  it("rol insuficiente en la MISMA empresa: falla y no escribe", async () => {
    // El analista_rrhh es el caso interesante: es miembro de esta empresa, así
    // que la membresía existe — lo que no alcanza es el rol.
    txMock.membresiaEmpresa.findUnique.mockResolvedValue({ rol: "analista_rrhh", empresaId: EMPRESA_A });
    await expect(quitarAdminEmpresa(EMPRESA_A, UID_AJENO, UID_ADMIN)).rejects.toThrow(
      "no es el admin_empresa de esta empresa"
    );
    expect(txMock.membresiaEmpresa.deleteMany).not.toHaveBeenCalled();
  });

  it("id de empresa basura de la URL: falla cerrado sin abrir transacción ni consultar", async () => {
    // El controlador hace `Number(req.params.id)`: "abc" llega como NaN. Antes
    // el predicado lo frenaba sin tocar la base; ahora la consulta va primero,
    // así que el guard numérico tiene que seguir estando ANTES — con NaN,
    // Prisma tiraría su error crudo en la cara del admin.
    await expect(quitarAdminEmpresa(NaN, UID_AJENO, UID_ADMIN)).rejects.toThrow(
      "no es el admin_empresa de esta empresa"
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.membresiaEmpresa.findUnique).not.toHaveBeenCalled();
  });

  it("H7 — la baja queda en la bitácora CON el actor que la ejecutó, y nada se escribe fuera de la transacción", async () => {
    // `Usuario` está vigilado por `fn_auditar_cambio`, que lee el autor de
    // `app.usuario_actual`. Con `prisma.usuario.update` pelado quedaba
    // constancia de que a alguien lo sacaron de una empresa y ninguna de quién
    // — el mismo medio-rastro que `invitarColaborador` ya había arreglado.
    txMock.membresiaEmpresa.findUnique.mockResolvedValue(membresiaAdmin());
    txMock.usuario.findUnique.mockResolvedValue(parada(EMPRESA_A));

    await quitarAdminEmpresa(EMPRESA_A, UID_AJENO, UID_ADMIN);

    expect(txMock.$executeRaw.mock.calls[0]).toContain(UID_ADMIN);
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
    expect(txMock.usuario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: UID_NUEVO, rol: "admin_empresa", empresaId: 42 }),
    });
  });

  it("H2 — el admin del onboarding manual nace CON membresía: si no, el correo de invitación lleva a un 403", async () => {
    // Mismo agujero que el registro, por la puerta del admin_plataforma: la
    // persona define su contraseña por correo, entra, y `requiereAuth` la
    // rebota en todos los endpoints porque su puntero no tiene membresía.
    prismaMock.empresa.create.mockResolvedValue({ id: 42, nombre: "Beta" });
    await crearEmpresaConAdmin(datosCrearEmpresa, UID_ADMIN);
    expect(txMock.membresiaEmpresa.upsert).toHaveBeenCalledWith(altaDeMembresia(UID_NUEVO, 42, "admin_empresa"));
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("H7 — el alta la firma el admin_plataforma que la ejecutó", async () => {
    prismaMock.empresa.create.mockResolvedValue({ id: 42, nombre: "Beta" });
    await crearEmpresaConAdmin(datosCrearEmpresa, UID_ADMIN);
    expect(txMock.$executeRaw.mock.calls[0]).toContain(UID_ADMIN);
  });

  it("correo duplicado: 409 y la empresa se borra (no queda una empresa sin dueño)", async () => {
    // Una empresa huérfana no es solo basura: aparece en el listado de
    // admin_plataforma y puede recibir empleados antes de tener admin.
    prismaMock.empresa.create.mockResolvedValue({ id: 42, nombre: "Beta" });
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: errorAuth("email_exists") });
    await expect(crearEmpresaConAdmin(datosCrearEmpresa)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(prismaMock.empresa.delete).toHaveBeenCalledWith({ where: { id: 42 } });
    expect(txMock.usuario.create).not.toHaveBeenCalled();
    expect(txMock.membresiaEmpresa.upsert).not.toHaveBeenCalled();
  });

  it("invitación sin error pero SIN usuario: revierte la empresa y aborta", async () => {
    prismaMock.empresa.create.mockResolvedValue({ id: 42, nombre: "Beta" });
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: null });
    await expect(crearEmpresaConAdmin(datosCrearEmpresa)).rejects.toThrow("No se pudo enviar la invitación");
    expect(prismaMock.empresa.delete).toHaveBeenCalledWith({ where: { id: 42 } });
    expect(txMock.usuario.create).not.toHaveBeenCalled();
  });

  it("si el perfil falla, compensa las dos cosas: cuenta de Auth y empresa", async () => {
    prismaMock.empresa.create.mockResolvedValue({ id: 42, nombre: "Beta" });
    txMock.usuario.create.mockRejectedValue(new Error("choque de unicidad"));
    await expect(crearEmpresaConAdmin(datosCrearEmpresa)).rejects.toThrow("choque de unicidad");
    expect(authAdminMock.deleteUser).toHaveBeenCalledWith(UID_NUEVO);
    expect(prismaMock.empresa.delete).toHaveBeenCalledWith({ where: { id: 42 } });
  });

  it("si la membresía falla, compensa igual: ni cuenta de Auth ni empresa a medias", async () => {
    prismaMock.empresa.create.mockResolvedValue({ id: 42, nombre: "Beta" });
    txMock.membresiaEmpresa.upsert.mockRejectedValue(new Error("MembresiaEmpresa no existe"));
    await expect(crearEmpresaConAdmin(datosCrearEmpresa)).rejects.toThrow("MembresiaEmpresa no existe");
    expect(authAdminMock.deleteUser).toHaveBeenCalledWith(UID_NUEVO);
    expect(prismaMock.empresa.delete).toHaveBeenCalledWith({ where: { id: 42 } });
  });
});

// --- reasignarAdminEmpresa ------------------------------------------------

describe("reasignarAdminEmpresa", () => {
  const datosAdmin = { nombreAdmin: "Nuevo Admin", emailAdmin: "nuevo@acme.com" };

  /** La búsqueda de los admins anteriores pregunta por empresa; la de
   * `revocarMembresia`, por cuenta. El mismo mock atiende a las dos y las
   * distingue por el `where`, que es justo lo que las diferencia. */
  function conAdminAnterior(usuarioId: string) {
    txMock.membresiaEmpresa.findMany.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) =>
        where.usuarioId === undefined ? [{ usuarioId }] : []
    );
  }

  it("empresa inexistente: falla ANTES de mandarle un correo a un tercero", async () => {
    // Un id de URL equivocado no puede terminar en una invitación real a una
    // persona que nunca va a tener a dónde entrar.
    prismaMock.empresa.findUnique.mockResolvedValue(null);
    await expect(reasignarAdminEmpresa(999, datosAdmin)).rejects.toThrow("Empresa no encontrada");
    expect(authAdminMock.inviteUserByEmail).not.toHaveBeenCalled();
    expect(txMock.membresiaEmpresa.deleteMany).not.toHaveBeenCalled();
  });

  it("H1 — al admin anterior le REVOCA la membresía, no solo el puntero", async () => {
    // Con el `updateMany` a `Usuario` el reemplazado quedaba "individual" pero
    // con su membresía de admin_empresa intacta: volvía a serlo con un solo
    // `POST /auth/empresa-activa`, y la empresa terminaba con dos admins, uno
    // de ellos invisible en el panel.
    conAdminAnterior(UID_AJENO);
    txMock.usuario.findUnique.mockResolvedValue({ rol: "admin_empresa", empresaId: EMPRESA_A });

    await reasignarAdminEmpresa(EMPRESA_A, datosAdmin, UID_ADMIN);

    expect(txMock.membresiaEmpresa.deleteMany).toHaveBeenCalledWith({
      where: { usuarioId: UID_AJENO, empresaId: EMPRESA_A },
    });
    // Y el puntero del reemplazado cae con su membresía.
    expect(txMock.usuario.update).toHaveBeenCalledWith({
      where: { id: UID_AJENO },
      data: { empresaId: null, rol: "individual" },
    });
    // Nada de degradar cuentas con un updateMany global: la baja va de a una,
    // por membresía, porque a cada persona hay que reapuntarle el puntero a lo
    // que le quede.
    expect(prismaMock.usuario.updateMany).not.toHaveBeenCalled();
  });

  it("H4 — busca a los anteriores por MEMBRESÍA de esa empresa, sin incluir al reemplazo", async () => {
    // Las dos condiciones del `where` son de seguridad, no de estilo:
    //   - sin `empresaId`, esto revocaría a los admins de TODAS las empresas
    //     del sistema de una sola petición;
    //   - sin el `NOT`, el reemplazo se revocaría a sí mismo y la empresa
    //     quedaría sin nadie que pueda invitar ni liquidar.
    // Y por membresía y no por `Usuario.empresaId`: al admin anterior que
    // estuviera parado en otra empresa suya, el `updateMany` no lo alcanzaba —
    // seguía siendo admin de esta para siempre.
    await reasignarAdminEmpresa(EMPRESA_A, datosAdmin, UID_ADMIN);
    expect(txMock.membresiaEmpresa.findMany).toHaveBeenCalledWith({
      where: { empresaId: EMPRESA_A, rol: "admin_empresa", NOT: { usuarioId: UID_NUEVO } },
      select: { usuarioId: true },
    });
  });

  it("H2 — el reemplazo nace con su membresía, en la misma transacción que la baja del anterior", async () => {
    // Si el alta y la baja no fueran atómicas, un fallo entre las dos deja a la
    // empresa sin ningún admin, o con dos.
    conAdminAnterior(UID_AJENO);
    await reasignarAdminEmpresa(EMPRESA_A, datosAdmin, UID_ADMIN);
    expect(txMock.membresiaEmpresa.upsert).toHaveBeenCalledWith(
      altaDeMembresia(UID_NUEVO, EMPRESA_A, "admin_empresa")
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("H7 — el relevo queda en la bitácora con el actor que lo ejecutó", async () => {
    conAdminAnterior(UID_AJENO);
    await reasignarAdminEmpresa(EMPRESA_A, datosAdmin, UID_ADMIN);
    expect(txMock.$executeRaw.mock.calls[0]).toContain(UID_ADMIN);
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });

  it("correo duplicado: 409 y el admin actual queda intacto", async () => {
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: errorAuth("email_exists") });
    await expect(reasignarAdminEmpresa(EMPRESA_A, datosAdmin)).rejects.toBeInstanceOf(ErrorConflicto);
    expect(txMock.usuario.create).not.toHaveBeenCalled();
    expect(txMock.membresiaEmpresa.deleteMany).not.toHaveBeenCalled();
  });

  it("invitación sin usuario: aborta sin degradar a nadie", async () => {
    authAdminMock.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: null });
    await expect(reasignarAdminEmpresa(EMPRESA_A, datosAdmin)).rejects.toThrow("No se pudo enviar la invitación");
    expect(txMock.membresiaEmpresa.deleteMany).not.toHaveBeenCalled();
  });

  it("si el perfil nuevo falla, el admin actual sobrevive y se borra la cuenta invitada", async () => {
    // El orden importa: crear primero y revocar después es lo que hace que un
    // fallo a mitad de camino deje a la empresa CON admin en vez de sin
    // ninguno. Ahora además la transacción revierte lo que ya se hubiera
    // escrito, así que "sobrevive" es literal.
    conAdminAnterior(UID_AJENO);
    txMock.usuario.create.mockRejectedValue(new Error("correo ya usado en Usuario"));
    await expect(reasignarAdminEmpresa(EMPRESA_A, datosAdmin, UID_ADMIN)).rejects.toThrow("correo ya usado");
    expect(txMock.membresiaEmpresa.deleteMany).not.toHaveBeenCalled();
    expect(authAdminMock.deleteUser).toHaveBeenCalledWith(UID_NUEVO);
  });
});
