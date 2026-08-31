// Los dos endpoints de sesión que decide este controlador: "¿quién soy?" y
// "cambiame de empresa". Lo que se prueba acá es el MAPEO HTTP —qué status y
// qué cuerpo ve el cliente para cada resultado del servicio—, no la regla de
// pertenencia: esa vive en `authService.test.ts`, donde se puede probar contra
// la consulta que la hace cumplir.
//
// NINGUNA PRUEBA TOCA LA BASE NI SUPABASE. El servicio va mockeado entero (acá
// interesa la traducción, no la consulta) y `lib/supabaseAdmin.js` es
// obligatorio cortarlo: el módulo real hace `createClient(process.env.SUPABASE_URL!, ...)`
// en el import y explota sin variables de entorno.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { servicioMock } = vi.hoisted(() => ({
  servicioMock: {
    cambiarEmpresaActiva: vi.fn(),
    salirDeVistaPlataforma: vi.fn(),
    empresasDeUsuario: vi.fn(),
    registrarEmpresa: vi.fn(),
    registrarIndividual: vi.fn(),
    asegurarPerfilIndividual: vi.fn(),
    invitarColaborador: vi.fn(),
  },
}));

vi.mock("../../services/authService.js", () => servicioMock);
vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../lib/supabaseAdmin.js", () => ({ supabaseAdmin: { auth: { admin: {} } } }));

import { empresaActiva, salirVistaPlataforma, whoami } from "../authController.js";
import { EMPRESA_SUSPENDIDA, NO_PERTENECES, type UsuarioAutenticado } from "../../middleware/auth.js";

const UID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPRESA_A = 1;
const EMPRESA_B = 2;

/** El `req.usuario` que dejó `requiereAuth` — ya validado contra la membresía. */
function sesion(over: Partial<UsuarioAutenticado> = {}): UsuarioAutenticado {
  return {
    id: UID,
    nombre: "Ana",
    rol: "admin_empresa",
    rolCuenta: "admin_empresa",
    empresaId: EMPRESA_A,
    empleadoId: null,
    ...over,
  };
}

function pedir(body: unknown, usuario: UsuarioAutenticado = sesion()) {
  const req = { body, usuario } as unknown as Request;
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
  } as unknown as Response;
  return { req, res, visto };
}

beforeEach(() => {
  vi.clearAllMocks();
  servicioMock.empresasDeUsuario.mockResolvedValue([]);
});

describe("whoami", () => {
  it("devuelve la sesión más TODAS las empresas de la cuenta", async () => {
    // El selector del header se dibuja con esto: sin `empresas`, un admin de
    // dos empresas no tiene forma de saber que la otra existe.
    servicioMock.empresasDeUsuario.mockResolvedValue([
      { id: EMPRESA_A, nombre: "Acme", rol: "admin_empresa" },
      { id: EMPRESA_B, nombre: "Beta", rol: "auditor" },
    ]);
    const { req, res, visto } = pedir(undefined, sesion({ empleadoId: 7 }));

    await whoami(req, res);

    expect(visto.cuerpo).toEqual({
      rol: "admin_empresa",
      rolCuenta: "admin_empresa",
      empresaId: EMPRESA_A,
      empleadoId: 7,
      empresas: [
        { id: EMPRESA_A, nombre: "Acme", rol: "admin_empresa" },
        { id: EMPRESA_B, nombre: "Beta", rol: "auditor" },
      ],
    });
  });

  it("con la vista de plataforma puesta, rol y rolCuenta divergen — y los dos viajan", async () => {
    // Es lo ÚNICO que le permite a la web distinguir el «ver como» (barra de
    // salida) de un auditor real: el efectivo dice auditor, la cuenta dice
    // plataforma.
    const { req, res, visto } = pedir(undefined, sesion({ rol: "auditor", rolCuenta: "admin_plataforma" }));

    await whoami(req, res);

    expect(visto.cuerpo).toMatchObject({ rol: "auditor", rolCuenta: "admin_plataforma" });
  });

  it("las empresas se piden por el id de la SESIÓN, nunca por uno del cliente", async () => {
    const { req, res } = pedir(undefined);
    await whoami(req, res);
    expect(servicioMock.empresasDeUsuario).toHaveBeenCalledWith(UID);
  });

  it("una cuenta sin empresas responde la lista vacía (individual, colaborador libre)", async () => {
    const { req, res, visto } = pedir(undefined, sesion({ rol: "individual", rolCuenta: "individual", empresaId: null }));
    await whoami(req, res);
    expect(visto.cuerpo).toEqual({
      rol: "individual",
      rolCuenta: "individual",
      empresaId: null,
      empleadoId: null,
      empresas: [],
    });
  });
});

