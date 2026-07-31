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
  // Dos tramos por clave anual: sin eso no se puede probar que la fecha
  // resuelva contra la historia y no contra "lo último que haya".
  { clave: "smlmv", valor: 1_300_000, vigenteDesde: "2024-01-01", vigenteHasta: "2024-12-31" },
  { clave: "smlmv", valor: 1_750_905, vigenteDesde: "2026-01-01" },
  { clave: "uvt", valor: 47_065, vigenteDesde: "2024-01-01", vigenteHasta: "2024-12-31" },
  { clave: "uvt", valor: 52_374, vigenteDesde: "2026-01-01" },
  { clave: "auxilio_transporte", valor: 162_000, vigenteDesde: "2024-01-01", vigenteHasta: "2024-12-31" },
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

  it("con ?fecha resuelve contra la historia de vigencias, no contra hoy", async () => {
    // Es la razón de existir del parámetro: quien audita una liquidación de
    // 2024 necesita el SMLMV de 2024, no el de hoy.
    const s = await generarParametrosSnapshot("2024-03-15");
    const valor = (c: string) => s.parametros.find((p) => p.clave === c)?.valor;
    expect(s.vigenteDesde).toBe("2024-03-15");
    expect(valor("smlmv")).toBe(1_300_000);
    expect(valor("auxilio_transporte")).toBe(162_000);
    expect(valor("uvt")).toBe(47_065);
  });

  it("los derivados siguen la fecha pedida, no la de hoy", async () => {
    // Un tope en SMLMV convertido a pesos con el salario del año equivocado es
    // el error silencioso clásico: el número se ve razonable.
    const s = await generarParametrosSnapshot("2024-03-15");
    expect(s.derivados.ibcTopePesos).toBe(1_300_000 * 25);
    expect(s.derivados.auxilioTransporteTopePesos).toBe(1_300_000 * 2);
  });

  it("las claves sin valor en esa fecha se declaran en noVigentes, no se callan", async () => {
    // Antes se descartaban con un `continue`. Con fecha eso es trampa: la
    // lista sale más corta y nada lo dice.
    const s = await generarParametrosSnapshot("2024-03-15");
    const claves = s.noVigentes.map((n) => n.clave);
    // En el fixture, el dominical arranca en jul-2025 y el divisor en 2026.
    expect(claves).toContain("recargo_dominical");
    expect(claves).toContain("divisor_hora_ordinaria");
    expect(s.noVigentes.every((n) => n.motivo.includes("2024-03-15"))).toBe(true);
    // Y no aparecen entre los publicados.
    expect(s.parametros.some((p) => p.clave === "recargo_dominical")).toBe(false);
  });

  it("sin fecha se comporta igual que antes: hoy y sin romper el contrato", async () => {
    const s = await generarParametrosSnapshot();
    expect(s.vigenteDesde).toBe(new Date().toISOString().slice(0, 10));
    expect(s.parametros.find((p) => p.clave === "smlmv")?.valor).toBe(1_750_905);
  });

  it("la fecha viaja firmada: un snapshot de 2024 no se puede pasar por uno de hoy", async () => {
    const viejo = await generarParametrosSnapshot("2024-03-15");
    const { verificarFirma } = await import("../batchSignatureService.js");
    const falsificado = { ...viejo, vigenteDesde: "2026-07-31" };
    expect(verificarFirma({ ...falsificado, signature: undefined }, falsificado.signature)).toBe(false);
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
