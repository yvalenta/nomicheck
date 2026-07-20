import type { z } from "zod";
import { proveedorChat } from "./ia/index.js";
import type { chatExplicarSchema } from "../validation/chat.js";

type ResultadoNominaContexto = z.infer<typeof chatExplicarSchema>["resultado"];
type MensajeChat = NonNullable<z.infer<typeof chatExplicarSchema>["historial"]>[number];

// Chat contador (SDD §03 Módulo E, spec v1 "chat-contador"): pasa por la misma
// capa multi-proveedor que la extracción de comprobantes (IA_PROVEEDOR decide
// Gemini o Claude, sin tocar este archivo) — así no queda bloqueado por la
// disponibilidad de un solo proveedor. El LLM nunca recalcula ni contradice
// el ResultadoNomina — solo lo explica en español, citando ley cuando aplique.
const PROMPT_SISTEMA = `Eres el "chat contador" de NomiCheck, una plataforma de verificación de nómina colombiana. Tu única función es EXPLICAR un resultado de cálculo ya hecho por el motor de reglas — nunca lo recalculas, nunca lo contradices, nunca inventas cifras nuevas. Si el usuario pregunta "¿por qué mi comprobante dice otra cosa?", explica la diferencia en términos de las líneas y advertencias que ya tienes. Responde en español, con tono cercano y claro. Cita la ley o el porcentaje exacto cuando esté disponible en la línea correspondiente (ej. "el recargo dominical es del 90% desde julio de 2026 según la Ley 2466 de 2025"). Si te preguntan algo fuera del alcance de este resultado (asesoría legal general, otros periodos, otros empleados), aclara que eres un asistente informativo y no reemplazas asesoría legal certificada.`;

function contextoResultado(resultado: ResultadoNominaContexto): string {
  const lineas = resultado.lineas
    .map((l) => {
      const partes = [`${l.tipo}: ${l.concepto} = $${l.valorCalculado.toLocaleString("es-CO")}`];
      if (l.horas !== undefined) partes.push(`${l.horas} h`);
      if (l.recargoPct !== undefined) partes.push(`${(l.recargoPct * 100).toFixed(0)}%`);
      if (l.ley) partes.push(`(${l.ley})`);
      return partes.join(" — ");
    })
    .join("\n");

  return [
    `Modo: ${resultado.modo}`,
    `Periodo: ${resultado.periodoDesde} a ${resultado.periodoHasta}`,
    `Salario básico mensual pactado: $${resultado.salarioBasicoMensual.toLocaleString("es-CO")}`,
    `Líneas del resultado:`,
    lineas,
    `Total devengado: $${resultado.totalDevengos.toLocaleString("es-CO")}`,
    `Total deducciones: $${resultado.totalDeducciones.toLocaleString("es-CO")}`,
    `Neto esperado: $${resultado.netoEsperado.toLocaleString("es-CO")}`,
    resultado.advertencias.length > 0 ? `Advertencias: ${resultado.advertencias.join(" / ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function explicarResultado(
  resultado: ResultadoNominaContexto,
  pregunta: string,
  historial: MensajeChat[] = []
): Promise<string> {
  const promptSistema = `${PROMPT_SISTEMA}\n\nContexto del cálculo a explicar:\n${contextoResultado(resultado)}`;
  const historialConvertido = historial.map((h) => ({
    rol: (h.rol === "usuario" ? "user" : "assistant") as "user" | "assistant",
    texto: h.texto,
  }));

  return proveedorChat().chat(promptSistema, historialConvertido, pregunta);
}
