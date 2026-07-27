// Emisión de la CONSTANCIA DE PAGO VERIFICABLE (validation/comprobante.ts).
//
// Cruza las tres capas que hacen el documento incuestionable:
//   1. el lote FIRMADO que salió de `ejecutarBatchPagoOnchain` (el cálculo)
//   2. el recibo ON-CHAIN de la tx donde se pagó        (el hecho)
//   3. la firma Ed25519 de esta constancia               (la custodia)
//
// Stateless igual que sus hermanos: entra JSON, sale JSON, no toca Prisma.
// Una sola llamada RPC (`getTransactionReceipt`) — NO escanea historial. Ese
// es el punto: el pagador ya sabe con qué tx pagó, así que no hay nada que
// buscar. Escanear logs para "encontrar" pagos toparía con el techo de 10.000
// bloques (~5,6 h) del RPC público de Base y no haría falta ni una sola vez.
import { createPublicClient, http, parseEventLogs, erc20Abi } from "viem";
import { firmarPayload, verificarFirma, obtenerPublicKeyId } from "./batchSignatureService.js";
import { construirHabeasData } from "./batchPublicoService.js";
import { origenPublico, resolverRedPago, type RedPago } from "../lib/pagosConfig.js";
import {
  NATURALEZA_JURIDICA,
  type CadenaDeCustodia,
  type ComprobanteOutput,
  type LineaComprobante,
} from "../validation/comprobante.js";
import type { BatchPagoOnchainOutput, ItemPagoOnchain } from "../validation/batchPagoOnchain.js";

/** El lote no viene de este servidor (firma rota o alterada). Es lo PRIMERO
 *  que se comprueba: sin esto, cualquiera arma un JSON con los montos que
 *  quiera y se auto-emite una constancia firmada por nosotros. */
export class ErrorLoteNoAutentico extends Error {
  constructor(motivo: string) {
    super(
      `El lote no es auténtico (${motivo}) — no se emite constancia. La firma Ed25519 del ` +
        `lote debe verificar contra la llave pública de NomiCheck antes de mirar la cadena.`
    );
    this.name = "ErrorLoteNoAutentico";
  }
}

/** La wallet no aparece en el lote — no hay nada que certificarle. */
export class ErrorWalletSinItems extends Error {
  constructor(wallet: string) {
    super(`La wallet ${wallet} no tiene items en este lote — no hay pago que constatar.`);
    this.name = "ErrorWalletSinItems";
  }
}

/** La transacción no existe, no está minada, o está revertida. */
export class ErrorPagoNoConfirmado extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "ErrorPagoNoConfirmado";
  }
}

/** La tx existe pero no contiene el Transfer que el lote esperaba. Distinto de
 *  `ErrorPagoNoConfirmado`: la cadena está bien, lo que no cuadra es el monto
 *  o el destino. Se reporta aparte para que el titular sepa cuál de las dos. */
export class ErrorPagoNoCoincide extends Error {
  constructor(wallet: string, montoUsdc: number) {
    super(
      `La transacción no contiene una transferencia de ${montoUsdc} USDC hacia ${wallet}. ` +
        `El pago pudo hacerse por otro monto, a otra wallet, o en otra transacción.`
    );
    this.name = "ErrorPagoNoCoincide";
  }
}

function esLoteConForma(v: unknown): v is BatchPagoOnchainOutput {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.reglasHash === "string" &&
    typeof o.tokenAddress === "string" &&
    Array.isArray(o.items) &&
    typeof o.signature === "object" &&
    o.signature !== null
  );
}

/** Verifica la firma del lote y devuelve el lote tipado. La firma cubre todo
 *  menos `signature`, así que alterar un solo peso de un item la invalida. */
function autenticarLote(lote: unknown): BatchPagoOnchainOutput {
  if (!esLoteConForma(lote)) throw new ErrorLoteNoAutentico("no tiene la forma de un lote de pago");
  const firma = lote.signature;
  if (firma.algo !== "ed25519") throw new ErrorLoteNoAutentico(`algoritmo no soportado: ${firma.algo}`);
  // `verificarFirma` canonicaliza y excluye `signature` por su cuenta.
  if (!verificarFirma(lote, firma)) throw new ErrorLoteNoAutentico("la firma Ed25519 no verifica");
  return lote;
}

interface TransferLeido {
  from: string;
  to: string;
  value: bigint;
}

