import { beforeEach, describe, expect, it, vi } from "vitest";

// El catálogo legal se cachea porque cambia ~1 vez al año, pero al vencer el
// TTL la siguiente petición va a la base. Si esa consulta falla, antes el
// endpoint devolvía 500 — y eso se vio en producción el 2026-08-03 en
// `/api/batch/verificar/ejemplo`, que es público, auditado y de solo lectura.
//
// Lo que se prueba acá es la degradación: un hipo de la base sirve el catálogo
// anterior (declarado, firmado y verificable), y una caída larga vuelve a
// doler.

const findManyReglas = vi.fn();
const findManyFestivos = vi.fn();

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    reglaLegal: { findMany: () => findManyReglas() },
    festivo: { findMany: () => findManyFestivos() },
  },
}));

const { obtenerReglasYFestivos, invalidarCacheReglas } = await import("../nominaService.js");

const REGLAS = [
  { clave: "smlmv", valor: 1_750_905, vigenteDesde: "2026-01-01", vigenteHasta: null, fuente: "D. 1234" },
];

beforeEach(() => {
  // El orden importa: `restoreAllMocks` borra las implementaciones, así que
  // configurar los `findMany` antes de llamarlo los deja devolviendo undefined
  // y la prueba falla dentro del servicio, no en lo que quiere medir.
  vi.restoreAllMocks();
  vi.useRealTimers();
  invalidarCacheReglas();
  findManyReglas.mockReset().mockResolvedValue(REGLAS);
  findManyFestivos.mockReset().mockResolvedValue([]);
});

describe("obtenerReglasYFestivos — caché", () => {
  it("consulta una vez y después sirve de memoria", async () => {
    await obtenerReglasYFestivos();
    await obtenerReglasYFestivos();
    expect(findManyReglas).toHaveBeenCalledTimes(1);
  });

  it("sin catálogo previo, un fallo de la base sube tal cual", async () => {
    findManyReglas.mockRejectedValue(new Error("pooler caído"));
    await expect(obtenerReglasYFestivos()).rejects.toThrow("pooler caído");
  });
});

describe("obtenerReglasYFestivos — la base falla al refrescar", () => {
  it("sirve el catálogo anterior en vez de tumbar la petición", async () => {
    vi.useFakeTimers();
    const primero = await obtenerReglasYFestivos();

    // Vence el TTL de 5 minutos y la base deja de responder.
    vi.advanceTimersByTime(6 * 60 * 1000);
    findManyReglas.mockRejectedValue(new Error("Can't reach database server"));
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    const segundo = await obtenerReglasYFestivos();
    expect(segundo.reglas).toEqual(primero.reglas);
    // Servir vencido en silencio sería indistinguible de servir fresco.
    expect(aviso).toHaveBeenCalledOnce();
    expect(aviso.mock.calls[0][0]).toContain("la base no respondió");
  });

  it("avisa en CADA refresco fallido, no solo en el primero", async () => {
    vi.useFakeTimers();
    await obtenerReglasYFestivos();
    vi.advanceTimersByTime(6 * 60 * 1000);
    findManyReglas.mockRejectedValue(new Error("timeout"));
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    await obtenerReglasYFestivos();
    await obtenerReglasYFestivos();
    expect(aviso).toHaveBeenCalledTimes(2);
  });

  it("pasada la gracia, la caída vuelve a doler", async () => {
    vi.useFakeTimers();
    await obtenerReglasYFestivos();

    // 5 min de TTL + 30 de gracia: a los 40 ya no hay excusa.
    vi.advanceTimersByTime(40 * 60 * 1000);
    findManyReglas.mockRejectedValue(new Error("Can't reach database server"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(obtenerReglasYFestivos()).rejects.toThrow("Can't reach database server");
  });

  it("cuando la base vuelve, se refresca de verdad", async () => {
    vi.useFakeTimers();
    await obtenerReglasYFestivos();
    vi.advanceTimersByTime(6 * 60 * 1000);

    findManyReglas.mockRejectedValueOnce(new Error("hipo"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await obtenerReglasYFestivos();

    const nuevas = [{ ...REGLAS[0], valor: 1_800_000 }];
    findManyReglas.mockResolvedValue(nuevas);
    const tercero = await obtenerReglasYFestivos();
    expect(tercero.reglas[0].valor).toBe(1_800_000);
  });
});
