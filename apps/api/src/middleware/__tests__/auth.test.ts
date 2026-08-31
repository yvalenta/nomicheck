// La guarda de entrada: qué rol tiene quien pide, y sobre qué empresa.
//
// Lo que se prueba acá no es que deje entrar: es a quién NO deja. Desde
// MembresiaEmpresa, `Usuario.empresaId` dejó de ser la pertenencia y pasó a
// ser un PUNTERO ("en cuál de mis empresas estoy parado"), así que un puntero
// que nadie respalda —una fila vieja, una membresía revocada, un UPDATE a
// mano— es exactamente la forma que tendría un salto de tenencia. Por eso hay
// tres pruebas negativas por cada camino feliz.
//
// NINGUNA PRUEBA TOCA LA BASE NI SUPABASE, igual que `authService.test.ts`:
// `vitest.config.ts` dice que esta suite es de módulos puros. El corte va en
// los dos clientes impuros, y el de `supabaseAdmin` además es obligatorio —
// el módulo real hace `createClient(process.env.SUPABASE_URL!, ...)` en el
// import y explota sin variables de entorno.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, RequestHandler, Response } from "express";

const { prismaMock, getClaimsMock } = vi.hoisted(() => ({
  prismaMock: {
    usuario: { findUnique: vi.fn() },
    empleado: { findFirst: vi.fn() },
    empresa: { findUnique: vi.fn() },
    membresiaEmpresa: { findMany: vi.fn() },
    usuarioSede: { findMany: vi.fn() },
  },
  getClaimsMock: vi.fn(),
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../../lib/supabaseAdmin.js", () => ({
  supabaseAdmin: { auth: { getClaims: getClaimsMock } },
}));

import {
  reiniciarGraciaSinTabla,
  requiereAuth,
  requierePermiso,
  requiereRol,
  sedesDelUsuario,
  type UsuarioAutenticado,
} from "../auth.js";
import { usarEmisor, type LineaDeRegistro } from "../../lib/registro.js";

const UID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPRESA_A = 1;
const EMPRESA_B = 2;

/** El perfil de `Usuario`: rol de cuenta + puntero a la empresa activa. */
function perfil(over: Partial<{ rol: string; empresaId: number | null }> = {}) {
  return { id: UID, nombre: "Ana", rol: "admin_empresa", empresaId: EMPRESA_A, ...over };
}

/** Una fila de MembresiaEmpresa tal como la pide `requiereAuth` (con el
 * `activa` de la empresa embebido). */
function membresia(over: Partial<{ empresaId: number; rol: string; activa: boolean }> = {}) {
  const { empresaId = EMPRESA_A, rol = "admin_empresa", activa = true } = over;
  return { empresaId, rol, empresa: { activa } };
}

let lineas: LineaDeRegistro[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  lineas = [];
  usarEmisor((l) => lineas.push(l));
  // La ventana de gracia es estado del MÓDULO (arranca en el primer request
  // degradado y no se reabre sola): sin esto, una prueba heredaría el reloj y
  // el contador de la anterior.
  reiniciarGraciaSinTabla();
  // Camino feliz por defecto; cada prueba mueve SOLO la pieza que le importa.
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: UID } }, error: null });
  prismaMock.usuario.findUnique.mockResolvedValue(perfil());
  prismaMock.empleado.findFirst.mockResolvedValue(null);
  prismaMock.membresiaEmpresa.findMany.mockResolvedValue([membresia()]);
  prismaMock.empresa.findUnique.mockResolvedValue({ activa: true });
  prismaMock.usuarioSede.findMany.mockResolvedValue([]);
});

afterEach(() => usarEmisor(() => {}));

/** Corre `requiereAuth` y devuelve lo que quedó: el `req` (para mirar
 * `req.usuario`) y lo que la respuesta alcanzó a decir. */
async function entrar(headers: Record<string, string> = { authorization: "Bearer jwt" }) {
  const req = { headers } as unknown as Request;
  const visto = { estado: undefined as number | undefined, cuerpo: undefined as unknown, siguio: false };
  const res = {
    status(s: number) {
      visto.estado = s;
      return this;
    },
    json(c: unknown) {
      visto.cuerpo = c;
      return this;
    },
  } as unknown as Response;
  await requiereAuth(req, res, (() => {
    visto.siguio = true;
  }) as NextFunction);
  return { req, ...visto };
}

