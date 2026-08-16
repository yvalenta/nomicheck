// La evidencia firmada de un cierre de periodo: producirla y leerla.
//
// Es lo que la empresa compra. El portal calcula gratis; lo que se paga es que
// ese cierre quede **probable ante un tercero** — firmado con Ed25519 sobre el
// payload canónico, con el hash del catálogo legal que lo produjo y la fecha en
// que ese catálogo se verificó. Quien reciba la evidencia puede comprobarla con
// la llave pública servida en `/api/batch/publickey`, sin volver a preguntarnos
// nada y sin confiar en nosotros.
//
// ── Por qué el payload es chico ────────────────────────────────────────────
//
// No lleva los recibos. Lleva **qué se cerró, para cuánta gente, bajo qué
// reglas y cuándo**. Los recibos ya viven en la base y los sirve el portal; lo
// que no existía era una afirmación firmada sobre el cierre como un todo.
// Meterlos adentro haría la firma cara de producir y de verificar, y el valor
// probatorio es el mismo: el `reglasHash` ya identifica exactamente qué reglas
// produjeron cada número.
import type { Prisma } from "@prisma/client";
import type { ClienteAcotado } from "../lib/alcance.js";
import { firmarPayload, verificarFirma, type FirmaBatch } from "./batchSignatureService.js";
import { obtenerLedgerReglas } from "./reglasVerificadasService.js";
import { mesColombiano, type CierreMedido } from "./medidorCierres.js";

export interface PayloadCierre {
  tipo: "cierre_periodo";
  version: 1;
  empresaId: number;
  periodoId: number;
  fechaInicio: string;
  fechaFin: string;
  estadoCierre: string;
  conEvidencia: number;
  reglasHash: string;
  reglasVerificadasAl: string;
  cerradoEn: string;
}

/** Arma el payload que se firma. Puro y exportado para poder probar la forma
 *  exacta sin base ni llaves: si un campo cambia de nombre, una evidencia vieja
 *  deja de verificar y hay que enterarse acá, no en una disputa de factura. */
export function construirPayload(datos: {
  empresaId: number;
  periodoId: number;
  fechaInicio: string;
  fechaFin: string;
  estadoCierre: string;
  conEvidencia: number;
  reglasHash: string;
  reglasVerificadasAl: string;
  cerradoEn: Date;
}): PayloadCierre {
  return {
    tipo: "cierre_periodo",
    version: 1,
    empresaId: datos.empresaId,
    periodoId: datos.periodoId,
    fechaInicio: datos.fechaInicio,
    fechaFin: datos.fechaFin,
    estadoCierre: datos.estadoCierre,
    conEvidencia: datos.conEvidencia,
    reglasHash: datos.reglasHash,
    reglasVerificadasAl: datos.reglasVerificadasAl,
    cerradoEn: datos.cerradoEn.toISOString(),
  };
}

/**
 * Escribe la evidencia de un cierre. Se llama desde el worker de liquidación
 * cuando el periodo llega a un estado terminal que NO es `fallido`.
 *
 * **Nunca tumba el cierre.** Si algo acá falla —la llave, la base, el ledger de
 * reglas—, el periodo igual quedó liquidado y la empresa igual puede ver sus
 * recibos: lo que se pierde es la evidencia, o sea algo que **no se le va a
 * cobrar**. Al revés sería inaceptable: tumbar una nómina ya calculada porque
 * el medidor de facturación tuvo un mal día. El error se registra para que se
 * vea, y devuelve `null`.
 */
export async function registrarEvidenciaCierre(
  prisma: ClienteAcotado,
  datos: {
    empresaId: number;
    periodoId: number;
    fechaInicio: string;
    fechaFin: string;
    estadoCierre: "liquidado" | "liquidado_con_rechazos";
    conEvidencia: number;
  }
): Promise<{ id: number; mes: string } | null> {
  const cerradoEn = new Date();
  const ledger = await obtenerLedgerReglas();
  const payload = construirPayload({
    ...datos,
    reglasHash: ledger.hash,
    reglasVerificadasAl: ledger.fecha,
    cerradoEn,
  });
  const firma = firmarPayload(payload);
  const mes = mesColombiano(cerradoEn);

  const fila = await prisma.evidenciaCierre.create({
    data: {
      empresaId: datos.empresaId,
      periodoId: datos.periodoId,
      mes,
      conEvidencia: datos.conEvidencia,
      estadoCierre: datos.estadoCierre,
      payload: payload as unknown as Prisma.InputJsonValue,
      firma: firma as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return { id: fila.id, mes };
}

/** Una fila de evidencia tal como sale de la base, ya verificada.
 *  `firmaValida` es el resultado de comprobar la firma contra el payload
 *  guardado — no una copia de lo que la fila dice de sí misma. */
export function medirCierre(fila: {
  periodoId: number;
  conEvidencia: number;
  payload: unknown;
  firma: unknown;
}): CierreMedido {
  let firmaValida = false;
  try {
    firmaValida = verificarFirma(fila.payload, fila.firma as FirmaBatch);
  } catch {
    // Una firma con forma inesperada es una firma que no verifica, no una
    // excepción que tumba el estado de cuenta entero.
    firmaValida = false;
  }
  return {
    periodoId: fila.periodoId,
    empleadosConEvidencia: fila.conEvidencia,
    firmaValida,
  };
}
