// Las tres rutas del panel de plataforma que escriben `Usuario`: crear una
// empresa con su primer admin, reemplazar al admin y quitarlo.
//
// LO QUE SE PRUEBA ACÁ ES QUIÉN FIRMA. La regla de pertenencia —a quién se
// puede quitar, a dónde va el puntero después de la baja— vive en
// `authService.test.ts`, contra las consultas que la hacen cumplir. Este
// archivo cubre el tramo que ninguna de esas pruebas puede ver: que el
// controlador le PASE al servicio el id de quien está ejecutando.
//
// Por qué merece pruebas propias y no es ceremonia: `Usuario` está vigilado por
// `fn_auditar_cambio`, que lee el autor de `app.usuario_actual`. El servicio
// acepta el actor como parámetro OPCIONAL —tiene que serlo para los llamadores
// sin actor—, así que olvidarse de pasarlo compila, responde 201/204 y deja el
// rastro con `usuarioId = NULL`: constancia de que a un admin lo sacaron de una
// empresa y ninguna de quién lo sacó. Un olvido silencioso solo lo agarra una
// prueba que mire el argumento.
//
// NINGUNA PRUEBA TOCA LA BASE NI SUPABASE: los dos servicios van mockeados y
// `lib/supabaseAdmin.js` es obligatorio cortarlo (el módulo real hace
// `createClient(process.env.SUPABASE_URL!, ...)` en el import y explota sin
// variables de entorno).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { authMock, empresasMock } = vi.hoisted(() => ({
  authMock: {
    crearEmpresaConAdmin: vi.fn(),
    reasignarAdminEmpresa: vi.fn(),
    quitarAdminEmpresa: vi.fn(),
    entrarComoVistaPlataforma: vi.fn(),
  },
  empresasMock: {
    listarEmpresasAdmin: vi.fn(),
    cambiarEstadoEmpresa: vi.fn(),
  },
}));

vi.mock("../../services/authService.js", () => authMock);
vi.mock("../../services/empresasAdminService.js", () => empresasMock);
vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../lib/supabaseAdmin.js", () => ({ supabaseAdmin: { auth: { admin: {} } } }));

import { crear, entrar, quitarAdmin, reasignarAdmin } from "../empresasAdminController.js";
import type { UsuarioAutenticado } from "../../middleware/auth.js";

/** El admin_plataforma que ejecuta: es el que tiene que quedar firmado. */
const UID_ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** El admin_empresa al que le pasan cosas. Distinto del actor a propósito: si
 * fueran el mismo uuid, "quedó firmado por quien ejecutó" pasaría igual con el
 * argumento equivocado. */
const UID_VICTIMA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMPRESA = 7;

/** El `req.usuario` que dejó `requiereAuth`: las cuatro rutas del panel entran
 * por `conPermiso("plataforma.empresas")`, o sea `[requiereAuth,
 * requierePermiso]`, así que cuando el controlador corre ya está adjunto. */
function sesion(): UsuarioAutenticado {
  return {
    id: UID_ACTOR,
    nombre: "Plataforma",
    rol: "admin_plataforma",
    rolCuenta: "admin_plataforma",
    empresaId: null,
    empleadoId: null,
  };
}

