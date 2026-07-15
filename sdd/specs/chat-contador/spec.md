# Capacidad: Chat del contador (explicación conversacional)

Acompaña al usuario en la pantalla de resultado con un chat que explica cada
concepto del cálculo en lenguaje sencillo, como lo haría un contador humano.

## Requisitos

1. El sistema DEBE ofrecer un chat disponible únicamente después de que
   exista un `ResultadoNomina` ya calculado (por código determinístico, no
   por el LLM) — el chat explica un resultado existente, no calcula uno
   nuevo.

2. El sistema DEBE incluir el `ResultadoNomina` completo (y las reglas
   legales usadas para producirlo) como contexto de cada llamada a Claude,
   de modo que las respuestas se refieran a las cifras reales del usuario y
   no a generalidades.

3. El sistema NO DEBE permitir que el LLM modifique, recalcule o contradiga
   las cifras del `ResultadoNomina` — si el usuario pregunta "¿por qué mi
   comprobante dice otra cosa?", el LLM DEBE explicar la diferencia en
   términos del resultado ya calculado, nunca inventar un cálculo alterno.

4. El sistema DEBE responder en español, con tono cercano y sin jerga
   innecesaria, citando la ley o el porcentaje aplicable cuando sea
   pertinente (ej. "el recargo dominical es del 90 % desde julio de 2026
   según la Ley 2466 de 2025").

5. El sistema DEBE mostrar el disclaimer de que el chat es informativo y no
   constituye asesoría legal o contable certificada, visible en la interfaz
   del chat (no solo en el resultado).

6. El procesamiento del chat DEBE ocurrir del lado del servidor
   (`POST /chat/explicar`), nunca exponiendo la API key de Claude en el
   navegador.

## Fixtures de referencia
Preguntas de prueba usando los dos comprobantes reales, ej.: "¿por qué me
descontaron fondo de solidaridad?", "¿cómo calculaste el recargo dominical?",
"¿por qué el valor hora cambió respecto al mes pasado?".
