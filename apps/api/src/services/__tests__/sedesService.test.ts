// Tests de `sedesService.ts` — sedes y staff empresarial (SDD §15, pilar 1).
// Acá el riesgo cross-tenant tiene DOS caras:
//
//   1. La clásica: operar sobre una sede de otra empresa por id.
//   2. La de personas: `asignarStaff` puede ROBAR una cuenta ya vinculada a
//      otra empresa (el update pisa usuario.empresaId), o colgar a un
//      analista de sedes ajenas — y quien queda con acceso a datos que no
//      le tocan es una CUENTA, no una fila.
//
// Mismo patrón hermético que empleadosService.test.ts: corte en
// `lib/prisma.js`, mini-base con filas de DOS empresas y un where que se
// evalúa de verdad — perder el tenant hace APARECER la fila ajena y pone la
// prueba en rojo.
//
// Además: `eliminarSede` es la única operación con transacción interactiva
// del servicio. El test le pasa un tx PROPIO (objeto distinto del cliente
// raíz) para verificar que las tres escrituras van juntas y DENTRO de la
// transacción, no colgando del cliente global.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock, txMock } = vi.hoisted(() => ({
  prismaMock: {
    sede: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), delete: vi.fn() },
    usuario: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    usuarioSede: { deleteMany: vi.fn(), createMany: vi.fn() },
    empleado: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  // El tx es OTRO objeto a propósito: si el servicio escribe en
  // prisma.<modelo> en vez de tx.<modelo>, la operación queda FUERA de la
  // transacción (no se revierte con las demás) y estos mocks lo delatan.
  txMock: {
    sede: { delete: vi.fn() },
    usuario: { update: vi.fn() },
    usuarioSede: { deleteMany: vi.fn(), createMany: vi.fn() },
    empleado: { updateMany: vi.fn() },
  },
}));

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
  rol: string;
  empresaId: number | null;
  sedesAsignadas: { sedeId: number }[];
  [k: string]: unknown;
}

// La sede 20 y las cuentas "uid-cfo-b"/"uid-analista-b" son de la empresa B:
// existen para probar que ninguna query de A las alcanza.
function semillaSedes(): FilaSede[] {
  return [
    { id: 10, empresaId: EMPRESA_A, nombre: "Centro" },
    { id: 11, empresaId: EMPRESA_A, nombre: "Norte" },
    { id: 20, empresaId: EMPRESA_B, nombre: "Sur Ajena" },
  ];
}

function semillaUsuarios(): FilaUsuario[] {
  return [
    { id: "uid-admin-a", email: "admin@a.com", nombre: "Admin A", rol: "admin_empresa", empresaId: EMPRESA_A, sedesAsignadas: [] },
    { id: "uid-analista-a", email: "analista@a.com", nombre: "Analista A", rol: "analista_rrhh", empresaId: EMPRESA_A, sedesAsignadas: [{ sedeId: 10 }] },
    { id: "uid-libre", email: "libre@x.com", nombre: "Cuenta Libre", rol: "individual", empresaId: null, sedesAsignadas: [] },
    { id: "uid-cfo-b", email: "cfo@b.com", nombre: "CFO de B", rol: "admin_empresa", empresaId: EMPRESA_B, sedesAsignadas: [] },
    { id: "uid-analista-b", email: "analista@b.com", nombre: "Analista B", rol: "analista_rrhh", empresaId: EMPRESA_B, sedesAsignadas: [{ sedeId: 20 }] },
  ];
}

let bdSedes: FilaSede[];
let bdUsuarios: FilaUsuario[];

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

beforeEach(() => {
  vi.clearAllMocks();
  bdSedes = semillaSedes();
  bdUsuarios = semillaUsuarios();

  prismaMock.sede.findMany.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdSedes.filter((f) => cumpleWhere(f, where))
  );
  prismaMock.sede.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdSedes.find((f) => cumpleWhere(f, where)) ?? null
  );
  prismaMock.sede.count.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdSedes.filter((f) => cumpleWhere(f, where)).length
  );
  prismaMock.sede.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 12, ...data }));

  // findUnique por email: igualdad EXACTA, como el índice único real. Si el
  // servicio no normaliza a minúsculas, un email con mayúsculas no matchea.
  prismaMock.usuario.findUnique.mockImplementation(
    async ({ where }: { where: { email?: string; id?: string } }) =>
      bdUsuarios.find((u) => (where.email !== undefined ? u.email === where.email : u.id === where.id)) ?? null
  );
  prismaMock.usuario.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdUsuarios.find((u) => cumpleWhere(u, where)) ?? null
  );
  prismaMock.usuario.findMany.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => bdUsuarios.filter((u) => cumpleWhere(u, where))
  );

  for (const modelo of Object.values(txMock)) {
    for (const fn of Object.values(modelo)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  txMock.usuario.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const u = bdUsuarios.find((x) => x.id === where.id)!;
    Object.assign(u, data);
    return { ...u };
  });
  txMock.usuarioSede.deleteMany.mockResolvedValue({ count: 0 });
  txMock.usuarioSede.createMany.mockResolvedValue({ count: 0 });
  txMock.empleado.updateMany.mockResolvedValue({ count: 0 });
  txMock.sede.delete.mockResolvedValue({});

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
    expect(txMock.usuarioSede.deleteMany).toHaveBeenCalledWith({ where: { sedeId: 10 } });
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
});

// --- asignarStaff ----------------------------------------------------------

