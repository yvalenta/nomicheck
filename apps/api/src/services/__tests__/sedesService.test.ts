// Tests de `sedesService.ts` — sedes y staff empresarial (SDD §15, pilar 1).
// Acá el riesgo cross-tenant tiene TRES caras:
//
//   1. La clásica: operar sobre una sede de otra empresa por id.
//   2. La de personas: `asignarStaff` puede ROBAR una cuenta ya vinculada a
//      otra empresa, o colgar a un analista de sedes ajenas — y quien queda
//      con acceso a datos que no le tocan es una CUENTA, no una fila.
//   3. La que trajo el modelo N:M: `UsuarioSede` no tiene `empresaId` propio.
//      Una consulta filtrada solo por `usuarioId` alcanza las asignaciones de
//      TODAS las empresas — el admin de B borra el scoping que A le puso a esa
//      persona y le abre la nómina entera de A sin tocar nada de A.
//
// Y una cuarta, que no es de tenant sino de tiempo: desde `MembresiaEmpresa`,
// la pertenencia y el rol efectivo NO salen de `Usuario.empresaId`/`Usuario.rol`
// (eso es solo el puntero a la empresa activa). Preguntarle al puntero hace
// desaparecer de la lista a quien está parado en otra de sus empresas, y una
// baja que no borra la membresía no es una baja: la persona vuelve sola con un
// `POST /auth/empresa-activa`.
//
// Mismo patrón hermético que empleadosService.test.ts: corte en
// `lib/prisma.js`, mini-base con filas de DOS empresas y wheres que se evalúan
// DE VERDAD —incluido el ancla por relación `sede: { empresaId }`— así que
// perder el tenant hace aparecer (o borra) la fila ajena y pone la prueba en
// rojo.
//
// `conAuditoria`, `otorgarMembresia` y `revocarMembresia` corren de verdad:
// mockearlos probaría el mock. Lo único cortado es el cliente de base.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock, txMock } = vi.hoisted(() => {
  const modelos = () => ({
    sede: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), delete: vi.fn() },
    usuario: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    usuarioSede: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    membresiaEmpresa: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    empleado: { updateMany: vi.fn() },
  });
  return {
    prismaMock: { ...modelos(), $transaction: vi.fn() },
    // El tx es OTRO objeto a propósito: si el servicio escribe en
    // prisma.<modelo> en vez de tx.<modelo>, la operación queda FUERA de la
    // transacción (no se revierte con las demás, y el `SET LOCAL` del actor no
    // le aplica) y estos mocks lo delatan.
    txMock: { ...modelos(), $executeRaw: vi.fn() },
  };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import {
  asignarStaff,
  crearSede,
  eliminarSede,
  ErrorAsignacionStaff,
  ErrorConflictoSede,
  listarSedes,
  listarStaff,
  quitarStaff,
} from "../sedesService.js";

// --- mini-base multi-tenant ------------------------------------------------

const EMPRESA_A = 1;
const EMPRESA_B = 2;

// Quien ejecuta la acción. Viaja hasta el servicio solo para que el trigger de
// auditoría sobre `Usuario` pueda nombrarlo: sin él, "a Fulano lo sacaron de la
// empresa" queda escrito sin decir quién lo sacó.
const ACTOR = "99999999-9999-4999-8999-999999999999";

interface FilaSede {
  id: number;
  empresaId: number;
  nombre: string;
  [k: string]: unknown;
}

interface FilaUsuario {
  id: string;
  email: string;
  nombre: string;
  /** Rol de CUENTA. Ya no es el rol efectivo en una empresa: eso es la membresía. */
  rol: string;
  /** Puntero a la empresa ACTIVA, no la pertenencia. */
  empresaId: number | null;
}

interface FilaMembresia {
  usuarioId: string;
  empresaId: number;
  rol: string;
  /** Monótono, como el DEFAULT now() de la migración: menor = más vieja. */
  creadoEn: number;
}

interface FilaUsuarioSede {
  usuarioId: string;
  sedeId: number;
}

// La sede 20 y las cuentas de B existen para probar que ninguna query de A las
// alcanza — y al revés: que ninguna operación de B alcanza las sedes de A.
function semillaSedes(): FilaSede[] {
  return [
    { id: 10, empresaId: EMPRESA_A, nombre: "Centro" },
    { id: 11, empresaId: EMPRESA_A, nombre: "Norte" },
    { id: 20, empresaId: EMPRESA_B, nombre: "Sur Ajena" },
  ];
}

