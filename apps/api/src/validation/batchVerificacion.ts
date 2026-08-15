// Contrato de intake/export del wrapper stateless de VERIFICACIÓN DE
// COMPROBANTE (listing 5). CONTRATO PÚBLICO — cambio incompatible sube
// `version`; los aditivos van dentro de v1.
//
// Diseño (docs/03 listing 5, execution_market/docs/04 §5.1): el listing
// original imaginaba recibir el PDF/imagen del comprobante — pero eso
// reintroduce PII de archivo (gap de habeas data ya resuelto en 6/8b con
// intake numérico anónimo). Este wrapper toma el MISMO atajo que 6: el buyer
// (o su OCR/cliente propio) transcribe lo que el comprobante DECLARA como
// líneas {nombre, valor}, sin nombre/documento del empleado — NomiCheck
// recalcula las líneas de ley de forma independiente (mismo motor que
// `/api/nomina/calcular`, modo salario-fijo con `conceptos: []`) y compara.
//
// Cero persistencia: entra JSON, sale JSON. No usa Prisma, no llama IA
// (`noExternalLlm` se respeta trivialmente — el motor es determinístico).
import { z } from "zod";
import { fecha } from "./comunes.js";
import type { FirmaOutput, HabeasDataConstancia } from "./batchPublico.js";

const walletEvm = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Wallet EVM inválida");

const tipoContrato = z
  .enum(["indefinido", "fijo", "obra_labor", "tiempo_parcial", "aprendizaje_sena_lectiva", "aprendizaje_sena_practica"])
  .optional();

// Lo que el comprobante DECLARA en una línea — mismo shape mínimo que
// `conceptoExtraidoSchema` (services/ia/tipos.ts), sin volver a importarlo
// para no acoplar el contrato público a la forma interna del OCR.
const conceptoDeclarado = z.object({
  nombre: z.string().min(1),
  valor: z.number(),
});

const comprobanteInput = z.object({
  externalId: z.string().min(1),
  salarioBasicoMensual: z.number().positive(),
  recibeAuxilioTransporte: z.boolean().default(false),
  periodoDesde: fecha,
  periodoHasta: fecha,
  tipoContrato,
  // Lo que el comprobante dice que se pagó/dedujo — al menos una línea.
  declarado: z.array(conceptoDeclarado).min(1).max(50),
});

export const batchVerificacionSchema = z.object({
  version: z.literal("1"),
  buyer: z.object({
    executorId: z.string().min(1).optional(),
    wallet: walletEvm.optional(),
    noExternalLlm: z.boolean().default(true),
  }),
  comprobantes: z.array(comprobanteInput).min(1).max(500),
});

export type BatchVerificacionInput = z.infer<typeof batchVerificacionSchema>;
export type ComprobanteInput = z.infer<typeof comprobanteInput>;

// Claves canónicas de las ÚNICAS líneas que el motor puede recalcular de
// forma independiente en modo salario-fijo (ver calculadoraSalarioFijo.ts +
// deducciones.ts/auxilio.ts). Cualquier otra línea del comprobante (bonos,
// comisiones, préstamos, embargos) es "no_verificable" — el motor no tiene
// base legal para derivarla sin más contexto del contrato.
export type ClaveConceptoLegal =
  | "salario_basico"
  | "auxilio_transporte"
  | "salud"
  | "pension"
  | "fondo_solidaridad";

export type VeredictoLinea =
  | "correcto"
  | "pagado_de_menos"
  | "pagado_de_mas"
  | "faltante_en_comprobante"
  | "no_verificable_extralegal";

export interface LineaVerificada {
  claveConcepto: ClaveConceptoLegal | "extralegal";
  nombreDeclarado: string;
  valorDeclarado: number;
  /**
   * Lo que la ley manda para esta línea, o **`null` cuando no hay con qué
   * derivarlo** (líneas extralegales: bonos, comisiones).
   *
   * Antes iba `0` en ese caso, y `0` es una afirmación: dice "la ley manda
   * cero". La verdad es "no tengo base legal para saberlo", y quien lee
   * `declarado $500.000 · ley $0` entiende que le pagaron de más. La ausencia
   * de dato es `null`, nunca `0`.
   */
  valorCalculado: number | null;
  /**
   * `valorDeclarado - valorCalculado`, sin ajustar por dirección
   * devengo/deducción. `null` cuando `valorCalculado` lo es: una resta contra
   * lo desconocido no da cero, no da nada.
   */
  delta: number | null;
  /** Efecto neto sobre lo que recibe el trabajador: devengo usa `delta` tal
   * cual, deducción usa `-delta` (deducir de más reduce el neto). */
  impactoNeto: number;
  veredicto: VeredictoLinea;
  referenciaLegal?: string;
}

export interface ResultadoVerificacion {
  externalId: string;
  veredicto: "correcto" | "discrepancias_encontradas";
  /** Suma de `impactoNeto` de las líneas verificables — positivo = a favor
   * del trabajador, negativo = en contra. Excluye líneas no_verificable. */
  deltaNetoEstimado: number;
  lineas: LineaVerificada[];
  advertencias: string[];
}

export interface BatchVerificacionOutput {
  version: "1";
  generadoEn: string;
  reglasVerificadasAl: string;
  reglasHash: string;
  disclaimer: string;
  habeasData: HabeasDataConstancia;
  resultados: ResultadoVerificacion[];
  signature: FirmaOutput;
}
