import { describe, expect, it } from "vitest";
import {
  construirCuentaDeCobro,
  faltantesDelEmisor,
  numeroDe,
  type Emisor,
} from "../cuentaDeCobroService.js";
import type { EstadoCuenta } from "../cuentaEmpresaService.js";
import { BANDAS, bandaPara } from "../medidorCierres.js";

// Un documento de cobro puede fallar de dos maneras, y las dos son caras:
// pidiendo plata que no corresponde, o afirmando una naturaleza jurídica que no
// tiene. La segunda es la que este producto NO se puede permitir — vendemos
// exactamente la idea de que un papel diga la verdad sobre sí mismo.

const emisor: Emisor = {
  nombre: "Ynt-labs",
  identificacion: "1234567890",
  correo: "hola@ejemplo.org",
  formaDePago: "Transferencia a cuenta de ahorros 000-000",
};

const adquirente = { nombre: "Restaurante Ejemplo", nit: "900123456-7" };

function cuenta(over: Partial<EstadoCuenta> = {}): EstadoCuenta {
  const empleados = over.empleadosFacturables ?? 8;
  const banda = bandaPara(empleados);
  return {
    mes: "2026-08",
    cierresTotales: 2,
    cierresFacturables: 2,
    excluidos: [],
    empleadosFacturables: empleados,
    banda,
    precioCop: banda?.precioCop ?? null,
    requiereConversacion: banda !== null && banda.precioCop === null,
    empresaId: 3,
    bandas: BANDAS,
    detalle: [
      {
        periodoId: 1,
        fechaInicio: "2026-08-01",
        fechaFin: "2026-08-15",
        estadoCierre: "liquidado",
        conEvidencia: empleados,
        cerradoEn: "2026-08-16T02:00:00.000Z",
        firmaValida: true,
      },
      {
        periodoId: 2,
        fechaInicio: "2026-08-16",
        fechaFin: "2026-08-31",
        estadoCierre: "liquidado",
        conEvidencia: empleados,
        cerradoEn: "2026-08-31T20:00:00.000Z",
        firmaValida: true,
      },
    ],
    ...over,
  };
}

const emitir = (over?: Partial<EstadoCuenta>, e: Partial<Emisor> = emisor) =>
  construirCuentaDeCobro({
    emisor: e,
    adquirente,
    cuenta: cuenta(over),
    emitidaEl: new Date("2026-09-01T15:00:00Z"),
  });

describe("qué NO se emite", () => {
  it("sin datos del emisor no se emite nada, y dice cuáles faltan", () => {
    const r = emitir(undefined, { nombre: "Ynt-labs" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Sin cuenta a dónde consignar, el documento no se puede pagar; con el NIT
    // de otro, es peor que no tenerlo.
    expect(r.motivos.join(" ")).toContain("identificacion");
    expect(r.motivos.join(" ")).toContain("formaDePago");
    expect(r.motivos.join(" ")).toContain("correo");
  });

  it("un mes sin cierres facturables NO genera un cobro de cero", () => {
    const r = emitir({ cierresTotales: 0, cierresFacturables: 0, empleadosFacturables: 0, detalle: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos[0]).toContain("no tiene cierres facturables");
  });

  it("un mes donde TODAS las firmas fallaron tampoco cobra", () => {
    const r = emitir({
      cierresFacturables: 0,
      empleadosFacturables: 0,
      precioCop: null,
      banda: null,
      excluidos: [{ periodoId: 1, motivo: "la firma de la evidencia no verifica" }],
    });
    expect(r.ok).toBe(false);
  });

  it("arriba de 150 empleados se niega en vez de inventar un monto", () => {
    // Esa banda no tiene precio de lista: el monto sale de una negociación, y
    // un script que ponga uno lo estaría inventando.
    const r = emitir({ empleadosFacturables: 300 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos[0]).toContain("no tiene precio de lista");
  });

  it("faltantesDelEmisor no acepta espacios en blanco como dato", () => {
    expect(faltantesDelEmisor({ ...emisor, correo: "   " })).toEqual(["correo"]);
    expect(faltantesDelEmisor(emisor)).toEqual([]);
  });
});

describe("el documento que sí se emite", () => {
  it("cobra el monto del medidor, sin recalcularlo", () => {
    const r = emitir();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totalCop).toBe(19_000);
    // `Intl` separa el símbolo con un espacio DURO (U+00A0), no con uno normal.
    // Se normaliza acá en vez de escribirlo literal: un ` ` invisible en el
    // fuente es la clase de detalle que hace fallar la prueba equivocada dentro
    // de seis meses.
    expect(r.markdown.replace(/ /g, " ")).toContain("$ 19.000");
  });

  it("NO se llama factura, y dice explícitamente que no lo es", () => {
    // La prueba que justifica el archivo entero. Una cuenta de cobro que se
    // presente como factura afirma una naturaleza jurídica que no tiene, y es
    // exactamente el error que este producto existe para señalar.
    const r = emitir();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markdown).toContain("# Cuenta de cobro");
    expect(r.markdown).toMatch(/no es una factura de venta ni una factura electrónica/i);
    expect(r.markdown).toMatch(/no da derecho a descontar IVA/i);
    // Y en ningún lado se nombra a sí mismo "factura".
    expect(r.markdown).not.toMatch(/^#+ .*factura/im);
  });

  it("lista los cierres que se cobran, para que se puedan verificar uno por uno", () => {
    const r = emitir();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markdown).toContain("2026-08-01 a 2026-08-15");
    expect(r.markdown).toContain("2026-08-16 a 2026-08-31");
    expect(r.markdown).toContain("/api/batch/publickey");
  });

  it("dice qué NO se cobró y por qué, en vez de descontarlo en silencio", () => {
    const r = emitir({
      cierresTotales: 3,
      excluidos: [{ periodoId: 9, motivo: "la firma de la evidencia no verifica" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markdown).toContain("No se cobran 1 cierre(s)");
    expect(r.markdown).toContain("periodo 9");
  });

  it("un cierre con firma inválida no aparece en la tabla de lo cobrado", () => {
    const base = cuenta();
    const r = construirCuentaDeCobro({
      emisor,
      adquirente,
      cuenta: {
        ...base,
        cierresFacturables: 1,
        detalle: [base.detalle[0], { ...base.detalle[1], firmaValida: false }],
        excluidos: [{ periodoId: 2, motivo: "la firma de la evidencia no verifica" }],
      },
      emitidaEl: new Date("2026-09-01T15:00:00Z"),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markdown).toContain("2026-08-01 a 2026-08-15");
    expect(r.markdown).not.toContain("| 2 | 2026-08-16 a 2026-08-31 |");
  });

  it("el número es el mismo si se reemite el mismo mes", () => {
    // Reemitir no inventa un documento nuevo: el par (quien cobra, mes) tiene
    // un solo identificador. Y NO es un consecutivo fiscal — fabricar uno sin
    // la autorización que lo respalda aparentaría una formalidad que no hay.
    expect(numeroDe(emisor, "2026-08")).toBe("1234567890-2026-08");
    expect(numeroDe(emisor, "2026-08")).toBe(numeroDe(emisor, "2026-08"));
    expect(numeroDe(emisor, "2026-09")).not.toBe(numeroDe(emisor, "2026-08"));
  });

  it("lleva el adquirente con su NIT y la forma de pago", () => {
    const r = emitir();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markdown).toContain("NIT 900123456-7");
    expect(r.markdown).toContain("Transferencia a cuenta de ahorros 000-000");
  });
});
