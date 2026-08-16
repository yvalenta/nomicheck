import { describe, expect, it } from "vitest";
import {
  BANDAS,
  bandaPara,
  mesColombiano,
  resumirMes,
  type CierreMedido,
} from "../medidorCierres.js";

// Lo que se vigila acá es lo único de la facturación que puede fallar EN
// SILENCIO. Una consulta rota se ve; una banda mal calculada produce una
// factura de aspecto perfecto por el monto equivocado, y el primero en
// enterarse es el cliente — que además tiene razón.
//
// Los tres modos de mentir de un medidor, y son los tres que se prueban:
//   - cobrar dos veces lo mismo (reliquidación)
//   - cobrar una banda que no toca (sumar en vez de tomar el máximo)
//   - cobrar por evidencia que no prueba nada

const cierre = (periodoId: number, empleados: number, firmaValida = true): CierreMedido => ({
  periodoId,
  empleadosConEvidencia: empleados,
  firmaValida,
});

describe("bandas de precio", () => {
  it("ubica cada tamaño en su banda, incluidos los bordes exactos", () => {
    expect(bandaPara(1)?.precioCop).toBe(19_000);
    expect(bandaPara(10)?.precioCop).toBe(19_000);
    expect(bandaPara(11)?.precioCop).toBe(49_000);
    expect(bandaPara(45)?.precioCop).toBe(49_000);
    expect(bandaPara(46)?.precioCop).toBe(99_000);
    expect(bandaPara(150)?.precioCop).toBe(99_000);
  });

  it("arriba de 150 no inventa un precio: devuelve la banda sin monto", () => {
    // Un número inventado ahí sería peor que la ausencia — el soporte de una
    // empresa de 400 personas no es el mismo y el precio se conversa.
    const b = bandaPara(400);
    expect(b).not.toBeNull();
    expect(b?.precioCop).toBeNull();
  });

  it("cero o negativo no cae en ninguna banda en vez de caer en la más barata", () => {
    expect(bandaPara(0)).toBeNull();
    expect(bandaPara(-3)).toBeNull();
    expect(bandaPara(Number.NaN)).toBeNull();
  });

  it("las bandas no dejan huecos ni se pisan entre sí", () => {
    // Un hueco haría que un tamaño concreto no tenga precio; un solape haría
    // que el precio dependa del orden del array. Las dos se ven igual de bien
    // leyendo la tabla.
    for (let i = 1; i < BANDAS.length; i++) {
      expect(BANDAS[i].desde).toBe((BANDAS[i - 1].hasta as number) + 1);
    }
    expect(BANDAS[0].desde).toBe(1);
    expect(BANDAS[BANDAS.length - 1].hasta).toBeNull();
    for (let n = 1; n <= 200; n++) expect(bandaPara(n)).not.toBeNull();
  });
});

describe("el mes que se factura es el colombiano", () => {
  it("un cierre del 31 a las 9 de la noche en Bogotá se factura en SU mes, no en el siguiente", () => {
    // 2026-08-31 21:00 en Bogotá son las 02:00 UTC del 1 de septiembre.
    // Facturarlo en septiembre le mueve el mes a la empresa —y a veces la
    // banda— por una zona horaria que no eligió.
    expect(mesColombiano(new Date("2026-09-01T02:00:00Z"))).toBe("2026-08");
  });

  it("un cierre de la mañana cae en el mes obvio", () => {
    expect(mesColombiano(new Date("2026-08-15T14:00:00Z"))).toBe("2026-08");
  });

  it("cruza el año sin romperse", () => {
    expect(mesColombiano(new Date("2027-01-01T03:00:00Z"))).toBe("2026-12");
    expect(mesColombiano(new Date("2027-01-01T06:00:00Z"))).toBe("2027-01");
  });
});