/** Corre una guarda sincrónica (`requierePermiso` / `requiereRol`) sobre un
 * `req.usuario` ya armado. */
function guardar(guarda: RequestHandler, usuario?: Partial<UsuarioAutenticado>) {
  const req = {
    usuario: usuario && ({ id: UID, nombre: "Ana", empresaId: EMPRESA_A, empleadoId: null, rol: "auditor", ...usuario } as UsuarioAutenticado),
  } as unknown as Request;
  const visto = { estado: undefined as number | undefined, cuerpo: undefined as unknown, siguio: false };
  const res = {
    status(s: number) {
      visto.estado = s;
      return this;
    },
    json(c: unknown) {
      visto.cuerpo = c;
      return this;
    },
  } as unknown as Response;
  guarda(req, res, (() => {
    visto.siguio = true;
  }) as NextFunction);
  return visto;
}

describe("requiereAuth — la sesión", () => {
  it("sin header Authorization es 401", async () => {
    const r = await entrar({});
    expect(r.estado).toBe(401);
    expect(r.siguio).toBe(false);
  });

  it("con un token que no verifica es 401", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: "jwt expired" } });
    const r = await entrar();
    expect(r.estado).toBe(401);
    expect(r.req.usuario).toBeUndefined();
  });

  it("un token válido de alguien sin perfil es 403", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    const r = await entrar();
    expect(r.estado).toBe(403);
    expect(r.cuerpo).toEqual({ error: "El usuario no tiene un perfil en NomiCheck" });
  });

  it("adjunta el empleado activo aceptado", async () => {
    prismaMock.empleado.findFirst.mockResolvedValue({ id: 7 });
    const r = await entrar();
    expect(r.req.usuario?.empleadoId).toBe(7);
  });
});

