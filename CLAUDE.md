# Convenciones para agentes en este repo

Fuente de verdad del producto: [SDD.md](SDD.md) (módulos, entidades, flujos,
decisiones fijas). Las restricciones de diseño viven en su §06 y en los
tokens de `apps/web/src/index.css` — se diseña dentro de ellas, no
alrededor.

## UI: la regla de resta

Los agentes ensucian UI igual que ensucian código: copy de más, íconos
decorativos, bordes, wrappers, estados "por si acaso". Después de cualquier
cambio de UI, pasada de resta obligatoria: mirar cada elemento tocado y
preguntar **"¿esto hace falta de verdad?"** — lo que no se justifica, se va.
La jerarquía se construye con las tres tintas (`ink`/`muted`/`quiet`), no
agregando negritas, color ni íconos.

## UI: componentes, no reimplementaciones

Antes de crear un botón, badge, modal o popover: mirar
`apps/web/src/components/ui/`. Si existe, se reusa; si necesita una
variante, se extiende el componente — nunca una copia local.

## UI: feedback ≠ fix inmediato

Ante una queja o molestia de interfaz, evaluar primero si cambia las
restricciones de diseño antes de saltar a la solución. Lo obvio se arregla
ya; lo menor va a [FRICCIONES.md](FRICCIONES.md) y se ataca en bloque en el
próximo rediseño. Sin spot-fixes reactivos.
