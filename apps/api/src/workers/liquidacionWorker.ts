// Worker de liquidación asíncrona (SDD §15, escalabilidad enterprise).
// Consume `liquidar-nomina` desde pg-boss y procesa el periodo en lotes de
// TAMANO_LOTE empleados, cada lote en su propia transacción envuelta en
// `conAuditoria(usuarioId, ...)` — así una empresa con 1000+ colaboradores
// no dispara una única transacción gigante que arriesga timeout o bloquea
// el Event Loop.
//
// Diseño de reintentos: si el proceso muere a mitad del periodo, un reintento
// del job vuelve a arrancar desde el principio Y descarta a los empleados
// que YA tienen ReciboPago (`empleadosPendientes` filtra por eso). Esto
// evita `@@unique` violations en (periodoId, empleadoId) y hace que el
// avance de lotes previos NO se pierda.
//
// Estado terminal:
//   - 0 rechazos → `liquidado`
//   - ≥1 rechazo → `liquidado_con_rechazos` con `erroresLiquidacion` poblado
//   - excepción no-QA → `fallido` con `{ mensaje, contexto }`
import type { PgBoss } from "pg-boss";
import { crearResolutorReglas } from "@pv/reglas";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { conAuditoria } from "../lib/auditoria.js";
import { obtenerReglasYFestivos } from "../services/nominaService.js";
import {
  calcularReciboLote,
  calcularRecibosContratistas,
  type RechazoQA,
} from "../services/liquidacionCalculo.js";
import { COLA_LIQUIDACION, type DatosJobLiquidacion } from "../lib/boss.js";
import { registrarEvidenciaCierre } from "../services/evidenciaCierreService.js";
import { registro } from "../lib/registro.js";

// Tamaño de lote configurable por env — benchmark en periodos de 600
// empleados (dev, jul 2026) mostró que 50 es óptimo (ver §13). Valores
// muy chicos multiplican el overhead de transacción/auditoría; muy
// grandes acercan la latencia del progreso a la del "todo o nada" antiguo.
const TAMANO_LOTE = Number(process.env.LOTE_LIQUIDACION) || 50;

async function actualizarProgreso(periodoId: number, progreso: number): Promise<void> {
  // Sin `version` a propósito: solo el job dueño del jobId escribe mientras
  // estado='liquidando' (protegido por el propio guard del pipeline). Evita
  // conflictos falsos cuando el update de progreso corre en paralelo a una
  // lectura del usuario que hace polling.
  await prisma.periodoNomina.update({ where: { id: periodoId }, data: { progreso } });
}

async function marcarTerminal(
  periodoId: number,
  versionAlEncolar: number,
  estado: "liquidado" | "liquidado_con_rechazos" | "fallido",
  erroresLiquidacion: Prisma.InputJsonValue | null,
  usuarioId: string | null
): Promise<void> {
  // Sí usa `version`: la transición final protege contra un `revertirABorrador`
  // que hubiera corrido en paralelo (aunque el guard `estado==='liquidando'`
  // ya lo debería impedir aguas arriba, mejor tener la doble red).
  await conAuditoria(usuarioId, (tx) =>
    tx.periodoNomina.update({
      where: { id: periodoId },
      data: {
        estado,
        progreso: 100,
        erroresLiquidacion: erroresLiquidacion === null ? Prisma.DbNull : erroresLiquidacion,
        version: { increment: 1 },
      },
    })
  );
  // silenciamos la version-al-encolar acá porque el propio estado='liquidando'
  // fue el gate; no queremos que un update de progreso concurrente bumpee
  // version y nos deje colgados con un P2025.
  void versionAlEncolar;
}

/**
 * La evidencia firmada del cierre — lo que la empresa realmente compra, y la
 * unidad que mide `medidorCierres.ts`.
 *
 * **Nunca tumba el cierre.** Si falla —la llave, la base, el ledger de reglas—,
 * el periodo ya quedó liquidado y la empresa ya puede ver sus recibos; lo que
 * se pierde es la evidencia, o sea algo que NO se le va a cobrar. Al revés
 * —tumbar una nómina ya calculada porque el medidor tuvo un mal día— sería
 * inaceptable.
 */
