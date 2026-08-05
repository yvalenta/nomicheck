// Tests de `auditoriaService.ts` — la ventana de LECTURA sobre la auditoría
// inmutable. Este servicio NO registra nada: el registro vive en el trigger
// PL/pgSQL `fn_auditar_cambio` (migración 20260720190000_auditoria_inmutable)
// y el actor entra por `conAuditoria` (lib/auditoria.ts). Lo que este servicio
// decide es VISIBILIDAD: qué filas de la auditoría ve cada empresa. Su modo de
// falla no es una excepción — es mostrarle a la empresa A los cambios de la B,
// o esconderle a A sus propias filas. Por eso el peso está en el `where`.
//
// El caso delicado es ReciboPago: la tabla no tiene empresaId, así que el
// trigger deja `empresaId = NULL` en esas filas y el servicio las alcanza por
// una segunda cláusula del OR con los ids de recibo de la empresa. Si esa
// cláusula se abre de más, la auditoría de nómina de TODAS las empresas queda
// visible para cualquiera con rol de lectura.
//
// Hermético como manda vitest.config.ts: el corte va en `lib/prisma.js`.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    reciboPago: { findMany: vi.fn() },
    periodoNomina: { findMany: vi.fn() },
    usuario: { findMany: vi.fn() },
    auditoriaCambio: { count: vi.fn(), findMany: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import { listarAuditoria, type FiltrosAuditoria } from "../auditoriaService.js";

const EMPRESA_A = 1;
const UID_AUTOR = "11111111-1111-4111-8111-111111111111";

function filtros(over: Partial<FiltrosAuditoria> = {}): FiltrosAuditoria {
  return { page: 1, limit: 25, skip: 0, ...over };
}

function filaAuditoria(over: Record<string, unknown> = {}) {
  return {
    id: 1n,
    empresaId: EMPRESA_A,
    usuarioId: UID_AUTOR,
    tabla: "Empleado",
    registroId: "500",
    accion: "UPDATE",
    valoresAnteriores: { salarioBase: 2_000_000 },
    valoresNuevos: { salarioBase: 2_100_000 },
    creadoEn: new Date("2026-08-01T12:00:00Z"),
    ...over,
  };
}

/** El `where` que el servicio le pasó a findMany — la decisión bajo prueba. */
function whereDeFindMany(): Record<string, any> {
  const args = prismaMock.auditoriaCambio.findMany.mock.calls[0]![0];
  return args.where;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults benignos: empresa sin recibos, sin periodos, sin filas de
  // auditoría. Cada test sobreescribe SOLO lo que le importa.
  prismaMock.reciboPago.findMany.mockResolvedValue([]);
  prismaMock.periodoNomina.findMany.mockResolvedValue([]);
  prismaMock.$queryRawUnsafe.mockResolvedValue([]);
  prismaMock.usuario.findMany.mockResolvedValue([]);
  prismaMock.auditoriaCambio.count.mockResolvedValue(0);
  prismaMock.auditoriaCambio.findMany.mockResolvedValue([]);
});

