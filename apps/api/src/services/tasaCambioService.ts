// Tasa de cambio COP→USD para el pago on-chain (SDD §17). Fuente: TRM
// oficial de la Superintendencia Financiera vía la API pública Socrata de
// datos.gov.co (dataset 32sa-8pi3) — gratuita, sin API key. Se asume
// USDC ≈ USD (paridad del stablecoin; la prima parametrizable en ReglaLegal
// cubre el spread P2P real COP→USDC del mercado colombiano).
//
// El snapshot se congela por lote con un hash sha256 del JSON canónico —
// citable en el export para que cualquiera pueda verificar qué tasa se usó
// (gap 5.2 "trazabilidad" del alcance execution_market).
import { createHash } from "node:crypto";

export interface TasaSnapshot {
  /** TRM oficial COP por USD. */
  trm: number;
  fuente: string;
  /** Fecha de vigencia de la TRM (YYYY-MM-DD). */
  fechaTrm: string;
  /** Prima porcentual sobre la TRM (0.01 = 1%) — de ReglaLegal. */
  primaPct: number;
  /** trm × (1 + primaPct) — la tasa que realmente convierte los netos. */
  tasaEfectiva: number;
  /** Momento de captura del snapshot (ISO). */
  capturadoEn: string;
  /** sha256 de los campos anteriores en JSON canónico. */
  hash: string;
}

const URL_TRM = "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1";

// La TRM cambia una vez por día hábil — cache de 1h es de sobra y evita
// castigar a datos.gov.co en cada lote (misma técnica que cacheReglas de
// nominaService).
const CACHE_TTL_MS = 60 * 60 * 1000;
let cacheTrm: { trm: number; fechaTrm: string; expira: number } | null = null;

export function invalidarCacheTrm(): void {
  cacheTrm = null;
}

async function obtenerTrm(): Promise<{ trm: number; fechaTrm: string }> {
  if (cacheTrm && Date.now() < cacheTrm.expira) {
    return { trm: cacheTrm.trm, fechaTrm: cacheTrm.fechaTrm };
  }
  const res = await fetch(URL_TRM);
  if (!res.ok) {
    throw new Error(`No se pudo obtener la TRM de datos.gov.co (HTTP ${res.status}) — reintenta o revisa conectividad`);
  }
  const filas = (await res.json()) as { valor: string; vigenciadesde: string }[];
  const fila = filas[0];
  if (!fila?.valor) throw new Error("Respuesta de datos.gov.co sin campo valor — el dataset 32sa-8pi3 pudo cambiar de forma");
  const trm = Number(fila.valor);
  if (!Number.isFinite(trm) || trm <= 0) throw new Error(`TRM inválida recibida: ${fila.valor}`);
  const fechaTrm = fila.vigenciadesde.slice(0, 10);
  cacheTrm = { trm, fechaTrm, expira: Date.now() + CACHE_TTL_MS };
  return { trm, fechaTrm };
}

/** Hash determinista del snapshot: mismos insumos → mismo hash. El orden de
 * claves es fijo (JSON canónico manual) para que el hash sea reproducible
 * por un tercero con los mismos datos. */
export function hashSnapshot(datos: Omit<TasaSnapshot, "hash">): string {
  const canonico = JSON.stringify({
    trm: datos.trm,
    fuente: datos.fuente,
    fechaTrm: datos.fechaTrm,
    primaPct: datos.primaPct,
    tasaEfectiva: datos.tasaEfectiva,
    capturadoEn: datos.capturadoEn,
  });
  return createHash("sha256").update(canonico).digest("hex");
}

export async function capturarTasaSnapshot(primaPct: number): Promise<TasaSnapshot> {
  const { trm, fechaTrm } = await obtenerTrm();
  const sinHash: Omit<TasaSnapshot, "hash"> = {
    trm,
    fuente: "TRM oficial — Superintendencia Financiera vía datos.gov.co (32sa-8pi3)",
    fechaTrm,
    primaPct,
    tasaEfectiva: trm * (1 + primaPct),
    capturadoEn: new Date().toISOString(),
  };
  return { ...sinHash, hash: hashSnapshot(sinHash) };
}
