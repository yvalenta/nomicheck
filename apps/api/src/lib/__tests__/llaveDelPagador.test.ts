// `llaveDelPagador`: recuperar la clave del pagador de su firma EIP-3009, y
// rechazarla si no corresponde a `authorization.from` — el modo de falla
// silencioso que el comentario de `payerKeyFromEvmSignature` (dx402.ts) y el
// de `payer.rs` del facilitador (informe `declaracion` §5) describen igual:
// un dominio desviado recupera una clave AJENA, VÁLIDA, sin ningún error.
//
// Firmas reales con cuentas viem en memoria (`generatePrivateKey()`) — nunca
// una llave de archivo ni de red, por la regla de la casa.
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount, publicKeyToAddress } from "viem/accounts";
import type { Address, Hex } from "viem";
import {
  llaveDelPagador,
  ErrorSinLlaveDelPagador,
  type AutorizacionEip3009,
  type DominioTransferWithAuthorization,
} from "../llaveDelPagador.js";

// El primo de secp256k1 (FFFFFFFF...FFFFFC2F) — hace falta para descomprimir
// la clave de abajo con matemática de curva propia, ver el comentario grande
// sobre `direccionDesdeClaveComprimida`.
const P_SECP256K1 = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let resultado = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) resultado = (resultado * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return resultado;
}

/**
 * Descomprime una clave pública secp256k1 comprimida (33 bytes: prefijo
 * 0x02/0x03 + X) a la dirección EVM que le corresponde, con matemática de
 * curva escrita acá mismo — sin pasar por `digestTransferWithAuthorization`
 * ni por `payerKeyFromEvmSignature` (las dos funciones que el test de abajo
 * está comprobando).
 *
 * POR QUÉ HACE FALTA (reparación DX402 punto 2 ronda 2, hallazgo del
 * refutador): la aserción original calculaba `esperada` con esas MISMAS dos
 * funciones y comparaba el resultado de `llaveDelPagador` contra ellas — es
 * `f(x) === f(x)`, y no puede fallar aunque el digest EIP-712 esté mal (p.
 * ej. `validAfter` declarado `uint64` en vez de `uint256`). Con un digest
 * roto, `payerKeyFromEvmSignature` igual recupera una clave secp256k1
 * VÁLIDA — solo que de OTRO punto de la curva, que no decomprime a la
 * dirección de quien realmente firmó. Esta función mide justo eso: si el
 * digest estuviera mal, `direccionDesdeClaveComprimida(clave)` no
 * coincidiría con `pagador.address` (verificado por fuera con ambos casos —
 * digest correcto y digest deliberadamente distinto — antes de este commit).
 *
 * `y = (x³+7)^((p+1)/4) mod p` es válida porque `p ≡ 3 (mod 4)` en
 * secp256k1 — la paridad de `y` se ajusta al prefijo (0x02 = par, 0x03 =
 * impar) tomando `p - y` cuando no coincide.
 */
function direccionDesdeClaveComprimida(clave: Uint8Array): Address {
  if (clave.length !== 33) throw new Error("se esperaba una clave comprimida de 33 bytes");
  const prefijo = clave[0];
  const x = BigInt("0x" + Buffer.from(clave.slice(1)).toString("hex"));
  const rhs = (modPow(x, 3n, P_SECP256K1) + 7n) % P_SECP256K1;
  let y = modPow(rhs, (P_SECP256K1 + 1n) / 4n, P_SECP256K1);
  const yEsPar = y % 2n === 0n;
  const sePideYPar = prefijo === 2;
  if (yEsPar !== sePideYPar) y = P_SECP256K1 - y;
  const xHex = x.toString(16).padStart(64, "0");
  const yHex = y.toString(16).padStart(64, "0");
  return publicKeyToAddress(`0x04${xHex}${yHex}` as Hex);
}

// USDC nativo de Avalanche C-Chain — el mismo dominio que `AVALANCHE_MAINNET`
// en `x402Config.ts` (medido on-chain, no elegido).
const DOMINIO_AVALANCHE: DominioTransferWithAuthorization = {
  name: "USD Coin",
  version: "2",
  chainId: 43114,
  verifyingContract: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
};