describe("POST /auth/vista-plataforma/salir", () => {
  it("ok responde la empresa que se dejó", async () => {
    servicioMock.salirDeVistaPlataforma.mockResolvedValue({ estado: "ok", empresaId: EMPRESA_A });
    const { req, res, visto } = pedir(undefined, sesion({ rol: "auditor", rolCuenta: "admin_plataforma" }));

    await salirVistaPlataforma(req, res);

    expect(visto.estado).toBeUndefined(); // 200 implícito
    expect(visto.cuerpo).toEqual({ empresaId: EMPRESA_A });
    // El id sale de la sesión, jamás de un body del cliente.
    expect(servicioMock.salirDeVistaPlataforma).toHaveBeenCalledWith(UID);
  });

  it("una cuenta que no es de plataforma recibe 403", async () => {
    servicioMock.salirDeVistaPlataforma.mockResolvedValue({ estado: "no_plataforma" });
    const { req, res, visto } = pedir(undefined, sesion({ rol: "auditor", rolCuenta: "colaborador" }));

    await salirVistaPlataforma(req, res);

    expect(visto.estado).toBe(403);
  });

  it("parado por membresía real es 409: eso no es una vista y no se borra", async () => {
    servicioMock.salirDeVistaPlataforma.mockResolvedValue({ estado: "membresia_real", rol: "admin_empresa" });
    const { req, res, visto } = pedir(undefined, sesion({ rolCuenta: "admin_plataforma" }));

    await salirVistaPlataforma(req, res);

    expect(visto.estado).toBe(409);
  });
});

describe("POST /auth/empresa-activa", () => {
  it("con membresía responde el puntero nuevo y su rol", async () => {
    servicioMock.cambiarEmpresaActiva.mockResolvedValue({ estado: "ok", empresaId: EMPRESA_B, rol: "auditor" });
    const { req, res, visto } = pedir({ empresaId: EMPRESA_B });

    await empresaActiva(req, res);

    expect(visto.estado).toBeUndefined(); // 200 implícito
    expect(visto.cuerpo).toEqual({ empresaId: EMPRESA_B, rol: "auditor" });
  });

  it("el id del cliente va al SERVICIO junto con el usuario de la sesión", async () => {
    // El primer argumento sale de `req.usuario`, no del body: si el usuarioId
    // fuera del cliente, cualquiera movería el puntero de cualquier cuenta.
    servicioMock.cambiarEmpresaActiva.mockResolvedValue({ estado: "ok", empresaId: EMPRESA_B, rol: "auditor" });
    const { req, res } = pedir({ empresaId: EMPRESA_B, usuarioId: "otro" });

    await empresaActiva(req, res);

    expect(servicioMock.cambiarEmpresaActiva).toHaveBeenCalledWith(UID, EMPRESA_B);
  });

  it("sin membresía es 403, con el MISMO texto que la puerta", async () => {
    // `requiereAuth` responde eso mismo cuando el puntero no tiene membresía:
    // dos mensajes distintos para el mismo hecho obligarían al cliente a
    // aprender dos vocabularios.
    servicioMock.cambiarEmpresaActiva.mockResolvedValue({ estado: "sin_membresia" });
    const { req, res, visto } = pedir({ empresaId: 99999 });

    await empresaActiva(req, res);

    expect(visto.estado).toBe(403);
    expect(visto.cuerpo).toEqual({ error: NO_PERTENECES });
  });

  it("empresa suspendida es 403 con el mensaje de suspensión", async () => {
    servicioMock.cambiarEmpresaActiva.mockResolvedValue({ estado: "suspendida" });
    const { req, res, visto } = pedir({ empresaId: EMPRESA_B });

    await empresaActiva(req, res);

    expect(visto.estado).toBe(403);
    expect(visto.cuerpo).toEqual({ error: EMPRESA_SUSPENDIDA });
  });

  it.each([
    ["sin empresaId", {}],
    ["empresaId como texto", { empresaId: "2" }],
    ["empresaId negativo", { empresaId: -1 }],
    ["empresaId decimal", { empresaId: 1.5 }],
    ["body ausente", undefined],
  ])("body inválido (%s): 400 y el servicio NO se llama", async (_caso, body) => {
    // Que el 400 corte ANTES del servicio es lo que impide que un `NaN` o un
    // `"2"` lleguen a la consulta de membresía, donde el `where` compararía
    // cualquier cosa.
    const { req, res, visto } = pedir(body);

    await empresaActiva(req, res);

    expect(visto.estado).toBe(400);
    expect(servicioMock.cambiarEmpresaActiva).not.toHaveBeenCalled();
  });
});