describe("resumen del mes — lo que se factura", () => {
  it("reliquidar un periodo NO cobra dos veces", () => {
    // El caso que motiva todo: un periodo se cierra, se revierte a borrador y
    // se vuelve a cerrar. Son dos cierres del MISMO trabajo. Cobrar por cierre
    // habría duplicado la factura; cobrar el mes la deja igual.
    const r = resumirMes("2026-08", [cierre(7, 8), cierre(7, 8)]);
    expect(r.cierresFacturables).toBe(2);
    expect(r.precioCop).toBe(19_000);
  });

  it("dos quincenas de la misma gente pagan UNA vez, y por su tamaño real", () => {
    // Sumar 8 + 8 daría 16 y saltaría a la banda de $49.000: la empresa pagaría
    // el doble por pagarle a su gente dos veces al mes.
    const r = resumirMes("2026-08", [cierre(1, 8), cierre(2, 8)]);
    expect(r.empleadosFacturables).toBe(8);
    expect(r.precioCop).toBe(19_000);
  });

  it("la banda la fija el máximo del mes: si la empresa creció, se cobra el tamaño nuevo", () => {
    const r = resumirMes("2026-08", [cierre(1, 9), cierre(2, 14)]);
    expect(r.empleadosFacturables).toBe(14);
    expect(r.precioCop).toBe(49_000);
  });

  it("un cierre cuya firma no verifica NO se factura, y se dice cuál", () => {
    // Misma regla que ya rige el muro x402: cobrar por una prueba que no prueba
    // sería el error que este producto existe para señalar.
    const r = resumirMes("2026-08", [cierre(1, 40, false)]);
    expect(r.cierresFacturables).toBe(0);
    expect(r.precioCop).toBeNull();
    expect(r.excluidos).toEqual([
      { periodoId: 1, motivo: "la firma de la evidencia no verifica" },
    ]);
  });

  it("una firma rota no arrastra al mes entero: los válidos siguen contando", () => {
    const r = resumirMes("2026-08", [cierre(1, 8), cierre(2, 40, false)]);
    expect(r.cierresFacturables).toBe(1);
    // Y el roto NO empuja la banda hacia arriba: 40 no se cuenta.
    expect(r.empleadosFacturables).toBe(8);
    expect(r.precioCop).toBe(19_000);
  });

  it("un cierre sin nadie con evidencia no se cobra", () => {
    // Pasa de verdad: un periodo cuyos empleados fueron todos rechazados por QA
    // termina en `liquidado_con_rechazos` con cero recibos.
    const r = resumirMes("2026-08", [cierre(1, 0)]);
    expect(r.cierresFacturables).toBe(0);
    expect(r.precioCop).toBeNull();
    expect(r.excluidos[0].motivo).toBe("ningún empleado quedó con evidencia");
  });

  it("un mes sin cierres no se cobra y NO pide conversación", () => {
    const r = resumirMes("2026-08", []);
    expect(r.precioCop).toBeNull();
    expect(r.banda).toBeNull();
    // Que no haya monto por estar vacío es distinto de que no haya monto por
    // ser una empresa grande. Confundirlos mandaría a vender a quien no usó nada.
    expect(r.requiereConversacion).toBe(false);
  });

  it("arriba de 150 marca conversación en vez de un monto", () => {
    const r = resumirMes("2026-08", [cierre(1, 320)]);
    expect(r.precioCop).toBeNull();
    expect(r.requiereConversacion).toBe(true);
    expect(r.empleadosFacturables).toBe(320);
  });

  it("el resumen informa el total de cierres, no solo los facturables", () => {
    // El estado de cuenta tiene que poder decir "cerraste 3, te cobro 2 y este
    // es el motivo del tercero". Un descuento sin explicación genera la misma
    // llamada que un cobro de más.
    const r = resumirMes("2026-08", [cierre(1, 5), cierre(2, 5, false), cierre(3, 0)]);
    expect(r.cierresTotales).toBe(3);
    expect(r.cierresFacturables).toBe(1);
    expect(r.excluidos).toHaveLength(2);
  });
});
