import { describe, expect, it } from "vitest";
import { mesColombiano, nombreMes, ultimosMeses } from "./mesesCuenta";

// Lo que se vigila: que el selector de meses de «Tu cuenta» hable del MISMO mes
// que el servidor factura.
//
// El backend congela el mes de cobro en hora colombiana al cerrar el periodo.
// Si esta lista se construyera con la zona del navegador, el desacuerdo no daría
// error: la empresa pediría "septiembre" creyendo que es el mes corriente y
// recibiría un mes vacío, con la cuenta en cero y ninguna pista de por qué. Un
// número equivocado que se ve perfecto es el modo de falla caro acá.

describe("el mes es el colombiano, no el del navegador", () => {
  it("las 9 de la noche del 31 en Bogotá siguen siendo agosto", () => {
    // 2026-08-31 21:00 COT = 2026-09-01 02:00 UTC.
    expect(mesColombiano(new Date("2026-09-01T02:00:00Z"))).toBe("2026-08");
  });

  it("pasadas las 5 UTC del día 1 ya es el mes nuevo", () => {
    expect(mesColombiano(new Date("2026-09-01T05:00:00Z"))).toBe("2026-09");
  });

  it("el primer mes de la lista es el corriente colombiano, no el UTC", () => {
    // El caso que rompe: en ese instante el navegador en UTC diría septiembre.
    expect(ultimosMeses(3, new Date("2026-09-01T02:00:00Z"))[0]).toBe("2026-08");
  });
});

describe("la lista de meses", () => {
  it("va del más reciente al más viejo, sin huecos ni repetidos", () => {
    const m = ultimosMeses(5, new Date("2026-08-16T15:00:00Z"));
    expect(m).toEqual(["2026-08", "2026-07", "2026-06", "2026-05", "2026-04"]);
  });

  it("cruza el año hacia atrás sin dar mes 0 ni mes 13", () => {
    const m = ultimosMeses(4, new Date("2027-02-10T15:00:00Z"));
    expect(m).toEqual(["2027-02", "2027-01", "2026-12", "2026-11"]);
  });

  it("doce meses son doce, todos con forma YYYY-MM", () => {
    const m = ultimosMeses(12, new Date("2026-08-16T15:00:00Z"));
    expect(m).toHaveLength(12);
    expect(new Set(m).size).toBe(12);
    for (const x of m) expect(x).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });
});

describe("cómo se escribe el mes", () => {
  it("traduce a español", () => {
    expect(nombreMes("2026-08")).toBe("agosto de 2026");
    expect(nombreMes("2026-01")).toBe("enero de 2026");
    expect(nombreMes("2026-12")).toBe("diciembre de 2026");
  });

  it("una entrada rara se muestra tal cual en vez de reventar", () => {
    // Un selector con etiqueta fea es molesto; uno que lanza deja a la empresa
    // sin poder abrir su cuenta.
    expect(nombreMes("2026-13")).toBe("2026-13");
    expect(nombreMes("cualquier cosa")).toBe("cualquier cosa");
    expect(nombreMes("")).toBe("");
  });
});
