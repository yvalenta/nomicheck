// Suite directa del ledger de reglas verificadas (RUMBO §2.4). Lo que ya
// cubre batchPublicoService.test.ts NO se repite acá: que el ledger público y
// el reglasHash del wrapper salgan del mismo hash, y que la fecha del ledger
// sea REGLAS_VERIFICADAS_AL (además, vaultSincronia.test.ts vigila que esa
// fecha no derive del vault). Lo que falta — y es la tesis del producto — son
// las propiedades del hash MISMO: que un tercero con los mismos datos llegue
// al mismo hash sin importar cómo le llegaron ordenados o tipados, y que
// CUALQUIER diferencia real del catálogo (un peso, una vigencia, una fuente,
// un festivo) produzca otro hash. Un hash que no cambia cuando el catálogo
// cambia es peor que ninguno: certifica lo que no es.
//
// El fixture es la semilla real (prisma/semillaLegal.ts), nunca inventado —
// si un valor legal cambia, cambia también para estas pruebas.
import { describe, expect, it, vi } from "vitest";
import type { Festivo, ReglaLegal } from "@pv/reglas";

import { FESTIVOS_SEMILLA, REGLAS_SEMILLA } from "../../../prisma/semillaLegal.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    reglaLegal: {
      findMany: async () =>
        REGLAS_SEMILLA.map((r) => ({ ...r, vigenteHasta: r.vigenteHasta ?? null, fuente: r.fuente ?? null })),
    },
    festivo: { findMany: async () => FESTIVOS_SEMILLA },
  },
}));

import { hashCatalogo, obtenerLedgerReglas } from "../reglasVerificadasService.js";

// Copias frescas en cada uso: varios tests mutan su copia local y ninguno
// debe poder contaminar al resto vía el array compartido de la semilla.
const reglas = (): ReglaLegal[] => REGLAS_SEMILLA.map((r) => ({ ...r }));
const festivos = (): Festivo[] => FESTIVOS_SEMILLA.map((f) => ({ ...f }));

