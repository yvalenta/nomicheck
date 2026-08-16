// El medidor de cierres: qué se le factura a una empresa por un mes, y por qué.
//
// ── Qué se cobra, en una línea ─────────────────────────────────────────────
//
// El portal es gratis. Lo que se cobra es **cerrar un periodo con evidencia
// firmada** — la respuesta Ed25519 sobre el payload completo, con el hash del
// catálogo legal que la produjo. Ver `sdd/marketing/precio-empresas.md`, que
// tiene de dónde sale cada número.
//
// ── Este archivo es el SITIO DE AFIRMACIÓN del precio ──────────────────────
//
// La tabla de bandas vive acá y en ningún otro lado. Un precio escrito además
// en la web, en el PDF de la factura y en un ad es un precio con cuatro lugares
// donde desincronizarse, y el modo de falla es el peor que hay: cobrarle a
// alguien algo distinto de lo que se le prometió. Todo lo que muestre precios
// los lee de acá.
//
// ── Por qué es puro y vive separado del acceso a la base ───────────────────
//
// Es lo único de la facturación que puede equivocarse **en silencio**. Una
// consulta rota se ve; una banda mal calculada produce una factura de aspecto
// perfecto por el monto equivocado, y el que la descubre es el cliente. Sin IO
// se prueba entero, incluidos los bordes que en producción aparecen una vez al
// año (el cierre del 31 a las 9 de la noche, el mes sin cierres, el periodo
// reliquidado tres veces).

/** Una banda de precio. `hasta` es inclusivo; `null` = sin techo. */
export interface Banda {
  desde: number;
  hasta: number | null;
  precioCop: number | null;
  etiqueta: string;
}

/**
 * Las bandas, decididas el 2026-08-15.
 *
 * Ancladas contra Alegra Nómina Colombia medido ese día ($29.900 / $69.000 /
 * $139.000 / $259.000 por 10/20/45/90 empleados) y fijadas **por debajo** de la
 * banda equivalente a propósito: NomiCheck no reemplaza a una suite de nómina
 * —no emite nómina electrónica DIAN, y eso está dicho en `NATURALEZA_JURIDICA`—
 * sino que agrega la capa de prueba encima. Un complemento no puede costar como
 * el producto principal.
 *
 * La última banda tiene `precioCop: null` a propósito: arriba de 150 empleados
 * el soporte deja de ser el mismo y el precio se conversa. Un número inventado
 * ahí sería peor que la ausencia — ver `precioDelMes`, que devuelve
 * `requiereConversacion` en vez de un monto.
 */
export const BANDAS: Banda[] = [
  { desde: 1, hasta: 10, precioCop: 19_000, etiqueta: "1 a 10 empleados" },
  { desde: 11, hasta: 45, precioCop: 49_000, etiqueta: "11 a 45 empleados" },
  { desde: 46, hasta: 150, precioCop: 99_000, etiqueta: "46 a 150 empleados" },
  { desde: 151, hasta: null, precioCop: null, etiqueta: "más de 150 empleados" },
];

export function bandaPara(empleados: number): Banda | null {
  if (!Number.isFinite(empleados) || empleados < 1) return null;

  return (
    BANDAS.find((b) => empleados >= b.desde && (b.hasta === null || empleados <= b.hasta)) ?? null
  );
}

/**
 * El mes calendario **colombiano** en el que cae un instante.
 *
 * Colombia es UTC-5 todo el año (no hay horario de verano), así que alcanza con
 * restar cinco horas antes de leer el año y el mes. No es un detalle de
 * prolijidad: un cierre del 31 de agosto a las 9 de la noche en Bogotá ocurre
 * el 1 de septiembre en UTC, y facturarlo en septiembre le mueve el mes a la
 * empresa —a veces cambiándole la banda— por una zona horaria que no eligió.
 */
