# NomiCheck — Software Design Document · v2.3

> **SDD v2.3** · Plataforma de nómina Colombia con dos modos: **verificador anónimo** de comprobantes de pago y **versión empresa** para liquidar nómina de colaboradores, con verificación y reporte de discrepancias por parte del empleado. Incluye **prestaciones sociales completas** (cesantías, intereses, prima, vacaciones) con provisiones mensuales en el modo empresa.
> Stack: pnpm monorepo TypeScript · React 19 + Vite + Tailwind CSS (SPA) · Express + Prisma + **Supabase (Postgres + Auth + RLS)** · `packages/reglas` (motor puro compartido) · Claude API (extracción + chat).

| Metadato | Valor |
|---|---|
| Versión | 2.3 — prestaciones sociales completas (cesantías, intereses, prima, vacaciones) en scope; `CalculadoraPrestaciones` + provisiones mensuales en modo empresa; documentación de escenarios edge con tests Vitest |
| Estado | Definición del pivot, en implementación |
| Stack | TypeScript end-to-end · React 19 · Express · Prisma sobre Supabase Postgres · Supabase Auth · Claude API |
| Actualizado | Julio 2026 |
| Documentos de referencia | `PLAN.md` (v1, superseded) · `sdd/` (metodología v1, archivada) · Advance Fitness SDD v2.0 (formato) |

> **Nota de transición (v2.3):** las **prestaciones sociales completas** (cesantías, intereses sobre cesantías, prima de servicios, vacaciones) pasan de out-of-scope a in-scope y **ya están implementadas** (no solo documentadas — ver corrección más abajo). `calcularPrestacionesSociales()` en `packages/reglas/src/prestaciones.ts` (tipos `DatosPrestaciones`/`ResultadoPrestaciones`) calcula las 4 prestaciones sobre el tiempo servido, con soporte para salario variable (promedio, CST art. 253), días excluidos por suspensión disciplinaria, y el año comercial de 360 días (verificado inmune a años bisiestos). El modo empresa agrega `Empleado.fechaIngreso` (base de antigüedad) y **provisiona mensualmente** cada prestación como líneas `tipo: "provision"` en `ReciboPago.lineas` (ventana del periodo liquidado, no acumulado de carrera) — informativas, no afectan `totalDevengado`/`totalDeducido`/`neto` porque son un pasivo del empleador, no dinero que el colaborador reciba ese periodo. El tipo de contrato (`tipoContrato`) documentado en §07 sigue **sin implementar**: el motor asume tácitamente término indefinido — aprendices SENA y prestación de servicios tendrían prestaciones distintas (o ninguna) y producirían un cálculo incorrecto si se ingresan hoy.
>
> **Corrección (misma v2.3):** la redacción original de esta nota se coló en el commit `2dd1d5b` (que en realidad trataba el tope de horas extra, §13) y describía `CalculadoraPrestaciones` con provisiones mensuales como si ya existiera — no existía una sola línea de código. Se detectó y implementó de verdad en un pase posterior (ver entrada correspondiente en §13). Queda anotado aquí para que el historial no repita SDD prometiendo funcionalidad inexistente.
>
> **Nota de transición (v2.2):** el producto se renombra **NomiCheck**. El verificador anónimo abandona los formularios de conceptos contables: el usuario declara tiempo (semana habitual + novedades) y el motor clasifica; el pago base pasa de horas×valor hora a **salario proporcional** + recargos; salud/pensión se deducen automáticamente. UI rediseñada (tokens FinTech §06).
>
> **Nota de transición (v2.1):** la v2.0 fijaba SQLite + auth/sesiones propias. Esta revisión adopta **Supabase** solo donde el alcance ya lo pedía: Postgres gestionado (reemplaza SQLite desde la Fase 5, cuando aparece multi-tenant real), **Auth** (reemplaza bcrypt/sesiones e invitación propia) y **RLS** (aplica el scoping por empresa/colaborador de §08 directo en la base, como defensa adicional al service). No se adoptan Storage, Realtime, Edge Functions ni acceso a datos vía `supabase-js` desde el frontend — ninguno lo pide el alcance actual (detalle en §04).
>
> **Nota de transición (v2.0):** la v1 (`PLAN.md` + carpeta `sdd/`) definía solo el verificador anónimo con metodología de specs por capacidad + propuestas por cambio. La v2.0 (a) amplía el producto a dos modos compartiendo el mismo motor de reglas, y (b) adopta este documento único como fuente de verdad. Los requisitos de los 5 specs de `sdd/specs/` están absorbidos íntegros en §03; la carpeta `sdd/` queda como historial.

---

## 01 — Introducción

### ¿Qué construimos?

**NomiCheck** es un "contador digital" para la nómina colombiana con dos caras sobre el mismo motor:

1. **Verificador anónimo** (público, sin login, gratuito): un empleado sube su comprobante de pago (imagen/PDF) o digita sus datos, y la app valida si le pagaron correctamente según la legislación vigente en la fecha del periodo (Ley 2101 de 2021, Ley 2466 de 2025, decretos de salario mínimo). Muestra cada concepto con semáforo, explica cada cifra con fórmula y referencia legal, y ofrece un chat que responde como un contador humano. Además de su valor propio, es la puerta de entrada comercial hacia el modo empresa.

2. **Versión empresa** (con cuenta): una empresa —restaurante, oficina, cualquier empleador pequeño— registra sus colaboradores, captura los turnos u condiciones del periodo, **liquida la nómina** con el mismo motor determinístico y genera recibos de pago. Cada colaborador entra con su cuenta, ve su recibo, lo **verifica automáticamente** contra el motor (¿me pagaron de más, de menos?) y **reporta discrepancias** que la empresa ve y responde.

> **Principio rector:** el cálculo SIEMPRE lo hace código determinístico (`packages/reglas`), testeable con comprobantes reales. La IA (Claude) solo hace dos cosas: **extraer** datos de un comprobante y **explicar** un resultado ya calculado. Nunca calcula, nunca contradice las cifras del motor.

---

## 02 — Alcance

| En scope (MVP) | Out of scope (MVP) |
|---|---|
| Dos calculadoras: por turnos/recargos y salario fijo con conceptos | Facturación electrónica / nómina electrónica DIAN |
| Motor de reglas legales versionadas por fecha (SMLMV, recargos, jornada, aportes) | PILA / planilla de aportes patronales completa |
| Verificador anónimo sin login ni persistencia de datos del usuario | Multi-país (solo legislación colombiana) |
| Extracción de comprobante por imagen/PDF con Claude visión + schema validado | App nativa iOS/Android |
| Chat contador que explica el resultado calculado | Firma electrónica de recibos |
| Cuentas: admin de plataforma, admin de empresa, colaborador | Contabilidad general (solo nómina) |
| Empresa: CRUD de empleados, captura de turnos, liquidación de periodo, recibos | Pagos en línea / dispersión bancaria |
| Colaborador: ver recibos, verificación automática, reporte de discrepancia | Notificaciones email/push (v1: todo in-app) |
| Panel admin de reglas legales y festivos con historial de vigencias | Facturación electrónica / nómina electrónica DIAN |
| **Prestaciones sociales completas** (cesantías CST art. 249, intereses CST art. 264, prima de servicios CST art. 306, vacaciones CST art. 186) + provisiones mensuales en modo empresa | — |
| Responsive móvil-primero, interactividad SPA sin recargas | Reportes financieros avanzados / exportes contables |

---

## 03 — Módulos funcionales

Cada requerimiento queda trazado a su entidad (§07) y su flujo (§10). Los requisitos numerados de los specs v1 se conservan con su redacción normativa (DEBE / NO DEBE).

### Módulo A — Motor de reglas legales

| Requerimiento | Solución | Entidad |
|---|---|---|
| Reglas legales como datos, nunca hardcode | Registro `ReglaLegal(clave, valor, vigenteDesde, vigenteHasta?, fuente)` | `ReglaLegal` |
| Vigencias históricas por clave | Múltiples registros por `clave` con rangos de vigencia sin solape (validado al guardar); un cálculo sobre fecha pasada usa la tarifa vigente entonces | `ReglaLegal` |
| Trazabilidad normativa | Campo `fuente` (ley/URL) obligatorio, visible en el panel | `ReglaLegal` |
| Festivos colombianos | Tabla poblada por año (Ley Emiliani determinística) + edición manual para días cívicos puntuales | `Festivo` |
| Sin caché rancio | El motor lee las reglas vigentes en la fecha del periodo en cada cálculo — un cambio en el panel se refleja de inmediato | — |
| Panel protegido | CRUD `GET/PUT /api/admin/reglas` solo para rol `admin_plataforma` | `Usuario` |

**Análisis: ¿migrar a un esquema SCD2 de dos tablas (`payroll_concepts` + `legal_rules`, UUID, ActiveRecord)?** No — el core actual ya implementa el mismo patrón (Slowly Changing Dimension Tipo 2), con menos piezas y sin costo adicional:

| Propuesta (2 tablas) | `ReglaLegal` (actual) | Por qué el actual alcanza |
|---|---|---|
| `payroll_concepts` (diccionario) + `legal_rules` (vigencias), JOIN en cada lectura | Una sola tabla: `clave` hace de código del concepto | El motor calcula nómina en un hot path (por empleado, por periodo) — un JOIN por cada `reglaEn()` es costo puro sin beneficio: el nombre/etiqueta del concepto no se usa en el cálculo, solo en el panel admin |
| Metadatos de UI (nombre, naturaleza) en la tabla del diccionario | Metadatos en `packages/reglas/src/catalogoReglas.ts` (TS estático) | Separa lo que el motor necesita en runtime (DB) de lo que solo necesita el panel admin (código) — el mismo principio de "packages/reglas es puro" del §05 |
| `multiplier_value` y `fixed_amount` como columnas separadas (nullable una u otra) | Una sola columna `valor: Float` | Dos columnas nullable obligan a todo consumidor a chequear cuál está poblada; una columna interpretada por convención (0-1 para porcentajes, pesos para montos) es más simple y es exactamente como ya la usa `reglaEn()` |
| `id` UUID | `id` autoincremental | Tabla de decenas de filas, sin referencias externas ni necesidad de IDs no-secuenciales — UUID no aporta nada aquí |
| Índice compuesto `(concept_id, valid_from, valid_to)` | Índice `(clave, vigenteDesde)` | Mismo propósito, ya implementado |
| RSpec / ActiveRecord | Prisma + Vitest | La propuesta asume stack Ruby/Rails — este proyecto es TypeScript de punta a punta (SDD §04); adoptar RSpec introduciría un segundo lenguaje/runtime de testing sin necesidad |

El único hallazgo real de la revisión fue un **bug de cálculo** (hora extra dominical nocturna subpagada — ver checklist §13), no un problema de esquema. `resolverReglaVigente` ya existe como `reglaEn(reglas, clave, fecha)` (`utils.ts`) y ya tiene su suite de fronteras temporales (`utils.test.ts`): divisor 220↔210 en el corte 15-jul-2026, recargo dominical 80%↔90% en el corte 1-jul-2026, ambos con tests que fijan el día exacto antes/después del corte.

**Semilla legal, verificada contra fuentes oficiales/prensa especializada el 16-jul-2026** (un día después del corte de jornada — todas las cifras confirmadas vigentes hoy, no proyectadas):

