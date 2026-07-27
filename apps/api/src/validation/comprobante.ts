// Contrato de la CONSTANCIA DE PAGO VERIFICABLE — el comprobante que el
// trabajador puede auditar sin confiar en NomiCheck.
//
// La diferencia con un comprobante en PDF no es el formato: es que acá
// **ninguna línea puede existir sin su prueba**. `LineaComprobante.prueba` es
// obligatoria en el tipo, así que es imposible agregar un número al documento
// sin decir contra qué se comprueba. Un dato sin prueba no compila.
//
// Cada peso del comprobante es una de dos cosas, nunca una tercera:
//   1. un HECHO ON-CHAIN     — el evento Transfer de una tx minada
//   2. una DERIVACIÓN CITADA — de la TRM congelada o del catálogo legal hasheado
//
// LÍMITE JURÍDICO (deliberado, ver `NATURALEZA_JURIDICA`): esto NO es el
// documento soporte de pago de nómina electrónica de la DIAN (Res. 000013 de
// 2021) ni el documento soporte en adquisiciones a no obligados a facturar
// (Res. 000167 de 2021). Es una constancia privada de pago: sirve como prueba
// documental, no reemplaza obligaciones tributarias. Decirlo dentro del propio
// documento evita que alguien lo presente como lo que no es.
import { z } from "zod";
import type { FirmaOutput, HabeasDataConstancia } from "./batchPublico.js";

const walletEvm = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Wallet EVM inválida");
const txHashEvm = z.string().regex(/^0x[a-fA-F0-9]{64}$/, "txHash inválido — 0x + 64 hex");

export const comprobanteSchema = z.object({
  version: z.literal("1"),
  // El lote firmado que salió de POST /api/batch/pago-onchain. Se acepta
  // como `unknown` a propósito: la validación real es la FIRMA Ed25519, no la
  // forma. Un lote con la forma correcta y la firma rota no vale nada, y uno
  // con un campo de más pero firma válida es auténtico.
  lote: z.unknown(),
  txHash: txHashEvm,
  // De quién se emite el comprobante. Solo se devuelven las líneas de ESTA
  // wallet — un lote de 40 contratistas no le muestra a uno lo que ganaron
  // los otros 39 (minimización, Ley 1581 art. 4 lit. c).
  wallet: walletEvm,
});

export type ComprobanteInput = z.infer<typeof comprobanteSchema>;

// Query del seguimiento SSE. Va acá y no en el router porque es contrato
// público igual que el resto: un cliente necesita saber qué puede mandar.
export const seguimientoQuerySchema = z.object({
  txHash: txHashEvm,
  red: z.string().default("base"),
  token: z.string().default("USDC"),
  // `coerce` porque en una query todo llega como string.
  confirmaciones: z.coerce.number().int().min(1).max(5).default(2),
});

export type SeguimientoQuery = z.infer<typeof seguimientoQuerySchema>;

/** Contra qué clase de evidencia se comprueba una línea. */
export type TipoPrueba =
  | "onchain_transfer"
  | "snapshot_tasa"
  | "catalogo_legal"
  | "firma_ed25519";

export interface Prueba {
  tipo: TipoPrueba;
  /** Lo que hay que comprobar: un txHash, un sha256, un publicKeyId. */
  referencia: string;
  /** Dónde se comprueba SIN pedirnos permiso ni confiar en esta respuesta. */
  verificarEn: string;
  /** Qué queda demostrado si la comprobación pasa. En español, para el titular. */
  demuestra: string;
}

export interface LineaComprobante {
  clave: string;
  concepto: string;
  /** String, no number: preserva la precisión y no deja ambigua la unidad. */
  valor: string;
  unidad: "COP" | "USDC" | "TRM" | "sha256" | "fecha" | "direccion";
  prueba: Prueba;
}

export interface PagoConfirmado {
  red: string;
  chainId: number;
  tokenAddress: string;
  txHash: string;
  bloque: string;
  /** Quién pagó, leído del log Transfer — no de lo que alguien declaró. */
  desdeWallet: string;
  haciaWallet: string;
  unidades: string;
  montoUsdc: number;
}

/** Prueba de que el comprobante desciende de un lote auténtico y no de un
 *  JSON inventado: se conserva la firma del lote origen, verificable aparte. */
export interface CadenaDeCustodia {
  loteGeneradoEn: string;
  loteFirmaValor: string;
  lotePublicKeyId: string;
  loteExpiraEn: string;
}

export interface ComprobanteOutput {
  version: "1";
  tipo: "constancia_pago_verificable";
  emitidoEn: string;
  /** El límite jurídico, embebido en el documento. Ver NATURALEZA_JURIDICA. */
  naturalezaJuridica: string;
  beneficiario: { wallet: string; externalId: string };
  pago: PagoConfirmado;
  /** Cada línea con su prueba. El corazón del documento. */
  lineas: LineaComprobante[];
  disclaimer: string;
  habeasData: HabeasDataConstancia;
  reglasHash: string;
  reglasVerificadasAl: string;
  cadenaDeCustodia: CadenaDeCustodia;
  /** Cómo verificar ESTE documento (no el lote) sin el servidor prendido. */
  comoVerificar: string[];
  signature: FirmaOutput;
}

// Se declara acá y no dentro del servicio para que sea citable desde los
// tests: si alguien afloja este texto, un test lo tiene que ver.
export const NATURALEZA_JURIDICA =
  "Constancia privada de pago con verificación criptográfica. Acredita que una " +
  "transferencia ocurrió en la red indicada y que el monto se derivó de una tasa y " +
  "un catálogo legal identificables. NO es documento soporte de pago de nómina " +
  "electrónica (DIAN Res. 000013 de 2021) ni documento soporte en adquisiciones a no " +
  "obligados a facturar (DIAN Res. 000167 de 2021), y no sustituye la factura ni las " +
  "obligaciones de facturación electrónica de las partes.";