describe("hashCatalogo", () => {
  it("es determinista y con forma sha256", () => {
    const a = hashCatalogo(reglas(), festivos());
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCatalogo(reglas(), festivos())).toBe(a);
  });

  it("no depende del orden en que la base devuelva reglas ni festivos", () => {
    // Prisma no garantiza orden sin orderBy, y un buyer recomputando desde un
    // export puede tener las filas en cualquier orden: el hash canonicaliza
    // ordenando por (clave, vigenteDesde) y por fecha — mismo catálogo,
    // mismo hash, llegue como llegue.
    const base = hashCatalogo(reglas(), festivos());
    expect(hashCatalogo(reglas().reverse(), festivos().reverse())).toBe(base);
    // Un desorden intermedio (ni original ni invertido) también.
    const barajadas = reglas();
    const [primera] = barajadas.splice(0, 1);
    barajadas.push(primera!);
    expect(hashCatalogo(barajadas, festivos())).toBe(base);
  });

  it("normaliza Date vs string en las vigencias: mismo día, mismo hash", () => {
    // Prisma devuelve DateTime como Date; la semilla y un export JSON traen
    // strings. Si el hash distinguiera el tipo, el buyer JAMÁS podría
    // reproducirlo desde el export — la normalización a YYYY-MM-DD es lo que
    // hace al hash verificable por terceros.
    const base = hashCatalogo(reglas(), festivos());
    const conDates = reglas().map((r) => ({
      ...r,
      vigenteDesde: new Date(`${r.vigenteDesde}T00:00:00.000Z`),
      vigenteHasta: r.vigenteHasta ? new Date(`${r.vigenteHasta}T00:00:00.000Z`) : undefined,
    })) as unknown as ReglaLegal[];
    const festivosConDates = festivos().map((f) => ({
      ...f,
      fecha: new Date(`${f.fecha}T00:00:00.000Z`),
    })) as unknown as Festivo[];
    expect(hashCatalogo(conDates, festivosConDates)).toBe(base);
  });

  it("fuente ausente y fuente null son el mismo catálogo", () => {
    // Prisma trae null, la semilla omite el campo: no son diferencias del
    // catálogo legal, y el hash no debe verlas.
    const base = hashCatalogo(reglas(), festivos());
    const conNulls = reglas().map((r) => ({ ...r, fuente: r.fuente ?? null })) as unknown as ReglaLegal[];
    expect(hashCatalogo(conNulls, festivos())).toBe(base);
  });

  it("un peso de diferencia en UN valor cambia el hash", () => {
    // La razón de existir del ledger: si alguien corre el motor con un SMLMV
    // adulterado en un peso, el hash citado en su output no coincide con el
    // publicado — el desvío mínimo es detectable.
    const base = hashCatalogo(reglas(), festivos());
    const adulteradas = reglas();
    adulteradas[0]!.valor += 1;
    expect(hashCatalogo(adulteradas, festivos())).not.toBe(base);
  });

  it("quitar una regla, cerrar una vigencia o cambiar una fuente cambia el hash", () => {
    const base = hashCatalogo(reglas(), festivos());

    expect(hashCatalogo(reglas().slice(1), festivos())).not.toBe(base);

    // Cerrar una vigencia abierta (null → fecha) es un cambio LEGAL real:
    // significa que la regla dejó de regir.
    const abierta = reglas();
    const idx = abierta.findIndex((r) => !r.vigenteHasta);
    expect(idx).toBeGreaterThanOrEqual(0);
    abierta[idx]!.vigenteHasta = "2026-12-31";
    expect(hashCatalogo(abierta, festivos())).not.toBe(base);

    // La fuente (el decreto citado) también es contenido verificable, no
    // decoración: citar otro decreto es otro catálogo.
    const otraFuente = reglas();
    otraFuente[0]!.fuente = "Decreto inventado 999 de 2026";
    expect(hashCatalogo(otraFuente, festivos())).not.toBe(base);
  });

  it("los festivos participan del hash: quitar uno o renombrarlo lo cambia", () => {
    // Un festivo de menos convierte recargos dominicales/festivos en pago
    // ordinario — el hash tiene que delatar también esa mitad del catálogo.
    const base = hashCatalogo(reglas(), festivos());
    expect(hashCatalogo(reglas(), festivos().slice(1))).not.toBe(base);
    const renombrados = festivos();
    renombrados[0]!.nombre = "Otro nombre";
    expect(hashCatalogo(reglas(), renombrados)).not.toBe(base);
  });

  it("dos tramos de la misma clave no colapsan: duplicar un tramo cambia el hash", () => {
    // El catálogo es histórico (varios tramos por clave). Si la
    // canonicalización dedupe-ara o pisara tramos con la misma clave, un
    // catálogo con historia corrupta daría el hash del sano.
    const base = hashCatalogo(reglas(), festivos());
    const duplicadas = [...reglas(), { ...REGLAS_SEMILLA[0]! }];
    expect(hashCatalogo(duplicadas, festivos())).not.toBe(base);
  });
});

describe("obtenerLedgerReglas", () => {
  it("los totales del ledger son los del catálogo real, no aproximaciones", async () => {
    // batchPublico ya prueba que ledger.hash coincide con hashCatalogo; acá
    // se fija que los conteos publicados salen de las MISMAS filas hasheadas
    // (un ledger que cuenta unas filas y hashea otras no certifica nada).
    const ledger = await obtenerLedgerReglas();
    expect(ledger.totalReglas).toBe(REGLAS_SEMILLA.length);
    expect(ledger.totalFestivos).toBe(FESTIVOS_SEMILLA.length);
    expect(ledger.hash).toBe(hashCatalogo(reglas(), festivos()));
    expect(ledger.fuente).toContain("sdd/vault/");
  });
});