| Clave | Valor | Vigencia | Fuente |
|---|---|---|---|
| `smlmv` | $1.750.905 | 2026 | Decretos 1469 y 1470 de 2025 (29-dic-2025) |
| `auxilio_transporte` | $249.095 | 2026 | Decreto 1470 de 2025 |
| `divisor_hora_ordinaria` | 220 (44 h/sem) → **210 (42 h/sem)** | corte **15-jul-2026** | Ley 2101 de 2021 (reduce CST art. 161: 48→46→44→42 h/sem escalonado) |
| `recargo_dominical_festivo` | 80 % → **90 %** (→100 % jul-2027) | corte **1-jul-2026** | Ley 2466 de 2025 (reforma laboral), modifica CST art. 179 |
| `recargo_nocturno` | 35 % · jornada nocturna 7:00 p.m.–6:00 a.m. | desde 25-dic-2025 | Ley 2466 de 2025 |
| `extra_diurna` / `extra_nocturna` | 25 % / 75 % (extra dominical/festiva suma el recargo dominical vigente) | — | CST art. 168 |
| `aporte_salud` / `aporte_pension` | 4 % / 4 % sobre IBC | sin cambios para 2026 | Ley 100 de 1993 |
| `fondo_solidaridad` | escalonado 1–2 % si IBC ≥ 4 SMLMV (4–16→1%, 16–17→1.2%, 17–18→1.4%, 18–19→1.6%, 19–20→1.8%, ≥20→2%) | — | Ley 100 de 1993, Ley 797 de 2003 art. 8 — **la reforma pensional (Ley 2381 de 2024) que la modificaría sigue suspendida por la Corte Constitucional (auto 841/25) por vicio de trámite; revisar si se reactiva** |
| Retención en la fuente | según tabla vigente del Estatuto Tributario | — | E.T. art. 383 — no se calcula automáticamente en v1 (ver Módulo B) |

**Ampliación de la semilla — AFC y preparación tributaria (verificado 16-jul-2026):**

| Clave | Valor | Vigencia | Fuente | Uso hoy |
|---|---|---|---|---|
| `limite_deducciones_salario` | 50 % del devengado | histórico | CST art. 149 num. 2 (excepción de libranza, Ley 1527 de 2012, art. 3 §5) | **Sí** — recorta el AFC si el total de deducciones lo supera |
| `uvt` | $52.374 | 2026 | DIAN, Resolución 000238 de 15-dic-2025 | No (Fase 2) |
| `limite_porcentaje_afc` | 30 % del ingreso laboral/mes | desde 2012 | E.T. art. 126-1 y 126-4 (Ley 1607 de 2012) | No (Fase 2) |
| `limite_anual_uvt_afc` | 3.800 UVT/año | desde 2012 | E.T. art. 126-1 y 126-4 | No (Fase 2) |
| `limite_rentas_exentas_porcentaje` | 40 % del ingreso | desde 2023 | E.T. art. 336 (Ley 2277 de 2022) | No (Fase 2) |

> ⚠️ El valor de UVT del prompt original de diseño ($49.799) es el de **2025**; el vigente para el año gravable 2026, confirmado en la resolución oficial de la DIAN, es **$52.374**. Se corrigió en la semilla (`apps/api/prisma/seed.ts`).

**AFC (Ahorro para el Fomento a la Construcción) — dos fases de tratamiento:**

- **Fase 1 (implementada):** para trabajadores que no declaran renta, el AFC es una **deducción por convenio de monto fijo** — el usuario/empresa declara `aporteAfcMensual`, se prorratea por días del periodo igual que el auxilio de transporte, y se descuenta del neto **sin afectar el IBC** de salud/pensión (E.T. art. 126-4 solo habla de renta exenta para quien declara renta; para quien no declara, el AFC no tiene ningún efecto tributario en la nómina, es un simple descuento autorizado). Protegido por `limite_deducciones_salario`: si salud + pensión + fondo + AFC superan el 50 % del devengado, se recorta el AFC — nunca los aportes obligatorios — y se deja una advertencia trazable (`packages/reglas/src/deducciones.ts`, función `aplicarDeducciones()`).
- **Fase 2 (preparación, NO implementada):** para perfiles que sí declaran renta, el AFC pasa a ser **renta exenta** que reduce la base de retención en la fuente (E.T. art. 126-4, fórmula `Base_ret = (Devengado − IngresosNoConstitutivos) − DeduccionesPermitidas − RentasExentas`, sujeta a los topes `limite_porcentaje_afc` / `limite_anual_uvt_afc` / `limite_rentas_exentas_porcentaje` ya sembrados). Requiere además: tabla del art. 383 del E.T. (rangos UVT → tarifa marginal), lógica de "¿este colaborador declara renta?" (umbral de ingresos/patrimonio, variable cada año), y UI para declarar dependientes/aportes voluntarios — se deja fuera del alcance actual a propósito (SDD.md §14 Visión a futuro).
- Ambas fases comparten la misma tabla `ReglaLegal` (`clave`, `valor`, `vigenteDesde`, `vigenteHasta`, `fuente`) — el panel administrativo (Fase 8, rol `admin_plataforma`) las edita sin tocar el repositorio. `packages/reglas/src/catalogoReglas.ts` expone metadatos (etiqueta, unidad, si ya se usa en el cálculo) para que ese panel no tenga que adivinar qué significa cada clave.
- **UI FinTech:** la línea "Aporte AFC (convenio)" aparece en el `SegmentedControl` bajo "Deducciones", con `tipo: "deduccion"` — el mismo mecanismo de color coral que ya usan salud/pensión/fondo, sin cambios en `ValidationRow.tsx`.

**Tope de auxilio de transporte (2 SMLMV, verificado 16-jul-2026):** el auxilio de transporte solo aplica a quien devenga hasta `auxilio_transporte_tope_smlmv` (2) SMLMV — para 2026, hasta $3.501.810. Por encima del tope, el empleador no está obligado a reconocerlo (fuente: Decreto de salario mínimo vigente, requisito histórico del auxilio). Implementado en `calculadoraTurnos.ts`: si `recibeAuxilioTransporte=true` pero el salario supera el tope, no se paga la línea y se agrega una advertencia explicando por qué. La UI (`PasoSalario.tsx`) oculta el checkbox y muestra el motivo apenas el salario ingresado supera el tope — el frontend consulta `GET /api/reglas/parametros` (nuevo endpoint público de solo lectura, `reglasController.ts`) para no duplicar la cifra de SMLMV como constante; el motor server-side sigue siendo la única fuente de verdad.

**Embargo judicial (verificado 16-jul-2026, CST art. 154–156):** dos regímenes independientes, ambos con tope propio (no comparten `limite_deducciones_salario`, que es solo para deducciones voluntarias):
- **Ordinario** (bancos, tarjetas, créditos civiles): 1 SMLMV es inembargable (art. 154); del excedente sobre esa cifra solo se puede embargar 1/5 = `embargo_ordinario_fraccion_excedente` (0.20, art. 155). El SMLMV se prorratea por el mismo factor que el periodo (`factorPeriodo` en `aplicarDeducciones()`) — comparar un devengado quincenal contra el SMLMV *mensual* completo daría siempre excedente cero, un bug real que se detectó y corrigió durante la implementación (ver tests de regresión).
- **Alimentos o cooperativa/fondo de empleados**: prioridad constitucional, hasta `embargo_alimentos_pct_max` (0.50) de **cualquier** salario, incluso por debajo del mínimo (art. 156).
- El monto ordenado (`descuentoJudicial.valorMensual`) se prorratea por días del periodo y se recorta al límite de su régimen — nunca al revés; si se recorta, queda una advertencia trazable. Implementado en `packages/reglas/src/deducciones.ts` (`limiteEmbargo()`), expuesto en el wizard vía dos checks mutuamente excluyentes (ordinario / alimentos-cooperativa) + monto (`PasoSalario.tsx`).

**Deducciones por convenio generalizadas (AFC, préstamo, ahorro, reproceso):** `aplicarDeducciones()` ya no trata el AFC como caso especial — acepta un arreglo `deduccionesConvenio: {concepto, valorMensual, ley?}[]`. Si la suma de ley + convenio supera `limite_deducciones_salario` (50%), el recorte es **proporcional entre todas las líneas de convenio** (se conserva la proporción solicitada entre AFC/préstamo/ahorro/reproceso), nunca sobre salud/pensión/fondo ni sobre el embargo (que tiene su propio tope, art. 154-156). UI: reemplazamos el `<select>` de embargo por dos checkboxes independientes, y cada deducción de convenio es un checkbox simple que revela su campo de monto solo si está marcado (componente `CheckMonto` en `PasoSalario.tsx`) — nada de listas desplegables, un check por concepto, ordenados por frecuencia de uso (AFC → préstamo → ahorro → reproceso → embargo).

**Test de regresión — caso RESPLANDOR (cierre nocturno en domingo):** se agregó un caso explícito que verifica que un domingo con cierre después de las 7:00 p.m. genera DOS líneas separadas y acumulables: "Recargo dominical/festivo" (todas las horas ordinarias del domingo, 80%/90% según vigencia) + "Recargo nocturno dominical/festivo" (solo las horas dentro de la franja 19:00-06:00, 35% adicional) — confirma que el motor no pisa un recargo con el otro.

**Periodo interactivo (periodicidad de pago):** el paso 1 del wizard pide primero la periodicidad (semanal/quincenal/mensual/personalizado) y la fecha de inicio; la fecha fin se calcula automáticamente (+6/+14 días, o +1 mes −1 día) y sigue siendo editable — editarla a mano cambia la periodicidad a "personalizado" para que no se sobrescriba en el siguiente cambio de fecha de inicio. Cálculo puramente de UI (`PasoSalario.tsx`, función `calcularHasta()`), no es una regla legal versionada: el motor solo recibe `periodoDesde`/`periodoHasta` como siempre.

### Módulo B — Verificador anónimo (wizard de turnos)

> **Principio (v2.2):** la carga cognitiva vive en el código. El usuario declara
> **tiempo** (a qué hora entró y salió, qué días descansó); el motor clasifica
> eso en conceptos legales y deduce salud/pensión automáticamente. La UI nunca
> muestra selectores de "devengo extralegal" ni "deducción por convenio".

| Requerimiento | Solución | Entidad |
|---|---|---|
| Wizard 3 pasos | 1) salario + periodo + neto recibido (opcional) · 2) semana habitual + novedades por día · 3) resultado | — (sin persistencia) |
| Semana habitual | Editor de 7 días (trabajo/descanso + horas); default dom 10–16, lun descanso, mar–sáb 10–17 | — |
| Novedades | Lista de días del periodo generada automáticamente (festivos pre-marcados como descanso vía `GET /api/festivos`); el usuario solo toca los días distintos | — |
| Deducciones automáticas | Salud 4 % + pensión 4 % sobre IBC (sin auxilio) + fondo de solidaridad si aplica — calculadas siempre, jamás declaradas | — |
| Subir comprobante en vez de digitar | Extracción con Claude (Módulo E) precarga los datos; el usuario revisa antes de calcular. El modo salario-fijo (conceptos) existe solo por esta vía | — |
| Resultado transparente | Cada concepto con icono, horas, fórmula en tooltip + referencia legal + semáforo de comparación contra el neto recibido | — |
| Chat contador | Sobre el resultado calculado (Módulo E) | — |
| Privacidad | El flujo anónimo NO persiste nada: ni archivo, ni datos, ni resultado | — |

