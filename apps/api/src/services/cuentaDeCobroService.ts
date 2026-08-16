// La cuenta de cobro de un mes: el documento que se le manda a la empresa.
//
// ── Por qué NO se llama factura, y no es una sutileza ──────────────────────
//
// En Colombia una **factura de venta** emitida por alguien obligado a facturar
// es un documento con forma legal: numeración autorizada por la DIAN, formato
// UBL, y validación previa a través de un proveedor tecnológico o del servicio
// gratuito de la DIAN. Nada de eso se puede producir con un script.
//
// Lo que este archivo emite es una **cuenta de cobro**: el instrumento normal
// para quien NO está obligado a facturar. Es un documento privado que pide un
// pago; no da derecho a descuento de IVA ni sustituye una factura.
//
// Llamarlo "factura" sería regalar exactamente el error que este producto
// existe para señalar: un papel que afirma una naturaleza jurídica que no
// tiene. Es la misma línea que ya traza `NATURALEZA_JURIDICA` del comprobante
// de pago — y por eso el documento lo dice en su propio cuerpo, no en una nota
// al pie que nadie lee.
//
// **Si Ynt-labs pasa a estar obligado a facturar electrónicamente, esto deja de
// servir** y hay que emitir por el camino de la DIAN. El script no puede saber
// eso; por eso pide los datos del emisor y no los inventa.
import type { EstadoCuenta } from "./cuentaEmpresaService.js";

export interface Emisor {
  nombre: string;
  /** Cédula o NIT de quien cobra. */
  identificacion: string;
  correo: string;
  /** A dónde se consigna. Sin esto la cuenta de cobro no se puede pagar. */
  formaDePago: string;
  ciudad?: string;
  telefono?: string;
}

export interface Adquirente {
  nombre: string;
  nit: string;
}

const CAMPOS_EMISOR: (keyof Emisor)[] = ["nombre", "identificacion", "correo", "formaDePago"];

/** Qué falta para poder emitir. Vacío = se puede.
 *
 *  Se valida y no se rellena con un valor por defecto a propósito: un
 *  documento de cobro con el NIT de otro, o sin cuenta a dónde consignar, es
 *  peor que no tener documento. */
export function faltantesDelEmisor(e: Partial<Emisor>): string[] {
  return CAMPOS_EMISOR.filter((c) => !String(e[c] ?? "").trim()).map(String);
}

/**
 * El número del documento: `{identificacion}-{mes}`.
 *
 * Es determinístico y sin estado a propósito. Un **consecutivo** de verdad
 * —1, 2, 3…— es una figura fiscal con reglas propias, y fabricar uno sin la
 * autorización que lo respalda haría que el documento aparente una formalidad
 * que no tiene. Este número identifica de forma única el par (quien cobra, mes)
 * sin afirmar nada sobre su naturaleza, y reemitir el mismo mes da el mismo
 * número en vez de inventar uno nuevo.
 */
export function numeroDe(emisor: Pick<Emisor, "identificacion">, mes: string): string {
  return `${emisor.identificacion}-${mes}`;
}

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export type Emision =
  | { ok: true; numero: string; totalCop: number; markdown: string }
  | { ok: false; motivos: string[] };

/**
 * Arma el documento. Puro: recibe el estado de cuenta ya calculado y no vuelve
 * a calcular el monto — el precio sale de `medidorCierres.ts` y de ningún otro
 * lado, así que una cuenta de cobro nunca puede decir algo distinto de lo que
 * la empresa vio en su portal.
 *
 * Se niega, en vez de emitir algo raro, cuando:
 *   - faltan datos del emisor
 *   - el mes no tiene nada facturable (no se manda un cobro de cero)
 *   - la banda es de las que se conversan (>150 empleados): ahí el monto lo
 *     pone una negociación, y un script que ponga uno estaría inventándolo
 */
export function construirCuentaDeCobro(datos: {
  emisor: Partial<Emisor>;
  adquirente: Adquirente;
  cuenta: EstadoCuenta;
  emitidaEl: Date;
}): Emision {
  const { adquirente, cuenta } = datos;
  const motivos = faltantesDelEmisor(datos.emisor).map((c) => `falta el campo del emisor: ${c}`);

  if (cuenta.requiereConversacion) {
    motivos.push(
      `la banda «${cuenta.banda?.etiqueta}» no tiene precio de lista: el monto se acuerda y se carga a mano`
    );
  } else if (cuenta.precioCop === null || cuenta.cierresFacturables === 0) {
    motivos.push(
      `el mes ${cuenta.mes} no tiene cierres facturables (${cuenta.cierresTotales} cierre(s) en total)`
    );
  }
  if (motivos.length > 0) return { ok: false, motivos };

  const emisor = datos.emisor as Emisor;
  const total = cuenta.precioCop as number;
  const numero = numeroDe(emisor, cuenta.mes);
  const fecha = datos.emitidaEl.toISOString().slice(0, 10);

  const filas = cuenta.detalle
    .filter((d) => d.firmaValida)
    .map(
      (d) =>
        `| ${d.periodoId} | ${d.fechaInicio} a ${d.fechaFin} | ${d.estadoCierre} | ${d.conEvidencia} |`
    )
    .join("\n");

  const excluidos =
    cuenta.excluidos.length > 0
      ? `\n**No se cobran ${cuenta.excluidos.length} cierre(s):**\n\n` +
        cuenta.excluidos.map((e) => `- periodo ${e.periodoId} — ${e.motivo}`).join("\n") +
        "\n"
      : "";

  const markdown = `# Cuenta de cobro ${numero}

**Fecha:** ${fecha}

## Debe a

**${emisor.nombre}** · ${emisor.identificacion}${emisor.ciudad ? ` · ${emisor.ciudad}` : ""}
${emisor.correo}${emisor.telefono ? ` · ${emisor.telefono}` : ""}

## La suma de

# ${COP.format(total)}

## Por concepto de

Cierre de periodos de nómina con evidencia firmada — **${cuenta.mes}**.
Banda: ${cuenta.banda?.etiqueta}. ${cuenta.cierresFacturables} cierre(s) con evidencia verificada, sobre un máximo de **${cuenta.empleadosFacturables}** personas.

| Periodo | Fechas | Estado | Con evidencia |
|---|---|---|---|
${filas}
${excluidos}
El portal, el cálculo y la exportación PILA no se cobran. Lo que se cobra es que cada cierre quede probado ante un tercero.

## Adquirente

**${adquirente.nombre}** · NIT ${adquirente.nit}

## Forma de pago

${emisor.formaDePago}

---

**Qué es este documento.** Una cuenta de cobro: un documento privado que solicita
un pago. **No es una factura de venta ni una factura electrónica**, no fue
validada por la DIAN y no da derecho a descontar IVA ni impuestos. Si necesita
una factura electrónica de venta, escríbanos antes de pagar.

**Cómo verificar lo que está pagando.** Cada cierre de la tabla tiene una
evidencia firmada con Ed25519. La llave pública para comprobarlas está en
\`/api/batch/publickey\`, y la verificación se puede hacer sin nosotros y sin
confiar en nosotros. Un cierre cuya firma no verifica no se cobra — por eso la
lista de arriba puede ser más corta que la de periodos cerrados.
`;

  return { ok: true, numero, totalCop: total, markdown };
}
