import { describe, expect, it } from "vitest";
import { construirPayload, medirCierre } from "../evidenciaCierreService.js";
import { firmarPayload, verificarFirma } from "../batchSignatureService.js";
import { resumirMes } from "../medidorCierres.js";

// La evidencia es lo que la empresa compra, así que la pregunta que estas
// pruebas contestan es una sola: **¿prueba algo?**
//
// El modo de falla que importa no es que la firma falle —eso se ve—, sino que
// una evidencia manipulada pase igual. Ahí el producto entero deja de valer:
// vendemos exactamente la garantía de que eso no ocurre. Y del lado de la plata
// es peor todavía, porque el medidor factura lo que verifica.

const base = {
  empresaId: 3,
  periodoId: 41,
  fechaInicio: "2026-08-01",
  fechaFin: "2026-08-15",
  estadoCierre: "liquidado",
  conEvidencia: 12,
  reglasHash: "abc123",
  reglasVerificadasAl: "2026-07-30",
  cerradoEn: new Date("2026-08-16T02:00:00Z"),
};

describe("evidencia de un cierre", () => {
  it("una evidencia recién firmada verifica", () => {
    const payload = construirPayload(base);
    expect(verificarFirma(payload, firmarPayload(payload))).toBe(true);
  });

  it("cambiar el número de empleados rompe la firma", () => {
    // Es el campo que fija la banda de precio: si se pudiera tocar sin romper
    // la firma, se podría bajar la factura editando la base.
    const payload = construirPayload(base);
    const firma = firmarPayload(payload);
    expect(verificarFirma({ ...payload, conEvidencia: 999 }, firma)).toBe(false);
  });

  it("cambiar el hash del catálogo legal rompe la firma", () => {
    // El `reglasHash` es lo que ata el número a las reglas que lo produjeron.
    // Sin esta propiedad, la evidencia diría "calculado con la ley" sin poder
    // decir con cuál.
    const payload = construirPayload(base);
    const firma = firmarPayload(payload);
    expect(verificarFirma({ ...payload, reglasHash: "otro" }, firma)).toBe(false);
  });

  it("mover el cierre a otra empresa o a otro periodo rompe la firma", () => {
    const payload = construirPayload(base);
    const firma = firmarPayload(payload);
    expect(verificarFirma({ ...payload, empresaId: 99 }, firma)).toBe(false);
    expect(verificarFirma({ ...payload, periodoId: 99 }, firma)).toBe(false);
  });

  it("reordenar las claves NO rompe la firma", () => {
    // El canonical ordena claves: una evidencia que viaja por JSON.parse y se
    // vuelve a serializar con otro orden tiene que seguir verificando, o el
    // tercero que la comprueba obtiene un falso negativo.
    const payload = construirPayload(base);
    const firma = firmarPayload(payload);
    const reordenado = JSON.parse(JSON.stringify(payload, Object.keys(payload).sort().reverse()));
    expect(verificarFirma(reordenado, firma)).toBe(true);
  });

  it("el payload lleva los campos que hacen verificable el cierre", () => {
    // Si un nombre de campo cambia, las evidencias viejas dejan de verificar.
    // Que la lista esté fijada acá obliga a enterarse en CI y no en una disputa.
    expect(Object.keys(construirPayload(base)).sort()).toEqual([
      "cerradoEn",
      "conEvidencia",
      "empresaId",
      "estadoCierre",
      "fechaFin",
      "fechaInicio",
      "periodoId",
      "reglasHash",
      "reglasVerificadasAl",
      "tipo",
      "version",
    ]);
  });
});

describe("del cierre firmado a lo que se factura", () => {
  it("una evidencia sana se mide como facturable y produce su banda", () => {
    const payload = construirPayload(base);
    const medido = medirCierre({
      periodoId: base.periodoId,
      conEvidencia: base.conEvidencia,
      payload,
      firma: firmarPayload(payload),
    });
    expect(medido.firmaValida).toBe(true);
    expect(resumirMes("2026-08", [medido]).precioCop).toBe(49_000);
  });

  it("una evidencia manipulada NO se factura", () => {
    // El circuito completo: alguien edita `conEvidencia` en la base para saltar
    // de banda. La firma deja de verificar y el mes no se cobra — en vez de
    // cobrarse por una cifra que nadie puede probar.
    const payload = construirPayload(base);
    const firma = firmarPayload(payload);
    const medido = medirCierre({
      periodoId: base.periodoId,
      conEvidencia: 400,
      payload: { ...payload, conEvidencia: 400 },
      firma,
    });
    expect(medido.firmaValida).toBe(false);
    const r = resumirMes("2026-08", [medido]);
    expect(r.precioCop).toBeNull();
    expect(r.excluidos[0].motivo).toBe("la firma de la evidencia no verifica");
  });

  it("firmada con OTRA llave no se confunde con manipulada", () => {
    // El caso que más caro sale y que no se ve venir: si la llave de firma
    // rotara, todos los cierres pasados dejarían de verificar de golpe. Sin
    // esta distinción, el estado de cuenta acusaría manipulación —a un cliente
    // que no hizo nada— y dejaría de facturar meses enteros sin decir por qué.
    //
    // Es el mismo error que el verificador público del sobre cometía con
    // emisores ajenos; acá además hay plata de por medio.
    // Cómo se ve una rotación desde el lector: la firma NO valida con la llave
    // de hoy, y el `publicKeyId` que declara no es el de hoy. Se simula
    // firmando otro payload —así los bytes no verifican— y etiquetándolo con
    // una llave ajena. Cambiar solo la etiqueta no serviría: `verificarFirma`
    // comprueba los bytes, no el rótulo.
    const payload = construirPayload(base);
    const firma = {
      ...firmarPayload(construirPayload({ ...base, conEvidencia: 999 })),
      publicKeyId: "llave-de-antes-de-la-rotacion",
    };
    const medido = medirCierre({
      periodoId: 1,
      conEvidencia: 8,
      payload,
      firma,
    });
    expect(medido.firmaValida).toBe(false);
    expect(medido.firmadaConOtraLlave).toBe(true);

    // Tampoco se factura —no se cobra lo que no se puede verificar— pero el
    // motivo apunta a nosotros y no al cliente.
    const r = resumirMes("2026-08", [medido]);
    expect(r.precioCop).toBeNull();
    expect(r.excluidos[0].motivo).toContain("revisar de nuestro lado");
    expect(r.excluidos[0].motivo).not.toContain("no verifica");
  });

  it("manipulada con la llave ACTUAL sigue diciendo que no verifica", () => {
    // La contraparte: si el `publicKeyId` es el de hoy y aun así falla, es
    // manipulación de verdad y el motivo tiene que decirlo.
    const payload = construirPayload(base);
    const firma = firmarPayload(payload);
    const medido = medirCierre({
      periodoId: 1,
      conEvidencia: 400,
      payload: { ...payload, conEvidencia: 400 },
      firma,
    });
    expect(medido.firmadaConOtraLlave).toBe(false);
    expect(resumirMes("2026-08", [medido]).excluidos[0].motivo).toBe(
      "la firma de la evidencia no verifica"
    );
  });

  it("una firma con forma inesperada no tumba el estado de cuenta", () => {
    // Basura en la columna (migración a medias, escritura manual) tiene que
    // dar "no verifica", no una excepción que deja a la empresa sin poder ver
    // su cuenta.
    for (const firma of [null, undefined, {}, "no soy una firma", { valor: 123 }]) {
      expect(
        medirCierre({ periodoId: 1, conEvidencia: 5, payload: { a: 1 }, firma }).firmaValida
      ).toBe(false);
    }
  });
});