describe("requiereAuth — el puntero de empresa se valida contra la membresía", () => {
  it("el rol efectivo sale de la MEMBRESÍA, no de Usuario.rol", async () => {
    // La misma cuenta puede ser admin_empresa en una empresa y auditor en
    // otra: si el rol siguiera saliendo de `Usuario`, cambiar de empresa
    // arrastraría los permisos de la anterior.
    prismaMock.usuario.findUnique.mockResolvedValue(perfil({ rol: "admin_empresa" }));
    prismaMock.membresiaEmpresa.findMany.mockResolvedValue([membresia({ rol: "auditor" })]);

    const r = await entrar();

    expect(r.siguio).toBe(true);
    expect(r.req.usuario?.rol).toBe("auditor");
    expect(r.req.usuario?.empresaId).toBe(EMPRESA_A);
  });

  it("un puntero SIN membresía es 403 y no adjunta empresa", async () => {
    prismaMock.membresiaEmpresa.findMany.mockResolvedValue([]);

    const r = await entrar();

    expect(r.estado).toBe(403);
    expect(r.cuerpo).toEqual({ error: "No perteneces a esta empresa" });
    // No hay "entrar igual pero sin empresa": el request no llega a tener
    // usuario, así que ninguna ruta de más abajo puede resolver nada.
    expect(r.req.usuario).toBeUndefined();
    expect(r.siguio).toBe(false);
  });

  it("una membresía en OTRA empresa no vale para el puntero", async () => {
    // La forma exacta del salto de tenencia: ser miembro de algo no autoriza
    // sobre lo que el puntero diga.
    prismaMock.usuario.findUnique.mockResolvedValue(perfil({ empresaId: EMPRESA_A }));
    prismaMock.membresiaEmpresa.findMany.mockResolvedValue([
      membresia({ empresaId: EMPRESA_B, rol: "admin_empresa" }),
    ]);

    const r = await entrar();

    expect(r.estado).toBe(403);
    expect(r.req.usuario).toBeUndefined();
  });

  it("sin empresa activa el rol es el de la cuenta", async () => {
    // colaborador libre entre empresas, individual y admin_plataforma: nadie
    // tiene membresía y a nadie hay que pedírsela.
    for (const rol of ["colaborador", "individual", "admin_plataforma"]) {
      prismaMock.usuario.findUnique.mockResolvedValue(perfil({ rol, empresaId: null }));
      prismaMock.membresiaEmpresa.findMany.mockResolvedValue([]);

      const r = await entrar();

      expect(r.siguio, rol).toBe(true);
      expect(r.req.usuario?.rol, rol).toBe(rol);
      expect(r.req.usuario?.empresaId, rol).toBeNull();
    }
  });

  it("no cuesta una consulta extra: la suspensión viaja con la membresía", async () => {
    // El chequeo de suspensión era un round-trip encadenado (`empresa.findUnique`
    // después del perfil). Ahora `activa` llega dentro de la lectura de
    // membresías, que va en el mismo Promise.all: si alguien vuelve a
    // encadenar la consulta, esto se pone rojo.
    await entrar();
    expect(prismaMock.empresa.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.membresiaEmpresa.findMany).toHaveBeenCalledTimes(1);
  });

  it("una empresa suspendida sigue dando 403, con el mensaje de siempre", async () => {
    prismaMock.membresiaEmpresa.findMany.mockResolvedValue([membresia({ activa: false })]);

    const r = await entrar();

    expect(r.estado).toBe(403);
    expect(r.cuerpo).toEqual({
      error: "Esta empresa está suspendida — contacta al soporte de NomiCheck.",
    });
    expect(r.req.usuario).toBeUndefined();
  });

  it("un admin_plataforma con puntero huérfano entra sin empresa, y queda dicho", async () => {
    // 403 lo dejaría afuera de la plataforma entera por un dato que no usa
    // (su acceso no depende de pertenecer a ninguna empresa), pero el puntero
    // tampoco puede valer sin membresía: se ignora.
    prismaMock.usuario.findUnique.mockResolvedValue(perfil({ rol: "admin_plataforma" }));
    prismaMock.membresiaEmpresa.findMany.mockResolvedValue([]);

    const r = await entrar();

    expect(r.siguio).toBe(true);
    expect(r.req.usuario?.rol).toBe("admin_plataforma");
    expect(r.req.usuario?.empresaId).toBeNull();
    expect(lineas.map((l) => l.nivel)).toContain("warn");
  });

  // El «ver como» (tarea 2026-08-31): con la vista puesta, el rol EFECTIVO
  // del request es el de la membresía auditor; `rolCuenta` viaja aparte para
  // que whoami pueda distinguir la vista de un auditor real.
  it("con la vista puesta el rol efectivo es auditor y rolCuenta conserva admin_plataforma", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(perfil({ rol: "admin_plataforma" }));
    prismaMock.membresiaEmpresa.findMany.mockResolvedValue([membresia({ rol: "auditor" })]);

    const r = await entrar();

    expect(r.siguio).toBe(true);
    expect(r.req.usuario?.rol).toBe("auditor");
    expect(r.req.usuario?.rolCuenta).toBe("admin_plataforma");
    expect(r.req.usuario?.empresaId).toBe(EMPRESA_A);
  });

  it("si suspenden la empresa con la vista puesta, el admin_plataforma NO queda preso: vuelve a plataforma", async () => {
    // Para cualquier otro rol la suspensión es un 403 real (kill-switch del
    // producto). Para la cuenta de plataforma sería un encierro: ni /admin ni
    // el propio salir responden con el rol efectivo auditor. Se ignora el
    // puntero —como en la rama del puntero huérfano— y queda dicho en el log.
    prismaMock.usuario.findUnique.mockResolvedValue(perfil({ rol: "admin_plataforma" }));
    prismaMock.membresiaEmpresa.findMany.mockResolvedValue([membresia({ rol: "auditor", activa: false })]);

    const r = await entrar();

    expect(r.siguio).toBe(true);
    expect(r.req.usuario?.rol).toBe("admin_plataforma");
    expect(r.req.usuario?.empresaId).toBeNull();
    expect(lineas.map((l) => l.nivel)).toContain("warn");
  });

  it("el rescate de la suspendida es SOLO para la cuenta de plataforma: un auditor real sigue en 403", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(perfil({ rol: "colaborador" }));
    prismaMock.membresiaEmpresa.findMany.mockResolvedValue([membresia({ rol: "auditor", activa: false })]);

    const r = await entrar();

    expect(r.estado).toBe(403);
    expect(r.req.usuario).toBeUndefined();
  });
});

