// Tests del «ver como» del admin_plataforma (tarea 2026-08-31, paso 6 de
// multiorg): entrar = membresía auditor + puntero, salir = revocar + limpiar,
// TODO por el embudo de lib/membresias.ts y dentro de conAuditoria.
//
// Lo que se prueba no es que las escrituras ocurran sino los tres bordes que
// harían daño real: (1) una membresía REAL de la cuenta jamás se pisa al
// entrar ni se borra al salir — el upsert la degradaría a auditor y el salir
// la desvincularía de verdad; (2) el salir solo obedece a la cuenta de
// plataforma — un auditor real que llamara la ruta se autoborraría la
// membresía que su empresa le dio; (3) idempotencia en ambos sentidos, sin
// escrituras de más (una línea de auditoría sin cambio es una mentira).
//
// Misma mini-base en memoria que membresias.test.ts: las funciones reciben el
// `tx` como parámetro; conAuditoria se mockea a "pasá el tx" y se le afirma
// el actor.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { conAuditoriaMock } = vi.hoisted(() => ({
  conAuditoriaMock: vi.fn(),
}));
vi.mock("../../lib/auditoria.js", () => ({ conAuditoria: conAuditoriaMock }));
vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../lib/supabaseAdmin.js", () => ({ supabaseAdmin: { auth: { admin: {} } } }));

import { entrarComoVistaPlataforma, salirDeVistaPlataforma } from "../authService.js";
import { requierePermiso } from "../../middleware/auth.js";
import { PERMISOS } from "../../lib/permisos.js";
import type { TxAcotada } from "../../lib/alcance.js";
import type { NextFunction, Request, Response } from "express";

// --- mini-base -------------------------------------------------------------

const UID_PLATAFORMA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UID_COLABORADORA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMPRESA_7 = 7;
const EMPRESA_PROPIA = 8;
const EMPRESA_SUSPENDIDA = 40;
const EMPRESA_INEXISTENTE = 999;

interface FilaMembresia {
  usuarioId: string;
  empresaId: number;
  rol: string;
  creadoEn: number;
}
interface FilaUsuario {
  id: string;
  rol: string;
  empresaId: number | null;
}

let bdMembresias: FilaMembresia[];
let bdUsuarios: FilaUsuario[];
const bdEmpresas: Record<number, { activa: boolean }> = {
  [EMPRESA_7]: { activa: true },
  [EMPRESA_PROPIA]: { activa: true },
  [EMPRESA_SUSPENDIDA]: { activa: false },
};

const txMock = {
  empresa: {
    findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
      const e = bdEmpresas[where.id];
      return e ? { ...e } : null;
    }),
  },
  membresiaEmpresa: {
    findUnique: vi.fn(
      async ({ where }: { where: { usuarioId_empresaId: { usuarioId: string; empresaId: number } } }) => {
        const { usuarioId, empresaId } = where.usuarioId_empresaId;
        const m = bdMembresias.find((f) => f.usuarioId === usuarioId && f.empresaId === empresaId);
        return m ? { rol: m.rol } : null;
      }
    ),
    upsert: vi.fn(
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
        const fila = { ...create, creadoEn: Date.now() + bdMembresias.length };
        bdMembresias.push(fila);
        return { ...fila };
      }
    ),
    // Respeta los filtros que el barrido usa de verdad (`rol` y
    // `empresaId: { not }`): sin esto el mock barre membresías que el código
    // real jamás toca y los rojos mienten sobre el servicio.
    findMany: vi.fn(
      async ({ where }: { where: { usuarioId: string; rol?: string; empresaId?: { not: number } } }) =>
        bdMembresias
          .filter((m) => m.usuarioId === where.usuarioId)
          .filter((m) => (where.rol === undefined ? true : m.rol === where.rol))
          .filter((m) => (where.empresaId?.not === undefined ? true : m.empresaId !== where.empresaId.not))
          .map((m) => ({ empresaId: m.empresaId, rol: m.rol, empresa: bdEmpresas[m.empresaId]! }))
    ),
    deleteMany: vi.fn(async ({ where }: { where: { usuarioId: string; empresaId: number } }) => {
      const antes = bdMembresias.length;
      bdMembresias = bdMembresias.filter(
        (m) => !(m.usuarioId === where.usuarioId && m.empresaId === where.empresaId)
      );
      return { count: antes - bdMembresias.length };
    }),
  },
  usuario: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const u = bdUsuarios.find((x) => x.id === where.id);
      return u ? { ...u } : null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FilaUsuario> }) => {
      const u = bdUsuarios.find((x) => x.id === where.id)!;
      Object.assign(u, data);
      return { ...u };
    }),
  },
};

