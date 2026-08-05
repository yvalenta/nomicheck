// Suite del snapshot de TRM (SDD §17). Una tasa mala acá no es un bug
// cosmético: convierte lotes ENTEROS de pagos USDC — una TRM en 0 pagaría
// infinito, una negativa firmaría montos absurdos, y una vieja pagaría con el
// dólar de otro día. Por eso el peso está en los caminos rotos.
//
// RED PROHIBIDA: `fetch` se stubbea con una implementación que LANZA si algún
// test la deja pasar sin programar respuesta — así una prueba nueva que olvide
// el mock revienta en CI en vez de pegarle a datos.gov.co en silencio.
//
// hashSnapshot ya tiene sus pruebas de determinismo y sensibilidad a
// trm/primaPct en pagosService.test.ts — acá no se repiten; solo se agrega lo
// que faltaba: la sensibilidad de los OTROS cuatro campos y que el hash cubre
// exactamente los campos declarados.
//
// La cache TRM es estado de módulo: cada test la vacía con invalidarCacheTrm()
// y los de expiración usan fake timers (el TTL se decide con Date.now()).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { capturarTasaSnapshot, hashSnapshot, invalidarCacheTrm, type TasaSnapshot } from "../tasaCambioService.js";

const fetchMock = vi.fn();

function respuesta(filas: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => filas } as unknown as Response;
}

function filaTrm(valor: string, vigenciadesde = "2026-08-04T00:00:00.000"): { valor: string; vigenciadesde: string } {
  return { valor, vigenciadesde };
}

