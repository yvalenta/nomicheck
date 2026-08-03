import { describe, expect, it } from "vitest";
import { marcasDeAnios } from "./indemnizacionMarcas.ts";

describe("marcasDeAnios", () => {
  it("no marca nada antes del primer año cumplido", () => {
    expect(marcasDeAnios(359)).toEqual([]);
  });

  it("marca cada año cumplido en su proporción del tramo", () => {
    const m = marcasDeAnios(1080); // exactamente 3 años
    // El tercero cae en el 100% —sobre la fecha de terminación— y se poda.
    expect(m.map((x) => x.etiqueta)).toEqual(["1º año", "2º año"]);
    expect(m[0].pct).toBeCloseTo(33.33, 1);
    expect(m[1].pct).toBeCloseTo(66.67, 1);
  });

  it("poda la marca que quedaría pegada al final, donde no se lee", () => {
    // 1096 días: el 3º año cae al 98,5% del tramo, encima de la fecha final.
    expect(marcasDeAnios(1096).map((x) => x.etiqueta)).toEqual(["1º año", "2º año"]);
  });

  it("no explota con un tramo vacío", () => {
    expect(marcasDeAnios(0)).toEqual([]);
  });
});
