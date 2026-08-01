// CSV export del wrapper stateless (RUMBO §2.1: "JSON+CSV out sin persistir").
// Formato plano: una fila por línea de recibo, con la fila del recibo
// duplicando totales por línea para que un contador lo abra en Excel/Google
// Sheets y filtre por externalId sin tocar SQL. El disclaimer + fecha
// verificada + hash del catálogo van como comentarios `#` al inicio para que
// no se pierdan al pegar el CSV en un correo o adjuntar a una liquidación.
import type { BatchLiquidarOutput } from "../validation/batchPublico.js";
import type { BatchRetencionOutput } from "../validation/batchRetencion.js";
import type { BatchPagoOnchainOutput } from "../validation/batchPagoOnchain.js";
import type { BatchVerificacionOutput } from "../validation/batchVerificacion.js";
import type { BatchLiquidacionFinalOutput } from "../validation/batchLiquidacionFinal.js";

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
    `# signature_algo: ${salida.signature.algo}`,
    `# signature_public_key_id: ${salida.signature.publicKeyId}`,
    `# signature_value: ${salida.signature.valor}`,
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

// ── Retención en la fuente (listing 6) ──────────────────────────────────────
// Una fila por persona: parámetros derivados de la depuración + la retención
// mensual. Mismo patrón de cabecera `#` con hash/disclaimer/firma para que el
// contador lo abra en Excel sin perder la trazabilidad legal.
export function batchRetencionToCsv(salida: BatchRetencionOutput): string {
  const cabecera = [
    `# NomiCheck retención batch export — version ${salida.version}`,
    `# generado_en: ${salida.generadoEn}`,
    `# reglas_verificadas_al: ${salida.reglasVerificadasAl}`,
    `# reglas_hash: ${salida.reglasHash}`,
    `# habeas_data: ${salida.habeasData.norma}`,
    `# signature_algo: ${salida.signature.algo}`,
    `# signature_public_key_id: ${salida.signature.publicKeyId}`,
    `# signature_value: ${salida.signature.valor}`,
    `# disclaimer: ${salida.disclaimer}`,
  ].join("\n");

  const columnas = [
    "external_id",
    "ingreso_laboral_mensual",
    "ingreso_no_constitutivo",
    "deduccion_dependientes",
    "deduccion_medicina_prepagada",
    "renta_exenta_afc_pension",
    "renta_exenta_laboral",
    "total_exento_deducible",
    "base_gravable",
    "base_gravable_uvt",
    "retencion_mensual",
    "referencia_legal",
  ];

  const filas: string[] = [columnas.join(",")];
  for (const r of salida.resultados) {
    filas.push(
      [
        r.externalId,
        r.ingresoLaboralMensual,
        r.ingresoNoConstitutivo,
        r.deduccionDependientes,
        r.deduccionMedicinaPrepagada,
        r.rentaExentaAfcYPension,
        r.rentaExentaLaboral,
        r.totalExentoYDeducible,
        r.baseGravable,
        r.baseGravableUvt,
        r.retencionMensual,
        r.referenciaLegal,
      ]
        .map(escaparCampo)
        .join(",")
    );
  }
  return `${cabecera}\n${filas.join("\n")}\n`;
}

// ── Pago on-chain (listing 8b) ──────────────────────────────────────────────
// Una fila por item pagable + la tasa/hash en la cabecera. El `linkEip681` va
// en su columna para que el empleador lo copie a la wallet; el Safe batch JSON
// NO cabe en CSV (es un objeto anidado) — se obtiene del endpoint JSON.
export function batchPagoOnchainToCsv(salida: BatchPagoOnchainOutput): string {
  const cabecera = [
    `# NomiCheck pago on-chain batch export — version ${salida.version}`,
    `# generado_en: ${salida.generadoEn}`,
    `# reglas_verificadas_al: ${salida.reglasVerificadasAl}`,
    `# reglas_hash: ${salida.reglasHash}`,
    `# red: ${salida.red} (chainId ${salida.chainId})`,
    `# token: ${salida.token} @ ${salida.tokenAddress}`,
    `# tasa_trm: ${salida.tasaSnapshot.trm} COP/USD (vigencia ${salida.tasaSnapshot.fechaTrm})`,
    `# tasa_efectiva: ${salida.tasaSnapshot.tasaEfectiva} (prima ${salida.tasaSnapshot.primaPct})`,
    `# tasa_hash: ${salida.tasaSnapshot.hash}`,
    `# expira_en: ${salida.expiraEn}`,
    `# total_cop: ${salida.totalCop} — total_usdc: ${salida.totalUsdc}`,
    `# excluidos_sin_wallet: ${salida.excluidosSinWallet.join("; ")}`,
    `# habeas_data: ${salida.habeasData.norma}`,
    `# signature_algo: ${salida.signature.algo}`,
    `# signature_public_key_id: ${salida.signature.publicKeyId}`,
    `# signature_value: ${salida.signature.valor}`,
    `# disclaimer: ${salida.disclaimer}`,
  ].join("\n");

  const columnas = ["external_id", "destino_wallet", "monto_cop", "monto_usdc", "link_eip681"];
  const filas: string[] = [columnas.join(",")];
  for (const i of salida.items) {
    filas.push(
      [i.externalId, i.destinoWallet, i.montoCop, i.montoUsdc, i.linkEip681].map(escaparCampo).join(",")
    );
  }
  return `${cabecera}\n${filas.join("\n")}\n`;
}

