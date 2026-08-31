---
estado: bloqueada
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
- 2026-08-31: Yonatan dio el GO («dale con la mitad del producto»); la sesión del apex se mudó acá y arranca.
- 2026-08-31: traducida TODA la superficie de agentes del producto — llms.txt,
  agents.md, quickstart/pricing/manifiesto (claves incluidas: schemas v1→v2,
  sin integradores que romper — medido: cero órdenes), auth.md, las
  descripciones del OpenAPI (tag `catálogo`→`catalog`; claves `x-x402`
  intactas), el card A2A del origen, el server card, el 404, los markdown
  negociados de /, /servicios y /lanzamiento, robots.txt, las tools WebMCP del
  SPA (renombradas a inglés, declarado en cabecera) y los textos de las cinco
  tools MCP (nombres intactos: clientes reales ya los ejercitaron). Las tres
  páginas de confianza quedaron BILINGÜES a propósito: HTML humano en español,
  markdown de agente en inglés, con guarda de paridad de hechos (URLs,
  correos, leyes) — 4 pruebas nuevas. De yapa, dos mentiras heredadas
  corregidas: el porqué de /pago-onchain en pricing describía OTRA ruta
  (probado contra el OpenAPI) y `limits.docs` apuntaba al schema de /liquidar
  como si fuera el general. Evidencia: 1673 pruebas verdes (35 mcp + 478
  reglas + 204 web + 956 api), tsc limpio en los 4 workspaces, 7 mutaciones
  plantadas / 7 cazadas, revisión adversarial de 3 lentes (28 hallazgos; 4
  must-fix y 15 de calidad aplicados; el vendored sobre.mjs se deja en
  español a propósito — es copia literal del verificador de referencia).
- 2026-08-31: BLOQUEADA — la desbloquea el deploy de Yonatan
  (`ssh ynt@18.191.129.33 'cd ~/docker-lab/apps/nomicheck && ./deploy.sh'`
  con la imagen del CI de este commit). Tras el deploy: medir servido
  (llms.txt, quickstart v2, /pricing en, agents.md, robots, MCP) y pasar a
  `hecha`.
