import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { chatExplicarSchema } from "../validation/chat.js";

type ResultadoNominaContexto = z.infer<typeof chatExplicarSchema>["resultado"];
type MensajeChat = NonNullable<z.infer<typeof chatExplicarSchema>["historial"]>[number];

// Chat contador (SDD §03 Módulo E, spec v1 "chat-contador", íntegro): SOLO
// Claude (no pasa por la capa multi-proveedor de extracción — esta es una
// conversación de texto, no visión estructurada). El LLM nunca recalcula ni
// contradice el ResultadoNomina — solo lo explica en español, citando ley
// cuando aplique.
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en el servidor");

  const client = new Anthropic({ apiKey });
  const respuesta = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: `${PROMPT_SISTEMA}\n\nContexto del cálculo a explicar:\n${contextoResultado(resultado)}`,
    messages: [
      ...historial.map((h) => ({
        role: (h.rol === "usuario" ? "user" : "assistant") as "user" | "assistant",
        content: h.texto,
      })),
      { role: "user" as const, content: pregunta },
    ],
  });

  const bloque = respuesta.content.find((b) => b.type === "text");
  if (!bloque || bloque.type !== "text") {
    throw new Error("El chat contador no devolvió una respuesta de texto");
  }
  return bloque.text;
}
