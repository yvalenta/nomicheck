// Tests de `empresasAdminService.ts` — la vista de admin_plataforma sobre las
// empresas. Deliberadamente SIN scoping por empresa: la ruta lo protege con
// `soloPlataforma` (routes/index.ts). Lo que sí decide el servicio y hay que
// fijar: qué campos viajan al panel (la walletPagadora NO — este repo ya pagó
// una wallet filtrada en un lugar "que nadie mira") y que suspender/reactivar
// escriba exactamente `activa` y nada más. El bloqueo real de una empresa
// suspendida vive en `requiereAuth` (middleware/auth.ts), que devuelve 403
// cuando `empresa.activa` es false — acá solo se decide el valor del switch.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    empresa: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import { cambiarEstadoEmpresa, listarEmpresasAdmin } from "../empresasAdminService.js";

const EMPRESA_A = 1;

function empresaBd(over: Record<string, unknown> = {}) {
  return {
    id: EMPRESA_A,
    nombre: "Frutera del Valle",
    nit: "900123456-7",
    sector: "agro",
    creadoEn: new Date("2026-05-01"),
    activa: true,
    walletPagadora: "0xDEADBEEF00000000000000000000000000000001",
    _count: { empleados: 12, contratistas: 3 },
    usuarios: [{ id: "11111111-1111-4111-8111-111111111111", nombre: "Jefa", email: "jefa@frutera.co" }],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.empresa.findMany.mockResolvedValue([]);
  prismaMock.empresa.findUnique.mockResolvedValue(null);
  prismaMock.empresa.update.mockImplementation(async ({ where, data }: { where: { id: number }; data: object }) => ({
    ...empresaBd(),
    ...where,
    ...data,
  }));
});

// --- listarEmpresasAdmin ---------------------------------------------------

describe("listarEmpresasAdmin", () => {
  it("solo trae como 'admins' a los admin_empresa, y de ellos solo id/nombre/email", async () => {
    // El where y el select del include SON la decisión: sin el rol en el
    // where, la lista de "admins" incluiría a todos los colaboradores de la
    // empresa (con sus correos) en el panel de plataforma.
    await listarEmpresasAdmin();
    const args = prismaMock.empresa.findMany.mock.calls[0]![0];
    expect(args.include.usuarios).toEqual({
      where: { rol: "admin_empresa" },
      select: { id: true, nombre: true, email: true },
    });
  });

  it("aplana la fila para el panel y la walletPagadora NO viaja", async () => {
    // La wallet del empleador es referencial y sensible: el panel de
    // plataforma no la necesita para nada, así que no debe salir del API.
    // (Historia del repo: una wallet comprometida estuvo publicada en un
    // documento servido mientras los auditores daban verde.)
    prismaMock.empresa.findMany.mockResolvedValue([empresaBd(), empresaBd({ id: 2, activa: false, usuarios: [] })]);
    const r = await listarEmpresasAdmin();
    expect(r[0]).toEqual({
      id: EMPRESA_A,
      nombre: "Frutera del Valle",
      nit: "900123456-7",
      sector: "agro",
      creadoEn: new Date("2026-05-01"),
      activa: true,
      colaboradores: 12,
      contratistas: 3,
      admins: [{ id: "11111111-1111-4111-8111-111111111111", nombre: "Jefa", email: "jefa@frutera.co" }],
    });
    expect("walletPagadora" in r[0]!).toBe(false);
    // La suspendida se VE (activa=false), no se esconde: el panel existe para
    // poder reactivarla.
    expect(r[1]).toMatchObject({ id: 2, activa: false, admins: [] });
  });
});

// --- cambiarEstadoEmpresa --------------------------------------------------

describe("cambiarEstadoEmpresa", () => {
  it("empresa inexistente: falla sin escribir", async () => {
    prismaMock.empresa.findUnique.mockResolvedValue(null);
    await expect(cambiarEstadoEmpresa(999, false)).rejects.toThrow("Empresa no encontrada");
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
  });

  it("suspender escribe EXACTAMENTE { activa: false } — ningún otro campo se toca", async () => {
    // El update es el switch que `requiereAuth` consulta para devolver 403.
    // Afirmar el objeto data completo evita dos regresiones: que se cuele un
    // campo más (pisar la wallet, renombrar la empresa) y que el booleano se
    // quede hardcodeado en un solo sentido.
    prismaMock.empresa.findUnique.mockResolvedValue(empresaBd());
    await cambiarEstadoEmpresa(EMPRESA_A, false);
    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: EMPRESA_A },
      data: { activa: false },
    });
  });

  it("reactivar es el mismo update con true — la suspensión es reversible", async () => {
    prismaMock.empresa.findUnique.mockResolvedValue(empresaBd({ activa: false }));
    const r = await cambiarEstadoEmpresa(EMPRESA_A, true);
    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: EMPRESA_A },
      data: { activa: true },
    });
    expect(r.activa).toBe(true);
  });

  it("suspender una empresa YA suspendida no falla: el update es idempotente", async () => {
    // El panel puede mandar el mismo estado dos veces (doble click, dos
    // pestañas). Convertir eso en error obligaría al admin a adivinar el
    // estado actual antes de cada click.
    prismaMock.empresa.findUnique.mockResolvedValue(empresaBd({ activa: false }));
    await expect(cambiarEstadoEmpresa(EMPRESA_A, false)).resolves.toMatchObject({ activa: false });
  });
});
