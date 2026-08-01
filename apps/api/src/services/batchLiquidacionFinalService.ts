// Pipeline stateless del wrapper de LIQUIDACIÓN FINAL. Reusa
// `calcularLiquidacionFinal` de `@pv/reglas` sin persistir nada: entra
// `BatchLiquidacionFinalInput`, sale `BatchLiquidacionFinalOutput` firmado.
//
// Lo que agrega sobre el cálculo puro es el SOBRE verificable — reglasHash,
// fecha de verificación, disclaimer embebido, constancia habeas data y firma
// Ed25519 —, que es lo que un buyer del marketplace puede citar y auditar
// (RUMBO §2.4). El motor no cambia; cambia quién puede probar qué produjo.
import { calcularLiquidacionFinal, crearResolutorReglas, reglaEn } from "@pv/reglas";
import type { DatosIndemnizacion } from "@pv/reglas";
import { obtenerReglasYFestivos } from "./nominaService.js";
import { hashCatalogo, REGLAS_VERIFICADAS_AL } from "./reglasVerificadasService.js";
import { firmarPayload } from "./batchSignatureService.js";
import { construirHabeasData } from "./batchPublicoService.js";
import type {
  BatchLiquidacionFinalInput,
  BatchLiquidacionFinalOutput,
  ResultadoLiquidacionBatch,
} from "../validation/batchLiquidacionFinal.js";

const DISCLAIMER =
  "Liquidación final de contrato de trabajo (CST art. 249, 306 y 186; Ley 52 de 1975, art. 1; " +
  "indemnización CST art. 64), determinística, basada en la normativa laboral colombiana vigente al " +
  REGLAS_VERIFICADAS_AL +
  ". Calcula las prestaciones pendientes a partir del historial de cortes DECLARADO por quien llama: " +
  "si no se informa hasta cuándo se pagó cada concepto, se liquida desde la fecha de ingreso y el " +
  "supuesto se declara en `supuestos`. NO sustituye la liquidación oficial del empleador ni " +
  "constituye asesoría laboral o dictamen contable (Ley 43/1990). NomiCheck no persiste los datos " +
  "de este batch (Ley 1581/2012 habeas data).";

export async function ejecutarBatchLiquidacionFinal(
  input: BatchLiquidacionFinalInput
): Promise<BatchLiquidacionFinalOutput> {
  const { reglas, festivos } = await obtenerReglasYFestivos();
  const resolutor = crearResolutorReglas(reglas);
  const reglasHash = hashCatalogo(reglas, festivos);

  const resultados: ResultadoLiquidacionBatch[] = input.empleados.map((e) => {
    // El auxilio se resuelve del catálogo A LA FECHA DE RETIRO, no de hoy: una
    // liquidación de 2024 lleva el auxilio de 2024. Es justo lo que las filas
    // históricas del catálogo existen para permitir.
    const auxilioTransporte = e.auxilioTransporte
      ? reglaEn(reglas, "auxilio_transporte", e.fechaRetiro)
      : undefined;

    // La indemnización se arma con los datos del propio empleado — el
    // comprador no los repite, así que no pueden contradecirse.
    let indemnizacion: DatosIndemnizacion | undefined;
    if (e.indemnizacion) {
      const comun = {
        salarioMensual: e.salarioBase,
        fechaTerminacion: e.fechaRetiro,
        conJustaCausa: e.indemnizacion.conJustaCausa,
        enPeriodoPrueba: e.indemnizacion.enPeriodoPrueba,
      };
      indemnizacion =
        e.indemnizacion.tipoContrato === "fijo" || e.indemnizacion.tipoContrato === "obra_labor"
          ? {
              ...comun,
              tipoContrato: e.indemnizacion.tipoContrato,
              // El schema ya garantiza que está, salvo en los casos que
              // resuelven en $0 sin mirarla (prueba / justa causa).
              fechaVencimientoPactada: e.indemnizacion.fechaVencimientoPactada ?? e.fechaRetiro,
            }
          : { ...comun, tipoContrato: e.indemnizacion.tipoContrato, fechaIngreso: e.fechaIngreso };
    }

    const r = calcularLiquidacionFinal(
      {
        fechaIngreso: e.fechaIngreso,
        fechaRetiro: e.fechaRetiro,
        salarioBase: e.salarioBase,
        devengosVariables: e.devengosVariables,
        devengosSuplementarios: e.devengosSuplementarios,
        auxilioTransporte,
        cortePrima: e.cortePrima,
        corteCesantias: e.corteCesantias,
        diasVacacionesTomados: e.diasVacacionesTomados,
        diasSuspension: e.diasSuspension,
        indemnizacion,
      },
      resolutor
    );

    return {
      externalId: e.externalId,
      nombre: e.nombre,
      documento: e.documento,
      fechaIngreso: e.fechaIngreso,
      fechaRetiro: e.fechaRetiro,
      lineas: r.lineas.map((l) => ({
        codigo: l.codigo,
        concepto: l.concepto,
        valorCalculado: l.valorCalculado,
        ley: l.ley,
      })),
      total: r.total,
      supuestos: r.supuestos,
      advertencias: r.advertencias,
      // Decir en la respuesta lo que el schema ya dice en su descripción: la
      // línea ausente no es una línea en cero. Quien lee esto puede ser un
      // agente que no escribió el request.
      noSolicitado: e.indemnizacion
        ? []
        : [
            {
              codigo: "INDEMNIZACION_DESPIDO",
              motivo:
                "No se envió el bloque `indemnizacion`, así que no se calculó. La ausencia de " +
                "esta línea NO significa que la indemnización sea cero: significa que no se pidió.",
            },
          ],
    };
  });

  const sinFirma = {
    version: "1" as const,
    generadoEn: new Date().toISOString(),
    reglasVerificadasAl: REGLAS_VERIFICADAS_AL,
    reglasHash,
    disclaimer: DISCLAIMER,
    habeasData: construirHabeasData(),
    // Spread condicional: si no se declaró, la clave NO EXISTE en la salida.
    // Poner `null` o un texto de relleno sería firmar un dato que nadie dio.
    ...(input.empresa
      ? { empresa: { nombre: input.empresa.nombre, nit: input.empresa.nit } }
      : {}),
    resultados,
  };
  return { ...sinFirma, signature: firmarPayload(sinFirma) };
}

export { DISCLAIMER as DISCLAIMER_LIQUIDACION_FINAL };
