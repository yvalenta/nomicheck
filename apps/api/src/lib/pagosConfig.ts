// Config técnica del pago on-chain (SDD §17). Separada de ReglaLegal a
// propósito: red/token/contrato no son reglas legales con vigencia, son
// infraestructura. Los knobs numéricos con semántica de política (prima
// sobre TRM, ventana de validez) SÍ viven en ReglaLegal.
//
// Fase 1: SOLO { red: "base", token: "USDC" } — validación estricta. Cuando
// haya demanda real de otra red, se agrega una entrada aquí y el resto del
// sistema la acepta sin refactor (BatchPago ya guarda red/token/tokenAddress
// por lote).

export interface RedPago {
  red: string;
  chainId: number;
  token: string;
  // USDC NATIVO de Circle en Base — NO USDbC (0xd9aA…, bridged legacy).
  // Nativo = MiCA compliance + atestación mensual de reservas de Circle.
  tokenAddress: `0x${string}`;
  decimales: number;
  rpcUrl: string;
  // Explorador de bloques público — es POR RED, no global. Va acá y no en el
  // servicio para que agregar una red traiga su explorador con ella y el
  // comprobante nunca enlace a un explorador que no conoce esa chain.
  explorerTxUrl: (txHash: string) => string;
}

export const REDES_SOPORTADAS: RedPago[] = [
  {
    red: "base",
    chainId: 8453,
    token: "USDC",
    tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimales: 6,
    rpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
    explorerTxUrl: (txHash) => `https://basescan.org/tx/${txHash}`,
  },
];

// Origen público donde vive esta API. Solo se usa para construir URLs de
// verificación DENTRO del comprobante: el titular tiene que poder auditar
// la tasa y la llave pública sin que nadie le pase el enlace aparte.
export function origenPublico(): string {
  return (process.env.NOMICHECK_PUBLIC_ORIGIN ?? "https://nomicheck.ynt.codes").replace(/\/+$/, "");
}

export class ErrorRedNoSoportada extends Error {
  constructor(red: string, token: string) {
    super(
      `El par { red: "${red}", token: "${token}" } no está soportado. ` +
        `Fase 1 solo acepta { red: "base", token: "USDC" } (USDC nativo de Circle en Base). ` +
        `Otras redes se habilitan según demanda — ver SDD §17.`
    );
    this.name = "ErrorRedNoSoportada";
  }
}

export function resolverRedPago(red: string, token: string): RedPago {
  const encontrada = REDES_SOPORTADAS.find((r) => r.red === red && r.token === token);
  if (!encontrada) throw new ErrorRedNoSoportada(red, token);
  return encontrada;
}

// Disclaimer que viaja embebido en TODA respuesta/export de un BatchPago —
// no basta con el copy del listing (gap 5.3 del alcance execution_market).
export function disclaimerBatch(hashTasa: string): string {
  return (
    `Conversión informativa COP→USDC con tasa snapshot ${hashTasa}. ` +
    `Aplica únicamente a pagos de contratistas de servicios (Ley 1819 de 2016, art. 244) — ` +
    `pago comercial entre partes. NO aplica a salarios de empleados: el salario en Colombia ` +
    `se paga en moneda legal (CST art. 134-136). Este documento no constituye dictamen ` +
    `contable ni asesoría legal.`
  );
}