function plataforma() {
  return bdUsuarios.find((u) => u.id === UID_PLATAFORMA)!;
}
function membresia(usuarioId: string, empresaId: number) {
  return bdMembresias.find((m) => m.usuarioId === usuarioId && m.empresaId === empresaId) ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  conAuditoriaMock.mockImplementation((_usuarioId: string | null, fn: (tx: TxAcotada) => Promise<unknown>) =>
    fn(txMock as unknown as TxAcotada)
  );
  bdMembresias = [{ usuarioId: UID_COLABORADORA, empresaId: EMPRESA_7, rol: "colaborador", creadoEn: 1 }];
  bdUsuarios = [
    { id: UID_PLATAFORMA, rol: "admin_plataforma", empresaId: null },
    { id: UID_COLABORADORA, rol: "colaborador", empresaId: EMPRESA_7 },
  ];
});

// --- entrar ----------------------------------------------------------------

describe("entrarComoVistaPlataforma", () => {
  it("crea la membresía auditor, mueve el puntero y no toca el rol de cuenta", async () => {
    const resultado = await entrarComoVistaPlataforma(UID_PLATAFORMA, EMPRESA_7);

    expect(resultado).toEqual({ estado: "ok", empresaId: EMPRESA_7 });
    expect(membresia(UID_PLATAFORMA, EMPRESA_7)).toMatchObject({ rol: "auditor" });
    expect(plataforma().empresaId).toBe(EMPRESA_7);
    expect(plataforma().rol).toBe("admin_plataforma");
    // El actor de la transacción es el admin: los triggers firman con él.
    expect(conAuditoriaMock).toHaveBeenCalledWith(UID_PLATAFORMA, expect.any(Function));
  });

  it("re-entrar es idempotente y no reescribe ni puntero ni membresía (cero auditoría falsa)", async () => {
    await entrarComoVistaPlataforma(UID_PLATAFORMA, EMPRESA_7);
    const resultado = await entrarComoVistaPlataforma(UID_PLATAFORMA, EMPRESA_7);

    expect(resultado).toEqual({ estado: "ok", empresaId: EMPRESA_7 });
    expect(bdMembresias.filter((m) => m.usuarioId === UID_PLATAFORMA)).toHaveLength(1);
    // La segunda pasada encuentra todo ya puesto y NO reescribe nada: un
    // UPDATE idéntico dispararía el trigger de auditoría con antes = después.
    expect(txMock.usuario.update).toHaveBeenCalledTimes(1);
    expect(txMock.membresiaEmpresa.upsert).toHaveBeenCalledTimes(1);
  });

  it("entrar a otra empresa barre la vista anterior: una sola vista a la vez", async () => {
    // Sin el barrido, el puntero se iba (rescate de suspendida, dos entrar
    // encimados) y la membresía auditor anterior quedaba huérfana para
    // siempre en el staff de esa empresa.
    await entrarComoVistaPlataforma(UID_PLATAFORMA, EMPRESA_7);
    const resultado = await entrarComoVistaPlataforma(UID_PLATAFORMA, EMPRESA_PROPIA);

    expect(resultado).toEqual({ estado: "ok", empresaId: EMPRESA_PROPIA });
    expect(membresia(UID_PLATAFORMA, EMPRESA_7)).toBeNull();
    expect(membresia(UID_PLATAFORMA, EMPRESA_PROPIA)).toMatchObject({ rol: "auditor" });
    expect(plataforma().empresaId).toBe(EMPRESA_PROPIA);
  });

  it("el barrido de vistas previas jamás toca una membresía real de la cuenta", async () => {
    bdMembresias.push({ usuarioId: UID_PLATAFORMA, empresaId: EMPRESA_PROPIA, rol: "admin_empresa", creadoEn: 2 });

    await entrarComoVistaPlataforma(UID_PLATAFORMA, EMPRESA_7);

    expect(membresia(UID_PLATAFORMA, EMPRESA_PROPIA)).toMatchObject({ rol: "admin_empresa" });
    expect(membresia(UID_PLATAFORMA, EMPRESA_7)).toMatchObject({ rol: "auditor" });
  });

  it("una membresía REAL de la cuenta no se pisa: estado membresia_real y nada escrito", async () => {
    // El dueño de la plataforma también es admin_empresa de la suya.
    bdMembresias.push({ usuarioId: UID_PLATAFORMA, empresaId: EMPRESA_PROPIA, rol: "admin_empresa", creadoEn: 2 });

    const resultado = await entrarComoVistaPlataforma(UID_PLATAFORMA, EMPRESA_PROPIA);

    expect(resultado).toEqual({ estado: "membresia_real", rol: "admin_empresa" });
    expect(membresia(UID_PLATAFORMA, EMPRESA_PROPIA)).toMatchObject({ rol: "admin_empresa" });
    expect(plataforma().empresaId).toBeNull();
    expect(txMock.membresiaEmpresa.upsert).not.toHaveBeenCalled();
    expect(txMock.usuario.update).not.toHaveBeenCalled();
  });

  it("empresa suspendida: se rechaza ANTES de escribir (el puntero adentro sería un 403 perpetuo)", async () => {
    const resultado = await entrarComoVistaPlataforma(UID_PLATAFORMA, EMPRESA_SUSPENDIDA);

    expect(resultado).toEqual({ estado: "suspendida" });
    expect(membresia(UID_PLATAFORMA, EMPRESA_SUSPENDIDA)).toBeNull();
    expect(plataforma().empresaId).toBeNull();
  });

  it("empresa inexistente → no_encontrada; id basura ni abre transacción", async () => {
    expect(await entrarComoVistaPlataforma(UID_PLATAFORMA, EMPRESA_INEXISTENTE)).toEqual({
      estado: "no_encontrada",
    });

    // Un id que ni es número (NaN de un Number(param) basura) falla cerrado
    // sin abrir transacción; un entero que no existe (negativo incluido)
    // entra, no encuentra y devuelve lo mismo.
    conAuditoriaMock.mockClear();
    expect(await entrarComoVistaPlataforma(UID_PLATAFORMA, Number.NaN)).toEqual({ estado: "no_encontrada" });
    expect(conAuditoriaMock).not.toHaveBeenCalled();
    expect(await entrarComoVistaPlataforma(UID_PLATAFORMA, -3)).toEqual({ estado: "no_encontrada" });
  });
});