// Beto y Carla son las dos personas que el modelo N:M vino a habilitar y que
// el modelo viejo no sabía nombrar: pertenecen a A y a B a la vez, y su
// puntero está parado en B.
//
//   · Beto  → auditor en A (más viejo), admin_empresa en B. Es el miembro que
//     `listarStaff` hacía invisible y `quitarStaff` no encontraba.
//   · Carla → analista_rrhh en A restringida a la sede 10, auditora en B con
//     la sede 20. Es a quien el admin de B le borraba el scoping de A.
function semillaUsuarios(): FilaUsuario[] {
  return [
    { id: "uid-admin-a", email: "admin@a.com", nombre: "Admin A", rol: "admin_empresa", empresaId: EMPRESA_A },
    { id: "uid-analista-a", email: "analista@a.com", nombre: "Analista A", rol: "analista_rrhh", empresaId: EMPRESA_A },
    { id: "uid-libre", email: "libre@x.com", nombre: "Cuenta Libre", rol: "individual", empresaId: null },
    { id: "uid-cfo-b", email: "cfo@b.com", nombre: "CFO de B", rol: "admin_empresa", empresaId: EMPRESA_B },
    { id: "uid-analista-b", email: "analista@b.com", nombre: "Analista B", rol: "analista_rrhh", empresaId: EMPRESA_B },
    { id: "uid-beto", email: "beto@x.com", nombre: "Beto Dos Empresas", rol: "admin_empresa", empresaId: EMPRESA_B },
    { id: "uid-carla", email: "carla@x.com", nombre: "Carla Dos Sedes", rol: "auditor", empresaId: EMPRESA_B },
    // Puntero en null pero miembro de B: el que el guard viejo —que le
    // preguntaba al puntero— dejaba absorber.
    { id: "uid-suelto-b", email: "suelto@b.com", nombre: "Suelto de B", rol: "individual", empresaId: null },
  ];
}

function semillaMembresias(): FilaMembresia[] {
  return [
    { usuarioId: "uid-admin-a", empresaId: EMPRESA_A, rol: "admin_empresa", creadoEn: 1 },
    { usuarioId: "uid-analista-a", empresaId: EMPRESA_A, rol: "analista_rrhh", creadoEn: 2 },
    { usuarioId: "uid-cfo-b", empresaId: EMPRESA_B, rol: "admin_empresa", creadoEn: 3 },
    { usuarioId: "uid-analista-b", empresaId: EMPRESA_B, rol: "analista_rrhh", creadoEn: 4 },
    { usuarioId: "uid-beto", empresaId: EMPRESA_A, rol: "auditor", creadoEn: 5 },
    { usuarioId: "uid-beto", empresaId: EMPRESA_B, rol: "admin_empresa", creadoEn: 6 },
    { usuarioId: "uid-carla", empresaId: EMPRESA_A, rol: "analista_rrhh", creadoEn: 7 },
    { usuarioId: "uid-carla", empresaId: EMPRESA_B, rol: "auditor", creadoEn: 8 },
    { usuarioId: "uid-suelto-b", empresaId: EMPRESA_B, rol: "auditor", creadoEn: 9 },
  ];
}

function semillaUsuarioSede(): FilaUsuarioSede[] {
  return [
    { usuarioId: "uid-analista-a", sedeId: 10 },
    { usuarioId: "uid-analista-b", sedeId: 20 },
    { usuarioId: "uid-beto", sedeId: 11 },
    { usuarioId: "uid-carla", sedeId: 10 }, // empresa A
    { usuarioId: "uid-carla", sedeId: 20 }, // empresa B
  ];
}

let bdSedes: FilaSede[];
let bdUsuarios: FilaUsuario[];
let bdMembresias: FilaMembresia[];
let bdUsuarioSede: FilaUsuarioSede[];

function cumpleWhere(fila: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [campo, cond] of Object.entries(where)) {
    if (cond !== null && typeof cond === "object") {
      const abanico = (cond as { in?: unknown[] }).in;
      if (abanico !== undefined && !abanico.includes(fila[campo])) return false;
    } else if (fila[campo] !== cond) {
      return false;
    }
  }
  return true;
}

/** El dueño de una sede vive en el padre — que es exactamente por lo que
 * `UsuarioSede` necesita el ancla explícita. */
function empresaDeSede(sedeId: number): number | undefined {
  return bdSedes.find((s) => s.id === sedeId)?.empresaId;
}

interface WhereUsuarioSede {
  usuarioId?: string;
  sedeId?: number;
  sede?: { empresaId?: number };
}

/** Evalúa el where de `UsuarioSede` DE VERDAD, ancla incluida. Si el servicio
 * omite `sede: { empresaId }`, este matcher deja pasar las filas de la otra
 * empresa — y esa es la única razón por la que existe. */
function cumpleUsuarioSede(fila: FilaUsuarioSede, where: WhereUsuarioSede): boolean {
  if (where.usuarioId !== undefined && fila.usuarioId !== where.usuarioId) return false;
  if (where.sedeId !== undefined && fila.sedeId !== where.sedeId) return false;
  if (where.sede?.empresaId !== undefined && empresaDeSede(fila.sedeId) !== where.sede.empresaId) {
    return false;
  }
  return true;
}

interface WhereMembresia {
  usuarioId?: string;
  empresaId?: number;
  rol?: { in?: string[] };
}

interface SelectMembresia {
  usuario?: { select?: { sedesAsignadas?: { where?: WhereUsuarioSede } } };
}

/** Una fila de membresía con lo que cualquiera de los dos consumidores pueda
 * pedirle: `membresiasDe` mira `empresa.activa`; `listarStaff` mira el usuario
 * y sus sedes. Las sedes se filtran con el where que la consulta trajo — sin
 * where, salen todas, incluidas las de la otra empresa. */
