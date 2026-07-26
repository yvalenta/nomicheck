// Tests del snapshot de parámetros (listing de Fase 1). Mockean el catálogo
// para ser deterministas: verifican la FORMA del contrato publicado y las
// derivaciones, no los valores normativos (esos tienen sus golden tests en
// packages/reglas).
//
// El foco está en dos propiedades que hacen vendible este listing: que la
// firma cubra todo lo publicado, y que una regla ausente se omita en vez de
// publicarse como cero — un tope legal en cero produce cálculos catastróficos
// aguas abajo.
import { describe, expect, it, vi } from "vitest";
import type { Festivo, ReglaLegal } from "@pv/reglas";

const REGLAS: ReglaLegal[] = [
  { clave: "smlmv", valor: 1_750_905, vigenteDesde: "2026-01-01" },
  { clave: "uvt", valor: 52_374, vigenteDesde: "2026-01-01" },
  { clave: "auxilio_transporte", valor: 249_095, vigenteDesde: "2026-01-01" },
  { clave: "auxilio_transporte_tope_smlmv", valor: 2, vigenteDesde: "2020-01-01" },
  { clave: "aporte_salud_empleado", valor: 0.04, vigenteDesde: "2020-01-01" },
  { clave: "aporte_pension_empleado", valor: 0.04, vigenteDesde: "2020-01-01" },
  { clave: "fondo_solidaridad_umbral_smlmv", valor: 4, vigenteDesde: "2020-01-01" },
  { clave: "ibc_tope_smlmv", valor: 25, vigenteDesde: "2020-01-01" },
  { clave: "recargo_nocturno", valor: 0.35, vigenteDesde: "2020-01-01" },
  { clave: "recargo_dominical", valor: 0.8, vigenteDesde: "2025-07-01" },
  { clave: "hora_extra_diurna", valor: 0.25, vigenteDesde: "2020-01-01" },
  { clave: "hora_extra_nocturna", valor: 0.75, vigenteDesde: "2020-01-01" },
  { clave: "divisor_hora_ordinaria", valor: 220, vigenteDesde: "2026-01-01" },
];
const FESTIVOS: Festivo[] = [];

vi.mock("../nominaService.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../nominaService.js")>()),
  obtenerReglasYFestivos: vi.fn(async () => ({ reglas: REGLAS, festivos: FESTIVOS })),
}));

const { generarParametrosSnapshot } = await import("../parametrosSnapshotService.js");
const { hashCatalogo, REGLAS_VERIFICADAS_AL } = await import("../reglasVerificadasService.js");
const { verificarFirma } = await import("../batchSignatureService.js");

describe("generarParametrosSnapshot", () => {
  it("publica los parámetros del catálogo con su metadata legal", async () => {
    const s = await generarParametrosSnapshot();

    expect(s.version).toBe("1");
    expect(s.reglasVerificadasAl).toBe(REGLAS_VERIFICADAS_AL);
    expect(s.reglasHash).toBe(hashCatalogo(REGLAS, FESTIVOS));
    expect(s.parametros.length).toBeGreaterThan(0);

    const uvt = s.parametros.find((p) => p.clave === "uvt");
    expect(uvt).toMatchObject({ valor: 52_374, unidad: "pesos" });
    // La referencia legal es el producto: sin ella son números sueltos.
    expect(uvt?.referenciaLegal).toContain("E.T.");
    expect(uvt?.descripcion.length).toBeGreaterThan(0);
  });

  it("omite las reglas ausentes en vez de publicarlas en cero", async () => {
    const s = await generarParametrosSnapshot();
    const claves = s.parametros.map((p) => p.clave);

    // No están en el fixture; publicarlas como 0 haría que un comprador
    // dedujera de más o embargara sin límite.
    expect(claves).not.toContain("embargo_alimentos_pct_max");
    expect(claves).not.toContain("limite_deduccion_dependientes_uvt_mes");

    expect(s.parametros.every((p) => typeof p.valor === "number" && Number.isFinite(p.valor))).toBe(true);
  });

  it("deriva los topes a pesos para fijar su interpretación", async () => {
    const s = await generarParametrosSnapshot();

    // Confundir "2 SMLMV" con "2 pesos" es un error clásico; publicar ambas
    // formas lo cierra.
    expect(s.derivados.auxilioTransporteTopePesos).toBe(1_750_905 * 2);
    expect(s.derivados.ibcTopePesos).toBe(1_750_905 * 25);
    expect(s.derivados.fondoSolidaridadUmbralPesos).toBe(1_750_905 * 4);
    expect(s.derivados.retencionUmbralAproxPesos).toBe(52_374 * 95);
  });

  it("firma todo lo publicado y la firma verifica", async () => {
    const s = await generarParametrosSnapshot();

    expect(s.signature.algo).toBe("ed25519");
    expect(s.signature.cubreCampos).toBe("todos_menos_signature");
    expect(verificarFirma(s, s.signature)).toBe(true);
  });

  it("invalida la firma si se altera un parámetro publicado", async () => {
    const s = await generarParametrosSnapshot();
    const alterado = JSON.parse(JSON.stringify(s));
    alterado.parametros[0].valor += 1;

    expect(verificarFirma(alterado, s.signature)).toBe(false);
  });

  it("lleva el disclaimer de Ley 43/1990 embebido", async () => {
    const s = await generarParametrosSnapshot();
    expect(s.disclaimer).toContain("Ley 43/1990");
    expect(s.disclaimer).toContain(REGLAS_VERIFICADAS_AL);
  });
});
