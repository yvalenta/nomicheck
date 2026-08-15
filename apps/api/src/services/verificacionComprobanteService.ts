// Lógica PURA de comparación declarado-vs-calculado (listing 5). Separada de
// `batchVerificacionService.ts` (que sí toca `obtenerReglasYFestivos`) para
// que el matching/diff sea testeable sin BD ni motor — solo estructuras de
// datos, cero I/O.
//
// El comprobante DECLARA líneas con nombre libre (texto de OCR o tipeo
// manual); el motor CALCULA sus propias líneas legales con nombres fijos
// (ver calculadoraSalarioFijo.ts + deducciones.ts + auxilio.ts). Este módulo
// hace el puente: canonicaliza el nombre declarado a una clave conocida,
// busca su contraparte calculada, y decide el veredicto según el efecto neto
// sobre lo que recibe el trabajador.
import type { LineaResultado } from "@pv/reglas";
import type { ClaveConceptoLegal, LineaVerificada, VeredictoLinea } from "../validation/batchVerificacion.js";

// Claves cuyo efecto es un DEVENGO (más valor declarado = más a favor del
// trabajador) — el resto son deducciones (más valor deducido = menos a favor).
const CLAVES_DEVENGO = new Set<ClaveConceptoLegal>(["salario_basico", "auxilio_transporte"]);

// Heurística de texto libre → clave legal. Orden importa: "fondo de
// solidaridad pensional" contiene la palabra "pension" como substring de
// "pensional", así que fondo_solidaridad se evalúa ANTES que pension.
export function canonicalizarConcepto(nombre: string): ClaveConceptoLegal | null {
  const n = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // quita tildes: básico → basico
  if (n.includes("fondo") && (n.includes("solidaridad") || n.includes("fsp"))) return "fondo_solidaridad";
  if (n.includes("pension")) return "pension";
  if (n.includes("salud") || n.includes("eps")) return "salud";
  if (n.includes("auxilio") && n.includes("transporte")) return "auxilio_transporte";
  if (n.includes("salario") || n.includes("basico") || n.includes("sueldo") || n.includes("sostenimiento")) {
    return "salario_basico";
  }
  return null;
}

interface ComputadoPorClave {
  valor: number;
  ley?: string;
}

function indexarComputado(lineas: LineaResultado[]): Map<ClaveConceptoLegal, ComputadoPorClave> {
  const mapa = new Map<ClaveConceptoLegal, ComputadoPorClave>();
  for (const l of lineas) {
    const clave = canonicalizarConcepto(l.concepto);
    if (clave) mapa.set(clave, { valor: l.valorCalculado, ley: l.ley });
  }
  return mapa;
}

const TOLERANCIA_PESOS = 1;

function veredictoPorImpacto(impactoNeto: number): VeredictoLinea {
  if (Math.abs(impactoNeto) <= TOLERANCIA_PESOS) return "correcto";
  return impactoNeto > 0 ? "pagado_de_mas" : "pagado_de_menos";
}

export interface DiffComprobante {
  lineas: LineaVerificada[];
  deltaNetoEstimado: number;
  veredicto: "correcto" | "discrepancias_encontradas";
}

export function compararComprobante(
  declarado: { nombre: string; valor: number }[],
  computado: LineaResultado[]
): DiffComprobante {
  const computadoPorClave = indexarComputado(computado);
  const clavesDeclaradas = new Set<ClaveConceptoLegal>();
  const lineas: LineaVerificada[] = [];

  for (const item of declarado) {
    const clave = canonicalizarConcepto(item.nombre);
    if (!clave) {
      lineas.push({
        claveConcepto: "extralegal",
        nombreDeclarado: item.nombre,
        valorDeclarado: item.valor,
        // `null` y no `0`: no hay base legal para derivar un bono o una
        // comisión, y decir "la ley manda cero" es una afirmación que nadie
        // midió. `impactoNeto` SÍ es 0 —no puede sumar lo que no se sabe— y
        // por eso queda fuera del delta neto sin ensuciarlo.
        valorCalculado: null,
        delta: null,
        impactoNeto: 0,
        veredicto: "no_verificable_extralegal",
      });
      continue;
    }
    clavesDeclaradas.add(clave);
    const encontrado = computadoPorClave.get(clave);
    const valorCalculado = encontrado?.valor ?? 0;
    const delta = item.valor - valorCalculado;
    const impactoNeto = CLAVES_DEVENGO.has(clave) ? delta : -delta;
    lineas.push({
      claveConcepto: clave,
      nombreDeclarado: item.nombre,
      valorDeclarado: item.valor,
      valorCalculado,
      delta,
      impactoNeto,
      veredicto: veredictoPorImpacto(impactoNeto),
      referenciaLegal: encontrado?.ley,
    });
  }

  // Líneas que el motor calcula pero el comprobante NO declaró (ej. no
  // dedujeron salud) — solo se reportan si el motor esperaba un valor > 0;
  // si la ley no aplica (fondo de solidaridad bajo el umbral) no hay nada
  // que echar en falta.
  for (const [clave, { valor, ley }] of computadoPorClave) {
    if (clavesDeclaradas.has(clave) || valor <= 0) continue;
    const impactoNeto = CLAVES_DEVENGO.has(clave) ? -valor : valor;
    lineas.push({
      claveConcepto: clave,
      nombreDeclarado: "(no aparece en el comprobante)",
      valorDeclarado: 0,
      valorCalculado: valor,
      delta: -valor,
      impactoNeto,
      veredicto: "faltante_en_comprobante",
      referenciaLegal: ley,
    });
  }

  const deltaNetoEstimado = lineas.reduce((s, l) => s + l.impactoNeto, 0);
  const veredicto = lineas.every((l) => l.veredicto === "correcto" || l.veredicto === "no_verificable_extralegal")
    ? "correcto"
    : "discrepancias_encontradas";

  return { lineas, deltaNetoEstimado, veredicto };
}
