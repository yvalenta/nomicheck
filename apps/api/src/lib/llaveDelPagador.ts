// La clave del pagador (DX402 punto 2, Parte 3 — implementar:adaptador).
//
// Para sellar el sobre a quien pagó (SDK `sealEvidence`/`anchorEvidence`,
// informe `sdk` §2) hace falta su clave pública secp256k1, y la única forma
// de conseguirla sin que el comprador mande nada extra es RECUPERARLA de la
// firma que ya mandó al pagar (`payerKeyFromEvmSignature` del SDK,
// `dx402.ts:462-478`): esa función recupera una clave a partir de
// `(firma, digest)`, y el digest es el de `TransferWithAuthorization`
// (EIP-3009) que el comprador firmó al autorizar el `transferWithAuthorization`.
//
// EL DOMINIO EIP-712 NO SE ADIVINA. Sale del MISMO accept que el 402 anunció
// (`context.paymentRequirements.extra.name/version`, que es `red.eip712` de
// `x402Config.ts` — el mismo dato que ya se midió on-chain para Avalanche),
// nunca de una tabla propia: el comentario de `payerKeyFromEvmSignature`
// (`dx402.ts:454-458`) y el de `payer.rs` del facilitador (informe
// `declaracion` §5, `payer.rs:14-18`) coinciden en el mismo riesgo — "a
// second copy would drift, and a drifted domain does not error — it recovers
// a different, perfectly valid public key". Por eso, además, la clave
// recuperada se CONTRASTA contra `authorization.from`: un dominio desviado
// recupera una clave ajena SIN que nada lo avise, y esa comparación es lo
// único que lo cacha.
import { hashTypedData, hexToBytes, recoverAddress, type Address, type Hex } from "viem";
import { payerKeyFromEvmSignature } from "uvd-x402-sdk";

/** `{from,to,value,validAfter,validBefore,nonce}` de un EIP-3009 `transferWithAuthorization`. */
export interface AutorizacionEip3009 {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

/**
 * `payload` de `paymentPayload` en x402 — IDÉNTICO en v1 y v2 (informe
 * `faremeter` §6, `x402Muro.ts#aFormatoV1`: "`payload` ya trae
 * `{signature, authorization}`, que es idéntico en las dos versiones").
 */
export interface CargaDePago {
  signature: string;
  authorization: AutorizacionEip3009;
}

/** El dominio EIP-712 del accept pagado: nombre/versión del token + chainId + el token mismo. */
export interface DominioTransferWithAuthorization {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export class ErrorSinLlaveDelPagador extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorSinLlaveDelPagador";
  }
}

const TIPOS_TRANSFER_WITH_AUTHORIZATION = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** El digest EIP-712 exacto que el comprador firmó al autorizar el pago. */
export function digestTransferWithAuthorization(
  autorizacion: AutorizacionEip3009,
  dominio: DominioTransferWithAuthorization
): Hex {
  // Las tres direcciones en minúsculas ANTES de pasar por viem:
  // `hashTypedData` rechaza con `InvalidAddressError` toda dirección en
  // mayúsculas mixtas cuyo checksum EIP-55 no sea exacto, y el digest EIP-712
  // codifica la dirección como bytes20 — el casing no cambia el hash. Sin
  // esto, un `X402_PAY_TO` con checksum malo (que el arranque acepta:
  // `/^0x[0-9a-fA-F]{40}$/`) o un cliente que serialice `from` en mayúsculas
  // convertían CADA venta en un 422 `no_payer_key` que le echaba la culpa a
  // la firma del comprador (hallazgo del refutador `identidad`, ronda 3).
  return hashTypedData({
    domain: { ...dominio, verifyingContract: dominio.verifyingContract.toLowerCase() as Address },
    types: TIPOS_TRANSFER_WITH_AUTHORIZATION,
    primaryType: "TransferWithAuthorization",
    message: {
      from: autorizacion.from.toLowerCase() as Address,
      to: autorizacion.to.toLowerCase() as Address,
      value: BigInt(autorizacion.value),
      validAfter: BigInt(autorizacion.validAfter),
      validBefore: BigInt(autorizacion.validBefore),
      nonce: autorizacion.nonce as Hex,
    },
  });
}

/**
 * Recupera la clave pública secp256k1 (33 bytes comprimidos) de quien pagó,
 * y la contrasta contra `authorization.from` ANTES de devolverla — ver el
 * comentario grande de arriba para el porqué exacto. RECHAZA (throw
 * `ErrorSinLlaveDelPagador`) si no coincide; nunca cobra por su cuenta, eso
 * lo decide el llamador (Parte 3 del brief: 422 `no_payer_key` sin capturar).
 */
export async function llaveDelPagador(
  carga: CargaDePago,
  dominio: DominioTransferWithAuthorization
): Promise<Uint8Array> {
  const digest = digestTransferWithAuthorization(carga.authorization, dominio);
  const recuperada = await recoverAddress({ hash: digest, signature: carga.signature as Hex });
  if (recuperada.toLowerCase() !== carga.authorization.from.toLowerCase()) {
    throw new ErrorSinLlaveDelPagador(
      `la firma recupera ${recuperada}, que no es quien dice pagar ` +
        `(authorization.from=${carga.authorization.from}). Un dominio EIP-712 desviado recupera ` +
        "una clave distinta y VÁLIDA sin ningún error (informe declaracion §5, payer.rs:14-18) — " +
        "por eso se contrasta contra `from` en vez de confiar en que la recuperación \"funcionó\"."
    );
  }
  return payerKeyFromEvmSignature(carga.signature, hexToBytes(digest));
}
