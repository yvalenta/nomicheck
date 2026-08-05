// Tests de `reglasAdminService.ts` — el CRUD admin del catálogo legal (Fase
// 8). Acá se escribe lo que después liquida la nómina de todo el mundo: una
// vigencia mal cerrada solapa dos valores de SMLMV, y un cache sin invalidar
// sirve el valor viejo hasta que expire el TTL. El fixture NO es inventado:
// es `prisma/semillaLegal.ts`, la misma semilla que escribe la base.
//
// Dos hallazgos nacieron caracterizados acá y HOY ESTÁN CERRADOS; las pruebas
// que los describían ahora afirman el arreglo:
//   1. Un valor NEGATIVO pasaba (`valor: z.number()` sin piso): un SMLMV de -5
//      entraba al catálogo y el cache se invalidaba para servirlo.
//   2. Cerrar la vigencia anterior y crear la nueva NO iban en transacción: si
//      el create fallaba, la clave quedaba con la anterior CERRADA y ninguna
//      abierta, y el motor lanzaba "No hay regla legal vigente".
//
// Hermético: prisma mockeado; `invalidarCacheReglas` (nominaService) también,
// porque invalidar o no invalidar ES parte del contrato bajo prueba.
//
// `$transaction` del mock ejecuta el callback con el MISMO cliente mockeado y
// propaga el rechazo, que es lo que permite probar el rollback: si el create
// lanza, la prueba ve que el cache NO se invalidó.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOGO_REGLAS_LEGALES } from "@pv/reglas";
import { REGLAS_SEMILLA } from "../../../prisma/semillaLegal.js";
import { nuevaReglaSchema } from "../../validation/reglasAdmin.js";

const { prismaMock, invalidarMock } = vi.hoisted(() => {
  const mock: Record<string, unknown> = {
    reglaLegal: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    festivo: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
  };
  // El callback corre con el mismo cliente: así los `tx.reglaLegal.*` de la
  // transacción quedan registrados en los mismos espías que ya usan las
  // pruebas, y un rechazo adentro se propaga como lo haría un rollback.
  mock.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mock));
  return { prismaMock: mock, invalidarMock: vi.fn() };
});

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

  // Nació caracterizando el hallazgo 1; hoy afirma que está cerrado. La guarda
  // vive en el SCHEMA (`validation/reglasAdmin.ts`) y no en el servicio, así
  // que se prueba donde vive: el servicio recibe lo ya validado.
  it("el schema RECHAZA un valor negativo antes de que llegue al servicio", () => {
    const r = nuevaReglaSchema.safeParse({ ...nueva, valor: -5 });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toContain("no puede ser negativo");
  });

  // El cero NO es un valor faltante: `pago_onchain_prima_pct` vale 0 en la
  // semilla real. Un piso en `> 0` habría roto el catálogo vigente, así que
  // esta prueba fija que el piso es `>= 0` y no otro.
  it("...pero ACEPTA el cero, que es un valor legítimo del catálogo real", () => {
    expect(nuevaReglaSchema.safeParse({ ...nueva, valor: 0 }).success).toBe(true);
    expect(REGLAS_SEMILLA.some((r) => r.valor === 0)).toBe(true);
  });

  it("si el create falla, la vigencia anterior NO queda cerrada: todo va en una transacción", async () => {
    // El hallazgo 2, cerrado. Antes eran dos statements sueltos y un fallo
    // entre ambos dejaba la clave sin fila abierta — toda fecha desde la nueva
    // vigencia lanzaba "No hay regla legal vigente" en el motor.
    prismaMock.reglaLegal.findFirst.mockResolvedValue(SMLMV_ABIERTO);
    prismaMock.reglaLegal.create.mockRejectedValue(new Error("conexión perdida"));

    await expect(crearVigenciaRegla(nueva)).rejects.toThrow("conexión perdida");

    // El cierre y el alta ocurrieron DENTRO de $transaction: el rechazo del
    // create hace rollback de los dos, así que la anterior sigue abierta.
    expect(prismaMock.$transaction).toHaveBeenCalled();
    // Y el cache NO se invalida: hacerlo sobre una escritura que termina en
    // rollback obliga a releer para volver a lo mismo, y deja creer que entró.
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