function proyectarMembresia(m: FilaMembresia, select: SelectMembresia | undefined) {
  const u = bdUsuarios.find((x) => x.id === m.usuarioId)!;
  const filtroSedes = select?.usuario?.select?.sedesAsignadas?.where;
  const sedes = bdUsuarioSede.filter(
    (f) => f.usuarioId === m.usuarioId && (filtroSedes === undefined || cumpleUsuarioSede(f, filtroSedes))
  );
  return {
    usuarioId: m.usuarioId,
    empresaId: m.empresaId,
    rol: m.rol,
    creadoEn: m.creadoEn,
    // Todas las empresas de esta mini-base están activas; la suspensión y su
    // efecto sobre el puntero se prueban en `lib/__tests__/membresias.test.ts`.
    empresa: { activa: true },
    usuario: {
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      sedesAsignadas: sedes.map((f) => ({ sedeId: f.sedeId })),
    },
  };
}

type OrdenMembresia = { creadoEn?: "asc" | "desc"; empresaId?: "asc" | "desc"; usuario?: { nombre?: "asc" | "desc" } };

function ordenarMembresias(filas: FilaMembresia[], orderBy: OrdenMembresia | OrdenMembresia[] | undefined) {
  const criterios = orderBy === undefined ? [] : Array.isArray(orderBy) ? orderBy : [orderBy];
  const nombreDe = (id: string) => bdUsuarios.find((x) => x.id === id)!.nombre;
  return [...filas].sort((a, b) => {
    for (const criterio of criterios) {
      const sentido = (c: "asc" | "desc" | undefined, va: string | number, vb: string | number) =>
        va === vb ? 0 : (va < vb ? -1 : 1) * (c === "desc" ? -1 : 1);
      if (criterio.creadoEn) {
        const r = sentido(criterio.creadoEn, a.creadoEn, b.creadoEn);
        if (r !== 0) return r;
      }
      if (criterio.empresaId) {
        const r = sentido(criterio.empresaId, a.empresaId, b.empresaId);
        if (r !== 0) return r;
      }
      if (criterio.usuario?.nombre) {
        const r = sentido(criterio.usuario.nombre, nombreDe(a.usuarioId), nombreDe(b.usuarioId));
        if (r !== 0) return r;
      }
    }
    return 0;
  });
}

/** Las empresas a las que la cuenta sigue perteneciendo — o sea, las únicas
 * que `cambiarEmpresaActiva` podría encontrar por la PK del par. Una baja que
 * deje algo acá no es una baja. */
function pertenenciaDe(id: string): number[] {
  return bdMembresias.filter((m) => m.usuarioId === id).map((m) => m.empresaId).sort();
}

/** Lo que la fila `Usuario` dice de sí misma: rol de cuenta y dónde está parada. */
function perfilDe(id: string) {
  const u = bdUsuarios.find((x) => x.id === id)!;
  return { rol: u.rol, empresaId: u.empresaId };
}

function sedesDe(id: string): number[] {
  return bdUsuarioSede.filter((f) => f.usuarioId === id).map((f) => f.sedeId).sort();
}

function montarModelos(destino: typeof prismaMock | typeof txMock) {
  destino.sede.findMany.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdSedes.filter((f) => cumpleWhere(f, where))
  );
  destino.sede.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdSedes.find((f) => cumpleWhere(f, where)) ?? null
  );
  destino.sede.count.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdSedes.filter((f) => cumpleWhere(f, where)).length
  );
  destino.sede.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: 12, ...data })
  );
  destino.sede.delete.mockImplementation(async ({ where }: { where: { id: number } }) => {
    const fila = bdSedes.find((s) => s.id === where.id)!;
    bdSedes = bdSedes.filter((s) => s.id !== where.id);
    return fila;
  });

  // findUnique por email: igualdad EXACTA, como el índice único real. Si el
  // servicio no normaliza a minúsculas, un email con mayúsculas no matchea.
  destino.usuario.findUnique.mockImplementation(
    async ({ where }: { where: { email?: string; id?: string } }) => {
      const u = bdUsuarios.find((x) => (where.email !== undefined ? x.email === where.email : x.id === where.id));
      return u ? { ...u } : null;
    }
  );
  destino.usuario.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdUsuarios.find((u) => cumpleWhere(u, where)) ?? null
  );
  destino.usuario.findMany.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdUsuarios.filter((u) => cumpleWhere(u, where))
  );
  destino.usuario.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Partial<FilaUsuario> }) => {
      const u = bdUsuarios.find((x) => x.id === where.id)!;
      Object.assign(u, data);
      return { ...u };
    }
  );

  destino.membresiaEmpresa.findMany.mockImplementation(
    async ({
      where,
      select,
      orderBy,
    }: {
      where: WhereMembresia;
      select?: SelectMembresia;
      orderBy?: OrdenMembresia | OrdenMembresia[];
    }) => {
      const filas = bdMembresias.filter(
        (m) =>
          (where.usuarioId === undefined || m.usuarioId === where.usuarioId) &&
          (where.empresaId === undefined || m.empresaId === where.empresaId) &&
          (where.rol?.in === undefined || where.rol.in.includes(m.rol))
      );
      return ordenarMembresias(filas, orderBy).map((m) => proyectarMembresia(m, select));
    }
  );
  destino.membresiaEmpresa.findUnique.mockImplementation(
    async ({ where }: { where: { usuarioId_empresaId: { usuarioId: string; empresaId: number } } }) => {
      const { usuarioId, empresaId } = where.usuarioId_empresaId;
      const m = bdMembresias.find((x) => x.usuarioId === usuarioId && x.empresaId === empresaId);
      return m ? proyectarMembresia(m, undefined) : null;
    }
  );
  destino.membresiaEmpresa.upsert.mockImplementation(
    async ({
      where,
      create,
      update,
    }: {
      where: { usuarioId_empresaId: { usuarioId: string; empresaId: number } };
      create: { usuarioId: string; empresaId: number; rol: string };
      update: { rol: string };
    }) => {
      const { usuarioId, empresaId } = where.usuarioId_empresaId;
      const existente = bdMembresias.find((m) => m.usuarioId === usuarioId && m.empresaId === empresaId);
      if (existente) {
        existente.rol = update.rol;
        return { ...existente };
      }
      const fila = { ...create, creadoEn: 100 + bdMembresias.length };
      bdMembresias.push(fila);
      return { ...fila };
    }
  );
  destino.membresiaEmpresa.deleteMany.mockImplementation(
    async ({ where }: { where: { usuarioId: string; empresaId: number } }) => {
      const antes = bdMembresias.length;
      bdMembresias = bdMembresias.filter(
        (m) => !(m.usuarioId === where.usuarioId && m.empresaId === where.empresaId)
      );
      return { count: antes - bdMembresias.length };
    }
  );

  destino.usuarioSede.findMany.mockImplementation(
    async ({ where }: { where: WhereUsuarioSede }) => bdUsuarioSede.filter((f) => cumpleUsuarioSede(f, where))
  );
  destino.usuarioSede.deleteMany.mockImplementation(async ({ where }: { where: WhereUsuarioSede }) => {
    const antes = bdUsuarioSede.length;
    bdUsuarioSede = bdUsuarioSede.filter((f) => !cumpleUsuarioSede(f, where));
    return { count: antes - bdUsuarioSede.length };
  });
  destino.usuarioSede.createMany.mockImplementation(async ({ data }: { data: FilaUsuarioSede[] }) => {
    bdUsuarioSede.push(...data);
    return { count: data.length };
  });

  destino.empleado.updateMany.mockResolvedValue({ count: 0 });
}