**Reglas de cálculo por turnos** (v2.2 — modelo salario proporcional):
1. Entrada: salario básico mensual, periodo, `horarioBase` semanal (7 posiciones, null = descanso) y `novedades` (días que difieren: no trabajó, u horas distintas).
2. Horario efectivo de un día: novedad declarada → festivo (descanso salvo novedad) → horario base del día de semana.
3. **Devengo base = salario/30 × días calendario del periodo** (modelo estándar de nómina colombiana: el salario pactado cubre la jornada ordinaria). Los turnos solo generan recargos y extras.
4. Valor hora = `salario ÷ divisor` según fecha (220 → 210 con corte 15-jul-2026); si el periodo cruza un corte normativo, cada tramo se presenta por separado.
5. Recargos (solo el % adicional — la hora base ya está en el salario): nocturno 35 % (19:00–06:00), dominical/festivo vigente (80 %/90 %/100 %) sobre horas ordinarias en domingo/festivo; se acumulan.
6. Horas extra (por encima de 7 h hábiles / 6 h dominicales por día): se pagan completas — hora × (1 + recargo): diurna 25 %, nocturna 75 %, dominical/festiva = recargo dominical + 25 %.
7. Deducciones de ley automáticas sobre IBC = devengado salarial (base + recargos + extras, SIN auxilio de transporte); más el aporte AFC opcional (`aporteAfcMensual`, prorrateado igual que el auxilio) como deducción por convenio — no afecta el IBC (Fase 1, ver arriba). El total de deducciones no puede superar `limite_deducciones_salario` (50 %, CST art. 149): si lo excede, se recorta el AFC y se agrega una advertencia.
8. Advertencia de descanso compensatorio cuando se trabajan ≥ 3 domingos en el periodo (CST art. 181).
9. Fixture de regresión (Resplandor, 16–30 jun 2026, horario default): base $875.453 + recargo dominical 12 h × 80 % = $76.403 + auxilio $124.548 − salud/pensión $76.148 → neto $1.000.255. Con AFC de $200.000/mes (caso de prueba adicional): AFC prorrateado $100.000, IBC sin cambios, neto $900.255.

**Esquema JSON del resultado** (`ResultadoNomina`, `packages/reglas/src/types.ts`) — el frontend pinta los tooltips explicativos sin recalcular nada, cada línea ya trae su fórmula:

```jsonc
{
  "modo": "turnos",
  "periodoDesde": "2026-06-16", "periodoHasta": "2026-06-30",
  "salarioBasicoMensual": 1750905,
  "lineas": [
    { "concepto": "Salario básico (15 días)", "base": 1750905, "valorCalculado": 875452.5, "tipo": "devengo", "ley": "Contrato de trabajo; CST art. 127" },
    { "concepto": "Recargo dominical/festivo", "horas": 12, "recargoPct": 0.8, "valorCalculado": 76403.13, "tipo": "devengo", "ley": "Ley 2466 de 2025, art. 2" },
    { "concepto": "Salud (aporte empleado)", "base": 951855.63, "recargoPct": 0.04, "valorCalculado": 38074.23, "tipo": "deduccion", "ley": "Ley 100 de 1993" },
    { "concepto": "Pensión (aporte empleado)", "base": 951855.63, "recargoPct": 0.04, "valorCalculado": 38074.23, "tipo": "deduccion", "ley": "Ley 100 de 1993" },
    { "concepto": "Aporte AFC (convenio)", "valorCalculado": 100000, "tipo": "deduccion", "ley": "E.T. art. 126-4 — deducción por convenio, no afecta IBC (Fase 1: sin declaración de renta)" }
  ],
  "totalDevengos": 951855.63, "totalDeducciones": 176148.46, "netoEsperado": 775707.17,
  "advertencias": []
}
```

- `base` + `recargoPct` presentes ⇒ el tooltip arma `${base} × ${recargoPct*100}%` (así se ve hoy en `ValidationRow.tsx`, caso salud/pensión).
- `horas` + `recargoPct` presentes ⇒ el tooltip arma `${horas}h × valorHora × ${recargoPct*100}%` (caso recargos/extras).
- Solo `valorCalculado` (sin `base` ni `horas`, ej. AFC) ⇒ se muestra como monto fijo, sin fórmula desplegable.
- `tipo: "deduccion"` ⇒ color coral en el `SegmentedControl`; `tipo: "devengo"` ⇒ color mint. Ningún campo nuevo requerido en el frontend — es el mismo contrato que ya consume `PaycheckCard`/`ValidationRow`.
- `advertencias: string[]` ⇒ se listan aparte (banner), incluye el recorte del AFC si aplicó el tope del 50 %.

**Reglas de cálculo salario fijo** (spec v1 `calculo-salario-fijo`, íntegro):
1. Entrada: salario básico mensual + lista abierta de conceptos (código/nombre, tipo: devengo legal · devengo extralegal · deducción legal · deducción por convenio, base y valor).
2. Aportes de ley sobre IBC: salud 4 %, pensión 4 %. Fixture ejecutivo (básico $12.958.400): $518.336 cada uno.
3. Fondo de solidaridad solo si IBC ≥ 4 SMLMV, escalonado 1–2 %; NO exigirlo por debajo. Fixture: 1 % = $129.584.
4. Devengos extralegales (prima, aux. vivienda, medicina prepagada, seguro de vida) no llevan aportes salvo que el usuario los marque salariales.
5. Deducciones por convenio (créditos, seguros, ahorro): valores declarados, no se recalculan, solo suman al total.
6. Retención en la fuente según tabla vigente cuando aplique; diferencia con lo declarado = **advertencia**, no error duro (depende de variables personales que el sistema puede no conocer).
7. Validar `total devengos − total deducciones = neto declarado`; señalar descuadres.
8. Resultado con semáforo por concepto + neto esperado + disclaimer.

### Módulo C — Empresa y nómina

| Requerimiento | Solución | Entidad |
|---|---|---|
| Registro de empresa | Cuenta `admin_empresa` crea su `Empresa` (nombre, NIT, sector) | `Empresa`, `Usuario` |
| Colaboradores | CRUD de empleados con condiciones: salario base, tipo de nómina (`turnos`/`fijo`), auxilio de transporte; un empleado puede existir sin cuenta hasta que se le invita | `Empleado` |
| Periodos de nómina | Quincenal o mensual; estados `borrador → liquidado → pagado` | `PeriodoNomina` |
| Captura de turnos | Por empleado tipo `turnos`: fecha, hora inicio/fin del periodo (grilla editable en la SPA) | `Turno` |
| Liquidación | Botón "liquidar periodo": el mismo motor (§05) calcula cada empleado y genera su recibo con líneas trazables | `ReciboPago` |
| Contabilidad de nómina | Dashboard por periodo: total devengado, total deducido, neto, comparativo entre periodos | derivado de `ReciboPago` |
| Discrepancias entrantes | Bandeja de reportes de colaboradores con estado y respuesta | `ReporteDiscrepancia` |

### Módulo D — Portal del colaborador

| Requerimiento | Solución | Entidad |
|---|---|---|
| Acceso | Invitación de la empresa vincula `Empleado ↔ Usuario(rol colaborador)`; login con email + contraseña | `Usuario`, `Empleado` |
| Mis recibos | Lista de recibos por periodo, detalle línea a línea con fórmula y referencia legal | `ReciboPago` |
| Verificación automática | "Verificar mi recibo": el motor recalcula con las condiciones y turnos registrados y compara contra las líneas del recibo — semáforo por concepto, veredicto (correcto / pagaron de más / pagaron de menos) | derivado |
| Reportar discrepancia | Tipo (`pago_de_mas` · `pago_de_menos` · `concepto_faltante`), detalle libre; estado `abierto → en_revision → resuelto` con respuesta de la empresa | `ReporteDiscrepancia` |
| Chat contador | Disponible también sobre el recibo propio (mismo Módulo E) | — |

### Módulo E — IA: extracción y chat contador

**Extracción** (spec v1 `extraccion-comprobante`, íntegro):
1. Acepta PDF o imagen (JPG/PNG) subida desde el navegador.
2. Se procesa SIEMPRE en `apps/api` (nunca en el navegador — la API key no se expone).
3. Claude visión con salida estructurada (JSON) contra schema fijo: campos comunes (empleado, periodo, salario básico, aux. transporte) + específicos del modo detectado (turnos: días, recargos, extras · fijo: conceptos código/valor).
4. La respuesta se valida contra el schema antes de usarse; si faltan campos obligatorios, se piden al usuario en el formulario — nunca se asumen.
5. Detección automática del modo (`turnos`/`fijo`) por estructura de conceptos, corregible por el usuario.
6. El archivo NO se persiste más allá del procesamiento de la solicitud.
7. Los datos extraídos se muestran editables antes de calcular.

**Chat contador** (spec v1 `chat-contador`, íntegro):
1. Disponible solo cuando existe un `ResultadoNomina` ya calculado por el motor.
2. Cada llamada incluye el `ResultadoNomina` completo + reglas legales usadas como contexto.
3. El LLM NO modifica, recalcula ni contradice las cifras; ante "¿por qué mi comprobante dice otra cosa?" explica la diferencia en términos del resultado calculado.
4. Español, tono cercano, cita ley/porcentaje cuando aplica ("el recargo dominical es del 90 % desde julio de 2026 según la Ley 2466 de 2025").
5. Disclaimer visible en la interfaz del chat.
6. Server-side (`POST /api/chat/explicar`).

---

## 04 — Stack tecnológico

| Tecnología | Rol | Notas |
|---|---|---|
| pnpm workspaces | Monorepo | `apps/web` · `apps/api` · `packages/reglas` |
| React 19 + Vite + TypeScript | SPA (`apps/web`) | Interactividad sin recargas nativa; build estático en producción |
| Tailwind CSS v4 + lucide-react | Estilos e iconos | Tokens en `@theme` (§06) |
| Express + TypeScript | API (`apps/api`) | `routes → controllers → services` |
| **Supabase (Postgres)** | Base de datos | Postgres gestionado; reemplaza SQLite desde la Fase 5 (cuando aparece el modelo empresa/colaborador) |
| **Supabase Auth** | Autenticación | Reemplaza sesiones/bcrypt propios — login, invitación de colaborador, recuperación de contraseña nativos |
| **RLS (Row Level Security)** | Autorización a nivel de fila | Políticas Postgres que aplican el scoping por empresa/colaborador directo en la base, como defensa adicional a la del service |
| Prisma | ORM | Sobre la connection string de Supabase Postgres; `schema.prisma` sigue siendo la fuente del modelo de datos y migraciones |
| `packages/reglas` | Motor de cálculo | TS puro: sin HTTP, sin ORM, sin dependencias de UI; testeable con fixtures reales |
| **Capa de IA multi-proveedor** | Extracción de comprobantes | `ProveedorExtraccionIA` (Strategy) + adaptadores intercambiables — **Gemini** activo (`IA_PROVEEDOR=gemini`), Claude disponible; API keys solo en servidor |
| Vitest | Tests | Motor de reglas con los 2 comprobantes reales como regresión |

### Capa de IA multi-proveedor (`apps/api/src/services/ia/`)

Igual que Advance Fitness (proyecto hermano): una interfaz de dominio
(`ProveedorExtraccionIA.extraerComprobante(archivo, mimeType)`) con
adaptadores intercambiables — `ProveedorGemini` y `ProveedorClaude` — elegidos
por `IA_PROVEEDOR` (env var). El contrato de qué extraer (schema, prompt) es
del dominio y vive en `ia/tipos.ts`; cada adaptador solo traduce esa forma al
formato de su proveedor (Gemini: `responseSchema` OpenAPI en mayúsculas vía
`fetch`; Claude: `tool_choice` forzado vía `@anthropic-ai/sdk`). Añadir un
proveedor nuevo es un archivo más, sin tocar el resto del sistema.

- **Por qué Gemini activo**: sin dependencia adicional (llamada REST directa
  con `fetch`, sin SDK), `responseSchema` nativo para salida estructurada,
  tier gratuito generoso una vez el proyecto de GCP tiene facturación
  habilitada (nota: si la key devuelve 429 con `limit: 0` en
  `generate_content_free_tier_requests`, es porque el proyecto de GCP no
  tiene facturación vinculada — no es un bug del adaptador).
