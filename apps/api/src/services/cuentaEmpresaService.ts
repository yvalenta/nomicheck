// El estado de cuenta de una empresa: qué se le va a cobrar este mes, y por qué.
//
// ── Por qué existe antes que la factura ────────────────────────────────────
//
// Un cobro que aparece sin haberse podido anticipar es una disputa. Esto es lo
// que la empresa puede mirar **cuando quiera**, con el mismo cálculo que va a
// producir el monto — no una aproximación pensada para tranquilizar.
//
// Y dice también lo que NO se cobra y por qué: un descuento sin explicación
// genera exactamente la misma llamada que un cobro de más.
import type { ClienteAcotado } from "../lib/alcance.js";
import { medirCierre } from "./evidenciaCierreService.js";
import { BANDAS, mesColombiano, resumirMes, type ResumenMes } from "./medidorCierres.js";

export interface EstadoCuenta extends ResumenMes {
  empresaId: number;
  /** La tabla completa, para que la empresa vea dónde cae y qué sigue. Sale del
   *  mismo sitio con el que se calcula el monto: no hay una segunda copia. */
  bandas: typeof BANDAS;
  detalle: {
    periodoId: number;
    fechaInicio: string;
    fechaFin: string;
    estadoCierre: string;
    conEvidencia: number;
    cerradoEn: string;
    firmaValida: boolean;
  }[];
}

/** El mes corriente en Colombia, que es el que se muestra por defecto. */
export function mesCorriente(ahora: Date = new Date()): string {
  return mesColombiano(ahora);
}

export async function obtenerEstadoCuenta(
  prisma: ClienteAcotado,
  empresaId: number,
  mes: string
): Promise<EstadoCuenta> {
  const filas = await prisma.evidenciaCierre.findMany({
    where: { empresaId, mes },
    orderBy: { creadoEn: "asc" },
  });

  // La firma se VERIFICA acá, contra el payload guardado. No se lee un campo
  // `valida` de la fila: una columna que dice de sí misma que es válida no
  // prueba nada, y este es justamente el producto que vende lo contrario.
  const medidos = filas.map((f) =>
    medirCierre({
      periodoId: f.periodoId,
      conEvidencia: f.conEvidencia,
      payload: f.payload,
      firma: f.firma,
    })
  );
  const resumen = resumirMes(mes, medidos);

  const detalle = filas.map((f, i) => {
    const p = (f.payload ?? {}) as Record<string, unknown>;
    return {
      periodoId: f.periodoId,
      fechaInicio: String(p.fechaInicio ?? ""),
      fechaFin: String(p.fechaFin ?? ""),
      estadoCierre: f.estadoCierre,
      conEvidencia: f.conEvidencia,
      cerradoEn: f.creadoEn.toISOString(),
      firmaValida: medidos[i].firmaValida,
    };
  });

  return { ...resumen, empresaId, bandas: BANDAS, detalle };
}