beforeEach(() => {
  vi.resetAllMocks();
  bdSedes = semillaSedes();
  bdUsuarios = semillaUsuarios();
  bdMembresias = semillaMembresias();
  bdUsuarioSede = semillaUsuarioSede();

  montarModelos(prismaMock);
  montarModelos(txMock);
  txMock.$executeRaw.mockResolvedValue(1);

  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));
});

// --- listarSedes -----------------------------------------------------------

describe("listarSedes", () => {
  it("solo lista las sedes de la empresa — la de la empresa B no aparece", async () => {
    const sedes = await listarSedes(EMPRESA_A);
    expect(sedes.map((s: { id: number }) => s.id)).toEqual([10, 11]);
    expect(prismaMock.sede.findMany.mock.calls[0]![0].where).toEqual({ empresaId: EMPRESA_A });
  });

  it("pide los conteos de empleados y analistas por sede (los usa el UI para avisar antes de borrar)", async () => {
    await listarSedes(EMPRESA_A);
    expect(prismaMock.sede.findMany.mock.calls[0]![0].include).toEqual({
      _count: { select: { empleados: true, analistas: true } },
    });
  });
});

// --- crearSede -------------------------------------------------------------

describe("crearSede", () => {
  it("estampa el empresaId de la sesión", async () => {
    await crearSede(EMPRESA_A, "Occidente");
    expect(prismaMock.sede.create).toHaveBeenCalledWith({ data: { empresaId: EMPRESA_A, nombre: "Occidente" } });
  });

  it("nombre duplicado (P2002) → ErrorConflictoSede nombrando la sede", async () => {
    prismaMock.sede.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "test" })
    );
    await expect(crearSede(EMPRESA_A, "Centro")).rejects.toBeInstanceOf(ErrorConflictoSede);
    await expect(crearSede(EMPRESA_A, "Centro")).resolves.toBeTruthy();
  });

  it("otros errores se propagan sin disfrazarse de conflicto", async () => {
    const caida = new Prisma.PrismaClientKnownRequestError("down", { code: "P1001", clientVersion: "test" });
    prismaMock.sede.create.mockRejectedValueOnce(caida);
    await expect(crearSede(EMPRESA_A, "Centro")).rejects.toBe(caida);
  });
});

// --- eliminarSede ----------------------------------------------------------