- **Por qué Claude sigue disponible**: cero costo de mantenimiento (ya
  integrado), fallback si Gemini falla o cambia de precio/cuota.

### ¿Qué de Supabase se usa y qué no

Se adoptan solo las piezas que el alcance actual (§02) realmente necesita — el resto queda fuera para no sumar superficie sin requisito:

| Se usa | Por qué |
|---|---|
| **Postgres gestionado** | Reemplaza SQLite en el momento en que el proyecto deja de ser de un solo usuario anónimo (Fase 5): multi-tenant real necesita un motor con concurrencia y backups administrados, no un archivo. |
| **Auth** | El Módulo D (portal colaborador) y el Módulo C (cuentas empresa) ya requerían login, invitación y recuperación de contraseña — Supabase Auth los da nativos y sin código propio de hashing/sesiones que mantener. |
| **RLS** | El requisito central de §08 ("un `admin_empresa` solo ve su empresa; un `colaborador` solo sus recibos") es exactamente lo que RLS resuelve en la base — una política declarativa en vez de repetir el `WHERE empresaId = ...` en cada service. |

| NO se usa (evita sobreingeniería) | Por qué no aplica |
|---|---|
| **Storage** | El comprobante subido NO se persiste (Módulo E, requisito 6) — no hay archivo que guardar. |
| **Realtime** | Ningún flujo del §10 requiere colaboración en vivo entre pestañas/usuarios; los estados (`liquidado`, `resuelto`) se leen al navegar, no se empujan. |
| **Edge Functions** | Ya existe `apps/api` (Express) como capa server-side; duplicar lógica en Edge Functions solo fragmentaría dónde vive el código servidor. |
| **supabase-js para datos en el frontend** | Todo acceso a datos de negocio pasa por `apps/api` (routes → controllers → services), igual que hoy — evita dos caminos de autorización distintos. La única excepción es el **cliente de Auth** (`@supabase/supabase-js`, solo métodos `auth.*`) en `apps/web`, para login/logout/recuperación — es el uso estándar de Supabase Auth y no expone datos de negocio. |

### ¿Por qué se mantiene TypeScript y no se pivota a Rails?

Advance Fitness (proyecto hermano) pivotó de React+Supabase a un monolito Rails y ese aprendizaje se evaluó aquí — la conclusión es la inversa, por tres razones. Primera: **el corazón de este dominio es un motor de cálculo puro** (`packages/reglas`), no un CRUD server-side pesado; TypeScript compartido entre web y api permite que los mismos tipos (`ResultadoNomina`, `DatosEntrada`) viajen del motor al formulario sin duplicación. Segunda: **el scaffold TS ya existe y funciona**; rehacerlo en Rails es costo sin requisito que lo justifique — aquí no hay BaaS del cual escapar (la lección real de Advance Fitness era salir de Supabase, no salir de React). Tercera: **la interactividad pedida es SPA nativa** — formularios de turnos con grilla editable, semáforos en vivo, chat — que React resuelve sin el puente Turbo/Stimulus. Lo que sí se adopta de Advance Fitness: el documento SDD único, la disciplina de capas con prohibiciones explícitas, los derivados que no se persisten, y la IA en el servidor detrás de una capa delgada.

### ¿Por qué la IA no calcula?

La nómina es determinística y auditable: cada peso debe trazarse a una fórmula y una ley. Un LLM que calcula es imposible de garantizar; un LLM que **extrae** (con schema validado) y **explica** (con el resultado como contexto inmutable) aporta exactamente lo que el código no puede. Si la extracción falla el usuario corrige un formulario; si el chat alucina, las cifras siguen siendo las del motor.

---

## 05 — Arquitectura

```
payment_validation/
├─ apps/
│  ├─ web/            # React 19 + Vite + Tailwind (SPA)
│  └─ api/            # Express + Prisma + Supabase (Postgres + Auth)
├─ packages/
│  └─ reglas/         # motor de reglas legales + calculadoras (compartido)
```

| Capa | Responsabilidad | Prohibido |
|---|---|---|
| `packages/reglas` | Tipos de dominio, `CalculadoraPorTurnos`, `CalculadoraSalarioFijo`, interfaz `ReglasLegales` | HTTP, ORM, acceso a red, estado |
| `apps/api` routes | Definición de endpoints, validación de entrada (zod) | Lógica de negocio |
| `apps/api` controllers | Orquestar: autenticar (Supabase Auth), autorizar, delegar, responder | Queries complejas, reglas de negocio inline |
| `apps/api` services | Casos de uso: liquidar periodo, verificar recibo, extraer comprobante, chat | Renderizado, conocimiento de HTTP |
| `apps/web` | Páginas, componentes, estado de UI | Cálculos de nómina (siempre vía API), API keys, acceso directo a Supabase |
| Postgres (RLS) | Última línea de defensa: una política por tabla multi-tenant, escrita una vez en migración SQL | Lógica de negocio (RLS solo filtra filas, no calcula) |

- **Patrón Strategy** (único patrón explícito): interfaz común `calcular(datosEntrada, reglas): ResultadoNomina` con dos implementaciones intercambiables. La liquidación de empresa y el verificador anónimo usan **las mismas** calculadoras — un solo lugar donde vive la ley.
- **Derivados no se persisten** en el flujo anónimo (nada se guarda) ni en la verificación del colaborador (se recalcula al momento). El `ReciboPago` sí persiste sus líneas: es un documento emitido, snapshot histórico de lo liquidado con las reglas de entonces.
- **La verificación del colaborador** compara el snapshot (recibo) contra el recálculo en vivo — si la empresa corrigió turnos después de liquidar, la diferencia aflora.
- **Dos capas de autorización, no una**: el service de Express sigue siendo quien decide qué query correr (fuente de verdad de la lógica), y las políticas RLS en Postgres son la red de seguridad si algún día una query se arma mal — el scoping por `empresaId`/`colaboradorId` queda garantizado incluso ante un bug del service.

```
┌────────────┐  HTTP/JSON  ┌──────────────────────────────────────┐
│  React SPA  │◄──────────►│  Express API                          │
│  (apps/web) │             │  routes → controllers → services      │
└────────────┘             │        │            │                 │
                           │  packages/reglas   Claude API          │
                           │  (calculadoras)    (extraer/explicar)  │
                           │        │                               │
                           │     Prisma ── Supabase Postgres (RLS)  │
                           │     Supabase Auth (login/invitación)   │
                           └──────────────────────────────────────┘
```

### Despliegue (Docker)

Imagen única multi-stage (`Dockerfile`, raíz del repo) — no hay contenedores separados para `api`/`web`: el server Express de `apps/api` sirve el build estático de `apps/web` (`web-dist/`) además de `/api/*`, un solo puerto (80).

- **Etapa `build`**: instala todo el workspace pnpm, corre `prisma generate`, compila `packages/reglas` → `apps/api` → `apps/web`, y usa `pnpm deploy --prod --legacy` para extraer solo las dependencias de producción de `@pv/api` (incluye `@pv/reglas` ya compilado).
- **Etapa final**: usuario no-root (`nomicheck`, uid/gid 1001 — 1000 ya existe en `node:slim`), copia artefactos compilados (`dist/`, `web-dist/`, `prisma/`) + `node_modules` de producción. `prisma` (CLI) vive en `dependencies`, no `devDependencies`, porque el entrypoint lo necesita en runtime.
- **`bin/docker-entrypoint`**: corre `prisma migrate deploy` contra `DATABASE_URL` antes de arrancar (salvo `SKIP_DB_MIGRATE=1`), luego `exec` al `CMD`.
- **Desarrollo** (`docker-compose.yml` + `Dockerfile.dev` + `bin/docker-entrypoint.dev`): api+web+postgres con hot-reload, código montado en vivo. Los `node_modules` viven en volúmenes nombrados (uno por paquete) que arrancan vacíos en el primer `up` y sobrescriben lo instalado en build time — por eso `docker-entrypoint.dev` corre `pnpm install` + `prisma generate` en cada arranque del contenedor, no solo en el Dockerfile. El store de pnpm también es un volumen nombrado (`pnpm_store`), así que tras la primera vez las reinstalaciones son casi instantáneas. El proxy de Vite (`web`) resuelve la API por nombre de servicio (`API_PROXY_TARGET=http://api:3001`), no `localhost`.
- **Variables `VITE_*`** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) se incrustan en el bundle en *build time* — deben pasarse como `--build-arg`, no como variables de runtime del contenedor. Son claves publishable, seguras para el navegador.
- Variables de runtime (`.env` de `apps/api`: `DATABASE_URL`, `SUPABASE_*`, `GOOGLE_CLIENT_*`, `JWT_SECRET`, `IA_PROVEEDOR`, etc.) se inyectan con `--env-file` o `-e` al hacer `docker run`.

```
docker build -t nomicheck \
  --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<publishable-key> .
docker run -d -p 80:80 --env-file apps/api/.env --name nomicheck nomicheck
```

---

## 06 — Sistema de diseño

- **Dirección de arte (v2.2)**: FinTech moderna — fondo `surface #F8FAFC`, header `midnight #0F172A` con patrón de dots, acento `mint #10B981` (acciones/éxito), `coral #EF4444` (deducciones/alertas), textos slate. Tipografía Inter/Plus Jakarta Sans (fallback system).
- **Tokens Tailwind v4** en `@theme` (`apps/web/src/index.css`): `--color-surface`, `--color-midnight`, `--color-mint`, `--color-coral`, `--color-ink`, `--color-muted`, `--font-sans`.
- **Componentes**: `HeaderProfile` (header midnight con periodo), `SegmentedControl` (píldora Resumen/Recargos/Deducciones), `PaycheckCard` (blanca, rounded-2xl, shadow-sm), `ValidationRow` (icono + concepto + badge horas + valor + tooltip con fórmula), `FinancialProgressBar` (base azul · recargos mint · deducciones coral), `SkeletonResultado` (loading). Transiciones ease-in-out 200 ms.
- **Disclaimer legal** siempre visible en resultado, recibo y chat: "estimado informativo, no reemplaza la liquidación oficial ni asesoría legal certificada".
- Responsive móvil-primero (≥ 375 px): un colaborador verifica su recibo desde el celular.

---

## 07 — Entidades del dominio

Prisma sobre SQLite, dominio en español. Las líneas anidadas por naturaleza (recibo) van como JSON.

### `Usuario` — perfil de dominio (auth vive en Supabase)
La identidad y credenciales (email, password, sesión) las gestiona **Supabase
Auth** (`auth.users`) — no se replican en el schema de Prisma. `Usuario` es
la tabla de **perfil** de dominio, 1:1 con `auth.users` por `id` (mismo UUID):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | igual a `auth.users.id` (FK lógica, sin passwordHash propio) |
| `nombre` | string | — |
| `rol` | string | enum: `admin_plataforma` · `admin_empresa` · `colaborador` — absorbe el `AdminUsuario` de v1 |
| `empresaId` | FK? → `Empresa` | null para `admin_plataforma` |

> La invitación de colaborador (Módulo D) usa el flujo nativo de invite de
> Supabase Auth (envía el link, el usuario define su contraseña al aceptar)
> en vez de un token propio.

### `Empresa`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | PK | — |
| `nombre` / `nit` / `sector` | string | sector: texto libre (restaurante, oficina…) |