async function leerTransfers(red: RedPago, txHash: string): Promise<{ transfers: TransferLeido[]; bloque: bigint }> {
  const cliente = createPublicClient({ transport: http(red.rpcUrl) });
  const receipt = await cliente
    .getTransactionReceipt({ hash: txHash as `0x${string}` })
    .catch(() => null);

  if (!receipt) {
    throw new ErrorPagoNoConfirmado(
      `No se encontró la transacción ${txHash} en ${red.red}. Puede no estar minada todavía, ` +
        `o pertenecer a otra red.`
    );
  }
  if (receipt.status !== "success") {
    throw new ErrorPagoNoConfirmado(
      `La transacción ${txHash} está revertida — no transfirió nada y no acredita ningún pago.`
    );
  }

  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
    .filter((l) => l.address.toLowerCase() === red.tokenAddress.toLowerCase())
    .map((l) => ({
      from: (l.args.from as string).toLowerCase(),
      to: (l.args.to as string).toLowerCase(),
      value: l.args.value as bigint,
    }));

  return { transfers, bloque: receipt.blockNumber };
}

function construirLineas(
  lote: BatchPagoOnchainOutput,
  item: ItemPagoOnchain,
  red: RedPago,
  txHash: string,
  transfer: TransferLeido
): LineaComprobante[] {
  const origen = origenPublico();
  const snap = lote.tasaSnapshot as unknown as Record<string, unknown>;
  const tasaEfectiva = typeof snap.tasaEfectiva === "number" ? snap.tasaEfectiva : 0;
  const hashTasa = typeof snap.hash === "string" ? snap.hash : "";

  return [
    {
      clave: "recibido_usdc",
      concepto: "Lo que efectivamente recibió",
      valor: item.montoUsdc.toFixed(6),
      unidad: "USDC",
      prueba: {
        tipo: "onchain_transfer",
        referencia: txHash,
        verificarEn: red.explorerTxUrl(txHash),
        demuestra:
          `La red ${red.red} registra una transferencia de ${transfer.value.toString()} unidades ` +
          `de USDC hacia esta wallet. Nadie puede alterarlo ni borrarlo, tampoco NomiCheck.`,
      },
    },
    {
      clave: "pagador",
      concepto: "Quién pagó",
      valor: transfer.from,
      unidad: "direccion",
      prueba: {
        tipo: "onchain_transfer",
        referencia: txHash,
        verificarEn: red.explorerTxUrl(txHash),
        demuestra:
          "La wallet de origen se leyó del evento Transfer en la cadena, no de lo que alguien declaró.",
      },
    },
    {
      clave: "equivalente_cop",
      concepto: "Equivalente pactado en pesos",
      valor: String(item.montoCop),
      unidad: "COP",
      prueba: {
        tipo: "snapshot_tasa",
        referencia: hashTasa,
        verificarEn: `${origen}/api/tasa/verify?hash=${hashTasa}`,
        demuestra:
          `El monto en USDC se obtuvo dividiendo ${item.montoCop} COP por la tasa congelada al ` +
          `momento de generar el lote. La tasa quedó hasheada antes de pagar: no se pudo ajustar después.`,
      },
    },
    {
      clave: "tasa_aplicada",
      concepto: "Tasa aplicada (COP por USDC)",
      valor: String(tasaEfectiva),
      unidad: "TRM",
      prueba: {
        tipo: "snapshot_tasa",
        referencia: hashTasa,
        verificarEn: `${origen}/api/tasa/verify?hash=${hashTasa}`,
        demuestra:
          "El snapshot completo (TRM oficial, prima aplicada, fuente y fecha) se recupera con ese hash.",
      },
    },
    {
      clave: "catalogo_legal",
      concepto: "Catálogo de reglas legales usado",
      valor: lote.reglasHash,
      unidad: "sha256",
      prueba: {
        tipo: "catalogo_legal",
        referencia: lote.reglasHash,
        verificarEn: `${origen}/api/batch/parametros`,
        demuestra:
          `Identifica exactamente qué versión de la normativa se aplicó, verificada al ` +
          `${lote.reglasVerificadasAl}. Si el catálogo cambia, el hash cambia: no se puede ` +
          `reescribir la historia sin que se note.`,
      },
    },
    {
      clave: "integridad_documento",
      concepto: "Integridad de esta constancia",
      valor: obtenerPublicKeyId(),
      unidad: "sha256",
      prueba: {
        tipo: "firma_ed25519",
        referencia: obtenerPublicKeyId(),
        verificarEn: `${origen}/api/batch/publickey`,
        demuestra:
          "La firma Ed25519 cubre todos los campos menos ella misma. Cambiar un solo peso la " +
          "invalida, y se comprueba con la llave pública sin necesidad de que el servidor exista.",
      },
    },
  ];
}