async function registrarEvidencia(
  empresaId: number,
  periodoId: number,
  periodo: { fechaInicio: string; fechaFin: string },
  estadoCierre: "liquidado" | "liquidado_con_rechazos"
): Promise<void> {
  try {
    // Cuántos quedaron con recibo de verdad. En `liquidado_con_rechazos` es
    // menos que la nómina: no se produce evidencia de quien QA rechazó, y por
    // lo tanto tampoco se cobra por él.
    const conEvidencia = await prisma.reciboPago.count({
      where: { periodoId, periodo: { empresaId } },
    });
    await registrarEvidenciaCierre(prisma, {
      empresaId,
      periodoId,
      fechaInicio: periodo.fechaInicio,
      fechaFin: periodo.fechaFin,
      estadoCierre,
      conEvidencia,
    });
  } catch (err) {
    registro.error(
      "liquidacionWorker",
      "cierre liquidado SIN evidencia firmada: no se factura este cierre",
      err,
      { periodoId, empresaId }
    );
  }
}

export async function ejecutarJobLiquidacion(datos: DatosJobLiquidacion): Promise<void> {
  const { empresaId, periodoId, usuarioId } = datos;

  const periodo = await prisma.periodoNomina.findFirst({ where: { id: periodoId, empresaId } });
  if (!periodo) throw new Error(`Periodo ${periodoId} no encontrado para empresa ${empresaId}`);
  if (periodo.estado !== "liquidando") {
    // El productor ya lo movió a 'liquidando' antes de encolar. Si al ejecutar
    // no está ahí (p. ej. revertido a borrador manualmente), no reprocesamos.
    console.warn(`[liquidacionWorker] periodo ${periodoId} en estado ${periodo.estado} — se omite`);
    return;
  }

  try {
    const [empleadosDelPeriodo, contratistas, turnos, { reglas, festivos }, recibosExistentes] =
      await Promise.all([
        prisma.empleado.findMany({
          where: {
            empresaId,
            activo: true,
            eliminadoEn: null,
            periodosIncluido: { some: { periodoId } },
          },
        }),
        prisma.contratista.findMany({ where: { empresaId, activo: true } }),
        prisma.turno.findMany({ where: { periodoId, periodo: { empresaId } } }),
        obtenerReglasYFestivos(),
        prisma.reciboPago.findMany({
          where: { periodoId, periodo: { empresaId } },
          select: { empleadoId: true, contratistaId: true },
        }),
      ]);

    const resolutor = crearResolutorReglas(reglas);

    // Idempotencia: si el job se reintentó, ignoramos a quienes ya tienen recibo.
    const empleadosYaLiquidados = new Set(recibosExistentes.map((r) => r.empleadoId).filter((v): v is number => v !== null));
    const contratistasYaLiquidados = new Set(recibosExistentes.map((r) => r.contratistaId).filter((v): v is number => v !== null));

    const empleadosPendientes = empleadosDelPeriodo.filter((e) => !empleadosYaLiquidados.has(e.id));
    const contratistasPendientes = contratistas.filter((c) => !contratistasYaLiquidados.has(c.id));

    const totalPendiente = empleadosPendientes.length + contratistasPendientes.length;
    if (totalPendiente === 0) {
      // Todo ya estaba hecho — solo cerramos el estado según haya o no rechazos
      // previos. En este path lo tratamos como 'liquidado' (limpio) porque los
      // rechazos ya se persistieron en el intento anterior en erroresLiquidacion.
      const errores = periodo.erroresLiquidacion as unknown as RechazoQA[] | null;
      const estadoFinal = errores && Array.isArray(errores) && errores.length > 0
        ? "liquidado_con_rechazos"
        : "liquidado";
      await marcarTerminal(periodoId, periodo.version, estadoFinal, errores as Prisma.InputJsonValue | null, usuarioId);
      // Este camino tambien CIERRA, asi que tambien deja evidencia: pasa cuando
      // un intento anterior alcanzo a crear los recibos y murio antes de marcar
      // terminal. Sin esto, ese cierre quedaria sin nada que facturar.
      await registrarEvidencia(empresaId, periodoId, periodo, estadoFinal);
      return;
    }

    const rechazosAcumulados: RechazoQA[] = Array.isArray(periodo.erroresLiquidacion)
      ? [...(periodo.erroresLiquidacion as unknown as RechazoQA[])]
      : [];

    let procesados = 0;
    // Procesa empleados por lotes: cada lote es una transacción independiente
    // envuelta en conAuditoria — un fallo en el lote N no revierte los lotes
    // 1..N-1 (esa es la ganancia real de partirlo).
    for (let i = 0; i < empleadosPendientes.length; i += TAMANO_LOTE) {
      const lote = empleadosPendientes.slice(i, i + TAMANO_LOTE);
      const { recibos, rechazos } = calcularReciboLote(
        periodoId,
        { fechaInicio: periodo.fechaInicio, fechaFin: periodo.fechaFin },
        lote.map((e) => ({
          id: e.id,
          nombre: e.nombre,
          salarioBase: e.salarioBase,
          auxilioTransporte: e.auxilioTransporte,
          tipoNomina: e.tipoNomina,
          tipoContrato: e.tipoContrato,
        })),
        turnos,
        reglas,
        festivos,
        resolutor
      );

      if (recibos.length > 0) {
        await conAuditoria(usuarioId, (tx) => tx.reciboPago.createMany({ data: recibos }));
      }
      rechazosAcumulados.push(...rechazos);
      procesados += lote.length;
      const progreso = Math.floor((procesados / totalPendiente) * 100);
      await actualizarProgreso(periodoId, progreso);
    }

    // Contratistas: un solo "lote" al final (no pasan por gate de QA).
    if (contratistasPendientes.length > 0) {
      const recibos = calcularRecibosContratistas(
        periodoId,
        { fechaInicio: periodo.fechaInicio, fechaFin: periodo.fechaFin },
        contratistasPendientes.map((c) => ({ id: c.id, honorariosMensuales: c.honorariosMensuales })),
        reglas,
        festivos
      );
      await conAuditoria(usuarioId, (tx) => tx.reciboPago.createMany({ data: recibos }));
    }

    const estadoFinal = rechazosAcumulados.length > 0 ? "liquidado_con_rechazos" : "liquidado";
    const errores = rechazosAcumulados.length > 0
      ? (rechazosAcumulados as unknown as Prisma.InputJsonValue)
      : null;
    await marcarTerminal(periodoId, periodo.version, estadoFinal, errores, usuarioId);

    await registrarEvidencia(empresaId, periodoId, periodo, estadoFinal);
  } catch (err) {
    // Cualquier excepción no-QA (DB caída, dato inválido inesperado) deja el
    // periodo en `fallido` con detalle en erroresLiquidacion. Los recibos ya
    // persistidos en lotes previos NO se borran — pueden usarse como base al
    // reintentar.
    const mensaje = err instanceof Error ? err.message : String(err);
    const contexto = err instanceof Error ? err.stack?.split("\n")[1]?.trim() : undefined;
    await conAuditoria(usuarioId, (tx) =>
      tx.periodoNomina.update({
        where: { id: periodoId },
        data: {
          estado: "fallido",
          erroresLiquidacion: { mensaje, contexto } as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      })
    );
    throw err; // pg-boss registra el fallo del job para observabilidad.
  }
}

export async function registrarWorkerLiquidacion(boss: PgBoss): Promise<void> {
  // batchSize=1 y teamSize=1: procesamos un periodo a la vez por proceso.
  // Escalar horizontalmente = correr más procesos (Docker replicas), no más
  // handlers concurrentes en el mismo proceso — evita duplicar la carga del
  // Event Loop en un solo Node.
  await boss.createQueue(COLA_LIQUIDACION);
  await boss.work<DatosJobLiquidacion>(
    COLA_LIQUIDACION,
    async (jobs: Array<{ data: DatosJobLiquidacion }>) => {
      for (const job of jobs) {
        await ejecutarJobLiquidacion(job.data);
      }
    }
  );
  console.log(`[pg-boss] Worker registrado en cola "${COLA_LIQUIDACION}"`);
}