### `Empleado` — condiciones laborales del colaborador en la empresa
| Columna | Tipo | Notas |
|---|---|---|
| `id` | PK | — |
| `empresaId` | FK → `Empresa` | — |
| `usuarioId` | FK? → `Usuario` | null hasta que se le invita — el empleado existe en nómina sin cuenta |
| `nombre` / `documento` | string | — |
| `salarioBase` | decimal | mensual, COP |
| `tipoNomina` | string | enum: `turnos` · `fijo` |
| `auxilioTransporte` | boolean | si aplica (salario ≤ 2 SMLMV) |
| `activo` | boolean | retiro sin borrar historial |
| `tipoContrato` | string? | **Futuro (out of scope MVP)** — ver nota abajo |

> **Nota — `tipoContrato` (pendiente):** el tipo de contrato laboral es una dimensión **ortogonal** a `tipoNomina` (`turnos`/`fijo`) y afecta los cálculos de formas que el motor actual no maneja. Queda documentado aquí para que ninguna fase futura lo asuma como "igual al estándar" sin revisarlo:
>
> | Tipo de contrato | Impacto en el cálculo | Estado |
> |---|---|---|
> | **Término indefinido** | Reglas estándar — es lo que el motor implementa hoy | ✅ cubierto implícitamente |
> | **Término fijo** | Devengos/deducciones idénticos al indefinido; prima y liquidación se prorratean si el plazo < 12 meses (aplica en §14 prestaciones sociales, fuera del MVP) | ⚠️ sin impacto en MVP (prestaciones out of scope) |
> | **Obra o labor** | Ídem término fijo en la práctica; prestaciones proporcionales al tiempo de vinculación | ⚠️ sin impacto en MVP |
> | **Aprendizaje SENA** | El "salario" es un **auxilio de sostenimiento** (no salarial), Ley 789 de 2002 art. 30: en la etapa **lectiva** no hay ningún aporte a seguridad social; en la **práctica** solo aporte de salud (sin pensión ni fondo de solidaridad). No genera auxilio de transporte ni prestaciones sociales | ✅ implementado — `tipoContrato: "aprendizaje_sena_lectiva" \| "aprendizaje_sena_practica"` en `DatosNominaTurnos`/`DatosNominaFija` y `Empleado.tipoContrato`; `deduccionesDeLey()` acepta `alcance: "completo"\|"solo_salud"\|"ninguno"` |
> | **Prestación de servicios** | Técnicamente no es contrato laboral: el contratista cotiza como **independiente** sobre el 40 % del ingreso bruto (Ley 1819 de 2016, art. 244, no el 100 %); no hay auxilio de transporte, no hay recargos nocturnos/dominicales, no hay prestaciones | ✅ implementado como tercera Strategy `CalculadoraServicios` (`modo: "servicios"`, `DatosNominaServicios`) — los aportes del independiente se muestran solo como advertencia (referencia informativa), nunca como deducción, porque quien contrata no los retiene. Disponible en `/nomina/calcular`; **no** modelado aún en `Empleado` del modo empresa (no es contrato laboral, ver nota debajo) |
> | **Tiempo parcial** | El IBC mínimo para cotizar es 1 SMLMV sin importar lo ganado (tope inferior de cotización) — si el salario parcial < SMLMV, la base de aportes se eleva al mínimo | 🚫 no implementado |
>
> **Implicación para el MVP:** el motor asume tácitamente contrato a término indefinido u obra/fijo ordinario. Los casos de aprendizaje SENA, prestación de servicios y tiempo parcial por debajo del mínimo producirían resultados incorrectos si se ingresan hoy. La solución definitiva es agregar `tipoContrato` al schema y una rama en `aplicarDeducciones()` / `calculadoraTurnos.ts`; mientras tanto, el wizard debería al menos advertir al usuario si el salario declarado es exactamente el 50 % del SMLMV (posible aprendiz). Tarea registrada en §14.

### `PeriodoNomina`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | PK | — |
| `empresaId` | FK → `Empresa` | — |
| `fechaInicio` / `fechaFin` | date | quincenal o mensual |
| `estado` | string | enum: `borrador` · `liquidado` · `pagado` — solo `borrador` acepta turnos nuevos |

### `Turno` — insumo de la calculadora por turnos
| Columna | Tipo | Notas |
|---|---|---|
| `id` | PK | — |
| `empleadoId` / `periodoId` | FK | — |
| `fecha` | date | — |
| `horaInicio` / `horaFin` | string HH:mm | el motor deriva diurno/nocturno/dominical/extra — nada de eso se persiste |

### `ReciboPago` — documento emitido (snapshot)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | PK | — |
| `empleadoId` / `periodoId` | FK | unique compuesto |
| `lineas` | JSON | `[{ concepto, tipo, formula, referenciaLegal, cantidad?, valor }]` |
| `totalDevengado` / `totalDeducido` / `neto` | decimal | — |
| `liquidadoEn` | datetime | — |

### `ReporteDiscrepancia`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | PK | — |
| `reciboId` | FK → `ReciboPago` | — |
| `colaboradorId` | FK → `Usuario` | quien reporta |
| `tipo` | string | enum: `pago_de_mas` · `pago_de_menos` · `concepto_faltante` |
| `detalle` | text | — |
| `estado` | string | enum: `abierto` · `en_revision` · `resuelto` |
| `respuestaEmpresa` | text? | — |

### `ReglaLegal` y `Festivo` (v1, sin cambios)
`ReglaLegal(id, clave, valor decimal, vigenteDesde, vigenteHasta?, fuente, creadoEn)` — validación de no-solape por clave. `Festivo(id, fecha unique, nombre)`.

> **Privacidad del flujo anónimo:** ninguna entidad guarda datos del verificador anónimo. El comprobante subido vive solo en memoria durante la solicitud de extracción.

### Políticas RLS (Postgres) — una por tabla multi-tenant

Se activan en las tablas que distinguen dueño (`Empleado`, `PeriodoNomina`,
`Turno`, `ReciboPago`, `ReporteDiscrepancia`). Cada política compara contra
`auth.uid()`, sin lógica adicional:

| Tabla | Política |
|---|---|
| `Empleado`, `PeriodoNomina`, `Turno` | `empresaId = (SELECT empresaId FROM "Usuario" WHERE id = auth.uid())` |
| `ReciboPago` | visible si pertenece a la empresa del usuario (join a `Empleado`) **o** si `empleado.usuarioId = auth.uid()` (el propio colaborador) |
| `ReporteDiscrepancia` | insertable solo por el `colaboradorId = auth.uid()` dueño del recibo; visible también por la empresa dueña del recibo |
| `ReglaLegal`, `Festivo` | lectura pública (las usa también el verificador anónimo), escritura solo `rol = 'admin_plataforma'` |
| `Usuario` | cada quien lee/edita su propia fila (`id = auth.uid()`); `admin_empresa` lee las de su `empresaId` |

`Usuario.rol` y `Usuario.empresaId` son la fuente que las políticas
consultan — por eso esa tabla se vuelve "de confianza" (no editable por el
propio colaborador vía RLS, solo por servicio o `admin_plataforma`).

---

## 08 — Seguridad y autenticación

- **Autenticación vía Supabase Auth**: login, verificación de email y recuperación de contraseña nativos — reemplaza sesiones/bcrypt propios. `apps/api` valida el JWT de Supabase en cada request (middleware que decodifica y adjunta `req.usuario`).
- **Middleware de rol**: `requiereRol('admin_empresa')` etc. en cada ruta protegida, leyendo `Usuario.rol`; el flujo anónimo no pasa por auth.
- **Doble capa de scoping** (§05): el service arma la query filtrada por `empresaId`/`empleadoId` (como antes) **y** las políticas RLS (§07) filtran a nivel de fila en Postgres — si el service tuviera un bug, RLS igual impide la fuga entre empresas.
- **Invitación de colaborador**: la empresa dispara el invite nativo de Supabase Auth ligado al `Empleado`; el colaborador define su propia contraseña al aceptar — la empresa nunca fija contraseñas.
- **API key de Claude** solo en `apps/api` (`.env`, fuera de git) — nunca la de Supabase service-role en el navegador. **Rate limit** en `/api/comprobantes/extraer` y `/api/chat/explicar` (endpoints con costo).
- Validación de entrada con **zod** en cada endpoint; los archivos subidos se limitan por tamaño y tipo MIME y nunca tocan disco (ni Storage: no se persisten, Módulo E).

---

## 09 — Contrato API (REST)

| Método y ruta | Auth | Descripción |
|---|---|---|
| `POST /api/comprobantes/extraer` | — | Archivo → Claude visión → JSON validado (no persiste) |
| `POST /api/nomina/calcular` | — | Datos + modo → `ResultadoNomina` (verificador anónimo) |
| `POST /api/chat/explicar` | — | `ResultadoNomina` + pregunta → explicación |
| `POST /api/auth/registro` | — | Crea usuario en Supabase Auth + `Empresa` + perfil `Usuario(rol: admin_empresa)` en una transacción |
| `POST /api/auth/invitar-aceptar` | — | Colaborador acepta invitación de Supabase Auth → crea su perfil `Usuario(rol: colaborador)` vinculado al `Empleado` | 
| — `/login` · `/logout` · recuperación | — | Manejados directo por el SDK de Supabase Auth desde `apps/web`, sin pasar por Express |
| `GET/POST/PUT /api/empresa/empleados` | admin_empresa | CRUD empleados |
| `POST /api/empresa/empleados/:id/invitar` | admin_empresa | Genera invitación de cuenta colaborador |
| `GET/POST /api/empresa/periodos` | admin_empresa | Periodos de nómina |
| `PUT /api/empresa/periodos/:id/turnos` | admin_empresa | Captura/edición de turnos (solo `borrador`) |
| `POST /api/empresa/periodos/:id/liquidar` | admin_empresa | Genera los `ReciboPago` del periodo |
| `GET /api/empresa/recibos` · `/api/empresa/reportes` | admin_empresa | Recibos y bandeja de discrepancias (+ responder) |
| `GET /api/mis-recibos` · `/:id` | colaborador | Recibos propios |
| `POST /api/mis-recibos/:id/verificar` | colaborador | Recalcula y compara → veredicto + semáforos |
| `POST /api/mis-recibos/:id/reportar` | colaborador | Crea `ReporteDiscrepancia` |
| `GET/PUT /api/admin/reglas` · `/api/admin/festivos` | admin_plataforma | CRUD reglas legales y festivos |

---

## 10 — Flujos principales

### Flujo A — Verificación anónima
1. Usuario elige modo (o sube comprobante → extracción detecta el modo, corregible).
2. Formulario precargado/manual; festivos del rango detectados y confirmados; validaciones de coherencia (domingos, jornada máxima).
3. `POST /api/nomina/calcular` → resultado con tramos si cruza corte normativo, semáforo por concepto, fórmula + ley en cada línea.
4. Chat contador disponible sobre ese resultado. Nada se persiste.

### Flujo B — Empresa liquida un periodo
1. Admin de empresa crea el periodo (`borrador`) y captura turnos en la grilla (empleados `fijo` no requieren turnos).
2. "Liquidar" → el motor calcula cada empleado con las reglas vigentes en el periodo → se generan los `ReciboPago` → estado `liquidado`.
3. Dashboard muestra totales del periodo; los colaboradores con cuenta ven su recibo nuevo en su portal.

### Flujo C — Colaborador verifica y reporta
1. Colaborador abre su recibo → "Verificar": el motor recalcula con turnos/condiciones registrados y compara línea a línea.
2. Veredicto: correcto · pagaron de más · pagaron de menos, con la diferencia por concepto.
3. Si difiere (o si él sabe algo que el sistema no, ej. un turno no registrado), reporta discrepancia → la empresa la ve en su bandeja, revisa, responde y resuelve.