describe("requiereAuth — la tabla de membresías todavía no existe", () => {
  /** Lo que tira Prisma cuando la migración no corrió: P2021 = la tabla no
   * existe en la base actual. */
  const sinTabla = () => Object.assign(new Error("The table `MembresiaEmpresa` does not exist"), { code: "P2021" });

  // Solo las pruebas de la ventana mueven el reloj, pero devolverlo siempre es
  // más barato que acordarse de cuál lo movió.
  afterEach(() => vi.useRealTimers());

  it("cae al rol de Usuario en vez de reventar, y lo dice en el log", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(perfil({ rol: "analista_rrhh" }));
    prismaMock.membresiaEmpresa.findMany.mockRejectedValue(sinTabla());

    const r = await entrar();

    expect(r.siguio).toBe(true);
    expect(r.req.usuario?.rol).toBe("analista_rrhh");
    expect(r.req.usuario?.empresaId).toBe(EMPRESA_A);
    // Explícito y logueado, no un catch mudo: degradar una guarda de
    // autorización en silencio es indistinguible de no tenerla.
    const aviso = lineas.find((l) => l.origen === "auth" && l.nivel === "warn");
    expect(aviso).toBeDefined();
    expect(aviso?.codigo).toBe("P2021");
  });

  it("en ese camino la suspensión SE SIGUE chequeando", async () => {
    prismaMock.membresiaEmpresa.findMany.mockRejectedValue(sinTabla());
    prismaMock.empresa.findUnique.mockResolvedValue({ activa: false });

    const r = await entrar();

    expect(prismaMock.empresa.findUnique).toHaveBeenCalledTimes(1);
    expect(r.estado).toBe(403);
    expect(r.cuerpo).toEqual({
      error: "Esta empresa está suspendida — contacta al soporte de NomiCheck.",
    });
  });

  it("cualquier OTRO error de la base propaga: no se falla abierto", async () => {
    // Si "la base no responde" se tradujera a "entrá con el rol que dice tu
    // fila", el fallback sería un agujero permanente disfrazado de
    // compatibilidad.
    prismaMock.membresiaEmpresa.findMany.mockRejectedValue(
      Object.assign(new Error("Can't reach database server"), { code: "P1001" })
    );

    await expect(entrar()).rejects.toThrow("Can't reach database server");
    expect(lineas).toHaveLength(0);
  });

  it("una COLUMNA que falta (P2022) NO degrada: propaga como cualquier otro error", async () => {
    // El disparador de la degradación tiene que ser "todavía no hay
    // membresías", y P2022 no es eso: es la tabla PRESENTE Y POBLADA a la que
    // le falta una columna — el estado normal de agregarle un campo al modelo
    // y desplegar antes de migrar. Degradar ahí es volver a resolver por
    // `Usuario.rol` cuando el rol de cuenta y el de la membresía YA divergen,
    // o sea conceder lo que el modelo nuevo niega. Justo al revés de P2021.
    prismaMock.membresiaEmpresa.findMany.mockRejectedValue(
      Object.assign(new Error("The column `MembresiaEmpresa.creadaEn` does not exist"), { code: "P2022" })
    );

    await expect(entrar()).rejects.toThrow("does not exist");
    expect(lineas).toHaveLength(0);
  });

  it("el aviso de cada request degradado sube un contador y muestra el reloj", async () => {
    // Un `warn` con la misma frase en cada request es una línea que se pierde
    // en el ruido. Con el contador y los minutos que quedan, dos líneas
    // seguidas ya dicen si esto empezó recién o lleva rato.
    prismaMock.membresiaEmpresa.findMany.mockRejectedValue(sinTabla());

    await entrar();
    await entrar();

    const avisos = lineas.filter((l) => l.origen === "auth" && l.nivel === "warn");
    expect(avisos.map((a) => a.requestsDegradados)).toEqual([1, 2]);
    expect(avisos[1]?.minutosRestantes).toBe(15);
  });

  it("la degradación SE APAGA SOLA: vencida la ventana el error sube y suena la alarma", async () => {
    // Lo que esta prueba defiende es que la degradación tenga fin sin que nadie
    // la apague. Una guarda de autorización degradada para siempre es
    // indistinguible de no tenerla, y depender de que alguien lea los `warn`
    // es depender de que alguien mire.
    vi.useFakeTimers();
    prismaMock.membresiaEmpresa.findMany.mockRejectedValue(sinTabla());

    // Dentro de la ventana: entra con el rol de su fila, como ayer.
    expect((await entrar()).siguio).toBe(true);

    // Un cuarto de hora después la migración sigue sin correr.
    vi.advanceTimersByTime(16 * 60 * 1000);

    await expect(entrar()).rejects.toThrow("does not exist");
    // `nivel:"error"` es el que `registro.ts` documenta cómo grepear, y sale
    // por stderr: la alarma no puede ser del mismo color que el aviso.
    const alarma = lineas.find((l) => l.origen === "auth" && l.nivel === "error");
    expect(alarma).toBeDefined();
    expect(alarma?.requestsDegradados).toBe(1);
  });

  it("una vez cerrada, la ventana no se reabre sola con el request siguiente", async () => {
    // El contador no puede volver a arrancar: si cada request vencido
    // reiniciara la marca, la ventana sería infinita en tramos de 15 minutos.
    vi.useFakeTimers();
    prismaMock.membresiaEmpresa.findMany.mockRejectedValue(sinTabla());

    await entrar();
    vi.advanceTimersByTime(16 * 60 * 1000);
    await expect(entrar()).rejects.toThrow("does not exist");
    await expect(entrar()).rejects.toThrow("does not exist");

    expect(lineas.filter((l) => l.nivel === "error")).toHaveLength(2);
    // Y ninguno de los dos volvió a degradar: el único `warn` es el primero.
    expect(lineas.filter((l) => l.nivel === "warn")).toHaveLength(1);
  });
});

