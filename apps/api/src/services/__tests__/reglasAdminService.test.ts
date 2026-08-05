// Tests de `reglasAdminService.ts` — el CRUD admin del catálogo legal (Fase
// 8). Acá se escribe lo que después liquida la nómina de todo el mundo: una
// vigencia mal cerrada solapa dos valores de SMLMV, y un cache sin invalidar
// sirve el valor viejo hasta que expire el TTL. El fixture NO es inventado:
// es `prisma/semillaLegal.ts`, la misma semilla que escribe la base.
//
// Dos HALLAZGOS caracterizados abajo (no corregidos acá):
//   1. Un valor NEGATIVO pasa: `nuevaReglaSchema.valor` es z.number() sin piso
//      y el servicio no valida — un SMLMV de -5 entra al catálogo y al cache.
//   2. Cerrar la vigencia anterior y crear la nueva NO van en una transacción:
//      si el create falla, la clave queda con la anterior CERRADA y ninguna
//      abierta — las fechas desde la nueva vigencia quedan sin regla y el
//      resolutor del motor lanza "No hay regla legal vigente".
//
// Hermético: prisma mockeado; `invalidarCacheReglas` (nominaService) también,
// porque invalidar o no invalidar ES parte del contrato bajo prueba.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOGO_REGLAS_LEGALES } from "@pv/reglas";
import { REGLAS_SEMILLA } from "../../../prisma/semillaLegal.js";

const { prismaMock, invalidarMock } = vi.hoisted(() => ({
  prismaMock: {
    reglaLegal: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    festivo: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
  invalidarMock: vi.fn(),
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../nominaService.js", () => ({ invalidarCacheReglas: invalidarMock }));

import {
  crearFestivo,
  crearVigenciaRegla,
  eliminarFestivo,
  listarFestivosAdmin,
  listarReglasAgrupadas,
} from "../reglasAdminService.js";

// La vigencia ABIERTA de smlmv según la semilla real (vigenteHasta ausente en
// la semilla = null en la base, igual que normaliza batchPublicoService.test).
const SMLMV_ABIERTO = {
  id: 7,
  ...REGLAS_SEMILLA.filter((r) => r.clave === "smlmv").find((r) => !r.vigenteHasta)!,
  vigenteHasta: null as string | null,
  fuente: "Decreto 1469 de 2025",
  creadoEn: new Date("2026-01-02"),
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.reglaLegal.findMany.mockResolvedValue([]);
  prismaMock.reglaLegal.findFirst.mockResolvedValue(null);
  prismaMock.reglaLegal.update.mockImplementation(async ({ where, data }: { where: { id: number }; data: object }) => ({ ...SMLMV_ABIERTO, ...where, ...data }));
  prismaMock.reglaLegal.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 99, ...data }));
  prismaMock.festivo.findMany.mockResolvedValue([]);
  prismaMock.festivo.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 1, ...data }));
  prismaMock.festivo.delete.mockResolvedValue({ id: 1 });
});

// --- crearVigenciaRegla ----------------------------------------------------