### Flujo D — Admin actualiza una regla legal
1. Cambio normativo → admin de plataforma agrega registro nuevo con `vigenteDesde` (el anterior recibe `vigenteHasta`); el sistema valida no-solape.
2. Cálculos futuros usan el valor nuevo automáticamente; cálculos sobre fechas pasadas siguen usando el histórico. Cero deploys.

---

## 11 — Fases

Cada fase entrega algo usable de punta a punta.

| Fase | Entrega | Contenido |
|---|---|---|
| **1** | Motor confiable | `packages/reglas`: tipos `DatosEntrada`/`ResultadoNomina`, `CalculadoraPorTurnos` + `CalculadoraSalarioFijo`, tests Vitest con los 2 comprobantes reales como regresión (incl. caso límite: periodo que cruza 1-jul/15-jul-2026). Schema Prisma `ReglaLegal`/`Festivo` sobre **Supabase Postgres** (proyecto creado desde esta fase, aunque el resto de tablas llegue en Fase 5) + seed legal jul-2026 |
| **2** | Verificador anónimo manual | Formularios turnos y fijo, `POST /api/nomina/calcular`, página de resultado con semáforo, fórmulas y disclaimer |
| **3** | Extracción por imagen | `POST /api/comprobantes/extraer` (Claude visión + zod schema), UI de carga, revisión editable de datos extraídos, detección de modo |
| **4** | Chat contador | `POST /api/chat/explicar`, panel de chat en la página de resultado |
| **5** | Cuentas y empresa | Schema completo (§07) migrado a Supabase Postgres, **Supabase Auth** para registro/login, políticas RLS (§07) aplicadas por migración SQL, CRUD empleados, invitación de colaborador vía Auth |
| **6** | Liquidación | Periodos, grilla de turnos, liquidar → recibos, dashboard de totales |
| **7** | Portal colaborador | Mis recibos, verificación automática, reporte de discrepancia + bandeja de la empresa |
| **8** | Panel admin de reglas | CRUD reglas/festivos con historial de vigencias y validación de no-solape |

---

## 12 — Decisiones fijas

| Decisión | Detalle |
|---|---|
| El cálculo es determinístico | La IA nunca calcula ni contradice al motor. Extrae y explica, nada más |
| Reglas legales = datos versionados | Nunca constantes en código; vigencias por fecha, sin solapes, con fuente |
| Flujo anónimo sin persistencia | Ni archivo, ni datos, ni resultado. Privacidad por diseño |
| Un solo motor para ambos modos | Liquidar (empresa) y verificar (anónimo/colaborador) usan las mismas calculadoras |
| El recibo es snapshot; la verificación es en vivo | El recibo no se recalcula al cambiar reglas; la verificación sí — la diferencia es información |
| La carga cognitiva vive en el código | El usuario declara tiempo (turnos, novedades); nunca conceptos contables ni deducciones — el motor clasifica y deduce |
| Español en dominio, código y UI | Entidades, conceptos y mensajes |
| Disclaimer legal siempre visible | Resultado, recibo y chat |
| Supabase solo para Postgres + Auth + RLS | Sin Storage/Realtime/Edge Functions ni `supabase-js` de datos en el frontend — el alcance actual no los pide (detalle en §04) |
| Doble capa de autorización | El service filtra por `empresaId`/`empleadoId` (lógica) y RLS filtra por fila (defensa); ninguna reemplaza a la otra |
| **Metodología**: este SDD es la fuente de verdad | Cambios de comportamiento → editar este documento (bump de versión + nota) y luego implementar. Fixes triviales van directo a código. La carpeta `sdd/` es historial de la etapa v1 |

---

## 13 — Checklist MVP

- [x] Fase 1 — motor + tests de regresión con los 2 comprobantes reales (26 tests, `packages/reglas`) + Supabase Postgres conectado con schema inicial migrado
- [x] Fase 2 — verificador anónimo manual end-to-end (formularios turnos/fijo, `POST /api/nomina/calcular`, resultado con comparación neto esperado vs. recibido)
- [x] Fase 3 — extracción por imagen: código completo (`POST /api/comprobantes/extraer`, capa multi-proveedor Gemini/Claude, editable antes de calcular). **⏸ Pausado**: bloqueado por falta de facturación habilitada en el proyecto de GCP de las keys de Gemini provistas (429 `limit: 0`); Claude sigue con key placeholder. Retomar cuando haya una key funcional — cambiar `IA_PROVEEDOR` en `.env` no requiere tocar código.
- [x] Fase 4 — chat contador: código completo (`POST /api/chat/explicar`, `chatService.ts` — solo Claude, no pasa por la capa multi-proveedor de extracción porque es texto, no visión). El prompt de sistema serializa el `ResultadoNomina` completo (líneas, totales, advertencias, cita legal de cada línea) y explícitamente instruye a NUNCA recalcular ni contradecir las cifras. UI: `ChatContador.tsx` con disclaimer siempre visible, montado en `Resultado.tsx` (wizard anónimo) y en `DashboardColaborador.tsx` (un chat por recibo propio, adaptando `ReciboPropio` a la forma `ResultadoNomina`). **⏸ Sigue pausado en la práctica**: verificado con una llamada real a la API — la validación Zod, el armado del contexto y la llamada a Anthropic funcionan correctamente, pero `ANTHROPIC_API_KEY` sigue sin ser una key válida (`401 invalid x-api-key`), igual que Fase 3. La UI maneja el error con gracia (se ve en el historial del chat). En cuanto haya una key real, la Fase 4 queda funcional sin tocar código
- [x] Fase 5 — cuentas + empresa + empleados: schema completo migrado (`Empresa`, `Empleado`, `PeriodoNomina`, `Turno`, `ReciboPago`, `ReporteDiscrepancia`) con políticas RLS aplicadas; Supabase Auth (Google + email) para registro/login; middleware `requiereAuth`/`requiereRol`; CRUD de empleados + invitación de colaborador. Verificado end-to-end en navegador (registro → login → crear empleado) y limpiado de la base
- [x] Fase 6 — liquidación y recibos: `PeriodoNomina` (borrador/liquidado), captura de `Turno` en grilla, `POST .../liquidar` genera `ReciboPago` por empleado reusando `CalculadoraPorTurnos`/`CalculadoraSalarioFijo` de `packages/reglas` (mismo motor del verificador anónimo). Verificado end-to-end en navegador: recibo liquidado coincide exactamente con la aritmética esperada
- [x] Fase 7 — portal colaborador + discrepancias: `requiereAuth` adjunta `empleadoId` (join `Usuario.empleado`); rutas `GET /colaborador/recibos` y `POST /colaborador/recibos/:id/reportar` (`soloColaborador`) filtran siempre por el `empleadoId` del token — nunca de otro colaborador. Lado empresa: `GET/PUT /empresa/discrepancias` para ver y responder. UI: `PortalColaborador.tsx` (nuevo shell en `/colaborador`, login con `AuthColaborador.tsx` — sin auto-registro, la cuenta la crea la invitación existente) lista recibos propios con `ValidationRow` reutilizado y un formulario de reporte; pestaña "Discrepancias" nueva en `EmpresaApp.tsx`. Verificado con un script contra la DB de desarrollo (Supabase Auth es remoto, no se puede fabricar un login real): recibos propios correctos, reporte→respuesta funcionando, y un intento de reportar con un `empleadoId` ajeno rechazado ("Recibo no encontrado")
- [x] Fase 8 — panel admin de reglas: rol `admin_plataforma` (`soloPlataforma` en `routes/index.ts`; sin auto-registro público — el primer usuario se crea a mano, SQL directo o `seed.ts` en desarrollo). `GET /admin/reglas` agrupa `ReglaLegal` por clave enriquecido con `catalogoReglas.ts` (etiqueta/unidad/fuente, sin que la UI tenga que adivinar). `POST /admin/reglas` crea una nueva vigencia con el patrón SCD2 ya usado en `fixtures.ts`/`seed.ts`: cierra automáticamente la vigencia abierta anterior de esa clave (`vigenteHasta` = el día antes) y rechaza una nueva vigencia que no sea estrictamente posterior. Llama `invalidarCacheReglas()` (la función ya existía desde la pasada de performance, comentada para este uso exacto) — el próximo cálculo ve el cambio de inmediato, sin esperar el TTL de 5 min. CRUD simple de `Festivo`. UI: nuevo shell `AdminPlataforma.tsx` en `/admin`. Verificado con un script contra la DB de desarrollo (mismo motivo que Fase 7 — no se puede fabricar un login real de Supabase): nueva vigencia de `smlmv` cierra la anterior exactamente en la fecha esperada, el cache se invalida automáticamente, y una vigencia no posterior a la última es rechazada
- [x] AFC Fase 1 (deducción por convenio) + preparación Fase 2 (renta exenta): `aplicarDeducciones()` en `packages/reglas`, tope 50% (CST art. 149), semilla `ReglaLegal` ampliada con `uvt` (corregido a $52.374, valor 2026 real — el borrador de diseño traía el de 2025), `limite_porcentaje_afc`, `limite_anual_uvt_afc`, `limite_rentas_exentas_porcentaje`, `limite_deducciones_salario`; catálogo de metadatos (`catalogoReglas.ts`) para el futuro panel admin. Verificado con tests (33/33) y en navegador real (wizard con AFC $200.000/mes → línea coral $100.000 prorrateada, IBC sin cambios, neto correcto)
- [x] Tope de auxilio de transporte (2 SMLMV) + embargo judicial (ordinario y alimentos/cooperativa, CST art. 154-156) + periodo interactivo por periodicidad en el wizard. Nuevo endpoint público `GET /api/reglas/parametros`. Verificado con tests (37/37, incluye la corrección del bug de proración del SMLMV contra periodos parciales) y en navegador real (salario > tope oculta el auxilio con advertencia; quincena 16→30-jun se autocalcula)
- [x] Deducciones por convenio generalizadas (Préstamo, Ahorro, Reproceso, junto a AFC) con recorte proporcional al tope del 50%; UI simplificada a checks (reemplaza el `<select>` de embargo por dos checkboxes excluyentes, cada deducción de convenio revela su monto solo si está marcada). Test de regresión explícito para recargo dominical + nocturno acumulados (RESPLANDOR, cierre después de 19:00). Verificado con tests (40/40) y en navegador real contra el compose de desarrollo
- [x] **Bug real corregido — redondeo por línea ("paradoja de la calculadora")**: `DECIMALES_REDONDEO` estaba en 2 (centavos) pese a que su propio comentario ya decía "sin centavos fraccionados en la práctica" — se corrigió a 0 (peso entero), y se renombró `round2` → `redondearPeso` en todo `packages/reglas` para que el nombre no siga sugiriendo 2 decimales. Antes, un empleado que multiplicaba horas × valor unitario impreso podía obtener un total distinto en 10-20 pesos al que mostraba la app, porque el total se sumaba con decimales internos y solo se redondeaba al mostrar. Ahora cada línea se redondea ANTES de sumar — la suma de lo impreso siempre cuadra exactamente con el total impreso. Se revisaron también los otros dos supuestos "bugs" de un documento de análisis operativo: **vigencias del recargo dominical** (`vigenteHasta: 2026-06-30` / `vigenteDesde: 2026-07-01`, ya correctas — hay tests explícitos en `utils.test.ts` que fijan exactamente esas dos fechas) y **validación de `Empleado`** (`nombre`/`documento` ya son `z.string().min(1)` obligatorios en `empleadoSchema`, y además columnas `NOT NULL` en el schema de Prisma — no hay ruta de código que permita persistir un empleado sin esos campos). Ninguno de los dos reproducía en este sistema; se agregó además un test de regresión para prorrateo dinámico con un periodo de 14 días (ingreso tardío/cierre anticipado), confirmando que el motor nunca asume 15 días fijos. Verificado con 41/41 tests y en navegador real (suma de líneas = total mostrado, sin descuadres)
- [x] **Auditoría de casos extremos + performance + arquitectura (jul-2026)**, en tres fases:
  - *Correctitud legal:* tope de horas extra (2h/día D.L. 13 de 1967, 12h/semana Ley 6 de 1981) como reglas `max_horas_extra_dia`/`max_horas_extra_semana` — el motor **paga todo lo trabajado (primacía de la realidad) pero advierte la infracción** por día y por semana calendario. Periodo invertido y fechas inexistentes (2026-02-30) ahora lanzan error en motor Y API (antes: resultado silencioso de $0 / desborde de Date a marzo). Turno "10:00→10:00" rechazado (ambiguo 0h vs 24h; antes se interpretaba como 24h en silencio). Salario ≤ 0 y novedades duplicadas rechazados en el motor (última defensa — liquidacionService no pasa por zod). Auxilio de transporte ahora también en modo salario fijo (helper compartido `auxilio.ts`; antes ese modo ignoraba el flag). Bug latente corregido: los campos `horas` de las líneas usaban el redondeo a peso entero (truncaba 1.5h→2h) — nuevo `redondearHoras` (2 decimales). Suite `casosExtremos.test.ts`: fondo de solidaridad en TODOS los tramos (16-20+ SMLMV con bordes), domingo 18:00→06:00 (12h: dominical+nocturna+extra+medianoche, factor 2.55 al peso), cruce del divisor 220→210 con extras en ambos tramos, embargo en el borde exacto del SMLMV prorrateado ($0), y embargo+convenio simultáneos (cada tope por separado, neto legalmente $0 en el extremo).
  - *Performance:* `crearResolutorReglas()` (índice por clave + cache por consulta, construido una vez por cálculo — antes `reglaEn` filtraba y ordenaba todo el arreglo en cada una de ~40 llamadas); cache en memoria de reglas/festivos en la API (TTL 5 min + `invalidarCacheReglas()` para el CRUD admin de Fase 8 — antes 2 queries a Supabase por CADA request anónimo); rate limit 30 req/min en `/nomina/calcular` (antes sin límite). `minutosNocturnosEnTramo` minuto-a-minuto se mantiene: con turnos <24h el costo es despreciable y la claridad gana.
  - *Arquitectura:* `ensamblarResultado()` compartido (cierre de totales antes duplicado en ambas Strategy); eliminadas funciones muertas de `utils.ts` (`horasNocturnas` — que además duplicaba las constantes de franja nocturna —, `horasEntre`, `esLunes`); regex de validación deduplicados en `validation/comunes.ts`; `TipoEmbargo`/`DescuentoJudicial` canónicos en `types.ts`; clasificación de conceptos con mapa `satisfies` (el compilador obliga a cubrir tipos nuevos); cast tipado a `Prisma.InputJsonValue` en vez del round-trip JSON.
  - Verificado: 71 tests (de 43), typecheck limpio, y en vivo contra el compose — periodo invertido/fecha inexistente → 400, ráfaga → 429, y el wizard muestra el banner de advertencia del tope de extras con las líneas del caso extremo cuadrando al peso.
