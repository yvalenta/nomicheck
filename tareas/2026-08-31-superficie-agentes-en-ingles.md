---
estado: propuesta
dueño: sesión
fecha: 2026-08-31
tema: la superficie para agentes del producto pasa a inglés, optimizada para descubrirse y ejecutarse
criterio_cierre: llms.txt, agents.md, quickstart, pricing, manifiesto, auth.md, las descripciones del OpenAPI, el server card y las tools del MCP sirven inglés; suites y tsc verdes; desplegado y medido servido
---

Pedido de Yonatan (2026-08-31): toda la documentación y uso de agentes debe
ser en inglés y optimizada para que un agente la descubra y pueda ejecutar sus
tareas. La mitad del apex se trabaja en `nomicheck_ops`
(tarea gemela del mismo día); esta propuesta cubre la mitad del producto:

- `nomicheck.ynt.codes/llms.txt`, `/agents.md`, `/api/batch/quickstart`,
  `/api/batch/pricing` + `/pricing`, `/api/batch/manifiesto`, `/auth.md`
- las `description` de TODAS las operaciones del OpenAPI servido (hay una
  prueba que exige el 100% descrito — traducir sin romperla)
- el server card del MCP y las cinco tools (`apps/mcp`)
- los markdown negociados de `/`, `/servicios`, `/lanzamiento`, `/about`,
  `/contact`, `/privacy` y el 404 con mapa
- robots.txt: la nota que manda a los agentes a `/agents.md`

La justificación medida vive en `nomicheck_ops/docs/estado/mercado.md`: la
audiencia real son máquinas (erc-8004-indexer, OAI-SearchBot, ClaudeBot…) y
van derecho al card, al ai-catalog y al llms.txt. La web humana (es-CO) no
cambia de idioma: solo la superficie que lee una máquina.

Trabajarla en sesión propia parada en este repo (regla de /casa). El deploy
final es con GO de Yonatan, como siempre.

## Bitácora
- 2026-08-31: declarada desde la sesión de nomicheck_ops al partir el pedido en dos repos.