// --- salir -----------------------------------------------------------------

describe("salirDeVistaPlataforma", () => {
  it("borra la membresía auditor, limpia el puntero y no toca el rol de cuenta", async () => {
    await entrarComoVistaPlataforma(UID_PLATAFORMA, EMPRESA_7);

    const resultado = await salirDeVistaPlataforma(UID_PLATAFORMA);

    expect(resultado).toEqual({ estado: "ok", empresaId: EMPRESA_7 });
    expect(membresia(UID_PLATAFORMA, EMPRESA_7)).toBeNull();
    expect(plataforma().empresaId).toBeNull();
    expect(plataforma().rol).toBe("admin_plataforma");
  });

  it("sin vista puesta es idempotente: ok sin escribir nada", async () => {
    const resultado = await salirDeVistaPlataforma(UID_PLATAFORMA);

    expect(resultado).toEqual({ estado: "ok", empresaId: null });
    expect(txMock.membresiaEmpresa.deleteMany).not.toHaveBeenCalled();
    expect(txMock.usuario.update).not.toHaveBeenCalled();
  });

  it("parado por membresía REAL: el puntero y la membresía quedan intactos, pero las vistas sueltas se barren", async () => {
    // El caso del residuo: con la vista puesta en 7, el dueño usó el selector
    // hacia su empresa real. La barra desapareció y el salir de antes
    // respondía 409 dejando la vista de 7 huérfana para siempre. Ahora barre
    // la vista sin tocar la membresía real ni el puntero.
    bdMembresias.push(
      { usuarioId: UID_PLATAFORMA, empresaId: EMPRESA_PROPIA, rol: "admin_empresa", creadoEn: 2 },
      { usuarioId: UID_PLATAFORMA, empresaId: EMPRESA_7, rol: "auditor", creadoEn: 3 }
    );
    plataforma().empresaId = EMPRESA_PROPIA;

    const resultado = await salirDeVistaPlataforma(UID_PLATAFORMA);

    expect(resultado).toEqual({ estado: "ok", empresaId: null });
    expect(membresia(UID_PLATAFORMA, EMPRESA_PROPIA)).toMatchObject({ rol: "admin_empresa" });
    expect(membresia(UID_PLATAFORMA, EMPRESA_7)).toBeNull();
    expect(plataforma().empresaId).toBe(EMPRESA_PROPIA);
  });

  it("una cuenta que no es de plataforma recibe no_plataforma sin escribir (un auditor real no puede autoborrarse)", async () => {
    const resultado = await salirDeVistaPlataforma(UID_COLABORADORA);

    expect(resultado).toEqual({ estado: "no_plataforma" });
    expect(membresia(UID_COLABORADORA, EMPRESA_7)).toMatchObject({ rol: "colaborador" });
    expect(txMock.membresiaEmpresa.deleteMany).not.toHaveBeenCalled();
  });

  it("puntero roto (sin membresía, p.ej. la empresa se suspendió con la vista puesta): el salir limpia igual", async () => {
    // La vista quedó puesta pero la fila de membresía ya no está: el salir
    // debe leer el puntero de la BASE (el middleware lo ignora en contexto)
    // y dejar la cuenta como plataforma pura. `empresaId: null` en la
    // respuesta: no había vista que dejar, solo un puntero que limpiar.
    plataforma().empresaId = EMPRESA_SUSPENDIDA;

    const resultado = await salirDeVistaPlataforma(UID_PLATAFORMA);

    expect(resultado).toEqual({ estado: "ok", empresaId: null });
    expect(plataforma().empresaId).toBeNull();
  });
});

// --- la solo-lectura en runtime, no solo en la matriz -----------------------

describe("vista auditor contra la superficie de escritura", () => {
  function guardaRechaza(permiso: (typeof PERMISOS)[number]): { estado?: number; siguio: boolean } {
    const visto: { estado?: number; siguio: boolean } = { siguio: false };
    const req = { usuario: { rol: "auditor" } } as unknown as Request;
    const res = {
      status(s: number) {
        visto.estado = s;
        return this;
      },
      json() {
        return this;
      },
    } as unknown as Response;
    requierePermiso(permiso)(req, res, (() => {
      visto.siguio = true;
    }) as NextFunction);
    return visto;
  }

  it("cada permiso de la matriz que no es .ver responde 403 con rol efectivo auditor", () => {
    const escritura = PERMISOS.filter((p) => !p.endsWith(".ver"));
    expect(escritura.length).toBeGreaterThan(0); // guarda de la guarda

    for (const permiso of escritura) {
      const visto = guardaRechaza(permiso);
      expect(visto.estado, permiso).toBe(403);
      expect(visto.siguio, permiso).toBe(false);
    }
  });
});