- [x] **Bug real corregido — hora extra dominical nocturna subpagada**: `calculadoraTurnos.ts` fusionaba TODAS las horas extra en domingo/festivo (diurnas y nocturnas) en una sola línea con el factor diurno (100%+25%+recargo dominical = 2.05/2.15), sin importar si la hora caía de noche. Una hora extra dominical nocturna debe pagarse a 100%+75%+recargo dominical = 2.55/2.65 (CST art. 168 + Ley 2466 de 2025) — el factor de la extra nocturna (75%), no el de la diurna (25%). Se separó en dos líneas independientes: "Hora extra dominical/festiva diurna" y "Hora extra dominical/festiva nocturna", cada una con su propio porcentaje. `ValidationRow.tsx` no necesitó cambios (ya usa `startsWith("Hora extra dominical")` para el ícono). Verificado con test de regresión explícito (domingo 14:00–22:00: 2h extra 100% nocturnas → factor 2.55) y en vivo contra la API real: `recargoPct: 1.55` (2.55 total) en la línea nocturna, separada de la ordinaria — 42/42 tests
- [x] **Años bisiestos**: `rangoFechas()` (motor, usado por todo cálculo de nómina) ya funcionaba bien porque usa `Date` nativo — se agregó test de regresión explícito (29-feb-2028 incluido, 2026 lo omite) para dejarlo blindado. **Bug real corregido** en `finDePeriodoMensual()` (nuevo, movido desde un helper local de `PasoSalario.tsx` a `packages/reglas/src/utils.ts` para poder testearlo): calcular la fecha fin de un periodo "mensual" iniciado en un día que no existe en el mes siguiente (29/30/31, con el caso extremo de febrero según sea bisiesto) hacía que `Date` desbordara al mes SUBSIGUIENTE (31-ene-2026 daba 2-mar en vez de fin de febrero) — se corrige acotando (`clamp`) al último día real del mes siguiente antes de restar el día. Verificado con 47/47 tests y en navegador real contra el compose de desarrollo: 31-ene-2028 (bisiesto) con periodicidad mensual → 28-feb-2028 (antes daba 1-mar)
- [x] Docker — imagen única de producción (`Dockerfile`) + `docker-compose.yml`/`Dockerfile.dev` para desarrollo con hot-reload. Verificado: build produce imagen que sirve API + SPA en un solo puerto (80), `prisma migrate deploy` corre en el entrypoint, y el compose de desarrollo levanta api+web+postgres con el proxy `web→api` resolviendo por nombre de servicio
- [x] **Prestaciones sociales completas** (cesantías, intereses, prima, vacaciones): `calcularPrestacionesSociales()` en `packages/reglas/src/prestaciones.ts` — implementa lo que la nota de transición v2.3 (arriba) ya declaraba, pero que se había colado sin código real en el commit `2dd1d5b` (error detectado y corregido en este mismo pase). Fórmulas CST 249/306/186 + Ley 52 de 1975 sobre año comercial de 360 días; soporta salario variable (promedio, CST art. 253), días excluidos por suspensión disciplinaria, y prima topada a 180 días/semestre. `Empleado.fechaIngreso` (nueva columna obligatoria) es la base de antigüedad. `liquidacionService.ts` anexa 4 líneas `tipo: "provision"` por recibo (ventana del periodo liquidado) que se listan pero no afectan `totalDevengado`/`totalDeducido`/`neto` (pasivo del empleador, no pago al colaborador). Verificado con 9 tests nuevos (80/80 en total, incluida la prueba de que el año bisiesto no rompe el divisor fijo de 360) y en navegador real: empleado con fecha de ingreso → liquidar periodo → recibo con las 4 líneas de provisión visibles sin alterar el neto
- [x] **Liquidación final al retiro**: `Empleado.fechaRetiro` (nullable) + `POST /empresa/empleados/:id/retirar` (marca `activo=false`, valida `fechaRetiro >= fechaIngreso`) y `POST /empresa/empleados/:id/liquidacion-final` (`liquidacionFinalService.ts`). Suma TODAS las líneas `tipo: "provision"` ya generadas en los recibos históricos del empleado (hasta ahora un pasivo solo informativo) más el tramo entre el último periodo liquidado y la fecha de retiro (vía `calcularPrestacionesSociales`), y genera un `ReciboPago` de cierre con esos 4 montos como `tipo: "devengo"` (ahora sí pagados) — bloqueado contra doble liquidación (busca líneas `"Liquidación final —…"` existentes). UI: botón "Retirar" (revela "Liquidar final") en `DashboardEmpresa.tsx`. Verificado end-to-end contra la DB de desarrollo: empleado con un periodo ya provisionado (enero) + retiro a mitad de marzo → recibo final con cesantías/prima exactas ($411.111 c/u, 74 días servidos bajo el tope de 180) y rechazo correcto del segundo intento de liquidar
- [x] **`tipoContrato`** (§07): aprendizaje SENA se integró a las dos calculadoras existentes (sigue siendo relación con horario) — etapa lectiva sin ninguna deducción de ley ni auxilio de transporte, etapa práctica solo con aporte de salud; `deduccionesDeLey`/`aplicarDeducciones` ganan el parámetro `alcance`. La provisión de prestaciones sociales (`liquidacionService.ts`) se omite para aprendices (Ley 789 de 2002 no las genera). Prestación de servicios es una tercera Strategy, `CalculadoraServicios` — no genera auxilio/recargos/prestaciones, y los aportes del independiente (IBC 40%, Ley 1819 de 2016) van como advertencia informativa, nunca como deducción del pago. Disponible en el verificador anónimo (`/nomina/calcular`); Verificado con 6 tests nuevos (86/86 en total) y en vivo contra la DB de desarrollo: aprendiz SENA etapa lectiva liquidado → una sola línea de devengo ("Auxilio de sostenimiento"), cero deducciones, cero provisiones
- [x] **Selector de tipoContrato en el wizard anónimo** (`PasoSalario.tsx`): confirmado en navegador — al elegir "etapa lectiva" desaparece el checkbox de auxilio y aparece la advertencia legal
- [x] **Contratistas de servicios en el modo empresa**: nuevo modelo `Contratista` (NO reutiliza `Empleado`) con CRUD (`GET/POST /empresa/contratistas`, `PUT .../:id`) y su propia sección en el dashboard (`ContratistasEmpresa.tsx`). `ReciboPago` gana `contratistaId` nullable (y `empleadoId` pasa a nullable) con un `CHECK` SQL que exige que un recibo pertenezca a exactamente uno de los dos. `liquidacionService.ts` liquida también los contratistas activos del periodo vía `CalculadoraServicios` — sin turnos, sin provisión de prestaciones, sin deducciones retenidas. Verificado en vivo contra la DB de desarrollo: recibo con `contratistaId` seteado, `empleadoId` null, neto == honorarios completos
- [x] **Contratista de servicios en el wizard anónimo**: `PasoSalario.tsx` gana la opción "Prestación de servicios (contratista independiente)" en el selector de tipo de contrato — al elegirla, cambia la etiqueta a "Honorarios mensuales pactados", oculta el auxilio de transporte y la tarjeta de deducciones opcionales (el pagador no retiene nada), y el botón pasa directo a "Calcular" saltándose el paso de turnos. `App.tsx` gana `calcularServicios()`, que llama a `calcularNomina({modo:"servicios", ...})`; `api.ts` amplía la firma de `calcularNomina` para aceptar `DatosNominaServicios`. Verificado con `tsc -b` limpio, 88/88 tests de `@pv/reglas`, y en navegador real: honorarios $3.000.000/mes, quincena 01–15 jul → "Honorarios (15 días)" $1.500.000, advertencia de IBC independiente (salud $150.000, pensión $192.000) y neto esperado $1.500.000 sin deducciones
- [x] **Advertencia de patrón de aprendiz por salario**: nuevo `advertenciaPatronAprendiz()` en `packages/reglas/src/advertenciasContrato.ts`, compartido por `CalculadoraTurnos` y `CalculadoraSalarioFijo` — si un contrato declarado `"indefinido"` (u omitido) trae un salario entre 50% y 75% de un SMLMV (constantes `PATRON_APRENDIZ_MIN_PCT_SMLMV`/`MAX_PCT_SMLMV`, el rango legal del auxilio de sostenimiento de un aprendiz SENA en práctica, Ley 789 de 2002 art. 30), emite una advertencia informativa — nunca reclasifica ni recalcula. No aplica si el contrato ya está declarado como aprendizaje SENA. Verificado con 4 tests nuevos (bordes 50%/75% inclusive, caso normal sin advertir, aprendiz real sin auto-advertirse) y en navegador real: turnos con salario $1.000.000 → advertencia visible en el resultado
- [x] **Término fijo/obra/tiempo parcial** (§07): `TipoContrato` gana `"fijo" | "obra_labor" | "tiempo_parcial"` — liquidan exactamente igual que `"indefinido"` periodo a periodo (recargos, extras y deducciones de ley no dependen del tipo de término bajo el CST); `advertenciaTerminoNoIndefinido()` (mismo archivo nuevo) explica que la diferencia real está en preaviso/indemnización al terminar, fuera del alcance de este verificador de nómina periódica — decisión consciente de advertir en vez de inventar una rama de cálculo que la ley no exige. Selector de `PasoSalario.tsx` los expone como opciones separadas (antes "indefinido" decía engañosamente "indefinido, fijo, obra"); con derecho pleno a auxilio de transporte y deducciones de ley, igual que indefinido. Zod (`apps/api/src/validation/nomina.ts`) amplía el enum. Verificado con 2 tests nuevos (mismas líneas/neto que indefinido + advertencia presente) y en vivo contra la API real (`tipoContrato:"fijo"`, salario $1.000.000 → mismo cálculo que indefinido + advertencia de preaviso, sin la advertencia de aprendiz porque no está declarado como "indefinido") — 94/94 tests en `@pv/reglas`
- [x] **Calculadora de indemnización por terminación** (a raíz de la advertencia de preaviso/indemnización de arriba): nuevo módulo aparte `packages/reglas/src/indemnizacion.ts` — `calcularIndemnizacion()`, NO es parte del recibo de nómina periódico (es otro modo de cálculo, con sus propios inputs). Término fijo/obra o labor: salarios de los días que faltan hasta la fecha de vencimiento pactada o estimada de fin de obra (CST art. 64, num. 1). Indefinido/tiempo parcial: escala de días por antigüedad — bajo 10 SMLMV, 30 días el primer año + 20 días proporcionales por año adicional; igual o sobre 10 SMLMV, 20 + 15 días (CST art. 64, modificado por la Ley 50 de 1990, art. 6). Con justa causa comprobada, indemnización $0 (CST art. 62). Es informativa/aproximada — no modela salario variable, fuero, ni convenciones colectivas. Nuevo endpoint público `POST /indemnizacion/calcular` (mismo rate-limit que `/nomina/calcular`) y pantalla propia `IndemnizacionCalculadora.tsx`, alcanzable desde un enlace en el paso 1 del wizard anónimo ("¿Te despidieron...?"). Verificado con 10 tests nuevos (104/104 en total en `@pv/reglas`), `tsc` limpio en las 3 paquetes, curl real contra la API (`tipoContrato:"fijo"` → 31 días, $3.100.000) y en navegador real (indefinido, 2024-01-01 a 2026-07-01, salario $2.000.000 → 60.67 días, $4.044.444, con la cita legal correcta)
- [x] **Dashboard administrativo empresa — CRUD completo**: edición inline de empleados y contratistas (`FormEmpleado`/`FormContratista` ganan prop `inicial`, icono lápiz por fila → mismo form precargado, `PUT` ya existente); **borrado físico con guarda legal** — `DELETE /empresa/empleados/:id` y `/empresa/contratistas/:id` solo proceden si la entidad no tiene NINGÚN historial (recibos/turnos, caso "creado por error"); con historial responden **409** (`ErrorConflicto`) con mensaje que dirige a "Retirar" — los registros de nómina deben conservarse, el soft-retire sigue siendo el camino legal y los FK Restrict del schema son la red de seguridad final. Todos los `window.prompt`/`alert` del dashboard reemplazados por formularios inline (invitar con input email, retirar con date picker + mínimo `fechaIngreso`, confirmación de borrado en la fila) y banners de éxito/error. Filtros: `SegmentedControl` Activos/Retirados/Todos + búsqueda por nombre/documento (client-side, `useMemo`) + fila de stats (activos, nómina base mensual, retirados). Verificado con script de servicios en el contenedor (`scriptsVerificacionAdmin.ts`): DELETE sin historial OK, con historial 409, scoping por empresa OK
- [x] **Panel de costo total empleador** (diferenciador frente a Siigo/Alegra, que lo venden como módulo aparte): `calcularCostoEmpleador()` en `packages/reglas/src/costoEmpleador.ts` — costo REAL mensual de un empleado: salario + auxilio de transporte (tope 2 SMLMV, reutiliza `auxilio.ts`) + aportes patronales (salud 8.5% Ley 100 art. 204, pensión 12% art. 20, ARL por clase de riesgo I-V Decreto 1772/1994, caja 4% Ley 21/1982, SENA 2% + ICBF 3%) + provisión mensual de prestaciones (cesantías/intereses/prima sobre salario+auxilio, vacaciones sobre salario — mismas bases de `prestaciones.ts`). **Exoneración Ley 1607 de 2012 art. 25** como parámetro: sin salud patronal/SENA/ICBF para salarios < 10 SMLMV en empresas contribuyentes de renta (borde 10 SMLMV inclusive NO exonerado, con advertencia). Aprendices SENA quedan sin carga plena (costo `null`, mismo criterio de `liquidacionService`); contratistas solo honorarios. `GET /empresa/costos?exonerado=` (`costosService.ts`) agrega por empresa; UI: tab "Costos" (`CostosEmpresa.tsx`) con tarjetas resumen (nómina base, costo total, sobrecosto %), toggle de exoneración explicado, y desglose expandible por empleado con cita legal por línea (misma transparencia del verificador). Verificado con 9 tests nuevos (113/113 en `@pv/reglas`) y en el contenedor contra la DB real: 1 SMLMV exonerado → factor 1.551, sin exonerar → 1.686 (la diferencia es exactamente el 13.5% de salud+SENA+ICBF)
- [x] **Comprobante de nómina imprimible** (`ComprobanteNomina.tsx`): plantilla con encabezado (empresa/empleado/período/salario básico/valor día/valor hora ordinaria/días laborados), tabla de ingresos salariales (concepto, % de recargo, N° horas, total), ingresos no salariales, deducciones (concepto, %, total) y neto a pagar — con `@media print` para "Imprimir/PDF" (solo el comprobante, sin el resto de la SPA). `ResultadoNomina` gana `valorDia`/`valorHoraOrdinaria`/`diasLaborados` (calculados en `ensamblarResultado.ts`, poblados por ambas calculadoras — `valorHoraOrdinaria` usa el divisor vigente al CIERRE del periodo). Montado en 3 lugares: wizard anónimo (`Resultado.tsx`, botón "Ver comprobante detallado", identidad vacía porque no hay empleado real), y modo empresa (`PeriodosEmpresa.tsx`, un comprobante por recibo liquidado con N° `NC-000123` y botón "Ver comprobante" — adapta `Recibo` de Prisma a `ResultadoNomina` igual que el portal colaborador). El portal colaborador queda pendiente de montarlo (mismo patrón, no bloqueante). Verificado con 1 test nuevo de cabecera (114/114 en `@pv/reglas`), `tsc` limpio en los 3 paquetes, y en navegador real: salario $2.500.000, 15-1jul → valor día $83.333, valor hora $11.905, 13 días laborados, tabla completa con recargo dominical 90%/12h y deducciones de ley, neto $1.387.456
- [x] **Rediseño de captura de turnos en modo empresa** (`PeriodosEmpresa.tsx`): turnos ahora se agrupan por colaborador en tarjetas colapsables (ícono + nombre + contador de turnos/horas totales; expandir para ver/editar/eliminar cada turno), en vez de una lista plana repitiendo el nombre en cada fila. Colaboradores de salario fijo se listan aparte con una nota de que no requieren turnos. Layout mobile-first: cada turno apila fecha arriba y horas abajo en pantallas angostas (antes era una fila de 4-5 campos que desbordaba). **Edición de periodo con auditoría**: `PUT /empresa/periodos/:id` (`editarPeriodo` en `periodosService.ts`) permite corregir `fechaInicio`/`fechaFin` **solo en borrador** (uno liquidado se revierte primero, vía `revertirPeriodo` ya existente) y exige una nota de motivo — se persiste en `PeriodoNomina.notaEdicion`/`editadoEn` (migración `20260718000000_periodo_nota_edicion`) y se muestra como "✎ Editado — <nota>" en la lista y el detalle del periodo. Verificado con 114/114 tests, `tsc` limpio, y script de servicios en el contenedor (`scriptsVerificacionPeriodos.ts`): edición en borrador OK, edición en liquidado rechazada (422), y flujo revertir→editar OK
- [x] **Autocompletar turnos según horario habitual** (modo empresa): se extrajo `HorarioSemanalEditor.tsx` del wizard anónimo (`PasoSemana.tsx`, antes tenía el editor de "Tu semana habitual" inline) para reutilizarlo tal cual en `PeriodosEmpresa.tsx` — mismo componente, misma UX, en ambos lugares. Cada colaborador, al expandir su tarjeta de turnos, tiene su propio horario habitual (solo en el navegador, no se persiste — cada `Turno` guardado ya trae sus propias horas explícitas) y un botón "Autocompletar turnos del periodo según este horario": genera un `Turno` por cada día del periodo donde el horario dice "trabajo", saltando fechas que ya tienen turno capturado (no pisa ediciones manuales) y festivos (por defecto descanso, igual que el wizard — si de verdad se trabajó el festivo se agrega a mano). Verificado: refactor de `PasoSemana.tsx` confirmado en navegador real sin cambio de comportamiento (mismo horario habitual, misma derivación de "Días del periodo", toggle de un día de la semana propaga correctamente a los 15 días del periodo); `tsc` limpio en los 3 paquetes, 114/114 tests en `@pv/reglas`