// ── Verificación de comprobante (listing 5) ────────────────────────────────
// Una fila por línea verificada (declarada vs calculada) por comprobante —
// incluye las líneas sintéticas "faltante_en_comprobante" y las extralegales
// sin cálculo, para que el contador vea el detalle completo en Excel.
export function batchVerificacionToCsv(salida: BatchVerificacionOutput): string {
  const cabecera = [
    `# NomiCheck verificación batch export — version ${salida.version}`,
    `# generado_en: ${salida.generadoEn}`,
    `# reglas_verificadas_al: ${salida.reglasVerificadasAl}`,
    `# reglas_hash: ${salida.reglasHash}`,
    `# habeas_data: ${salida.habeasData.norma}`,
    `# signature_algo: ${salida.signature.algo}`,
    `# signature_public_key_id: ${salida.signature.publicKeyId}`,
    `# signature_value: ${salida.signature.valor}`,
    `# disclaimer: ${salida.disclaimer}`,
  ].join("\n");

  const columnas = [
    "external_id",
    "veredicto_comprobante",
    "delta_neto_estimado",
    "clave_concepto",
    "nombre_declarado",
    "valor_declarado",
    "valor_calculado",
    "delta",
    "impacto_neto",
    "veredicto_linea",
    "referencia_legal",
  ];

  const filas: string[] = [columnas.join(",")];
  for (const r of salida.resultados) {
    for (const l of r.lineas) {
      filas.push(
        [
          r.externalId,
          r.veredicto,
          r.deltaNetoEstimado,
          l.claveConcepto,
          l.nombreDeclarado,
          l.valorDeclarado,
          l.valorCalculado,
          l.delta,
          l.impactoNeto,
          l.veredicto,
          l.referenciaLegal ?? "",
        ]
          .map(escaparCampo)
          .join(",")
      );
    }
  }
  return `${cabecera}\n${filas.join("\n")}\n`;
}

// ── Liquidación final ───────────────────────────────────────────────────────
// Una fila por LÍNEA de liquidación, no por empleado: es el formato que un
// contador pega junto a su planilla y cuadra concepto por concepto. El total
// se repite en cada fila del mismo empleado para poder filtrar por externalId
// sin perderlo. Los supuestos van al final, como comentarios `#`: son la
// diferencia entre una cifra y una cifra que sabes sobre qué se construyó.
export function batchLiquidacionFinalToCsv(salida: BatchLiquidacionFinalOutput): string {
  const cabecera = [
    `# NomiCheck liquidación final batch export — version ${salida.version}`,
    `# empresa: ${salida.empresa.nombre} (NIT ${salida.empresa.nit})`,
    `# generado_en: ${salida.generadoEn}`,
    `# reglas_verificadas_al: ${salida.reglasVerificadasAl}`,
    `# reglas_hash: ${salida.reglasHash}`,
    `# habeas_data: ${salida.habeasData.norma}`,
    `# signature_algo: ${salida.signature.algo}`,
    `# signature_public_key_id: ${salida.signature.publicKeyId}`,
    `# signature_value: ${salida.signature.valor}`,
    `# disclaimer: ${salida.disclaimer}`,
  ].join("\n");

  const columnas = [
    "external_id",
    "nombre",
    "documento",
    "fecha_ingreso",
    "fecha_retiro",
    "codigo",
    "concepto",
    "valor",
    "ley",
    "total_liquidacion",
  ];

  const filas: string[] = [columnas.join(",")];
  for (const r of salida.resultados) {
    for (const l of r.lineas) {
      filas.push(
        [
          r.externalId,
          r.nombre,
          r.documento,
          r.fechaIngreso,
          r.fechaRetiro,
          l.codigo,
          l.concepto,
          l.valorCalculado,
          l.ley,
          r.total,
        ]
          .map(escaparCampo)
          .join(",")
      );
    }
  }

  const notas: string[] = [];
  for (const r of salida.resultados) {
    for (const s of r.supuestos) notas.push(`# supuesto [${r.externalId}]: ${s}`);
    for (const a of r.advertencias) notas.push(`# advertencia [${r.externalId}]: ${a}`);
    // En un CSV la línea ausente es todavía más ambigua que en JSON: no hay
    // fila, así que nada distingue "no se pidió" de "dio cero".
    for (const n of r.noSolicitado) notas.push(`# no_calculado [${r.externalId}] ${n.codigo}: ${n.motivo}`);
  }

  return `${cabecera}\n${filas.join("\n")}\n${notas.length ? notas.join("\n") + "\n" : ""}`;
}