export function mesColombiano(instante: Date): string {
  const co = new Date(instante.getTime() - 5 * 60 * 60 * 1000);
  return `${co.getUTCFullYear()}-${String(co.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Un cierre ya medido: cuántos empleados quedaron con evidencia, y si esa
 *  evidencia verifica contra la llave pública servida. */
export interface CierreMedido {
  periodoId: number;
  empleadosConEvidencia: number;
  /** Resultado de `verificarFirma` sobre el payload guardado. */
  firmaValida: boolean;
  /**
   * La evidencia se firmó con una llave DISTINTA de la que corre hoy.
   *
   * No es lo mismo que una firma rota, y confundirlos ya costó caro una vez en
   * el verificador público del sobre: decirle «inválido, no confíes» a un
   * emisor honesto. Acá el error es peor, porque además cobra — o más bien deja
   * de cobrar: si la llave de firma rotara, **todos los cierres pasados
   * quedarían sin facturar** y el estado de cuenta acusaría manipulación donde
   * solo hubo un cambio de llave nuestro.
   *
   * Ninguno de los dos casos se factura —no se cobra lo que no se puede
   * verificar—, pero se nombran distinto: uno es un problema del cliente y el
   * otro es un problema NUESTRO.
   */
  firmadaConOtraLlave?: boolean;
}

export interface ResumenMes {
  mes: string;
  cierresTotales: number;
  cierresFacturables: number;
  /** Los `periodoId` que NO entran, con el motivo. Va en el estado de cuenta:
   *  un descuento sin explicación genera la misma llamada que un cobro de más. */
  excluidos: { periodoId: number; motivo: string }[];
  /** El headcount que fija la banda: el máximo del mes. */
  empleadosFacturables: number;
  banda: Banda | null;
  precioCop: number | null;
  requiereConversacion: boolean;
}

/**
 * El resumen de un mes, que es lo que se factura.
 *
 * Tres decisiones que este cálculo toma, y por qué:
 *
 * 1. **Se cobra el MES, no cada cierre.** Una empresa con nómina quincenal
 *    cierra dos veces y paga una. Cobrar por cierre castigaría a quien le paga
 *    más seguido a su gente, que es exactamente al revés de lo que queremos
 *    premiar. Y de paso vuelve **estructuralmente imposible** el doble cobro
 *    por reliquidar: un periodo que se revierte a borrador y se cierra otra vez
 *    suma cierres, no montos.
 *
 * 2. **La banda la fija el MÁXIMO de empleados del mes, no la suma.** Sumar los
 *    empleados de las dos quincenas duplicaría la nómina de la empresa y la
 *    empujaría a una banda que no le toca. El máximo es el tamaño real de la
 *    gente para la que se produjo evidencia.
 *
 * 3. **Un cierre cuya firma no verifica NO se factura.** Es la misma regla que
 *    ya rige el muro x402 (`leyes/cobrar-antes-de-servir`): cobrar por una
 *    prueba que no prueba sería justamente el error que este producto existe
 *    para señalar. Y se informa cuál quedó afuera, no se descuenta en silencio.
 */
export function resumirMes(mes: string, cierres: CierreMedido[]): ResumenMes {
  const excluidos: { periodoId: number; motivo: string }[] = [];
  const facturables: CierreMedido[] = [];

  for (const c of cierres) {
    if (!c.firmaValida) {
      excluidos.push({
        periodoId: c.periodoId,
        motivo: c.firmadaConOtraLlave
          ? // Nuestro problema, no del cliente: la evidencia está sana pero la
            // firmó una llave que ya no corre. Hay que re-firmar o reponer la
            // llave antes de cobrar este mes.
            "firmada con una llave anterior a la que corre hoy — revisar de nuestro lado antes de cobrar"
          : "la firma de la evidencia no verifica",
      });
      continue;
    }
    // Un cierre sin nadie con evidencia no produjo nada que cobrar. Pasa de
    // verdad: un periodo cuyos empleados fueron todos rechazados por QA termina
    // en `liquidado_con_rechazos` con cero recibos.
    if (c.empleadosConEvidencia < 1) {
      excluidos.push({ periodoId: c.periodoId, motivo: "ningún empleado quedó con evidencia" });
      continue;
    }
    facturables.push(c);
  }

  const empleadosFacturables = facturables.reduce(
    (max, c) => Math.max(max, c.empleadosConEvidencia),
    0
  );
  const banda = empleadosFacturables > 0 ? bandaPara(empleadosFacturables) : null;

  return {
    mes,
    cierresTotales: cierres.length,
    cierresFacturables: facturables.length,
    excluidos,
    empleadosFacturables,
    banda,
    precioCop: banda?.precioCop ?? null,
    // Solo cuando hay banda y esa banda no tiene precio de lista. Un mes sin
    // cierres no "requiere conversación": no se cobra y ya.
    requiereConversacion: banda !== null && banda.precioCop === null,
  };
}