function autorizacion(from: Address, to: Address): AutorizacionEip3009 {
  return {
    from,
    to,
    value: "20000",
    validAfter: "0",
    validBefore: "9999999999",
    nonce: `0x${"22".repeat(32)}`,
  };
}

async function firmarConCuenta(
  account: ReturnType<typeof privateKeyToAccount>,
  autorizacionAFirmar: AutorizacionEip3009,
  dominio: DominioTransferWithAuthorization
): Promise<Hex> {
  return account.signTypedData({
    domain: dominio,
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: autorizacionAFirmar.from as Address,
      to: autorizacionAFirmar.to as Address,
      value: BigInt(autorizacionAFirmar.value),
      validAfter: BigInt(autorizacionAFirmar.validAfter),
      validBefore: BigInt(autorizacionAFirmar.validBefore),
      nonce: autorizacionAFirmar.nonce as Hex,
    },
  });
}

describe("llaveDelPagador — camino feliz", () => {
  it("recupera exactamente la clave de quien firmó, comprimida en 33 bytes", async () => {
    const pagador = privateKeyToAccount(generatePrivateKey());
    const payTo = privateKeyToAccount(generatePrivateKey()).address;
    const auth = autorizacion(pagador.address, payTo);
    const signature = await firmarConCuenta(pagador, auth, DOMINIO_AVALANCHE);

    const clave = await llaveDelPagador({ signature, authorization: auth }, DOMINIO_AVALANCHE);

    expect(clave).toBeInstanceOf(Uint8Array);
    expect(clave.length).toBe(33);
    // Medición INDEPENDIENTE del digest (ver el comentario grande de
    // `direccionDesdeClaveComprimida` arriba): si `llaveDelPagador`
    // calculara un digest distinto del que en verdad se firmó, la clave que
    // devuelve sería válida pero de OTRO punto de la curva, y no
    // decomprimiría a la dirección de quien firmó.
    expect(direccionDesdeClaveComprimida(clave).toLowerCase()).toBe(pagador.address.toLowerCase());
  });
});

describe("llaveDelPagador — dominio desviado", () => {
  it("RECHAZA cuando el dominio EIP-712 no es el que se firmó, aunque la recuperación no lance", async () => {
    const pagador = privateKeyToAccount(generatePrivateKey());
    const payTo = privateKeyToAccount(generatePrivateKey()).address;
    const auth = autorizacion(pagador.address, payTo);
    // Se firma con el dominio real de Avalanche...
    const signature = await firmarConCuenta(pagador, auth, DOMINIO_AVALANCHE);
    // ...pero se verifica contra un dominio distinto (otro `version`, como
    // el caso real Base Sepolia "USDC" vs. el resto "USD Coin").
    const dominioDesviado: DominioTransferWithAuthorization = { ...DOMINIO_AVALANCHE, version: "1" };

    await expect(llaveDelPagador({ signature, authorization: auth }, dominioDesviado)).rejects.toThrow(
      ErrorSinLlaveDelPagador
    );
  });
});

describe("llaveDelPagador — firma de otra cuenta", () => {
  it("RECHAZA cuando quien firmó no es `authorization.from`", async () => {
    const firmante = privateKeyToAccount(generatePrivateKey());
    const otraCuenta = privateKeyToAccount(generatePrivateKey());
    const payTo = privateKeyToAccount(generatePrivateKey()).address;
    // `from` declara a `otraCuenta`, pero firma `firmante` — la firma de
    // alguien que no es quien dice pagar.
    const auth = autorizacion(otraCuenta.address, payTo);
    const signature = await firmarConCuenta(firmante, auth, DOMINIO_AVALANCHE);

    await expect(llaveDelPagador({ signature, authorization: auth }, DOMINIO_AVALANCHE)).rejects.toThrow(
      /no es quien dice pagar/
    );
  });
});