describe("eliminarSede", () => {
  it("CROSS-TENANT: la sede de otra empresa es 'no encontrada' y NO se abre transacción", async () => {
    // La 20 EXISTE (empresa B). Si el findFirst pierde el empresaId, la
    // encuentra y el $transaction BORRA una sede ajena — con efecto dominó:
    // sus empleados quedan sin sede y sus analistas sin asignación.
    await expect(eliminarSede(EMPRESA_A, 20)).rejects.toThrow("Sede no encontrada");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("las TRES escrituras van dentro de la MISMA transacción, y ninguna cuelga del cliente raíz", async () => {
    await eliminarSede(EMPRESA_A, 10);
    // Dentro del tx: desasignar empleados, soltar analistas, borrar la sede.
    expect(txMock.empleado.updateMany).toHaveBeenCalledWith({
      where: { sedeId: 10, empresaId: EMPRESA_A },
      data: { sedeId: null },
    });
    expect(txMock.usuarioSede.deleteMany).toHaveBeenCalledWith({
      where: { sedeId: 10, sede: { empresaId: EMPRESA_A } },
    });
    expect(txMock.sede.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    // Nada por fuera: una escritura en prisma.* no se revertiría con el resto.
    expect(prismaMock.empleado.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.sede.delete).not.toHaveBeenCalled();
  });

  it("desasigna empleados ANTES de borrar la sede (el orden dentro del tx no es decorativo)", async () => {
    await eliminarSede(EMPRESA_A, 10);
    const ordenUpdate = txMock.empleado.updateMany.mock.invocationCallOrder[0]!;
    const ordenDelete = txMock.sede.delete.mock.invocationCallOrder[0]!;
    expect(ordenUpdate).toBeLessThan(ordenDelete);
  });

  it("el updateMany de empleados lleva TAMBIÉN empresaId — cinturón sobre la FK", async () => {
    // El where {sedeId, empresaId} es redundante solo mientras sedeId sea
    // único global; si el where perdiera el empresaId y algún día los ids
    // colisionaran (o el findFirst de arriba se relajara), el updateMany
    // dejaría sin sede a empleados de OTRA empresa. Doble capa, como el
    // resto del repo (SDD §05).
    await eliminarSede(EMPRESA_A, 10);
    expect(txMock.empleado.updateMany.mock.calls[0]![0].where).toEqual({ sedeId: 10, empresaId: EMPRESA_A });
  });

  it("borrar la sede 10 de A no toca la asignación de la sede 20 de B", async () => {
    await eliminarSede(EMPRESA_A, 10);
    expect(sedesDe("uid-carla")).toEqual([20]);
    expect(sedesDe("uid-analista-b")).toEqual([20]);
  });
});

// --- asignarStaff ----------------------------------------------------------

describe("asignarStaff", () => {
  it("sin cuenta registrada → ErrorAsignacionStaff que direcciona a /login (el admin NO crea usuarios)", async () => {
    await expect(
      asignarStaff(EMPRESA_A, { email: "nadie@x.com", rol: "analista_rrhh", sedeIds: [] }, ACTOR)
    ).rejects.toBeInstanceOf(ErrorAsignacionStaff);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("CROSS-TENANT (cuentas): una cuenta que pertenece a OTRA empresa no se puede robar", async () => {
    // cfo@b.com es admin de la empresa B. Sin este guard, la asignación le
    // pisaría el rol y el puntero: B pierde su admin y A gana una cuenta con
    // historial de B — secuestro de cuenta en una petición.
    await expect(
      asignarStaff(EMPRESA_A, { email: "cfo@b.com", rol: "analista_rrhh", sedeIds: [] }, ACTOR)
    ).rejects.toThrow("ya está vinculada a otra empresa");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.usuario.update).not.toHaveBeenCalled();
    expect(txMock.membresiaEmpresa.upsert).not.toHaveBeenCalled();
  });

  it("H3/H4: el guard le pregunta a la MEMBRESÍA, no al puntero — una cuenta de B con el puntero en null tampoco se absorbe", async () => {
    // `uid-suelto-b` tiene empresaId null (nunca eligió empresa activa, o se
    // la limpiaron) y una membresía viva en B. El guard viejo miraba el
    // puntero: veía null, decía "cuenta libre" y se la llevaba puesta.
    await expect(
      asignarStaff(EMPRESA_A, { email: "suelto@b.com", rol: "auditor", sedeIds: [] }, ACTOR)
    ).rejects.toThrow("ya está vinculada a otra empresa");
    expect(pertenenciaDe("uid-suelto-b")).toEqual([EMPRESA_B]);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("CROSS-TENANT (sedes): una sede ajena en sedeIds tumba TODA la asignación", async () => {
    // La 20 es de B. Si el count de validación pierde el empresaId, la
    // cuenta quedaría colgada de una sede de B — y sedesDelUsuario le daría
    // alcance sobre los empleados de esa sede.
    await expect(
      asignarStaff(EMPRESA_A, { email: "libre@x.com", rol: "analista_rrhh", sedeIds: [10, 20] }, ACTOR)
    ).rejects.toThrow("no pertenece a tu empresa");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("H2: la cuenta libre queda con MEMBRESÍA, no solo con el puntero — no nace en 403", async () => {
    // Este es el bug que hacía fallar cerrado todo lo nuevo: el puntero se
    // movía y la membresía no se escribía nunca. `requiereAuth` toma el rol
    // efectivo de la membresía; puntero sin membresía es 403 en TODOS los
    // endpoints, incluidos `whoami` y el `empresa-activa` que sería la salida.
    const staff = await asignarStaff(
      EMPRESA_A,
      { email: "libre@x.com", rol: "analista_rrhh", sedeIds: [10, 11] },
      ACTOR
    );
    expect(pertenenciaDe("uid-libre")).toEqual([EMPRESA_A]);
    expect(perfilDe("uid-libre")).toEqual({ rol: "analista_rrhh", empresaId: EMPRESA_A });
    expect(sedesDe("uid-libre")).toEqual([10, 11]);
    expect(staff).toEqual({
      id: "uid-libre",
      email: "libre@x.com",
      nombre: "Cuenta Libre",
      rol: "analista_rrhh",
      sedeIds: [10, 11],
    });
  });

  it("H2: la membresía y las sedes se escriben por el tx, no por el cliente raíz", async () => {
    await asignarStaff(EMPRESA_A, { email: "libre@x.com", rol: "analista_rrhh", sedeIds: [10] }, ACTOR);
    expect(txMock.membresiaEmpresa.upsert).toHaveBeenCalledTimes(1);
    expect(txMock.usuarioSede.createMany).toHaveBeenCalledWith({
      data: [{ usuarioId: "uid-libre", sedeId: 10 }],
    });
    // Fuera de la transacción, una mitad podría commitear sin la otra: el
    // puntero en una empresa sin membresía es exactamente el estado prohibido.
    expect(prismaMock.membresiaEmpresa.upsert).not.toHaveBeenCalled();
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    expect(prismaMock.usuarioSede.createMany).not.toHaveBeenCalled();
  });

  it("H7: el actor llega a app.usuario_actual — el alta queda auditada CON autor", async () => {
    // `Usuario` está vigilado por `fn_auditar_cambio` (migración
    // 20260830140000_auditoria_usuario) y el autor sale de
    // `app.usuario_actual`, que setea `conAuditoria`. Con `$transaction`
    // pelado el trigger escribe usuarioId NULL: constancia de que a alguien lo
    // hicieron analista y ninguna de quién.
    await asignarStaff(EMPRESA_A, { email: "libre@x.com", rol: "auditor", sedeIds: [] }, ACTOR);
    expect(txMock.$executeRaw.mock.calls[0]).toContain(ACTOR);
    // Y el SET LOCAL va PRIMERO: después del UPDATE no serviría de nada.
    expect(txMock.$executeRaw.mock.invocationCallOrder[0]!).toBeLessThan(
      txMock.membresiaEmpresa.upsert.mock.invocationCallOrder[0]!
    );
  });

  it("cuenta YA de la misma empresa: re-asignar rol/sedes es legítimo (no es robo)", async () => {
    await asignarStaff(EMPRESA_A, { email: "analista@a.com", rol: "auditor", sedeIds: [] }, ACTOR);
    expect(pertenenciaDe("uid-analista-a")).toEqual([EMPRESA_A]);
    expect(bdMembresias.find((m) => m.usuarioId === "uid-analista-a")!.rol).toBe("auditor");
    // El puntero ya estaba en esta empresa: se le sincroniza el rol de cuenta.
    expect(perfilDe("uid-analista-a")).toEqual({ rol: "auditor", empresaId: EMPRESA_A });
  });

  it("H4 (escritura): a un miembro parado en OTRA de sus empresas se le puede cambiar el rol acá", async () => {
    // Beto es auditor en A y admin en B, con el puntero en B. El guard viejo
    // miraba `usuario.empresaId` y respondía "ya está vinculada a otra
    // empresa": el admin de A no podía ni ascenderlo ni degradarlo.
    await asignarStaff(EMPRESA_A, { email: "beto@x.com", rol: "analista_rrhh", sedeIds: [11] }, ACTOR);
    expect(bdMembresias.find((m) => m.usuarioId === "uid-beto" && m.empresaId === EMPRESA_A)!.rol).toBe(
      "analista_rrhh"
    );
    // Y su membresía en B queda intacta: A no manda sobre el rol de Beto en B.
    expect(bdMembresias.find((m) => m.usuarioId === "uid-beto" && m.empresaId === EMPRESA_B)!.rol).toBe(
      "admin_empresa"
    );
    // Tampoco lo saca de la empresa donde está trabajando en este momento.
    expect(perfilDe("uid-beto")).toEqual({ rol: "admin_empresa", empresaId: EMPRESA_B });
  });

  it("H5: asignar staff en B NO borra las sedes que A le puso a esa persona", async () => {
    // El escenario completo: Carla es analista de A restringida a la sede 10 y
    // auditora en B con la sede 20. El admin de B la re-asigna sin sedes. Con
    // `deleteMany({where:{usuarioId}})` desaparecía también la fila de la sede
    // 10 — que es de A—, y cero filas significa "sin scoping" para el
    // middleware: Carla pasaba de una sede a la nómina entera de A.
    await asignarStaff(EMPRESA_B, { email: "carla@x.com", rol: "auditor", sedeIds: [] }, ACTOR);
    expect(sedesDe("uid-carla")).toEqual([10]);
    expect(txMock.usuarioSede.deleteMany).toHaveBeenCalledWith({
      where: { usuarioId: "uid-carla", sede: { empresaId: EMPRESA_B } },
    });
  });

  it("sedeIds vacío = sin scoping por sede: limpia la asignación previa de ESTA empresa y no crea nada", async () => {
    await asignarStaff(EMPRESA_A, { email: "analista@a.com", rol: "analista_rrhh", sedeIds: [] }, ACTOR);
    expect(sedesDe("uid-analista-a")).toEqual([]);
    expect(txMock.usuarioSede.createMany).not.toHaveBeenCalled();
    // Y sin sedes que validar, no hay count.
    expect(prismaMock.sede.count).not.toHaveBeenCalled();
  });

  it("DEGRADACIÓN DE ADMIN: no se puede bajar de rango al admin_empresa de la propia empresa", async () => {
    // `otorgarMembresia` es un upsert con `update: { rol }`: sin la guarda le
    // pisa el rol a CUALQUIER membresía existente, incluida la del otro admin.
    // Un `admin_empresa` mandaba `POST /empresa/staff {"email":"<el otro
    // admin>","rol":"auditor"}` y lo dejaba de auditor — y eso no se deshace
    // por API: `reasignarAdminEmpresa` restaura por invitación a un correo, y
    // un correo que ya existe responde 409.
    await expect(
      asignarStaff(EMPRESA_A, { email: "admin@a.com", rol: "auditor", sedeIds: [] }, ACTOR)
    ).rejects.toBeInstanceOf(ErrorAsignacionStaff);
    await expect(
      asignarStaff(EMPRESA_A, { email: "admin@a.com", rol: "auditor", sedeIds: [] }, ACTOR)
    ).rejects.toThrow("administra esta empresa");

    // Nada tocado: ni la membresía ni el rol de cuenta, y sin abrir transacción.
    expect(bdMembresias.find((m) => m.usuarioId === "uid-admin-a")!.rol).toBe("admin_empresa");
    expect(perfilDe("uid-admin-a")).toEqual({ rol: "admin_empresa", empresaId: EMPRESA_A });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.membresiaEmpresa.upsert).not.toHaveBeenCalled();
  });

  it("DEGRADACIÓN DE ADMIN: tampoco puede degradarse a SÍ MISMO (la empresa se quedaba sin nadie que la administre)", async () => {
    // El actor es el propio admin de A. Con un solo administrador, este request
    // dejaba la empresa sin `admin_empresa` para siempre: `miembros.gestionar`,
    // `nomina.pagar` y `empleados.invitar` son celdas que solo tiene ese rol.
    await expect(
      asignarStaff(EMPRESA_A, { email: "admin@a.com", rol: "analista_rrhh", sedeIds: [10] }, "uid-admin-a")
    ).rejects.toThrow("administra esta empresa");
    expect(bdMembresias.find((m) => m.usuarioId === "uid-admin-a")!.rol).toBe("admin_empresa");
    expect(sedesDe("uid-admin-a")).toEqual([]);
  });

  it("DEGRADACIÓN DE ADMIN: la guarda mira la membresía DE ESTA empresa, no '¿es admin de alguna?'", async () => {
    // Beto es admin_empresa en B y auditor en A. En B no se lo toca...
    await expect(
      asignarStaff(EMPRESA_B, { email: "beto@x.com", rol: "auditor", sedeIds: [] }, ACTOR)
    ).rejects.toThrow("administra esta empresa");
    expect(bdMembresias.find((m) => m.usuarioId === "uid-beto" && m.empresaId === EMPRESA_B)!.rol).toBe(
      "admin_empresa"
    );

    // ...y en A sí, porque acá su rol es `auditor`. Si la guarda preguntara por
    // el rol de CUENTA (`Usuario.rol`, que dice admin_empresa porque su puntero
    // está en B) o por "tiene alguna membresía de admin", el admin de A se
    // quedaría sin poder administrar a un miembro suyo — el H4 de vuelta.
    await asignarStaff(EMPRESA_A, { email: "beto@x.com", rol: "analista_rrhh", sedeIds: [] }, ACTOR);
    expect(bdMembresias.find((m) => m.usuarioId === "uid-beto" && m.empresaId === EMPRESA_A)!.rol).toBe(
      "analista_rrhh"
    );
  });

  it("normaliza el email a minúsculas antes de buscar (el índice único es exacto)", async () => {
    await asignarStaff(EMPRESA_A, { email: "Libre@X.com", rol: "auditor", sedeIds: [] }, ACTOR);
    expect(prismaMock.usuario.findUnique.mock.calls[0]![0].where).toEqual({ email: "libre@x.com" });
    expect(pertenenciaDe("uid-libre")).toEqual([EMPRESA_A]);
  });
});

// --- listarStaff -----------------------------------------------------------

describe("listarStaff", () => {
  it("lista por MEMBRESÍA: incluye al miembro parado en otra empresa, con el rol que tiene ACÁ", async () => {
    // Beto es auditor en A (membresía) y admin_empresa en B, y su puntero está
    // en B — o sea `Usuario.empresaId = B` y `Usuario.rol = admin_empresa`. El
    // filtro viejo `{empresaId, rol: {in: [...]}}` lo dejaba fuera por partida
    // doble, y así el admin de A no lo veía ni lo podía quitar mientras Beto
    // volvía a A cuando quisiera con `POST /auth/empresa-activa`.
    const staff = await listarStaff(EMPRESA_A);
    expect(staff.map((s) => s.id)).toEqual(["uid-analista-a", "uid-beto", "uid-carla"]);
    const beto = staff.find((s) => s.id === "uid-beto")!;
    expect(beto.rol).toBe("auditor");
    expect(perfilDe("uid-beto").rol).toBe("admin_empresa");
  });

  it("no se cuela el staff de B ni el admin de A (admin_empresa no se administra desde esta pantalla)", async () => {
    const staff = await listarStaff(EMPRESA_A);
    expect(staff.map((s) => s.id)).not.toContain("uid-analista-b");
    expect(staff.map((s) => s.id)).not.toContain("uid-cfo-b");
    // El admin de A sí tiene membresía en A, pero con rol admin_empresa:
    // quitarlo dejaría la empresa sin quien la administre y esa operación es
    // de admin_plataforma (reasignarAdminEmpresa), no de acá.
    expect(staff.map((s) => s.id)).not.toContain("uid-admin-a");
    expect(prismaMock.membresiaEmpresa.findMany.mock.calls[0]![0].where).toEqual({
      empresaId: EMPRESA_A,
      rol: { in: ["analista_rrhh", "auditor"] },
    });
  });

  it("H5: los sedeIds son SOLO los de esta empresa — el panel de A no muestra ids de sedes de B", async () => {
    // Carla tiene la sede 10 (A) y la 20 (B). Sin el ancla en el select, el
    // panel de A publicaría el id de una sede de B, y el de B el de una de A.
    const staffA = await listarStaff(EMPRESA_A);
    expect(staffA.find((s) => s.id === "uid-carla")!.sedeIds).toEqual([10]);
    const staffB = await listarStaff(EMPRESA_B);
    expect(staffB.find((s) => s.id === "uid-carla")!.sedeIds).toEqual([20]);
  });

  it("ordena por nombre — el listado no depende del orden físico de las membresías", async () => {
    const staff = await listarStaff(EMPRESA_A);
    expect(staff.map((s) => s.nombre)).toEqual(["Analista A", "Beto Dos Empresas", "Carla Dos Sedes"]);
  });
});

// --- quitarStaff -----------------------------------------------------------

describe("quitarStaff", () => {
  it("H1: la baja borra la MEMBRESÍA — no queda ninguna empresa a la que volver", async () => {
    // El agujero: la versión anterior ponía el puntero en null y dejaba viva
    // la membresía. Como el rol efectivo sale de la membresía y
    // `POST /auth/empresa-activa` es la única ruta privada sin guarda de
    // permiso, la persona a la que acababan de sacar volvía sola con UN
    // request, con el rol que le habían quitado.
    await quitarStaff(EMPRESA_A, "uid-analista-a", ACTOR);
    expect(pertenenciaDe("uid-analista-a")).toEqual([]);
    expect(perfilDe("uid-analista-a")).toEqual({ rol: "individual", empresaId: null });
    expect(sedesDe("uid-analista-a")).toEqual([]);
  });

  it("H4: al miembro parado en otra empresa SÍ se lo puede quitar, y su otra empresa no se entera", async () => {
    // Antes, `quitarStaff` buscaba con `{id, empresaId, rol:{in}}` — el
    // puntero y el rol globales — y respondía "no encontrado en tu empresa"
    // para alguien que sí es miembro. Un miembro inextirpable.
    await quitarStaff(EMPRESA_A, "uid-beto", ACTOR);
    expect(pertenenciaDe("uid-beto")).toEqual([EMPRESA_B]);
    // El puntero estaba en B: la baja de A no lo desloguea de B.
    expect(perfilDe("uid-beto")).toEqual({ rol: "admin_empresa", empresaId: EMPRESA_B });
  });

  it("quitar a alguien de la empresa donde está parado lo manda a su otra membresía viva, no a la calle", async () => {
    // Carla está parada en B y es analista en A. Sacarla de B tiene que
    // dejarla en A con el rol DE A — dejarle el puntero en B (donde ya no
    // pertenece) sería 403 en todos los endpoints.
    await quitarStaff(EMPRESA_B, "uid-carla", ACTOR);
    expect(pertenenciaDe("uid-carla")).toEqual([EMPRESA_A]);
    expect(perfilDe("uid-carla")).toEqual({ rol: "analista_rrhh", empresaId: EMPRESA_A });
  });

  it("H5: la baja en B no borra las sedes que A le había puesto", async () => {
    await quitarStaff(EMPRESA_B, "uid-carla", ACTOR);
    expect(sedesDe("uid-carla")).toEqual([10]);
    expect(txMock.usuarioSede.deleteMany).toHaveBeenCalledWith({
      where: { usuarioId: "uid-carla", sede: { empresaId: EMPRESA_B } },
    });
  });

  it("H7: la baja queda auditada CON autor, y todo va por el tx", async () => {
    await quitarStaff(EMPRESA_A, "uid-analista-a", ACTOR);
    expect(txMock.$executeRaw.mock.calls[0]).toContain(ACTOR);
    expect(txMock.membresiaEmpresa.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.membresiaEmpresa.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    expect(prismaMock.usuarioSede.deleteMany).not.toHaveBeenCalled();
  });

  it("CROSS-TENANT: el staff de otra empresa es 'no encontrado' — no se desvincula gente ajena", async () => {
    // uid-analista-b EXISTE y es analista... de B. Sin el empresaId en la
    // búsqueda, quitarStaff de A lo dejaría sin acceso a SU propia empresa
    // (denial of service entre tenants).
    await expect(quitarStaff(EMPRESA_A, "uid-analista-b", ACTOR)).rejects.toThrow("no encontrado en tu empresa");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(pertenenciaDe("uid-analista-b")).toEqual([EMPRESA_B]);
    expect(sedesDe("uid-analista-b")).toEqual([20]);
  });

  it("el admin_empresa propio tampoco pasa por acá: el filtro de rol lo hace 'no encontrado'", async () => {
    // Quitar al admin dejaría la empresa sin nadie que administre; esa
    // operación existe pero es de admin_plataforma (reasignarAdminEmpresa),
    // no de esta pantalla.
    await expect(quitarStaff(EMPRESA_A, "uid-admin-a", ACTOR)).rejects.toThrow("no encontrado en tu empresa");
    expect(pertenenciaDe("uid-admin-a")).toEqual([EMPRESA_A]);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("quitar a quien nunca estuvo es 'no encontrado', no un borrado silencioso de otra cosa", async () => {
    await expect(quitarStaff(EMPRESA_A, "uid-libre", ACTOR)).rejects.toThrow("no encontrado en tu empresa");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