beforeEach(() => {
  invalidarCacheTrm();
  fetchMock.mockReset();
  // El default REVIENTA: ninguna ruta de estas pruebas puede tocar la red
  // real, ni siquiera por accidente de un test futuro.
  fetchMock.mockImplementation(async () => {
    throw new Error("Red real prohibida en tests: fetch se llamó sin respuesta programada");
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("capturarTasaSnapshot — camino feliz", () => {
  it("arma el snapshot completo, con tasa efectiva = TRM × (1 + prima) y hash recomputable", async () => {
    fetchMock.mockResolvedValueOnce(respuesta([filaTrm("4100.50")]));
    const s = await capturarTasaSnapshot(0.02);

    expect(s.trm).toBe(4100.5);
    expect(s.fechaTrm).toBe("2026-08-04");
    expect(s.primaPct).toBe(0.02);
    expect(s.tasaEfectiva).toBeCloseTo(4100.5 * 1.02, 10);
    expect(s.fuente).toContain("datos.gov.co");
    expect(Number.isNaN(Date.parse(s.capturadoEn))).toBe(false);
    // La promesa de trazabilidad (gap 5.2): un tercero con los campos del
    // snapshot recomputa el MISMO hash. Si esto falla, el hash citado en el
    // export no certifica nada.
    const { hash: _hash, ...sinHash } = s;
    expect(s.hash).toBe(hashSnapshot(sinHash));
    expect(s.hash).toMatch(/^[0-9a-f]{64}$/);

    // Y la consulta es exactamente la del último dato oficial, ordenado por
    // vigencia — no "alguna fila" del dataset.
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("www.datos.gov.co/resource/32sa-8pi3.json");
    expect(url).toContain("$order=vigenciadesde%20DESC");
    expect(url).toContain("$limit=1");
  });
});

describe("capturarTasaSnapshot — respuestas rotas", () => {
  it("HTTP no-ok falla con el status a la vista y NO cachea el fallo", async () => {
    fetchMock.mockResolvedValueOnce(respuesta([], false, 503));
    await expect(capturarTasaSnapshot(0)).rejects.toThrow(/HTTP 503/);

    // El fallo no puede envenenar la cache: el siguiente lote debe volver a
    // preguntar y poder salir bien.
    fetchMock.mockResolvedValueOnce(respuesta([filaTrm("4000")]));
    const s = await capturarTasaSnapshot(0);
    expect(s.trm).toBe(4000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("respuesta vacía o fila sin `valor` falla nombrando el dataset, no con undefined", async () => {
    // Socrata devuelve 200 con [] si el dataset se vacía o cambia de forma —
    // el caso que NO se detecta por status. Seguir de largo aquí produciría
    // trm=NaN y un lote entero convertido con basura.
    fetchMock.mockResolvedValueOnce(respuesta([]));
    await expect(capturarTasaSnapshot(0)).rejects.toThrow(/32sa-8pi3/);

    fetchMock.mockResolvedValueOnce(respuesta([{ vigenciadesde: "2026-08-04T00:00:00.000" }]));
    await expect(capturarTasaSnapshot(0)).rejects.toThrow(/sin campo valor/);
  });

  it("TRM no numérica, cero o negativa se rechaza citando el valor recibido", async () => {
    // El corazón de la suite: cualquiera de estas tres, aceptada, convierte
    // pagos USDC reales con una tasa que no existe.
    for (const malo of ["N/A", "0", "-4100.5"]) {
      invalidarCacheTrm();
      fetchMock.mockResolvedValueOnce(respuesta([filaTrm(malo)]));
      await expect(capturarTasaSnapshot(0)).rejects.toThrow(malo);
    }
  });

  it("Infinity tampoco pasa: la guarda es isFinite, no solo > 0", async () => {
    fetchMock.mockResolvedValueOnce(respuesta([filaTrm("Infinity")]));
    await expect(capturarTasaSnapshot(0)).rejects.toThrow(/TRM inválida/);
  });

  it("una TRM rechazada no queda cacheada: el reintento vuelve a la fuente", async () => {
    fetchMock.mockResolvedValueOnce(respuesta([filaTrm("0")]));
    await expect(capturarTasaSnapshot(0)).rejects.toThrow();

    fetchMock.mockResolvedValueOnce(respuesta([filaTrm("4200")]));
    const s = await capturarTasaSnapshot(0);
    expect(s.trm).toBe(4200);
  });
});

describe("cache de TRM", () => {
  it("dentro del TTL reutiliza la TRM sin volver a la red, pero la prima del snapshot es la pedida", async () => {
    fetchMock.mockResolvedValueOnce(respuesta([filaTrm("4100")]));
    const a = await capturarTasaSnapshot(0.01);
    const b = await capturarTasaSnapshot(0.05);
    // Una sola salida a la red: la TRM cambia una vez por día hábil.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b.trm).toBe(a.trm);
    // La cache es de la TRM, no del snapshot: cada lote lleva SU prima.
    expect(b.primaPct).toBe(0.05);
    expect(b.tasaEfectiva).toBeCloseTo(4100 * 1.05, 10);
  });

  it("pasado el TTL de 1h vuelve a la fuente y refleja la TRM nueva", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T08:00:00.000Z"));
    fetchMock.mockResolvedValueOnce(respuesta([filaTrm("4100")]));
    await capturarTasaSnapshot(0);

    // 61 minutos después: la cache venció; servir la TRM de la mañana a un
    // lote de la tarde sería citar en el export una tasa que ya no es la
    // vigente.
    vi.setSystemTime(new Date("2026-08-05T09:01:00.000Z"));
    fetchMock.mockResolvedValueOnce(respuesta([filaTrm("4150", "2026-08-05T00:00:00.000")]));
    const s = await capturarTasaSnapshot(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(s.trm).toBe(4150);
    expect(s.fechaTrm).toBe("2026-08-05");
  });

  it("invalidarCacheTrm fuerza la relectura aun dentro del TTL", async () => {
    fetchMock.mockResolvedValueOnce(respuesta([filaTrm("4100")]));
    await capturarTasaSnapshot(0);

    invalidarCacheTrm();
    fetchMock.mockResolvedValueOnce(respuesta([filaTrm("4200")]));
    const s = await capturarTasaSnapshot(0);
    expect(s.trm).toBe(4200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("hashSnapshot — lo que pagosService no cubre", () => {
  const base: Omit<TasaSnapshot, "hash"> = {
    trm: 4200,
    fuente: "test",
    fechaTrm: "2026-08-04",
    primaPct: 0.02,
    tasaEfectiva: 4284,
    capturadoEn: "2026-08-04T10:00:00.000Z",
  };

  it("cada uno de los campos restantes también altera el hash", () => {
    // pagosService ya cubre trm y primaPct; si alguno de estos cuatro quedara
    // fuera del canónico, se podría re-fechar o re-atribuir un snapshot sin
    // que el hash lo delate.
    const h = hashSnapshot(base);
    expect(hashSnapshot({ ...base, fuente: "otra" })).not.toBe(h);
    expect(hashSnapshot({ ...base, fechaTrm: "2026-08-03" })).not.toBe(h);
    expect(hashSnapshot({ ...base, tasaEfectiva: 4285 })).not.toBe(h);
    expect(hashSnapshot({ ...base, capturadoEn: "2026-08-04T10:00:01.000Z" })).not.toBe(h);
  });

  it("cubre exactamente los seis campos declarados: propiedades extra no participan", () => {
    // El canónico es una lista fija de claves, no un stringify del objeto —
    // así un consumidor que agregue metadata local puede recomputar igual.
    const conExtra = { ...base, extra: "ignorado" } as Omit<TasaSnapshot, "hash">;
    expect(hashSnapshot(conExtra)).toBe(hashSnapshot(base));
  });
});
