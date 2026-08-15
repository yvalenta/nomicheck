// El quickstart: TODO lo que un agente comprador necesita, en una sola llamada.
//
// ── Por qué existe ─────────────────────────────────────────────────────────
//
// Las piezas ya estaban: `/schema/v1.json`, `/ejemplo`, `/publickey`,
// `/parametros`, `/openapi.json` y el pre-chequeo gratis. Pero estaban
// DESPARRAMADAS: un comprador-bot tenía que descubrirlas de a una, adivinando
// nombres, y ninguna le decía cuánto cuesta ni qué NO hace el servicio.
//
// La idea es prestada de un paquete ajeno que hace bien la distribución hacia
// agentes (ARC/culture.sbs, 2026-08-14): un solo GET que responde qué es,
// cuánto cuesta, cómo se paga, cómo se verifica y qué NO hace. Copiamos la
// forma, no su modelo de negocio.
//
// ── Por qué se GENERA y no se escribe ──────────────────────────────────────
//
// Un documento de bienvenida escrito a mano miente el día que cambia un
// precio. Acá el precio sale de `PRECIOS_USD` —la misma constante que usa el
// muro para cobrar— y la llave y el catálogo salen de quien los sirve. Si el
// muro cobra otra cosa, este documento cambia solo. Es la ley de la casa
// aplicada a la vitrina: una sola fuente por cifra.
import { origenPublico } from "../lib/pagosConfig.js";
import { PRECIOS_USD } from "../lib/x402Config.js";
import { obtenerPublicKeyId } from "./batchSignatureService.js";
import { REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";

export function construirQuickstart() {
  // El origen sale de donde ya vive (pagosConfig): una sola fuente para todas
  // las URLs que este servicio publica de sí mismo.
  const base = origenPublico();
  const precioVerificar = PRECIOS_USD["/verificar"];

  return {
    schemaVersion: "nomicheck-quickstart/v1",
    canonical: `${base}/api/batch/quickstart`,

    queEs:
      "Verificación determinística de comprobantes de pago (nómina) de Colombia. " +
      "Recalcula las líneas de origen legal —salario, auxilio de transporte, salud, " +
      "pensión y fondo de solidaridad— de forma independiente al comprobante, y las " +
      "compara con lo declarado. Cero IA en el cálculo: mismo input, mismo output.",

    // Lo primero que ve el lector es lo GRATIS, a propósito: si su comprobante
    // está limpio se entera sin pagar y no vuelve. Esa es la promesa publicada.
    empezarGratis: {
      url: `${base}/api/batch/verificar/prechequeo`,
      metodo: "POST",
      precioUsd: 0,
      requiereRegistro: false,
      devuelve:
        "Cuántos comprobantes traen discrepancias y cuánto pesan en neto. " +
        "Nunca qué línea ni qué norma: eso es el informe pagado.",
      mismoMotor:
        "Corre el mismo cálculo que el informe. Si el pre-chequeo dice N, el informe encuentra N.",
      porQueEsGratis:
        "Cobrar según lo que se encuentra es el incentivo que un verificador no puede " +
        "tener. Si tu comprobante está limpio, te enterás gratis y no pagás nunca.",
    },

    informePagado: {
      url: `${base}/api/batch/verificar`,
      metodo: "POST",
      precioUsd: precioVerificar,
      precioFijo: true,
      pago: {
        protocolo: "x402",
        comoFunciona:
          "El endpoint responde 402 con el reto; el cliente firma una autorización " +
          "EIP-3009 y reintenta con el header X-PAYMENT. Sin cuenta, sin API key.",
        redes: ["base", "avalanche"],
        moneda: "USDC",
      },
      devuelve:
        "Veredicto por línea (correcto | pagado_de_mas | pagado_de_menos | " +
        "faltante_en_comprobante | no_verificable_extralegal), el valor que manda la " +
        "ley, la norma que lo rige, y el efecto neto estimado. Todo dentro de un " +
        "sobre firmado Ed25519.",
    },

    // La diferencia con cualquier otro verificador, y por eso va con su receta.
    verificarLaSalida: {
      queEs:
        "La salida es un sobre firmado: se comprueba SIN hablar con este servidor y " +
        "sin confiar en quien lo emitió. La firma cubre el documento entero.",
      llavePublica: `${base}/api/batch/publickey`,
      publicKeyId: obtenerPublicKeyId(),
      unClic: `https://ynt.codes/verificar?url=${base}/api/batch/verificar/ejemplo`,
      formato: "https://github.com/yvalenta/sobre",
      offline:
        "Cuatro implementaciones independientes (Ruby, Node, navegador y una escrita " +
        "por un tercero desde la especificación) producen los mismos bytes.",
    },

    probarAntesDePagar: {
      ejemplo: `${base}/api/batch/verificar/ejemplo`,
      queTrae: "Un input real y su output exacto. Postealo y contrastá.",
      esquema: `${base}/api/batch/verificar/schema/v1.json`,
      openapi: `${base}/api/batch/openapi.json`,
      salud: `${base}/api/batch/health`,
      parametros: `${base}/api/batch/parametros`,
    },

    procedencia: {
      reglasVerificadasAl: REGLAS_VERIFICADAS_AL,
      queSignifica:
        "La fecha en que un humano cotejó el catálogo legal contra la norma publicada. " +
        "Cada salida trae además `reglasHash`: dos informes con el mismo hash se " +
        "calcularon contra el mismo catálogo, y son comparables entre sí.",
    },

    // Prestado del mismo paquete ajeno, y es la parte más honesta que tienen:
    // decir qué NO hace evita el peor estado de un verificador, que es el que
    // se lee como más de lo que es (§6.1 de la spec del sobre).
    queNoHace: [
      "No es dictamen contable ni asesoría legal (Ley 43/1990).",
      "No verifica bonos, comisiones ni otros conceptos extralegales: sin base legal " +
        "para derivarlos, salen marcados `no_verificable_extralegal`.",
      "Un veredicto `correcto` dice que la línea es derivable del catálogo declarado, " +
        "no que ese catálogo sea el vigente hoy. Para eso está `reglasVerificadasAl`.",
      "No persiste los datos del batch (Ley 1581/2012, habeas data). No hay historial " +
        "que consultar después.",
      "No calcula la nómina: verifica una que ya existe.",
    ],

    manifiesto: {
      url: `${base}/api/batch/manifiesto`,
      queTrae:
        "En qué creemos, qué NO afirmamos, y las debilidades que conocemos — " +
        "con fecha. Incluida la más incómoda: todavía nadie nos compró.",
    },

    limites: {
      docs: `${base}/api/batch/schema/v1.json`,
      nota: "Los topes por lote se publican como `maxItems` en el esquema servido.",
    },
  };
}