const COMO_VERIFICAR = [
  "1. Abra el enlace del explorador: confirme destino, monto y que la transacción está confirmada.",
  "2. Consulte el hash de la tasa: obtiene la TRM oficial, la fuente y la fecha con que se convirtió.",
  "3. Descargue la llave pública y verifique la firma Ed25519 de este JSON (canonical: claves ordenadas, UTF-8, sin el campo signature).",
  "4. Si los tres pasos pasan, el documento es válido aunque NomiCheck ya no exista.",
];

/**
 * Emite una constancia por CADA item del lote que vaya a `wallet`. Devuelve un
 * arreglo porque nada impide que un lote pague dos conceptos a la misma wallet;
 * cada constancia se firma por separado y se verifica sola.
 *
 * Sobre autorización: NO se exige probar la titularidad de la wallet. Quien ya
 * tiene el lote firmado en la mano tiene esos datos, así que exigir login no
 * protegería nada — solo daría una falsa sensación de control. La prueba de
 * titularidad (EIP-4361) hace falta en la capa que BUSCA constancias por
 * wallet, no en la que las emite a partir de un lote que ya se posee.
 */
export async function emitirComprobantes(
  loteSinVerificar: unknown,
  txHash: string,
  wallet: string
): Promise<ComprobanteOutput[]> {
  const lote = autenticarLote(loteSinVerificar);
  const red = resolverRedPago(lote.red, lote.token);

  const walletLower = wallet.toLowerCase();
  const mios = lote.items.filter((i) => i.destinoWallet.toLowerCase() === walletLower);
  if (mios.length === 0) throw new ErrorWalletSinItems(wallet);

  // NOTA: el lote puede estar EXPIRADO y aun así emitirse la constancia.
  // `expiraEn` limita hasta cuándo esa tasa sirve para PAGAR; una vez el pago
  // ocurrió, es un hecho pasado. Negarle a alguien la constancia de un pago de
  // hace seis meses porque "la tasa venció" sería exactamente al revés.
  const { transfers, bloque } = await leerTransfers(red, txHash);

  // Se consume el transfer al emparejar: dos items del mismo monto a la misma
  // wallet exigen dos Transfer distintos, no se reutiliza un log para ambos.
  const disponibles = [...transfers];
  const cadenaDeCustodia: CadenaDeCustodia = {
    loteGeneradoEn: lote.generadoEn,
    loteFirmaValor: lote.signature.valor,
    lotePublicKeyId: lote.signature.publicKeyId,
    loteExpiraEn: lote.expiraEn,
  };

  return mios.map((item) => {
    const unidadesEsperadas = BigInt(Math.round(item.montoUsdc * 1_000_000));
    const idx = disponibles.findIndex((t) => t.to === walletLower && t.value === unidadesEsperadas);
    if (idx < 0) throw new ErrorPagoNoCoincide(wallet, item.montoUsdc);
    const [transfer] = disponibles.splice(idx, 1);

    const sinFirma = {
      version: "1" as const,
      tipo: "constancia_pago_verificable" as const,
      emitidoEn: new Date().toISOString(),
      naturalezaJuridica: NATURALEZA_JURIDICA,
      beneficiario: { wallet: item.destinoWallet, externalId: item.externalId },
      pago: {
        red: red.red,
        chainId: red.chainId,
        tokenAddress: red.tokenAddress,
        txHash,
        bloque: bloque.toString(),
        desdeWallet: transfer.from,
        haciaWallet: transfer.to,
        unidades: transfer.value.toString(),
        montoUsdc: item.montoUsdc,
      },
      lineas: construirLineas(lote, item, red, txHash, transfer),
      disclaimer: lote.disclaimer,
      habeasData: construirHabeasData(),
      reglasHash: lote.reglasHash,
      reglasVerificadasAl: lote.reglasVerificadasAl,
      cadenaDeCustodia,
      comoVerificar: COMO_VERIFICAR,
    };
    return { ...sinFirma, signature: firmarPayload(sinFirma) };
  });
}
