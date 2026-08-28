# Fricciones — cuaderno de molestias de UI

Registro de lo que estorba en la interfaz y **no** amerita arreglo inmediato.
Existe para no caer en el diseño whack-a-mole: parchar cada queja suelta
("hacé X más prominente") produce un mosaico que prioriza interacciones al
azar. Práctica tomada de *How I Design with AI* (Matt Dailey, Ref, ago-2026).

## La regla

1. **Lo obvio se arregla ya.** Un bug, un texto roto, algo que bloquea un
   flujo: fix directo, no pasa por acá.
2. **Lo menor se anota acá y no se parcha suelto.** Si duele pero no bloquea,
   entra a la tabla y espera.
3. **Se ataca en bloque.** Cuando toque rediseño se relee la lista completa
   y primero se pregunta si algo de acá cambia las restricciones de diseño
   (SDD §06 y los tokens de `apps/web/src/index.css`) antes de saltar a
   soluciones. Las soluciones salen del conjunto, cohesivas — no una por
   molestia.

## Pendientes

Una línea por fricción, la más nueva arriba.

| fecha | dónde (ruta / componente) | qué estorba | quién lo sufrió |
|---|---|---|---|

## Atendidas

Al cerrar fricciones en un rediseño, mover la fila acá con el commit que las
cerró.

| fecha | dónde | qué estorbaba | cerrada por |
|---|---|---|---|