describe("listarAuditoria — scoping por empresa", () => {
  it("el OR de empresa siempre lleva el empresaId del solicitante, y count/findMany comparten el MISMO where", async () => {
    // Si count y findMany divergieran, el total mentiría — o peor, contaría
    // filas de otras empresas que el listado no muestra (y viceversa).
    await listarAuditoria(EMPRESA_A, filtros());
    const where = whereDeFindMany();
    expect(where.OR).toContainEqual({ empresaId: EMPRESA_A });
    const whereCount = prismaMock.auditoriaCambio.count.mock.calls[0]![0].where;
    expect(whereCount).toEqual(where);
  });

  it("sin recibos propios, la cláusula ReciboPago NO existe: el where queda solo con empresaId", async () => {
    // Las dos formas degeneradas serían malas: `registroId: { in: [] }` es
    // inofensiva pero ruido, y `{ tabla: "ReciboPago" }` a secas abriría la
    // auditoría de recibos de TODAS las empresas (empresaId NULL en esas
    // filas). Afirmar la forma exacta cierra las dos puertas.
    await listarAuditoria(EMPRESA_A, filtros());
    expect(whereDeFindMany().OR).toEqual([{ empresaId: EMPRESA_A }]);
  });

  it("los recibos de OTRA empresa no entran al IN, ni siquiera los ya borrados", async () => {
    // El trigger deja empresaId=NULL en las filas de ReciboPago: la ÚNICA
    // barrera cross-tenant es este IN. Los borrados se reconstruyen del JSON
    // de la fila de auditoría (periodoId en valoresAnteriores/Nuevos) y se
    // filtran contra los periodos de la empresa — un registroId cuyo periodo
    // es de otra empresa tiene que quedar afuera.
    prismaMock.reciboPago.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    prismaMock.periodoNomina.findMany.mockResolvedValue([{ id: 100 }]);
    prismaMock.$queryRawUnsafe.mockResolvedValue([
      { registroId: "77", pid: 100 },  // recibo borrado de un periodo propio
      { registroId: "666", pid: 999 }, // recibo borrado de un periodo AJENO
    ]);

    await listarAuditoria(EMPRESA_A, filtros());

    // La consulta de recibos vivos también va scoped por empresa en el where.
    expect(prismaMock.reciboPago.findMany).toHaveBeenCalledWith({
      where: { periodo: { empresaId: EMPRESA_A } },
      select: { id: true },
    });
    const clausulaRecibos = whereDeFindMany().OR.find((c: any) => c.tabla === "ReciboPago");
    expect([...clausulaRecibos.registroId.in].sort()).toEqual(["10", "11", "77"]);
  });

  it("el SQL crudo de recibos borrados es un literal fijo: ningún filtro del usuario se concatena", async () => {
    // Es `$queryRawUnsafe` — el nombre avisa. Hoy es seguro porque el string
    // no interpola nada; esta prueba mantiene esa propiedad si alguien "le
    // agrega un filtro rápido" con template literal.
    await listarAuditoria(EMPRESA_A, filtros({ q: "'; DROP TABLE \"AuditoriaCambio\"; --" }));
    const llamada = prismaMock.$queryRawUnsafe.mock.calls[0]!;
    expect(llamada).toHaveLength(1); // sin parámetros extra
    expect(llamada[0]).not.toContain("DROP TABLE");
  });
});

