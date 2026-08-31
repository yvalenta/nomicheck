// Tests de `empresasAdminService.ts` — la vista de admin_plataforma sobre las
// empresas. Deliberadamente SIN scoping por empresa: la ruta lo protege con
// `soloPlataforma` (routes/index.ts). Lo que sí decide el servicio y hay que
// fijar: DE DÓNDE sale la lista de admins (de `MembresiaEmpresa`, no del
// puntero ni del rol de cuenta — ver el escenario del final), qué campos
// viajan al panel (la walletPagadora NO — este repo ya pagó una wallet
// filtrada en un lugar "que nadie mira") y que suspender/reactivar escriba
// exactamente `activa` y nada más. El bloqueo real de una empresa suspendida
// vive en `requiereAuth` (middleware/auth.ts), que devuelve 403 cuando
// `empresa.activa` es false — acá solo se decide el valor del switch.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    empresa: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import { cambiarEstadoEmpresa, listarEmpresasAdmin } from "../empresasAdminService.js";

const EMPRESA_A = 1;
const EMPRESA_B = 2;
const DORA = "22222222-2222-4222-8222-222222222222";

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
    membresias: [
      { usuario: { id: "11111111-1111-4111-8111-111111111111", nombre: "Jefa", email: "jefa@frutera.co" } },
    ],
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
  it("los admins se piden a la MEMBRESÍA de la empresa, no a la relación del puntero", async () => {
    // Esta afirmación cambió de sentido a propósito, y no es relajar una
    // prueba: la versión anterior fijaba `include.usuarios = { where: { rol:
    // "admin_empresa" } }`, o sea que ponía en verde el bug. `usuarios` es la
    // relación de `Usuario.empresaId` (la empresa ACTIVA de esa cuenta) y
    // `rol` ahí es el rol de CUENTA; los dos son globales y desde las
    // membresías no dicen quién administra esta empresa. Una prueba que
    // congela la consulta equivocada no protege nada: obliga a que el arreglo
    // la rompa. Lo que se conserva —y es lo que la prueba vieja sí cuidaba—
    // es el filtro por rol y el select angosto: sin ellos la lista de
    // "admins" serían todos los miembros de la empresa, con sus correos, en
    // el panel de plataforma.
    await listarEmpresasAdmin();
    const args = prismaMock.empresa.findMany.mock.calls[0]![0];
    expect(args.include.membresias).toEqual({
      where: { rol: "admin_empresa" },
      select: { usuario: { select: { id: true, nombre: true, email: true } } },
      orderBy: { usuario: { nombre: "asc" } },
    });
    // Y el puntero no se consulta: mientras siga en el include, alguien puede
    // volver a leer de ahí sin que nada se ponga rojo.
    expect(args.include.usuarios).toBeUndefined();
  });

  it("aplana la fila para el panel y la walletPagadora NO viaja", async () => {
    // La wallet del empleador es referencial y sensible: el panel de
    // plataforma no la necesita para nada, así que no debe salir del API.
    // (Historia del repo: una wallet comprometida estuvo publicada en un
    // documento servido mientras los auditores daban verde.)
    prismaMock.empresa.findMany.mockResolvedValue([
      empresaBd(),
      empresaBd({ id: EMPRESA_B, activa: false, membresias: [] }),
    ]);
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
    expect(r[1]).toMatchObject({ id: EMPRESA_B, activa: false, admins: [] });
  });
});

// --- El escenario medido por la revisión ------------------------------------
//
// Las dos pruebas de arriba miran la FORMA de la consulta y de la respuesta.
// Estas dos miran el EFECTO, contra una base de mentira mínima que resuelve la
// relación que el servicio pida: si pide `membresias` filtra `MembresiaEmpresa`
// por (empresa, rol); si pide `usuarios` filtra `Usuario` por (puntero, rol de
// cuenta). Es lo que hace que la prueba distinga las dos fuentes en vez de
// pasar por el nombre de la clave: leyendo del puntero, este mismo estado da
// las dos respuestas equivocadas que midió la revisión.
//
// El estado de Dora es el que deja el sistema hoy: es admin_empresa de A (de
// ahí su rol de cuenta) y auditora de B, y en este momento está PARADA en B —
// cambiar de empresa activa mueve el puntero y no sincroniza `Usuario.rol`.

