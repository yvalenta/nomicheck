import type { ReglaLegal } from "../types.js";
import { comoResolutor, type ResolutorReglas, diasEntreFechas } from "../utils.js";
import { redondearPeso } from "../numero.js";
import type { CodigoIssueQA, DatosQA, IssueQA, ResultadoQA, SeveridadQA } from "./tipos.js";

export * from "./tipos.js";

// Penalización determinista al score — documentada aquí para que un cambio
// de política sea evidente en el diff. Score final = max(0, 100 − Σ pesos).
const PESO_ERROR = 25;
const PESO_ADVERTENCIA = 5;

function issue(
  codigo: CodigoIssueQA,
  severidad: SeveridadQA,
  mensaje: string,
  referenciaLegal: string,
  valorCalculado: number,
  valorLimite: number,
  contexto?: string
): IssueQA {
  return { codigo, severidad, mensaje, referenciaLegal, detalles: { valorCalculado, valorLimite, contexto } };
}

/** Factor del periodo respecto a un mes calendario, para prorratear límites
 * mensuales (SMLMV, tope IBC). 30/30 = mes completo, 15/30 = quincena.
 * Se acota a [0, 1] — un "periodo" en la DB nunca debería superar el mes,
 * pero si por dato malo llegara, el factor 1 es el conservador (no infla
 * el techo ni hunde el piso). */
function factorPeriodo(desde: string, hasta: string): number {
  const dias = diasEntreFechas(desde, hasta) + 1;
  if (!Number.isFinite(dias) || dias <= 0) return 1;
  return Math.min(1, dias / 30);
}

function validarHorasExtra(datos: DatosQA, r: ResolutorReglas): IssueQA[] {
  const out: IssueQA[] = [];
  for (const d of datos.excesosHorasExtraDia ?? []) {
    const max = r.en("max_horas_extra_dia", d.fecha);
    if (d.horas > max) {
      out.push(
        issue(
          "HORAS_EXTRA_EXCEDIDAS_DIA",
          "error",
          `El ${d.fecha} se trabajaron ${d.horas.toFixed(2)} horas extra, sobre el tope legal de ${max} h/día.`,
          "D.L. 13 de 1967, art. 1",
          d.horas,
          max,
          d.fecha
        )
      );
    }
  }
  for (const s of datos.excesosHorasExtraSemana ?? []) {
    const max = r.en("max_horas_extra_semana", s.semana);
    if (s.horas > max) {
      out.push(
        issue(
          "HORAS_EXTRA_EXCEDIDAS_SEMANA",
          "error",
          `En la semana del ${s.semana} se acumularon ${s.horas.toFixed(2)} horas extra, sobre el tope legal de ${max} h/semana.`,
          "Ley 6 de 1981",
          s.horas,
          max,
          s.semana
        )
      );
    }
  }
  return out;
}

function validarTopeDeducciones(datos: DatosQA, r: ResolutorReglas): IssueQA[] {
  // Si aplicarDeducciones ya recortó, el total post-tope YA cabe en el 50%
  // — pero informamos que el tope se activó (bandera del llamador). En
  // liquidaciones directas o de reproceso donde no pase por aplicarDeducciones,
  // detectamos por comparación explícita.
  const topePct = r.en("limite_deducciones_salario", datos.fecha);
  const topeMonto = redondearPeso(datos.totalDevengado * topePct);
  if (datos.totalDeducciones > topeMonto) {
    return [
      issue(
        "TOPE_DEDUCCIONES_SUPERADO",
        "error",
        `Las deducciones ($${datos.totalDeducciones.toLocaleString("es-CO")}) superan el tope del ${redondearPeso(topePct * 100)}% del devengado ($${topeMonto.toLocaleString("es-CO")}).`,
        "CST art. 149",
        datos.totalDeducciones,
        topeMonto
      ),
    ];
  }
  if (datos.toperoDeduccionesActivado) {
    return [
      issue(
        "TOPE_DEDUCCIONES_SUPERADO",
        "advertencia",
        `Las deducciones voluntarias se recortaron para respetar el tope del ${redondearPeso(topePct * 100)}% del devengado — el trabajador se acerca al mínimo vital.`,
        "CST art. 149",
        datos.totalDeducciones,
        topeMonto
      ),
    ];
  }
  return [];
}

function validarRangoIbc(datos: DatosQA, r: ResolutorReglas): IssueQA[] {
  const smlmv = r.en("smlmv", datos.fecha);
  const topeSmlmv = r.en("ibc_tope_smlmv", datos.fecha);
  const fp = factorPeriodo(datos.periodoDesde, datos.periodoHasta);
  const piso = redondearPeso(smlmv * fp);
  const techo = redondearPeso(smlmv * topeSmlmv * fp);

  if (datos.ibcPeriodo < piso) {
    return [
      issue(
        "IBC_FUERA_DE_RANGO",
        "error",
        `El IBC del periodo ($${datos.ibcPeriodo.toLocaleString("es-CO")}) está por debajo del mínimo cotizable (1 SMLMV prorrateado = $${piso.toLocaleString("es-CO")}).`,
        "Ley 100 de 1993, art. 18",
        datos.ibcPeriodo,
        piso
      ),
    ];
  }
  if (datos.ibcPeriodo > techo) {
    return [
      issue(
        "IBC_FUERA_DE_RANGO",
        "error",
        `El IBC del periodo ($${datos.ibcPeriodo.toLocaleString("es-CO")}) supera el tope de ${topeSmlmv} SMLMV prorrateados = $${techo.toLocaleString("es-CO")} — la cotización debe topearse.`,
        "Ley 100 de 1993, art. 18 mod. Ley 797 de 2003, art. 5",
        datos.ibcPeriodo,
        techo
      ),
    ];
  }
  return [];
}

function validarNetoMinimo(datos: DatosQA, r: ResolutorReglas): IssueQA[] {
  const smlmv = r.en("smlmv", datos.fecha);
  const fp = factorPeriodo(datos.periodoDesde, datos.periodoHasta);
  const netoMinimo = redondearPeso(smlmv * fp);
  if (datos.netoPagado < netoMinimo) {
    return [
      issue(
        "NETO_BAJO_MINIMO",
        "error",
        `El neto a pagar ($${datos.netoPagado.toLocaleString("es-CO")}) queda por debajo del SMLMV prorrateado ($${netoMinimo.toLocaleString("es-CO")}). Revisa las deducciones voluntarias — la ley protege el mínimo vital.`,
        "CST art. 149; CST art. 154",
        datos.netoPagado,
        netoMinimo
      ),
    ];
  }
  return [];
}

/** Evalúa una pre-liquidación y devuelve el veredicto tipado. Determinista:
 * mismas entradas → misma salida (mismo score, mismos issues en el mismo
 * orden). */
export function evaluarQA(datos: DatosQA, reglas: ReglaLegal[] | ResolutorReglas): ResultadoQA {
  const r = comoResolutor(reglas);
  const issues: IssueQA[] = [
    ...validarHorasExtra(datos, r),
    ...validarTopeDeducciones(datos, r),
    ...validarRangoIbc(datos, r),
    ...validarNetoMinimo(datos, r),
  ];

  const penalizacion = issues.reduce(
    (s, i) => s + (i.severidad === "error" ? PESO_ERROR : PESO_ADVERTENCIA),
    0
  );
  const score = Math.max(0, 100 - penalizacion);

  const tieneError = issues.some((i) => i.severidad === "error");
  const estado: ResultadoQA["estado"] = tieneError
    ? "rechazada"
    : issues.length > 0
      ? "con_advertencias"
      : "aprobada";

  return { estado, score, issues };
}