describe("crearVigenciaRegla", () => {
  const nueva = { clave: "smlmv" as (typeof REGLAS_SEMILLA)[number]["clave"], valor: 1_900_000, vigenteDesde: "2027-01-01" };

  it("busca SOLO la vigencia abierta de ESA clave", async () => {
    await crearVigenciaRegla(nueva);
    expect(prismaMock.reglaLegal.findFirst).toHaveBeenCalledWith({
      where: { clave: "smlmv", vigenteHasta: null },
      orderBy: { vigenteDesde: "desc" },
    });
  });

  it("cierra la abierta anterior el día ANTES de la nueva: ni solapamiento ni hueco (SCD2)", async () => {
    prismaMock.reglaLegal.findFirst.mockResolvedValue(SMLMV_ABIERTO);
    await crearVigenciaRegla(nueva);
    expect(prismaMock.reglaLegal.update).toHaveBeenCalledWith({
      where: { id: SMLMV_ABIERTO.id },
      data: { vigenteHasta: "2026-12-31" },
    });
    expect(prismaMock.reglaLegal.create).toHaveBeenCalledWith({ data: nueva });
    // Sin esta invalidación el próximo cálculo liquidaría con el valor viejo
    // hasta que venza el TTL del cache — el cambio "aplicado" que no aplica.
    expect(invalidarMock).toHaveBeenCalledTimes(1);
  });

  it("el día anterior cruza bien el año bisiesto y el cambio de mes", async () => {
    // La resta ingenua de strings ("2028-03-01" → "2028-03-00") o un -1 sobre
    // el día sin acarreo dejarían un vigenteHasta inválido que Postgres
    // guardaría feliz (la columna es String) y el resolutor compararía mal.
    prismaMock.reglaLegal.findFirst.mockResolvedValue({ ...SMLMV_ABIERTO, vigenteDesde: "2027-06-01" });
    await crearVigenciaRegla({ ...nueva, vigenteDesde: "2028-03-01" });
    expect(prismaMock.reglaLegal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { vigenteHasta: "2028-02-29" } })
    );

    prismaMock.reglaLegal.findFirst.mockResolvedValue(SMLMV_ABIERTO);
    await crearVigenciaRegla({ ...nueva, vigenteDesde: "2026-08-01" });
    expect(prismaMock.reglaLegal.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { vigenteHasta: "2026-07-31" } })
    );
  });

  it("vigencia nueva ANTERIOR a la abierta: rechaza sin escribir y sin invalidar el cache", async () => {
    // Fechas invertidas = reescribir el pasado: una vigencia retroactiva
    // partiría el historial SCD2 con dos filas cubriendo el mismo día.
    prismaMock.reglaLegal.findFirst.mockResolvedValue(SMLMV_ABIERTO); // abierta desde 2026-01-01
    await expect(crearVigenciaRegla({ ...nueva, vigenteDesde: "2025-12-31" })).rejects.toThrow(/Ya existe una vigencia/);
    expect(prismaMock.reglaLegal.update).not.toHaveBeenCalled();
    expect(prismaMock.reglaLegal.create).not.toHaveBeenCalled();
    expect(invalidarMock).not.toHaveBeenCalled();
  });

  it("la MISMA fecha también se rechaza: el borde es >=, no >", async () => {
    prismaMock.reglaLegal.findFirst.mockResolvedValue(SMLMV_ABIERTO);
    await expect(crearVigenciaRegla({ ...nueva, vigenteDesde: SMLMV_ABIERTO.vigenteDesde })).rejects.toThrow(/Ya existe una vigencia/);
    expect(prismaMock.reglaLegal.create).not.toHaveBeenCalled();
  });

  it("primera vigencia de una clave: crea sin cerrar nada e invalida el cache", async () => {
    prismaMock.reglaLegal.findFirst.mockResolvedValue(null);
    await crearVigenciaRegla(nueva);
    expect(prismaMock.reglaLegal.update).not.toHaveBeenCalled();
    expect(prismaMock.reglaLegal.create).toHaveBeenCalledWith({ data: nueva });
    expect(invalidarMock).toHaveBeenCalledTimes(1);
  });

  it("HALLAZGO 1 caracterizado: un valor NEGATIVO entra al catálogo sin protesta", async () => {
    // z.number() sin .nonneg + servicio sin guarda = un SMLMV de -5 se
    // guarda y el cache se invalida para servirlo de inmediato. Ninguna
    // regla legal colombiana es negativa; esto debería rechazarse en el
    // schema (validation/reglasAdmin.ts, fuera del alcance de esta sesión).
    // Cuando se arregle, esta prueba debe fallar y reescribirse como rechazo.
    await crearVigenciaRegla({ ...nueva, valor: -5 });
    expect(prismaMock.reglaLegal.create).toHaveBeenCalledWith({ data: expect.objectContaining({ valor: -5 }) });
    expect(invalidarMock).toHaveBeenCalled();
  });

  it("HALLAZGO 2 caracterizado: si el create falla, la vigencia anterior YA quedó cerrada (sin transacción)", async () => {
    // Cierre y alta van en dos statements sueltos. Un fallo entre ambos deja
    // la clave sin fila abierta: toda fecha >= la nueva vigencia lanza "No
    // hay regla legal vigente" en el motor. El arreglo natural es
    // prisma.$transaction; mientras tanto esta prueba documenta la ventana.
    prismaMock.reglaLegal.findFirst.mockResolvedValue(SMLMV_ABIERTO);
    prismaMock.reglaLegal.create.mockRejectedValue(new Error("conexión perdida"));
    await expect(crearVigenciaRegla(nueva)).rejects.toThrow("conexión perdida");
    // La anterior quedó cerrada aunque la nueva nunca nació:
    expect(prismaMock.reglaLegal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { vigenteHasta: "2026-12-31" } })
    );
    // Y el cache ni se entera (sigue sirviendo el catálogo pre-cierre hasta
    // el TTL — el único consuelo de la ventana).
    expect(invalidarMock).not.toHaveBeenCalled();
  });
});

