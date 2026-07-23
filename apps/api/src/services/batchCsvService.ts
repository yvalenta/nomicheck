// CSV export del wrapper stateless (RUMBO §2.1: "JSON+CSV out sin persistir").
// Formato plano: una fila por línea de recibo, con la fila del recibo
// duplicando totales por línea para que un contador lo abra en Excel/Google
// Sheets y filtre por externalId sin tocar SQL. El disclaimer + fecha
// verificada + hash del catálogo van como comentarios `#` al inicio para que
// no se pierdan al pegar el CSV en un correo o adjuntar a una liquidación.
import type { BatchLiquidarOutput } from "../validation/batchPublico.js";

function escaparCampo(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return "";
  const s = typeof v === "number" ? v.toString() : v;
  // RFC 4180: cualquier campo con coma, comilla o salto de línea se
  // encierra entre comillas y las comillas internas se duplican.
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function batchToCsv(salida: BatchLiquidarOutput): string {
  const cabecera = [
    `# NomiCheck batch export — version ${salida.version}`,
    `# generado_en: ${salida.generadoEn}`,
    `# reglas_verificadas_al: ${salida.reglasVerificadasAl}`,
    `# reglas_hash: ${salida.reglasHash}`,
    `# habeas_data: ${salida.habeasData.norma}`,
    `# disclaimer: ${salida.disclaimer}`,
  ].join("\n");

  const columnas = [
    "external_id",
    "tipo",
    "nombre",
    "documento",
    "concepto",
    "tipo_linea",
    "valor",
    "referencia_legal",
    "horas",
    "base",
    "recargo_pct",
    "total_devengado",
    "total_deducido",
    "neto",
  ];

  const filas: string[] = [columnas.join(",")];

  for (const r of salida.recibos) {
    if (r.lineas.length === 0) {
      filas.push(
        [
          r.externalId,
          r.tipo,
          r.nombre,
          r.documento,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          r.totalDevengado,
          r.totalDeducido,
          r.neto,
        ]
          .map(escaparCampo)
          .join(",")
      );
      continue;
    }
    for (const l of r.lineas) {
      filas.push(
        [
          r.externalId,
          r.tipo,
          r.nombre,
          r.documento,
          l.concepto,
          l.tipo,
          l.valor,
          l.referenciaLegal ?? "",
          l.horas ?? "",
          l.base ?? "",
          l.recargoPct ?? "",
          r.totalDevengado,
          r.totalDeducido,
          r.neto,
        ]
          .map(escaparCampo)
          .join(",")
      );
    }
  }

  // Rechazos como bloque separado con marcador `#rechazo` en la columna
  // externa — quedan en el mismo archivo para trazabilidad.
  for (const rj of salida.rechazos) {
    filas.push(
      [
        rj.externalId,
        "#rechazo",
        rj.nombre,
        rj.documento,
        `issues=${rj.issues.length}`,
        "",
        "",
        JSON.stringify(rj.issues),
        "",
        "",
        "",
        "",
        "",
        "",
      ]
        .map(escaparCampo)
        .join(",")
    );
  }

  return `${cabecera}\n${filas.join("\n")}\n`;
}
