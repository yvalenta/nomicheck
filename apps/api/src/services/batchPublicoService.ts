// Pipeline stateless del wrapper público (RUMBO §3.4 / §2.1). Reusa
// `calcularReciboLote` + `calcularRecibosContratistas` sin persistir nada:
// entra `BatchLiquidarInput`, sale `BatchLiquidarOutput`. Las reglas legales
// se leen del catálogo cacheado (`obtenerReglasYFestivos`) — no es
// multi-tenant, es el mismo set que usa el verificador anónimo.
//
// Purga por diseño (Ley 1581/2012, gap §5.3 de execution_market/docs/04):
// el request se procesa y se descarta. El output NO incluye datos que el
// buyer no envió — externalIds del buyer + resultados del motor.
import { crearResolutorReglas, type LineaResultado } from "@pv/reglas";
import {
  calcularReciboLote,
  calcularRecibosContratistas,
  type EmpleadoLiquidable,
  type ContratistaLiquidable,
  type TurnoLiquidable,
} from "./liquidacionCalculo.js";
import { obtenerReglasYFestivos } from "./nominaService.js";
import type {
  BatchLiquidarInput,
  BatchLiquidarOutput,
  LineaBatch,
  ReciboBatch,
  RechazoBatch,
} from "../validation/batchPublico.js";

// Fecha de última verificación del catálogo legal contra fuentes oficiales.
// El spec humano vive en `sdd/vault/` (fuente de verdad verificable): las
// reglas estables en 01-04 y 06, y TODOS los valores actualizables (SMLMV,
// auxilio, UVT, %-recargos de la transición Ley 2101/2021, tarifas Fondo
// Solidaridad, etc.) en `05_Valores_Actualizables.md` como tabla maestra
// única. El catálogo `ReglaLegal` (Prisma) es la IMPLEMENTACIÓN de ese spec
// — deben coincidir en cada revisión. Actualizar esta fecha cuando se
// revise el vault + se re-siembre el catálogo. Se cita en cada output para
// darle al buyer trazabilidad temporal (RUMBO §2.4).
export const REGLAS_VERIFICADAS_AL = "2026-07-16";

const DISCLAIMER =
  "Cálculo informativo determinístico basado en la legislación laboral colombiana " +
  "vigente al " +
  REGLAS_VERIFICADAS_AL +
  ". NO constituye dictamen contable ni asesoría legal — requiere revisión de " +
  "contador titulado (Ley 43/1990) antes de usarse como liquidación oficial. " +
  "NomiCheck no persiste los datos de este batch (Ley 1581/2012 habeas data).";

function lineaMotorABatch(l: LineaResultado): LineaBatch {
  const salida: LineaBatch = {
    concepto: l.concepto,
    tipo: l.tipo,
    valor: l.valorCalculado,
  };
  if (l.ley !== undefined) salida.referenciaLegal = l.ley;
  if (l.horas !== undefined) salida.horas = l.horas;
  if (l.base !== undefined) salida.base = l.base;
  if (l.recargoPct !== undefined) salida.recargoPct = l.recargoPct;
  return salida;
}

export async function ejecutarBatchPublico(
  input: BatchLiquidarInput
): Promise<BatchLiquidarOutput> {
  const { reglas, festivos } = await obtenerReglasYFestivos();
  const resolutor = crearResolutorReglas(reglas);

  // Asignamos índices internos (id numérico) para reusar el pipeline
  // existente que espera FKs de BD; el mapeo `índice → externalId` se
  // conserva para reconstruir el output con la referencia del buyer.
  const empleadosById = new Map<number, (typeof input.empleados)[number]>();
  const empleadosLiquidables: EmpleadoLiquidable[] = input.empleados.map(
    (e, idx) => {
      const id = idx + 1;
      empleadosById.set(id, e);
      return {
        id,
        nombre: e.nombre,
        salarioBase: e.salarioBase,
        auxilioTransporte: e.auxilioTransporte,
        tipoNomina: e.tipoNomina,
        tipoContrato: e.tipoContrato,
      };
    }
  );

  const externalIdPorEmpleado = new Map<string, number>();
  for (const [id, e] of empleadosById) externalIdPorEmpleado.set(e.externalId, id);

  const turnosLiquidables: TurnoLiquidable[] = input.turnos
    .map((t) => {
      const empleadoId = externalIdPorEmpleado.get(t.empleadoExternalId);
      if (empleadoId === undefined) return null;
      return {
        empleadoId,
        fecha: t.fecha,
        horaInicio: t.horaInicio,
        horaFin: t.horaFin,
      };
    })
    .filter((t): t is TurnoLiquidable => t !== null);

  const contratistasById = new Map<number, (typeof input.contratistas)[number]>();
  const contratistasLiquidables: ContratistaLiquidable[] = input.contratistas.map(
    (c, idx) => {
      const id = idx + 1;
      contratistasById.set(id, c);
      return { id, honorariosMensuales: c.honorariosMensuales };
    }
  );

  const periodoDatos = { fechaInicio: input.periodo.fechaInicio, fechaFin: input.periodo.fechaFin };

  const lote = calcularReciboLote(
    0,
    periodoDatos,
    empleadosLiquidables,
    turnosLiquidables,
    reglas,
    festivos,
    resolutor
  );

  const contratistasRecibos = calcularRecibosContratistas(
    0,
    periodoDatos,
    contratistasLiquidables,
    reglas,
    festivos
  );

  const recibos: ReciboBatch[] = [];

  for (const r of lote.recibos) {
    const original = empleadosById.get(r.empleadoId);
    if (!original) continue;
    const lineas = (r.lineas as unknown as LineaResultado[]).map(lineaMotorABatch);
    const advertencias = (r.advertencias as unknown as string[]) ?? [];
    const recibo: ReciboBatch = {
      externalId: original.externalId,
      nombre: original.nombre,
      documento: original.documento,
      tipo: "empleado",
      lineas,
      advertencias,
      totalDevengado: r.totalDevengado,
      totalDeducido: r.totalDeducido,
      neto: r.neto,
    };
    if (r.qaIssues) recibo.qaIssues = r.qaIssues as unknown[];
    recibos.push(recibo);
  }

  for (const r of contratistasRecibos) {
    const original = contratistasById.get(r.contratistaId);
    if (!original) continue;
    const lineas = (r.lineas as unknown as LineaResultado[]).map(lineaMotorABatch);
    const advertencias = (r.advertencias as unknown as string[]) ?? [];
    recibos.push({
      externalId: original.externalId,
      nombre: original.nombre,
      documento: original.documento,
      tipo: "contratista",
      lineas,
      advertencias,
      totalDevengado: r.totalDevengado,
      totalDeducido: r.totalDeducido,
      neto: r.neto,
    });
  }

  const rechazos: RechazoBatch[] = lote.rechazos.map((rj) => {
    const original = empleadosById.get(rj.empleadoId);
    return {
      externalId: original?.externalId ?? String(rj.empleadoId),
      nombre: rj.nombre,
      documento: original?.documento ?? "",
      issues: rj.issues as unknown[],
    };
  });

  return {
    version: "1",
    generadoEn: new Date().toISOString(),
    reglasVerificadasAl: REGLAS_VERIFICADAS_AL,
    disclaimer: DISCLAIMER,
    empresa: input.empresa,
    periodo: input.periodo,
    recibos,
    rechazos,
  };
}
