// Pipeline stateless del wrapper de RETENCIÓN EN LA FUENTE (listing 6,
// RUMBO §3.4). Reusa `calcularRetencionFuente` de `@pv/reglas` sin persistir
// nada: entra `BatchRetencionInput`, sale `BatchRetencionOutput` firmado.
//
// Es el listing más corto a un order real (execution_market/docs/04 §6): el
// input cabe en texto (parámetros numéricos), el motor ya existe y es
// determinístico, y no hay PII de documentos. Lo que este wrapper agrega
// sobre el endpoint anónimo `/api/retencion/calcular` es el SOBRE
// verificable — reglasHash, fecha de verificación, disclaimer embebido,
// constancia habeas data y firma Ed25519 —, que es lo que un buyer del
// marketplace puede citar y auditar (RUMBO §2.4 / §M).
import { calcularRetencionFuente, crearResolutorReglas } from "@pv/reglas";
import { obtenerReglasYFestivos } from "./nominaService.js";
import { hashCatalogo, REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";
import { firmarPayload } from "./batchSignatureService.js";
import { construirHabeasData } from "./batchPublicoService.js";
import type {
  BatchRetencionInput,
  BatchRetencionOutput,
  ResultadoRetencionBatch,
} from "../validation/batchRetencion.js";

// E.T. art. 383 y 388, tal como en el endpoint anónimo (calculadorasController).
const REFERENCIA_LEGAL = "E.T. art. 383 y 388 (Ley 2277 de 2022, art. 7)";

const DISCLAIMER =
  "Cálculo informativo de retención en la fuente (E.T. art. 383/388), determinístico, " +
  "basado en la normativa tributaria colombiana vigente al " +
  REGLAS_VERIFICADAS_AL +
  ". Estima la retención mensual a partir de los parámetros declarados; NO valida el " +
  "umbral de declarante ni sustituye la depuración oficial que hace el empleador. No " +
  "constituye asesoría tributaria ni dictamen contable (Ley 43/1990). NomiCheck no " +
  "persiste los datos de este batch (Ley 1581/2012 habeas data).";

export async function ejecutarBatchRetencion(
  input: BatchRetencionInput
): Promise<BatchRetencionOutput> {
  const { reglas, festivos } = await obtenerReglasYFestivos();
  const resolutor = crearResolutorReglas(reglas);
  const reglasHash = hashCatalogo(reglas, festivos);
  // El endpoint anónimo usa "hoy" para resolver UVT/reglas vigentes (no hay
  // periodo declarado en retención) — el wrapper conserva esa semántica.
  const hoy = new Date().toISOString().slice(0, 10);

  const resultados: ResultadoRetencionBatch[] = input.personas.map((p) => {
    const r = calcularRetencionFuente(
      {
        ingresoLaboralMensual: p.ingresoLaboralMensual,
        declaraRenta: p.declaraRenta,
        aportesVoluntariosAfc: p.aportesVoluntariosAfc,
        aportesVoluntariosPensionObligatoria: p.aportesVoluntariosPensionObligatoria,
        tieneDependientes: p.tieneDependientes,
        medicinaPrepagadaMensual: p.medicinaPrepagadaMensual,
      },
      resolutor,
      hoy
    );
    return { externalId: p.externalId, ...r, referenciaLegal: REFERENCIA_LEGAL };
  });

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

export { DISCLAIMER as DISCLAIMER_RETENCION };