describe("requierePermiso", () => {
  it("deja pasar lo que la matriz concede", () => {
    expect(guardar(requierePermiso("nomina.ver"), { rol: "auditor" }).siguio).toBe(true);
    expect(guardar(requierePermiso("nomina.pagar"), { rol: "admin_empresa" }).siguio).toBe(true);
    expect(guardar(requierePermiso("nomina.operar"), { rol: "analista_rrhh" }).siguio).toBe(true);
    expect(guardar(requierePermiso("discrepancias.reportar"), { rol: "colaborador" }).siguio).toBe(true);
    expect(guardar(requierePermiso("plataforma.reglas"), { rol: "admin_plataforma" }).siguio).toBe(true);
  });

  it("rechaza lo que la matriz no concede", () => {
    // El auditor es solo lectura (SDD §15, pilar 1); el analista liquida pero
    // no paga; el colaborador no ve la empresa; la plataforma no opera nómina.
    for (const [permiso, rol] of [
      ["nomina.operar", "auditor"],
      ["nomina.pagar", "analista_rrhh"],
      ["empleados.ver", "colaborador"],
      ["nomina.ver", "admin_plataforma"],
      ["plataforma.empresas", "admin_empresa"],
    ] as const) {
      const r = guardar(requierePermiso(permiso), { rol });
      expect(r.estado, `${rol} / ${permiso}`).toBe(403);
      expect(r.siguio, `${rol} / ${permiso}`).toBe(false);
    }
  });

  it("sin sesión es 403, igual que requiereRol", () => {
    expect(guardar(requierePermiso("empresa.ver")).estado).toBe(403);
  });

  it("un rol que no está en la matriz no pasa por 'no figura en la lista'", () => {
    // `Usuario.rol` y `MembresiaEmpresa.rol` son `String` en la base: una fila
    // con un rol viejo o con typo entra a la aplicación igual.
    const r = guardar(requierePermiso("empresa.ver"), { rol: "admin" });
    expect(r.estado).toBe(403);
    expect(r.siguio).toBe(false);
  });

  it("responde EXACTAMENTE igual que requiereRol", () => {
    // Migrar una ruta de una guarda a la otra no puede cambiar lo que ve el
    // cliente: mismo status y mismo cuerpo.
    const conPermiso = guardar(requierePermiso("empresa.editar"), { rol: "auditor" });
    const conRol = guardar(requiereRol("admin_empresa"), { rol: "auditor" });
    expect(conPermiso.estado).toBe(conRol.estado);
    expect(conPermiso.cuerpo).toEqual(conRol.cuerpo);
    expect(conPermiso.cuerpo).toEqual({ error: "No tienes permiso para esta acción" });
  });
});

