# Capacidad: Panel de administración de reglas legales

Permite mantener las reglas legales (SMLMV, recargos, jornada, aportes,
festivos) actualizadas frente a cambios normativos, sin tocar código ni
redeploy.

## Requisitos

1. El sistema DEBE almacenar cada regla legal como un registro
   `ReglaLegal(clave, valor, vigenteDesde, vigenteHasta?, fuente)` — nunca
   como constante hardcodeada en el motor de cálculo.

2. El sistema DEBE permitir múltiples registros con la misma `clave` y
   distintos rangos de vigencia (ej. `recargo_dominical` = 0.80 hasta
   30-jun-2026, = 0.90 desde 1-jul-2026), de modo que un cálculo sobre una
   fecha pasada siga usando la tarifa que estaba vigente en ese momento.

3. El sistema DEBE exponer un CRUD protegido (`GET/PUT /admin/reglas`) solo
   accesible con autenticación de `AdminUsuario` — el flujo del empleado
   final (consulta de su nómina) permanece anónimo y sin login.

4. El sistema DEBE validar, al guardar una nueva regla, que no se solape el
   rango de vigencia con otro registro de la misma `clave` (evita ambigüedad
   sobre qué tarifa aplica en una fecha dada).

5. El sistema DEBE registrar `fuente` (referencia legal o URL) en cada regla,
   visible en el panel, para trazabilidad de por qué se cambió un valor.

6. El sistema DEBE permitir gestionar la tabla `Festivo` (fecha, nombre)
   desde el mismo panel, para agregar festivos especiales puntuales sin
   depender solo del cálculo determinístico de la Ley Emiliani.

7. El motor de cálculo (`packages/reglas`) DEBE leer las reglas vigentes en
   la fecha del periodo consultado en cada cálculo — nunca cachear valores de
   forma que un cambio en el panel admin deje de reflejarse en cálculos
   nuevos.

## Fixtures de referencia
Semilla inicial de reglas (jul-2026): SMLMV $1.750.905, auxilio transporte
$249.095, recargo dominical/festivo 80 %→90 % (corte 1-jul-2026), recargo
nocturno 35 %, jornada nocturna 7:00 p.m.–6:00 a.m., divisor hora ordinaria
220→210 (corte 15-jul-2026), aportes salud/pensión 4 %/4 %, fondo de
solidaridad escalonado desde 4 SMLMV.