// --- listarReglasAgrupadas -------------------------------------------------

describe("listarReglasAgrupadas", () => {
  it("devuelve TODAS las claves del catálogo con sus vigencias (vacías incluidas) y la metadata para la UI", async () => {
    const filasSmlmv = REGLAS_SEMILLA.filter((r) => r.clave === "smlmv").map((r, i) => ({ id: i + 1, ...r, vigenteHasta: r.vigenteHasta ?? null }));
    prismaMock.reglaLegal.findMany.mockResolvedValue(filasSmlmv);
    const r = await listarReglasAgrupadas();
    // El catálogo manda: una clave sin filas igual aparece (la UI la ofrece
    // para crear su primera vigencia), y la etiqueta viene del catálogo, no
    // de la base.
    expect(r).toHaveLength(CATALOGO_REGLAS_LEGALES.length);
    const smlmv = r.find((g) => g.clave === "smlmv")!;
    expect(smlmv.vigencias).toHaveLength(filasSmlmv.length);
    expect(smlmv.etiqueta).toBe("Salario mínimo legal mensual vigente");
    const uvt = r.find((g) => g.clave === "uvt")!;
    expect(uvt.vigencias).toEqual([]);
  });

  it("CARACTERIZACIÓN: una fila con clave fuera del catálogo desaparece del listado en silencio", async () => {
    // Solo puede pasar por edición manual de la base (el schema restringe las
    // claves al catálogo), pero conviene saber que el panel NO la mostraría:
    // el agrupado itera el catálogo, no las filas.
    prismaMock.reglaLegal.findMany.mockResolvedValue([
      { id: 1, clave: "clave_fantasma", valor: 1, vigenteDesde: "2026-01-01", vigenteHasta: null },
    ]);
    const r = await listarReglasAgrupadas();
    expect(r.every((g) => g.vigencias.length === 0)).toBe(true);
  });

  it("pide las vigencias ordenadas: por clave, y la más reciente primero dentro de cada una", async () => {
    await listarReglasAgrupadas();
    expect(prismaMock.reglaLegal.findMany).toHaveBeenCalledWith({
      orderBy: [{ clave: "asc" }, { vigenteDesde: "desc" }],
    });
  });
});

// --- festivos ----------------------------------------------------------------

describe("festivos", () => {
  it("crearFestivo crea e invalida el cache — un festivo nuevo cambia recargos YA", async () => {
    const festivo = { fecha: "2027-07-20", nombre: "Día de la Independencia" };
    await crearFestivo(festivo);
    expect(prismaMock.festivo.create).toHaveBeenCalledWith({ data: festivo });
    expect(invalidarMock).toHaveBeenCalledTimes(1);
  });

  it("eliminarFestivo borra e invalida el cache", async () => {
    await eliminarFestivo(3);
    expect(prismaMock.festivo.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(invalidarMock).toHaveBeenCalledTimes(1);
  });

  it("si el delete falla (id inexistente), el error sube y el cache no se toca", async () => {
    prismaMock.festivo.delete.mockRejectedValue(new Error("Record to delete does not exist"));
    await expect(eliminarFestivo(999)).rejects.toThrow("does not exist");
    expect(invalidarMock).not.toHaveBeenCalled();
  });

  it("listarFestivosAdmin ordena por fecha ascendente", async () => {
    await listarFestivosAdmin();
    expect(prismaMock.festivo.findMany).toHaveBeenCalledWith({ orderBy: { fecha: "asc" } });
  });
});