// Desde el 2026-08-31 ninguna ruta enumera roles (`routes/__tests__/guardas.test.ts`
// lo exige): `requiereRol` queda como la primitiva sobre la que `requierePermiso`
// está construido, y estas pruebas la sostienen — sobre todo la segunda, que es
// una propiedad de la guarda y no del router.
describe("requiereRol, la primitiva", () => {
  it("deja pasar al rol enumerado y rechaza al resto", () => {
    expect(guardar(requiereRol("admin_empresa"), { rol: "admin_empresa" }).siguio).toBe(true);
    expect(guardar(requiereRol("admin_empresa"), { rol: "analista_rrhh" }).estado).toBe(403);
    expect(guardar(requiereRol("colaborador")).estado).toBe(403);
  });

  it("lo evalúa sobre el rol EFECTIVO que dejó requiereAuth", async () => {
    // La guarda vieja tampoco puede quedar mirando `Usuario.rol`: si la
    // membresía dice auditor, `soloAdminEmpresa` tiene que rechazar aunque la
    // cuenta diga admin_empresa.
    prismaMock.usuario.findUnique.mockResolvedValue(perfil({ rol: "admin_empresa" }));
    prismaMock.membresiaEmpresa.findMany.mockResolvedValue([membresia({ rol: "auditor" })]);

    const { req } = await entrar();

    expect(guardar(requiereRol("admin_empresa"), req.usuario).estado).toBe(403);
  });
});

// `UsuarioSede` no tiene `empresaId` propio: su dueño se deriva de `Sede`. Es
// la forma exacta de los cuatro modelos de `lib/alcance.ts` —el `where` está
// completo respecto de lo que la tabla ofrece y aun así no dice de quién es la
// fila— pero fuera del embudo del compilador, así que el ancla la sostienen
// estas pruebas.
describe("sedesDelUsuario — el scoping por sede va anclado a la empresa activa", () => {
  function analista(over: Partial<UsuarioAutenticado> = {}): UsuarioAutenticado {
    return { id: UID, nombre: "Carla", rol: "analista_rrhh", empresaId: EMPRESA_A, empleadoId: null, ...over };
  }

  it("solo el analista_rrhh tiene scoping, y para el resto ni consulta", async () => {
    for (const rol of ["admin_empresa", "auditor", "colaborador", "admin_plataforma"]) {
      expect(await sedesDelUsuario(analista({ rol })), rol).toBeNull();
    }
    expect(prismaMock.usuarioSede.findMany).not.toHaveBeenCalled();
  });

  it("el where lleva el ANCLA de la empresa activa, no solo el usuarioId", async () => {
    prismaMock.usuarioSede.findMany.mockResolvedValue([{ sedeId: 10 }]);

    expect(await sedesDelUsuario(analista())).toEqual([10]);

    const args = prismaMock.usuarioSede.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(args.where).toEqual({ usuarioId: UID, sede: { empresaId: EMPRESA_A } });
  });

  it("no arrastra a otra empresa las sedes de la primera", async () => {
    // Carla es analista_rrhh en las dos empresas, restringida a la sede 10 —que
    // es de la empresa A— y sin restricción en la B. Sin el ancla la consulta
    // devolvía la sede 10 en las dos: en la B ese id es de otro tenant, y con
    // él se resolvía su scoping ahí.
    prismaMock.usuarioSede.findMany.mockImplementation(
      async (args: { where: { sede?: { empresaId?: number } } }) =>
        args.where.sede?.empresaId === EMPRESA_A ? [{ sedeId: 10 }] : []
    );

    expect(await sedesDelUsuario(analista({ empresaId: EMPRESA_A }))).toEqual([10]);
    // En la B no tiene sedes asignadas: la convención "sin sedes = ve toda la
    // empresa" se aplica POR EMPRESA, que es lo correcto — su restricción en A
    // no es una restricción en B, ni al revés.
    expect(await sedesDelUsuario(analista({ empresaId: EMPRESA_B }))).toBeNull();
  });

  it("sin empresa activa no devuelve sedes: falla cerrado y no consulta", async () => {
    // `null` acá significaría "sin scoping" — el lado que concede— y no hay
    // ninguna empresa contra la cual anclar. La lista vacía es el otro lado:
    // `{ sedeId: { in: [] } }` no trae nada y `empleadoAccesible` rechaza.
    expect(await sedesDelUsuario(analista({ empresaId: null }))).toEqual([]);
    expect(prismaMock.usuarioSede.findMany).not.toHaveBeenCalled();
  });

  it("cero sedes EN LA EMPRESA ACTIVA sigue siendo 've toda la empresa'", async () => {
    // La convención de las empresas sin sucursales no cambia; lo que cambia es
    // que ahora ese cero solo puede venir de la empresa activa.
    prismaMock.usuarioSede.findMany.mockResolvedValue([]);
    expect(await sedesDelUsuario(analista())).toBeNull();
  });
});