---

## 14 — Visión a futuro (sin fase asignada)

Ideas del "proyecto grande" para no perderlas — ninguna entra al MVP:

- **SaaS multi-empresa con pricing**: plan gratuito (verificador) como embudo hacia planes de pago por empleados activos.
- **PILA / aportes patronales — liquidación exacta**: el panel de costos (§13) ya estima el costo patronal mensual; falta la liquidación exacta por días trabajados para la planilla PILA real.
- **Semáforo de cumplimiento por empresa**: alertas automáticas sobre periodos liquidados (aprendices mal clasificados, salarios bajo el mínimo, topes de horas extra excedidos).
- **Exporte CSV de nómina**: descarga plana de recibos/periodo compatible con contabilidad — primer paso hacia la integración Siigo/Alegra.
- **Provisiones mensuales avanzadas**: panel de acumulado de provisiones por empleado a lo largo del año (cesantías provisión corriente vs. lo consignado al fondo, intereses acumulados, vacaciones acumuladas — más allá de las líneas en el recibo ya en scope desde v2.3).
- **Exportes contables**: integración o archivo plano hacia Siigo/Alegra/World Office.
- **Notificaciones**: email al colaborador cuando hay recibo nuevo o respuesta a su reporte.
- **Firma/acuse del recibo** por el colaborador (valor probatorio).
- **Histórico del colaborador entre empleos**: su hoja de vida salarial le pertenece a él, no a la empresa.
- **Comparador de ofertas**: "¿me conviene este turno/salario?" usando el mismo motor.
- **API pública del motor de reglas** legales colombianas (el activo más defendible del proyecto).
- **Nómina electrónica DIAN** cuando el producto madure hacia empleadores formales medianos.
