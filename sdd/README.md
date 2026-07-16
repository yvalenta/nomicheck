# SDD (Spec-Driven Development) — metodología de este repo

> **⚠️ Archivado (jul-2026).** La metodología del proyecto cambió con el pivot
> v2.0: la fuente de verdad es ahora el documento único [`SDD.md`](../SDD.md)
> en la raíz (módulos → entidades → flujos → fases → decisiones fijas). Los
> requisitos de `sdd/specs/` fueron absorbidos íntegros en su §03. Esta
> carpeta se conserva como historial de la etapa v1 y no se actualiza más.

Adoptamos el espíritu de OpenSpec — specs como fuente de verdad, propuesta
antes de código — implementado a mano, sin su CLI ni su tooling.

## Estructura

```
sdd/
├─ specs/                     # estado ACTUAL del sistema, por capacidad
│  └─ <capacidad>/spec.md
└─ changes/                   # propuestas de cambio EN CURSO
   ├─ archive/<nombre>/       # cambios ya aplicados (historial)
   └─ <nombre-del-cambio>/
      ├─ proposal.md          # por qué, qué capacidades toca, alcance
      ├─ tasks.md             # checklist de implementación
      └─ spec-delta.md        # requisitos ADDED / MODIFIED / REMOVED
```

`sdd/specs/` siempre describe el sistema **tal como es hoy**. Si el código y
un spec no coinciden, gana el spec como intención documentada — se corrige el
código o se abre un cambio para actualizar el spec, pero no se ignora la
discrepancia.

## Flujo de trabajo

1. **Proponer.** Antes de tocar código para una feature o cambio no trivial,
   crear `sdd/changes/<nombre>/proposal.md`: qué problema resuelve, qué
   capacidades de `sdd/specs/` toca, qué queda fuera de alcance.
2. **Especificar el delta.** Escribir `spec-delta.md` con los requisitos que
   se agregan, modifican o eliminan, en el mismo lenguaje llano de los specs.
   Revisar contra `sdd/specs/` actual para no contradecir una regla ya
   establecida en otra capacidad.
3. **Planear tareas.** `tasks.md` como checklist concreto de implementación.
4. **Implementar** siguiendo `tasks.md`.
5. **Cerrar el cambio.** Aplicar el delta sobre el `spec.md` correspondiente
   (queda reflejando el sistema real) y mover la carpeta del cambio a
   `sdd/changes/archive/<nombre>/`. No se borra: es el historial de por qué
   se tomó cada decisión, sin depender de arqueología de `git log`.

## Cuándo NO hace falta una propuesta formal

Fixes triviales, typos, ajustes de estilo o cambios que no alteran ningún
requisito de un spec existente se implementan directo, sin pasar por
`changes/`. La propuesta es para cambios de comportamiento o alcance.

## Formato de un spec.md

- Encabezado con el nombre de la capacidad y una frase de propósito.
- Requisitos numerados, en lenguaje llano ("El sistema DEBE...",
  "El sistema NO DEBE...").
- Un ejemplo o caso de prueba junto al requisito cuando aplique — en este
  proyecto, los dos comprobantes reales de nómina sirven de fixtures para
  varios requisitos de cálculo.

Sin CLI, sin validador automático: la disciplina es la convención de
carpetas + el hábito de proponer antes de construir.