function pedir(body: unknown, params: Record<string, string> = {}) {
  const req = { body, params, usuario: sesion() } as unknown as Request;
  const visto = { estado: undefined as number | undefined, cuerpo: undefined as unknown };
  const res = {
    status(s: number) {
      visto.estado = s;
      return this;
    },
    json(c: unknown) {
      visto.cuerpo = c;
      return this;
    },
    end() {
      return this;
    },
  } as unknown as Response;
  return { req, res, visto };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("crear (onboarding manual)", () => {
  const cuerpo = { empresa: { nombre: "Acme", nit: "900123456-1", sector: "servicios" }, nombreAdmin: "Ana", emailAdmin: "ana@acme.co" };

  it("le pasa al servicio el id del admin_plataforma que hace el onboarding", async () => {
    authMock.crearEmpresaConAdmin.mockResolvedValue({ empresa: { id: EMPRESA }, usuario: { id: UID_VICTIMA } });
    const { req, res, visto } = pedir(cuerpo);

    await crear(req, res);

    expect(visto.estado).toBe(201);
    expect(authMock.crearEmpresaConAdmin).toHaveBeenCalledWith(expect.anything(), UID_ACTOR);
  });

  it("no llama al servicio si el cuerpo no valida", async () => {
    const { req, res, visto } = pedir({ empresa: { nombre: "" } });

    await crear(req, res);

    expect(visto.estado).toBe(400);
    expect(authMock.crearEmpresaConAdmin).not.toHaveBeenCalled();
  });
});

describe("reasignarAdmin", () => {
  const cuerpo = { nombreAdmin: "Beto", emailAdmin: "beto@acme.co" };

  it("le pasa al servicio el id de quien reemplaza al admin", async () => {
    // Es la escritura más pesada de las tres: crea un admin nuevo y revoca al
    // anterior. Sin actor, la bitácora muestra que la empresa cambió de dueño
    // y no quién lo decidió.
    authMock.reasignarAdminEmpresa.mockResolvedValue({ id: UID_VICTIMA });
    const { req, res, visto } = pedir(cuerpo, { id: String(EMPRESA) });

    await reasignarAdmin(req, res);

    expect(visto.estado).toBe(201);
    expect(authMock.reasignarAdminEmpresa).toHaveBeenCalledWith(EMPRESA, cuerpo, UID_ACTOR);
  });
});

describe("quitarAdmin", () => {
  it("le pasa al servicio el id de quien ejecuta la baja, no el del que se va", async () => {
    // La aserción distingue los dos uuids: el argumento del actor tiene que ser
    // el del que ejecuta, y el de la víctima tiene que seguir en su lugar.
    authMock.quitarAdminEmpresa.mockResolvedValue(undefined);
    const { req, res, visto } = pedir(undefined, { id: String(EMPRESA), usuarioId: UID_VICTIMA });

    await quitarAdmin(req, res);

    expect(visto.estado).toBe(204);
    expect(authMock.quitarAdminEmpresa).toHaveBeenCalledWith(EMPRESA, UID_VICTIMA, UID_ACTOR);
  });

  it("traduce el rechazo del servicio a 422 sin filtrar de más", async () => {
    // El servicio da el MISMO mensaje para "no hay membresía", "la membresía no
    // es de admin" y "el id no es un id": el controlador lo repite tal cual y no
    // agrega nada que distinga cuál de las tres fue.
    authMock.quitarAdminEmpresa.mockRejectedValue(new Error("Ese usuario no es el admin_empresa de esta empresa"));
    const { req, res, visto } = pedir(undefined, { id: String(EMPRESA), usuarioId: UID_VICTIMA });

    await quitarAdmin(req, res);

    expect(visto.estado).toBe(422);
    expect(visto.cuerpo).toEqual({ error: "Ese usuario no es el admin_empresa de esta empresa" });
  });
});

describe("POST /admin/empresas/:id/entrar — el «ver como» solo lectura", () => {
  it("ok responde la empresa y firma con el actor de la sesión", async () => {
    authMock.entrarComoVistaPlataforma.mockResolvedValue({ estado: "ok", empresaId: EMPRESA });
    const { req, res, visto } = pedir(undefined, { id: String(EMPRESA) });

    await entrar(req, res);

    expect(visto.estado).toBeUndefined(); // 200 implícito
    expect(visto.cuerpo).toEqual({ empresaId: EMPRESA });
    expect(authMock.entrarComoVistaPlataforma).toHaveBeenCalledWith(UID_ACTOR, EMPRESA);
  });

  it("una membresía real de la cuenta es 409 y nombra el rol que ya tiene", async () => {
    authMock.entrarComoVistaPlataforma.mockResolvedValue({ estado: "membresia_real", rol: "admin_empresa" });
    const { req, res, visto } = pedir(undefined, { id: String(EMPRESA) });

    await entrar(req, res);

    expect(visto.estado).toBe(409);
    expect(visto.cuerpo).toEqual({
      error: "Tu cuenta ya es admin_empresa de esta empresa — esa pertenencia es real, no una vista.",
    });
  });

  it("suspendida e inexistente responden 422 con mensajes distintos", async () => {
    authMock.entrarComoVistaPlataforma.mockResolvedValue({ estado: "suspendida" });
    const suspendida = pedir(undefined, { id: String(EMPRESA) });
    await entrar(suspendida.req, suspendida.res);
    expect(suspendida.visto.estado).toBe(422);
    expect(suspendida.visto.cuerpo).toEqual({ error: "La empresa está suspendida; reactívala antes de entrar." });

    authMock.entrarComoVistaPlataforma.mockResolvedValue({ estado: "no_encontrada" });
    const inexistente = pedir(undefined, { id: "999" });
    await entrar(inexistente.req, inexistente.res);
    expect(inexistente.visto.estado).toBe(422);
    expect(inexistente.visto.cuerpo).toEqual({ error: "Empresa no encontrada" });
  });
});