describe("listarAuditoria — filtros", () => {
  it("tabla=Empleado no dispara la resolución de recibos y exige la tabla en el where", async () => {
    await listarAuditoria(EMPRESA_A, filtros({ tabla: "Empleado" }));
    expect(prismaMock.reciboPago.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(whereDeFindMany().tabla).toBe("Empleado");
  });

  it("tabla=ReciboPago sí resuelve los ids propios y fija la tabla", async () => {
    prismaMock.reciboPago.findMany.mockResolvedValue([{ id: 10 }]);
    await listarAuditoria(EMPRESA_A, filtros({ tabla: "ReciboPago" }));
    const where = whereDeFindMany();
    expect(where.tabla).toBe("ReciboPago");
    expect(where.OR).toContainEqual({ tabla: "ReciboPago", registroId: { in: ["10"] } });
  });

  it("desde/hasta son inclusivos: el día 'hasta' entra completo, hasta las 23:59:59.999Z", async () => {
    // El caso clásico: filtrar "hasta el 31" y perder todo lo del día 31
    // porque el corte quedó a medianoche. En una auditoría eso es esconder
    // exactamente el día que se está investigando.
    await listarAuditoria(EMPRESA_A, filtros({ desde: "2026-07-01", hasta: "2026-07-31" }));
    expect(whereDeFindMany().creadoEn).toEqual({
      gte: new Date("2026-07-01T00:00:00Z"),
      lte: new Date("2026-07-31T23:59:59.999Z"),
    });
  });

  it("buscar un autor que no existe devuelve NADA, no todo", async () => {
    // `usuarioId: { in: [] }` no matchea ninguna fila. Si el filtro vacío se
    // omitiera "por limpieza", buscar un nombre ajeno listaría la auditoría
    // completa — el fallback permisivo exacto que no puede pasar.
    prismaMock.usuario.findMany.mockResolvedValue([]);
    await listarAuditoria(EMPRESA_A, filtros({ q: "nadie con este nombre" }));
    expect(whereDeFindMany().usuarioId).toEqual({ in: [] });
  });

  it("la búsqueda de autor va por nombre O email, insensible a mayúsculas", async () => {
    await listarAuditoria(EMPRESA_A, filtros({ q: "ana" }));
    expect(prismaMock.usuario.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { nombre: { contains: "ana", mode: "insensitive" } },
          { email: { contains: "ana", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
  });

  it("accion se pasa tal cual al where", async () => {
    await listarAuditoria(EMPRESA_A, filtros({ accion: "DELETE" }));
    expect(whereDeFindMany().accion).toBe("DELETE");
  });

  it("paginación: skip/take vienen del filtro y la respuesta conserva page/limit/total", async () => {
    prismaMock.auditoriaCambio.count.mockResolvedValue(42);
    const r = await listarAuditoria(EMPRESA_A, filtros({ page: 2, limit: 25, skip: 25 }));
    expect(prismaMock.auditoriaCambio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25, orderBy: { creadoEn: "desc" } })
    );
    expect(r).toMatchObject({ total: 42, page: 2, limit: 25 });
  });
});

describe("listarAuditoria — forma de las entradas", () => {
  it("una cuenta eliminada NO borra el rastro: la entrada conserva el id del actor con placeholder", async () => {
    // La auditoría es inmutable justamente para sobrevivir a esto: si borrar
    // la cuenta hiciera desaparecer al autor del listado, borrarse sería la
    // forma de taparse. El id queda; solo el nombre se degrada a placeholder.
    prismaMock.auditoriaCambio.findMany.mockResolvedValue([filaAuditoria()]);
    prismaMock.auditoriaCambio.count.mockResolvedValue(1);
    prismaMock.usuario.findMany.mockResolvedValue([]); // la cuenta ya no está

    const r = await listarAuditoria(EMPRESA_A, filtros());
    expect(r.items[0]!.usuario).toEqual({ id: UID_AUTOR, nombre: "(cuenta eliminada)", email: null });
    // El payload no pierde nada más: valores y metadatos pasan intactos.
    expect(r.items[0]).toMatchObject({
      id: "1", // BigInt serializado a string — JSON.stringify explota con BigInt crudo
      tabla: "Empleado",
      registroId: "500",
      accion: "UPDATE",
      valoresAnteriores: { salarioBase: 2_000_000 },
      valoresNuevos: { salarioBase: 2_100_000 },
    });
  });

  it("una entrada sin usuarioId (cambio sin conAuditoria) sale con usuario null y sin consultar cuentas", async () => {
    // Este null es real: todo write a una tabla auditada que NO pasa por
    // `conAuditoria` queda registrado sin actor (p. ej. hoy
    // aceptar/rechazar invitación en colaboradorService — ver el hallazgo en
    // colaboradorService.test.ts). El servicio de lectura lo muestra como
    // anónimo en vez de inventar un autor.
    prismaMock.auditoriaCambio.findMany.mockResolvedValue([filaAuditoria({ usuarioId: null })]);
    prismaMock.auditoriaCambio.count.mockResolvedValue(1);

    const r = await listarAuditoria(EMPRESA_A, filtros());
    expect(r.items[0]!.usuario).toBeNull();
    expect(prismaMock.usuario.findMany).not.toHaveBeenCalled();
  });
});