type Seleccion = Record<string, boolean> | undefined;

interface FilaUsuario {
  id: string;
  nombre: string;
  email: string;
  /** Rol de CUENTA (global). */
  rol: string;
  /** Puntero: la empresa ACTIVA, no las que le pertenecen. */
  empresaId: number | null;
}

interface FilaMembresia {
  usuarioId: string;
  empresaId: number;
  /** Rol EN ESA empresa. La fuente de verdad. */
  rol: string;
}

interface IncluirRelacion {
  where?: { rol?: string };
  select?: Record<string, unknown>;
  orderBy?: unknown;
}

const bdUsuarios: FilaUsuario[] = [
  { id: DORA, nombre: "Dora", email: "dora@frutera.co", rol: "admin_empresa", empresaId: EMPRESA_B },
];

const bdMembresias: FilaMembresia[] = [
  { usuarioId: DORA, empresaId: EMPRESA_A, rol: "admin_empresa" },
  { usuarioId: DORA, empresaId: EMPRESA_B, rol: "auditor" },
];

/** Deja pasar solo las claves que el `select` pidió — como el select real: lo
 * que no se nombra no viaja (acá `rol` y `empresaId` de la fila Usuario). */
function proyectar(fila: Record<string, unknown>, select: Seleccion) {
  if (!select) return { ...fila };
  return Object.fromEntries(
    Object.keys(select)
      .filter((k) => select[k])
      .map((k) => [k, fila[k]])
  );
}

function montarDosEmpresas() {
  prismaMock.empresa.findMany.mockImplementation(
    async ({ include }: { include: Record<string, IncluirRelacion> }) =>
      [EMPRESA_A, EMPRESA_B].map((id) => {
        const fila: Record<string, unknown> = {
          ...empresaBd({ id, nombre: id === EMPRESA_A ? "Frutera del Valle" : "Andina Cargo" }),
        };
        delete fila.membresias;

        const porMembresia = include.membresias;
        if (porMembresia) {
          const selUsuario = (porMembresia.select?.usuario as { select?: Seleccion } | undefined)?.select;
          const filas = bdMembresias
            .filter((m) => m.empresaId === id && (porMembresia.where?.rol ?? m.rol) === m.rol)
            .map((m) => ({ usuario: proyectar(bdUsuarios.find((u) => u.id === m.usuarioId)!, selUsuario) }));
          // El orden por nombre solo si se pidió, para no tapar su ausencia.
          if (porMembresia.orderBy) {
            filas.sort((x, y) => String(x.usuario.nombre).localeCompare(String(y.usuario.nombre)));
          }
          fila.membresias = filas;
        }

        const porPuntero = include.usuarios;
        if (porPuntero) {
          fila.usuarios = bdUsuarios
            .filter((u) => u.empresaId === id && (porPuntero.where?.rol ?? u.rol) === u.rol)
            .map((u) => proyectar(u as unknown as Record<string, unknown>, porPuntero.select as Seleccion));
        }

        return fila;
      })
  );
}

describe("listarEmpresasAdmin — pertenecer a dos empresas", () => {
  beforeEach(montarDosEmpresas);

  it("la admin de A parada en B SIGUE siendo admin de A", async () => {
    // Con el puntero, A salía con `admins: []` y el panel escribía "Sin
    // admin_empresa asignado" sobre una empresa que sí tiene quien la
    // administre — y el admin_plataforma se quedaba sin a quién reasignar.
    const r = await listarEmpresasAdmin();
    expect(r.find((e) => e.id === EMPRESA_A)!.admins).toEqual([
      { id: DORA, nombre: "Dora", email: "dora@frutera.co" },
    ]);
  });

  it("su membresía de auditor en B no la convierte en admin de B", async () => {
    // El fantasma: con el puntero en B y el rol de cuenta que le quedó de A,
    // el panel la dibujaba como admin de B con un botón de papelera al lado
    // que siempre fallaba con 422, porque `quitarAdminEmpresa` sí pregunta
    // por la membresía del par (usuarioId, empresaId). Preguntando los dos lo
    // mismo, la pantalla no ofrece una acción que la API tiene prohibida.
    const r = await listarEmpresasAdmin();
    expect(r.find((e) => e.id === EMPRESA_B)!.admins).toEqual([]);
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
