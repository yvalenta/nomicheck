// Pipeline stateless del wrapper de VERIFICACIÓN DE COMPROBANTE (listing 5,
// RUMBO §3.4). Para cada comprobante: recalcula las líneas legales de forma
// independiente (mismo motor que `/api/nomina/calcular`, modo salario-fijo
// con `conceptos: []` — así solo salen salario/auxilio/salud/pensión/fondo,
// nada del comprobante se usa como input del cálculo) y compara contra lo
// declarado con `compararComprobante` (verificacionComprobanteService.ts).
//
// Cero persistencia, cero IA: la verificación es determinística.
import { calcularNomina, obtenerReglasYFestivos } from "./nominaService.js";
import { hashCatalogo, REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";
import { firmarPayload } from "./batchSignatureService.js";
import { construirHabeasData } from "./batchPublicoService.js";
import { compararComprobante } from "./verificacionComprobanteService.js";
import type {
  BatchVerificacionInput,
  BatchVerificacionOutput,
  ComprobanteInput,
  ResultadoVerificacion,
} from "../validation/batchVerificacion.js";

const DISCLAIMER =
  "Verificación informativa determinística: recalcula salario básico, auxilio de " +
  "transporte y aportes obligatorios de salud/pensión/fondo de solidaridad de forma " +
  "independiente al comprobante declarado, con la normativa laboral colombiana vigente " +
  "al " +
  REGLAS_VERIFICADAS_AL +
  ". Solo verifica las líneas de origen legal — bonos, comisiones y otros conceptos " +
  "extralegales quedan marcados 'no_verificable_extralegal' porque el motor no tiene " +
  "base legal para derivarlos. NO constituye dictamen contable ni asesoría legal " +
  "(Ley 43/1990). NomiCheck no persiste los datos de este batch (Ley 1581/2012 habeas " +
  "data).";

async function calcularLineasLegales(c: ComprobanteInput) {
  const resultado = await calcularNomina({
    modo: "salario-fijo",
    salarioBasicoMensual: c.salarioBasicoMensual,
    recibeAuxilioTransporte: c.recibeAuxilioTransporte,
    periodoDesde: c.periodoDesde,
    periodoHasta: c.periodoHasta,
    tipoContrato: c.tipoContrato,
    conceptos: [],
  });
  return resultado;
}

export async function ejecutarBatchVerificacion(
  input: BatchVerificacionInput
): Promise<BatchVerificacionOutput> {
  const { reglas, festivos } = await obtenerReglasYFestivos();
  const reglasHash = hashCatalogo(reglas, festivos);

  const resultados: ResultadoVerificacion[] = [];
  for (const c of input.comprobantes) {
    const calculado = await calcularLineasLegales(c);
    const diff = compararComprobante(c.declarado, calculado.lineas);
    resultados.push({
      externalId: c.externalId,
      veredicto: diff.veredicto,
      deltaNetoEstimado: diff.deltaNetoEstimado,
      lineas: diff.lineas,
      advertencias: calculado.advertencias,
    });
  }

  const sinFirma = {
    version: "1" as const,
    generadoEn: new Date().toISOString(),
    reglasVerificadasAl: REGLAS_VERIFICADAS_AL,
    reglasHash,
    disclaimer: DISCLAIMER,
    habeasData: construirHabeasData(),
    resultados,
  };
  return { ...sinFirma, signature: firmarPayload(sinFirma) };
}

/**
 * El resumen del pre-chequeo GRATIS: cuántos comprobantes traen algo y cuánto
 * pesa en neto — jamás qué línea ni qué norma, que es el informe pagado.
 *
 * Corre sobre la salida del MISMO motor que el informe: si esto dice N, el
 * informe encuentra N. Una heurística aparte que divergiera vendería la duda.
 * Y devuelve `reglasHash` a propósito: el teaser no está firmado, pero declara
 * contra qué catálogo se midió, así el que luego paga puede exigir el mismo.
 */
export function resumenPrechequeo(salida: BatchVerificacionOutput) {
  const conDiscrepancias = salida.resultados.filter((c) => c.veredicto !== "correcto").length;
  const deltaNetoTotalEstimado = salida.resultados.reduce(
    (acc, c) => acc + (c.deltaNetoEstimado ?? 0),
    0
  );
  return {
    version: "1" as const,
    generadoEn: salida.generadoEn,
    reglasHash: salida.reglasHash,
    comprobantes: salida.resultados.length,
    conDiscrepancias,
    deltaNetoTotalEstimado,
    detalle:
      "Sin detalle a propósito. El informe línea por línea —qué concepto, cuánto, " +
      "y el artículo que lo rige— con sobre firmado Ed25519 verificable offline, " +
      "es el servicio pagado: POST /api/batch/verificar.",
  };
}

export { DISCLAIMER as DISCLAIMER_VERIFICACION };