describe("asignarStaff", () => {
  it("sin cuenta registrada → ErrorAsignacionStaff que direcciona a /login (el admin NO crea usuarios)", async () => {
    await expect(
      asignarStaff(EMPRESA_A, { email: "nadie@x.com", rol: "analista_rrhh", sedeIds: [] })
    ).rejects.toBeInstanceOf(ErrorAsignacionStaff);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("CROSS-TENANT (cuentas): una cuenta vinculada a OTRA empresa no se puede robar", async () => {
    // cfo@b.com es admin de la empresa B. Sin este guard, el update la
    // pisaría con {rol: analista_rrhh, empresaId: A}: B pierde su admin y A
    // gana una cuenta con historial de B — secuestro de cuenta en una
    // petición.
    await expect(
      asignarStaff(EMPRESA_A, { email: "cfo@b.com", rol: "analista_rrhh", sedeIds: [] })
    ).rejects.toThrow("ya está vinculada a otra empresa");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.usuario.update).not.toHaveBeenCalled();
  });

  it("CROSS-TENANT (sedes): una sede ajena en sedeIds tumba TODA la asignación", async () => {
    // La 20 es de B. Si el count de validación pierde el empresaId, la
    // cuenta quedaría colgada de una sede de B — y sedesDelUsuario le daría
    // alcance sobre los empleados de esa sede.
    await expect(
      asignarStaff(EMPRESA_A, { email: "libre@x.com", rol: "analista_rrhh", sedeIds: [10, 20] })
    ).rejects.toThrow("no pertenece a tu empresa");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("cuenta libre (empresaId null): se vincula con rol y sedes, todo dentro de la transacción", async () => {
    const perfil = await asignarStaff(EMPRESA_A, { email: "libre@x.com", rol: "analista_rrhh", sedeIds: [10, 11] });
    expect(txMock.usuario.update).toHaveBeenCalledWith({
      where: { id: "uid-libre" },
      data: { rol: "analista_rrhh", empresaId: EMPRESA_A },
    });
    // Reemplazo completo de la asignación: primero limpiar, después crear.
    expect(txMock.usuarioSede.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: "uid-libre" } });
    expect(txMock.usuarioSede.createMany).toHaveBeenCalledWith({
      data: [
        { usuarioId: "uid-libre", sedeId: 10 },
        { usuarioId: "uid-libre", sedeId: 11 },
      ],
    });
    expect(perfil.empresaId).toBe(EMPRESA_A);
  });

  it("cuenta YA de la misma empresa: re-asignar rol/sedes es legítimo (no es robo)", async () => {
    await asignarStaff(EMPRESA_A, { email: "analista@a.com", rol: "auditor", sedeIds: [] });
    expect(txMock.usuario.update).toHaveBeenCalledWith({
      where: { id: "uid-analista-a" },
      data: { rol: "auditor", empresaId: EMPRESA_A },
    });
  });

  it("sedeIds vacío = sin scoping por sede: limpia la asignación previa y no crea nada", async () => {
    await asignarStaff(EMPRESA_A, { email: "analista@a.com", rol: "analista_rrhh", sedeIds: [] });
    expect(txMock.usuarioSede.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: "uid-analista-a" } });
    expect(txMock.usuarioSede.createMany).not.toHaveBeenCalled();
    // Y sin sedes que validar, no hay count.
    expect(prismaMock.sede.count).not.toHaveBeenCalled();
  });

  it("normaliza el email a minúsculas antes de buscar (el índice único es exacto)", async () => {
    await asignarStaff(EMPRESA_A, { email: "Libre@X.com", rol: "auditor", sedeIds: [] });
    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({ where: { email: "libre@x.com" } });
    expect(txMock.usuario.update).toHaveBeenCalled();
  });
});

// --- listarStaff -----------------------------------------------------------

describe("listarStaff", () => {
  it("lista SOLO el staff de la empresa (ni el de B, ni el admin propio) y aplana sedeIds", async () => {
    const staff = await listarStaff(EMPRESA_A);
    // El where exige empresaId Y rol ∈ {analista_rrhh, auditor}: el
    // analista de B queda fuera por tenant; el admin de A queda fuera por
    // rol (no es staff operativo, no se administra desde esta pantalla).
    expect(prismaMock.usuario.findMany.mock.calls[0]![0].where).toEqual({
      empresaId: EMPRESA_A,
      rol: { in: ["analista_rrhh", "auditor"] },
    });
    expect(staff.map((s: { id: string }) => s.id)).toEqual(["uid-analista-a"]);
    expect(staff[0]!.sedeIds).toEqual([10]);
  });
});

// --- quitarStaff -----------------------------------------------------------

describe("quitarStaff", () => {
  it("desvincula al staff propio: borra sus sedes y deja la cuenta libre como individual, en transacción", async () => {
    await quitarStaff(EMPRESA_A, "uid-analista-a");
    expect(txMock.usuarioSede.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: "uid-analista-a" } });
    expect(txMock.usuario.update).toHaveBeenCalledWith({
      where: { id: "uid-analista-a" },
      data: { empresaId: null, rol: "individual" },
    });
  });

  it("CROSS-TENANT: el staff de otra empresa es 'no encontrado' — no se desvincula gente ajena", async () => {
    // uid-analista-b EXISTE y es analista... de B. Sin empresaId en el
    // where, quitarStaff de A lo dejaría sin acceso a SU propia empresa
    // (denial of service entre tenants).
    await expect(quitarStaff(EMPRESA_A, "uid-analista-b")).rejects.toThrow("no encontrado en tu empresa");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("el admin_empresa propio tampoco pasa por acá: el filtro de rol lo hace 'no encontrado'", async () => {
    // Quitar al admin dejaría la empresa sin nadie que administre; esa
    // operación existe pero es de admin_plataforma (reasignarAdminEmpresa),
    // no de esta pantalla.
    await expect(quitarStaff(EMPRESA_A, "uid-admin-a")).rejects.toThrow("no encontrado en tu empresa");
    expect(txMock.usuario.update).not.toHaveBeenCalled();
  });
});
