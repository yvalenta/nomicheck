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

/** Emisor tipado usado por las calculadoras (SDD §15 pilar 2 — migración de
 * advertencias-string a IssueQA nativo). Empuja tanto el string legible como
 * el IssueQA estructurado, para no romper consumidores actuales de `advertencias`
 * (semáforo, UI). Los llamadores que solo tenían `advertencias.push(...)` se
 * reemplazan por `emitirIssue(issues, advertencias, issue(...))`. */
export function emitirIssue(issues: IssueQA[], advertencias: string[], i: IssueQA): void {
  issues.push(i);
  advertencias.push(i.mensaje);
}

/** Constructor exportado del issue (mismo shape que el interno) — para que las
 * calculadoras armen sus issues sin re-declarar la interfaz. */
export function crearIssue(
  codigo: CodigoIssueQA,
  severidad: SeveridadQA,
  mensaje: string,
  referenciaLegal: string,
  valorCalculado: number,
  valorLimite: number,
  contexto?: string
): IssueQA {
  return issue(codigo, severidad, mensaje, referenciaLegal, valorCalculado, valorLimite, contexto);
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

// Regla de sanidad post-cálculo (defensa en profundidad): aunque el motor
// ya no debería producir esto si `aplicarDeducciones` funcionó, si por dato
// de entrada raro el total sí supera el 50%, lo reportamos como error.
// Los issues que el motor mismo emite (recorte del art. 149 como advertencia)
// llegan por datos.issuesMotor y no se re-detectan aquí.
function validarTopeDeducciones(datos: DatosQA, r: ResolutorReglas): IssueQA[] {
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
    ...(datos.issuesMotor ?? []),
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
