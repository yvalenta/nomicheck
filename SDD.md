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
| Retención en la fuente | tabla art. 383 (7 tramos, 0%–39%) | vigente desde Ley 2277 de 2022 | E.T. art. 383/388 — calculadora propia `/retencion/calcular` (ver Fase 2 abajo y Módulo B) |

**Ampliación de la semilla — AFC y preparación tributaria (verificado 16-jul-2026):**

| Clave | Valor | Vigencia | Fuente | Uso hoy |
|---|---|---|---|---|
| `limite_deducciones_salario` | 50 % del devengado | histórico | CST art. 149 num. 2 (excepción de libranza, Ley 1527 de 2012, art. 3 §5) | **Sí** — recorta el AFC si el total de deducciones lo supera |
| `uvt` | $52.374 | 2026 | DIAN, Resolución 000238 de 15-dic-2025 | **Sí** (Fase 2) |
| `limite_porcentaje_afc` | 30 % del ingreso laboral/mes | desde 2012 | E.T. art. 126-1 y 126-4 (Ley 1607 de 2012) | **Sí** (Fase 2, solo si declara renta) |
| `limite_anual_uvt_afc` | 3.800 UVT/año | desde 2012 | E.T. art. 126-1 y 126-4 | **Sí** (Fase 2 — prorrateado ÷12, ver advertencia abajo) |
| `limite_rentas_exentas_porcentaje` | 40 % del ingreso | desde 2023 | E.T. art. 336 (Ley 2277 de 2022) | **Sí** (Fase 2, tope combinado) |
| `limite_rentas_exentas_uvt_anual` | 1.340 UVT/año | desde 2023 | E.T. art. 336 (Ley 2277 de 2022) | **Sí** (Fase 2 — el menor entre este y el 40 % aplica, prorrateado ÷12) |
| `limite_renta_exenta_laboral_uvt_mes` | 790 UVT/mes | desde 2007 | E.T. art. 206, num. 10 (Ley 1111 de 2006) | **Sí** (Fase 2 — 25 % renta exenta, aplica SIEMPRE, no depende de declarar renta) |
| `limite_deduccion_dependientes_uvt_mes` | 32 UVT/mes | desde 2016 | E.T. art. 387, par. 2 (Ley 1819 de 2016) | **Sí** (Fase 2, si se declara al menos un dependiente) |
| `limite_deduccion_salud_uvt_mes` | 16 UVT/mes | desde 2016 | E.T. art. 387, par. 1 (Ley 1819 de 2016) | **Sí** (Fase 2 — medicina prepagada/seguros de salud, aplica SIEMPRE, no depende de declarar renta) |

> ⚠️ El valor de UVT del prompt original de diseño ($49.799) es el de **2025**; el vigente para el año gravable 2026, confirmado en la resolución oficial de la DIAN, es **$52.374**. Se corrigió en la semilla (`apps/api/prisma/seed.ts`).

**AFC (Ahorro para el Fomento a la Construcción) — dos fases de tratamiento:**

- **Fase 1 (implementada):** para trabajadores que no declaran renta, el AFC es una **deducción por convenio de monto fijo** — el usuario/empresa declara `aporteAfcMensual`, se prorratea por días del periodo igual que el auxilio de transporte, y se descuenta del neto **sin afectar el IBC** de salud/pensión (E.T. art. 126-4 solo habla de renta exenta para quien declara renta; para quien no declara, el AFC no tiene ningún efecto tributario en la nómina, es un simple descuento autorizado). Protegido por `limite_deducciones_salario`: si salud + pensión + fondo + AFC superan el 50 % del devengado, se recorta el AFC — nunca los aportes obligatorios — y se deja una advertencia trazable (`packages/reglas/src/deducciones.ts`, función `aplicarDeducciones()`).
- **Fase 2 (implementada):** calculadora propia de retención en la fuente por el sistema de depuración (`POST /api/retencion/calcular`, motor en `packages/reglas/src/retencionFuente.ts`, función `calcularRetencionFuente()`). Fórmula: `Base = (Devengado − AportesObligatoriosSaludPensión) − DeducciónDependientes − DeducciónMedicinaPrepagada − RentaExentaAFCyPensión − RentaExentaLaboral25%`, sujeta al tope combinado (el menor entre `limite_rentas_exentas_porcentaje` (40%) y `limite_rentas_exentas_uvt_anual` (1.340 UVT/año, prorrateado ÷12) — si se supera, las cuatro líneas se recortan proporcionalmente, mismo patrón de `aplicarDeducciones()`). Sobre la base resultante (en UVT) se aplica `TABLA_RETENCION_FUENTE_ART_383` (constante estructural en `constantes.ts`, 7 tramos 0%–39%, no cambia por decreto anual — solo el valor de la UVT en pesos). Decisiones de alcance explícitas (confirmadas con el usuario antes de implementar, y ampliadas en una segunda ronda):
  - **"¿Declara renta?" es un checkbox autodeclarado, sin validar umbral** — el sistema no intenta calcular el umbral de ingresos/patrimonio vigente (cambia cada año, depende de datos que no se recolectan como patrimonio bruto o consignaciones). Advertencia siempre visible en el resultado aclarando esto.
  - **La renta exenta laboral del 25% (E.T. art. 206-10) y la deducción por medicina prepagada (E.T. art. 387, par. 1) aplican SIEMPRE**, sin importar si declara renta — son beneficios generales, no condicionados. La renta exenta del **AFC + aportes voluntarios a pensión obligatoria (E.T. art. 126-1/126-4) sí requiere declarar renta** (checkbox marcado) — si el usuario declara un aporte sin marcar la casilla, se advierte y no se toma en cuenta.
  - **AFC y aportes voluntarios a fondos de pensión OBLIGATORIA comparten exactamente el mismo tratamiento y el mismo tope combinado** (E.T. art. 126-1 los trata igual) — la UI los pide en dos campos separados (para que el usuario declare cada uno con su propio monto) pero el motor los suma ANTES de aplicar el tope de 30%/3.800 UVT anuales, no cada uno por separado.
  - Deducción por dependientes (E.T. art. 387, par. 2): una sola deducción (10% del ingreso, tope 32 UVT/mes) sin importar cuántos dependientes se declaren — la UI solo pregunta sí/no ("¿tienes al menos un dependiente?"), no un conteo.
  - Deducción por medicina prepagada/seguros de salud (E.T. art. 387, par. 1): lo efectivamente pagado, topado a 16 UVT/mes (no un % del ingreso, a diferencia de dependientes) — un solo campo, cubre al trabajador y su familia sin desglosar.
  - **No se modelan intereses de vivienda (E.T. art. 119) ni otras deducciones** — quedan fuera de alcance a propósito para otra ronda si se necesitan.
  - El tope anual del AFC/pensión voluntaria (3.800 UVT/año) se prorratea a mensual (÷12) porque el cálculo es por periodo y no lleva el acumulado real del año — se advierte explícitamente que el cupo disponible real puede ser menor si ya se usó parte en otros meses.
  - Es una calculadora informativa aparte (como prima/cesantías/recargos/indemnización), NO se integró como línea de deducción real en la liquidación de nómina de empresa (`liquidacionService.ts`) — evita el riesgo de alterar recibos reales de empresas con una estimación que depende de datos personales (declarante, dependientes) que el sistema de nómina de empresa no recolecta hoy.
  - UI: `RetencionCalculadora.tsx`, registrada en `CalculadorasHub.tsx` junto a las demás calculadoras anónimas.
  - Verificado con 10 tests de regresión (`retencionFuente.test.ts`, valores golden calculados independientemente, incluye medicina prepagada sola/topada y AFC+pensión obligatoria combinados) + llamadas reales a `POST /api/retencion/calcular` (incluyendo un caso con las 4 líneas activas a la vez, recortadas proporcionalmente al tope del 40%) + navegador real (formulario completo con AFC/pensión obligatoria condicionales a "declara renta", dependientes, medicina prepagada, resultado con las advertencias renderizadas).
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
6. Retención en la fuente según tabla vigente cuando aplique; diferencia con lo declarado = **advertencia**, no error duro (depende de variables personales que el sistema puede no conocer) — el verificador de comprobantes no la recalcula, pero sí existe una calculadora aparte que la estima (`/retencion/calcular`, ver Módulo A "AFC — dos fases de tratamiento").
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
| **Capa de IA multi-proveedor** | Extracción de comprobantes + chat contador | `ProveedorExtraccionIA` + `ProveedorChatIA` (Strategy) + adaptadores intercambiables — **Gemini** activo (`IA_PROVEEDOR=gemini`), Claude disponible; API keys solo en servidor |
| Vitest | Tests | Motor de reglas con los 2 comprobantes reales como regresión |

### Capa de IA multi-proveedor (`apps/api/src/services/ia/`)

Igual que Advance Fitness (proyecto hermano): dos interfaces de dominio —
`ProveedorExtraccionIA.extraerComprobante(archivo, mimeType)` (Fase 3) y
`ProveedorChatIA.chat(promptSistema, historial, pregunta)` (Fase 4) — con los
mismos adaptadores intercambiables — `ProveedorGemini` y `ProveedorClaude`,
cada uno implementa ambas interfaces — elegidos por `IA_PROVEEDOR` (env var,
un solo switch para toda la IA de la plataforma vía `proveedorExtraccion()` y
`proveedorChat()` en `ia/index.ts`). El contrato de qué extraer (schema,
prompt) es del dominio y vive en `ia/tipos.ts`; cada adaptador solo traduce
esa forma al formato de su proveedor (Gemini: `responseSchema` OpenAPI en
mayúsculas vía `fetch` para extracción, `generateContent` de texto libre para
chat; Claude: `tool_choice` forzado para extracción, `messages.create` simple
para chat — ambos vía `@anthropic-ai/sdk`). Añadir un proveedor nuevo es un
archivo más, sin tocar el resto del sistema; cambiar de proveedor en
cualquiera de las dos fases es una sola env var.

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
| `email` | string? unique | denormalizado desde Supabase Auth — permite buscar la cuenta por correo al invitar sin paginar Auth |
| `rol` | string | enum: `admin_plataforma` · `admin_empresa` · `colaborador` — absorbe el `AdminUsuario` de v1 |
| `empresaId` | FK? → `Empresa` | **empresa activa actual** (puntero denormalizado): null para `admin_plataforma` y para un colaborador **libre entre empresas**. Se setea al aceptar/unirse y se limpia al retirarse |

> La invitación de colaborador (Módulo D) tiene **dos caminos** según si el
> correo ya tiene cuenta (ver §08): correo nuevo → invite nativo de Supabase
> (define contraseña al aceptar); cuenta existente y libre → **notificación
> in-app** que el colaborador acepta. Una cuenta se liga a varios `Empleado`
> a lo largo del tiempo (**historial de empresas**), con a lo sumo **una
> membresía activa aceptada** a la vez (índice único parcial).

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
| `usuarioId` | FK? → `Usuario` | null hasta que se le invita. **No es único**: una cuenta puede aparecer en varios `Empleado` (distintas empresas/épocas = historial). La unicidad "una empresa activa por cuenta" la impone un índice único parcial en SQL (`WHERE usuarioId IS NOT NULL AND invitacionAceptadaEn IS NOT NULL AND activo = true`) |
| `invitacionAceptadaEn` | datetime? | null con `usuarioId` seteado = **invitación pendiente** (cuenta existente sin aceptar); con fecha = **aceptada** (o vínculo directo de cuenta nueva). Doble uso como auditoría del ingreso |
| `nombre` / `documento` | string | — |
| `salarioBase` | decimal | mensual, COP |
| `tipoNomina` | string | enum: `turnos` · `fijo` |
| `auxilioTransporte` | boolean | si aplica (salario ≤ 2 SMLMV) |
| `activo` | boolean | retiro sin borrar historial |
| `tipoContrato` | string | enum: `indefinido` (default) · `fijo` · `obra_labor` · `tiempo_parcial` · `aprendizaje_sena_lectiva` · `aprendizaje_sena_practica` — ver nota abajo |

> **Nota — `tipoContrato`:** el tipo de contrato laboral es una dimensión **ortogonal** a `tipoNomina` (`turnos`/`fijo`). Los 6 valores están soportados tanto en el verificador anónimo como en el modo empresa (formulario de empleado, validación zod y motor):
>
> | Tipo de contrato | Impacto en el cálculo | Estado |
> |---|---|---|
> | **Término indefinido** | Reglas estándar | ✅ implementado |
> | **Término fijo** | Devengos/deducciones idénticos al indefinido período a período; la diferencia real (preaviso, indemnización por terminación anticipada) se cubre con `advertenciaTerminoNoIndefinido()` en el recibo y con la calculadora de indemnización aparte (§14) | ✅ implementado |
> | **Obra o labor** | Ídem término fijo | ✅ implementado |
> | **Tiempo parcial** | Liquida igual que indefinido. Si el salario < 1 SMLMV, advierte sobre el **Piso de Protección Social** (Decreto 1174 de 2020, BEPS) — régimen alternativo con cotización reducida para estos casos. El motor calcula salud/pensión sobre el IBC real (el salario devengado): la norma **pre-2020** exigía elevar el IBC a 1 SMLMV, pero el decreto la sustituyó por este régimen opcional; cuál aplica depende de si el trabajador ya cotiza por otra vía (dato que este verificador no conoce), por eso se advierte en vez de recalcular en silencio — hacerlo forzaría una carga que puede no corresponder | ✅ implementado (advertencia, sin recalcular) |
> | **Aprendizaje SENA** | El "salario" es un **auxilio de sostenimiento** (no salarial), Ley 789 de 2002 art. 30: etapa **lectiva** sin aportes; etapa **práctica** solo salud. Sin auxilio de transporte ni prestaciones sociales | ✅ implementado — `deduccionesDeLey()` acepta `alcance: "completo"\|"solo_salud"\|"ninguno"` |
> | **Prestación de servicios** | No es contrato laboral: el contratista cotiza como independiente sobre el 40 % (Ley 1819 de 2016, art. 244); sin auxilio, recargos ni prestaciones | ✅ implementado como Strategy `CalculadoraServicios`; en modo empresa se modela como `Contratista`, no como `Empleado` |

### `PeriodoNomina`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | PK | — |
| `empresaId` | FK → `Empresa` | — |
| `fechaInicio` / `fechaFin` | date | quincenal o mensual |
| `estado` | string | enum: `borrador` · `liquidado` · `pagado` — solo `borrador` acepta turnos nuevos |

### `PeriodoNominaEmpleado` — qué empleados quedan incluidos en un periodo
Tabla puente (`periodoId`+`empleadoId`, PK compuesta). Se autopuebla con todos los `Empleado.activo` de la empresa al **crear** el periodo (mismo comportamiento implícito que tenía `liquidarPeriodo` antes de existir esta tabla); ajustable con `PUT /empresa/periodos/:id/empleados` **solo en borrador** (reemplazo completo, mismo patrón que `Turno`). `liquidarPeriodo` liquida únicamente los empleados de esta tabla (y siguen exigiendo `activo=true` por si se retiraron después de incluirse).

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
- **Invitación de colaborador** (`invitarColaborador`, tres caminos según el correo):
  - **Sin cuenta** → invite nativo de Supabase Auth ligado al `Empleado`; el colaborador define su contraseña al aceptar y queda unido (aceptación implícita). La empresa nunca fija contraseñas.
  - **Cuenta existente y libre** (sin membresía activa aceptada) → se liga el `Empleado` con `invitacionAceptadaEn = null` (pendiente); le aparece como **notificación in-app** que acepta/rechaza desde su portal (`GET /colaborador/invitaciones`, `POST .../:id/aceptar|rechazar`). No se envía correo ni se crea otra cuenta.
  - **Cuenta ya activa en otra empresa** → se **bloquea** con 409 (`ErrorConflicto`): la persona debe retirarse de su empresa actual antes de unirse a otra.
- **Aceptar / rechazar**: aceptar setea `invitacionAceptadaEn` + `Usuario.empresaId` (en transacción, con backstop del índice único parcial); rechazar desliga el `Empleado` (`usuarioId = null`).
- **Retiro = desvinculación con historial**: `retirarEmpleado` marca `activo=false`+`fechaRetiro` y, si era la membresía activa de una cuenta, limpia `Usuario.empresaId` → la cuenta queda libre para otra empresa; el `Empleado` retirado permanece con su `usuarioId` como historial (`GET /colaborador/empresas`).
- **API key de Claude** solo en `apps/api` (`.env`, fuera de git) — nunca la de Supabase service-role en el navegador. **Rate limit** en `/api/comprobantes/extraer` y `/api/chat/explicar` (endpoints con costo).
- Validación de entrada con **zod** en cada endpoint; los archivos subidos se limitan por tamaño y tipo MIME y nunca tocan disco (ni Storage: no se persisten, Módulo E).

---

## 09 — Contrato API (REST)

| Método y ruta | Auth | Descripción |
|---|---|---|
| `POST /api/comprobantes/extraer` | — | Archivo → Claude visión → JSON validado (no persiste) |
| `POST /api/nomina/calcular` | — | Datos + modo → `ResultadoNomina` (verificador anónimo) |
| `POST /api/indemnizacion/calcular` | — | Calculadora aparte de indemnización por terminación (§13) |
| `POST /api/prima/calcular` · `/api/cesantias/calcular` · `/api/recargos/calcular` | — | Calculadoras anónimas por concepto: prima, cesantías (+intereses) y recargos/horas extra — informativas, mismo rate-limit que `/nomina/calcular` |
| `POST /api/chat/explicar` | — | `ResultadoNomina` + pregunta → explicación |
| `POST /api/auth/registro` | — | Crea usuario en Supabase Auth + `Empresa` + perfil `Usuario(rol: admin_empresa)` en una transacción |
| `POST /api/auth/registro-individual` | — | Crea cuenta individual server-side (`email_confirm=true` → login inmediato) + perfil `Usuario(rol: individual)`, sin empresa — flujo delayed auth del verificador anónimo |
| `POST /api/liquidations` · `GET /api/liquidations` | autenticado | Guarda/lista el historial personal de liquidaciones (snapshot del `ResultadoNomina`); scoping por `req.usuario.id` |
| `GET /api/auth/whoami` | autenticado | `{ rol, empresaId, empleadoId }` de `req.usuario` — usado por `/login` y por los 3 portales para redirigir al correcto |
| `POST /api/auth/invitar-aceptar` | — | Colaborador acepta invitación de Supabase Auth → crea su perfil `Usuario(rol: colaborador)` vinculado al `Empleado` | 
| — `/login` · `/logout` · recuperación | — | Manejados directo por el SDK de Supabase Auth desde `apps/web`, sin pasar por Express |
| `GET/POST/PUT /api/empresa/empleados` | admin_empresa | CRUD empleados |
| `POST /api/empresa/empleados/:id/invitar` | admin_empresa | Genera invitación de cuenta colaborador |
| `GET/POST /api/empresa/periodos` | admin_empresa | Periodos de nómina |
| `PUT /api/empresa/periodos/:id/turnos` | admin_empresa | Captura/edición de turnos (solo `borrador`) |
| `GET/PUT /api/empresa/periodos/:id/empleados` | admin_empresa | Qué empleados quedan incluidos en el periodo (solo editable en `borrador`) |
| `POST /api/empresa/periodos/:id/liquidar` | admin_empresa | Genera los `ReciboPago` del periodo |
| `GET /api/empresa/recibos` · `/api/empresa/reportes` | admin_empresa | Recibos y bandeja de discrepancias (+ responder) |
| `GET /api/mis-recibos` · `/:id` | colaborador | Recibos propios |
| `POST /api/mis-recibos/:id/verificar` | colaborador | Recalcula y compara → veredicto + semáforos |
| `POST /api/mis-recibos/:id/reportar` | colaborador | Crea `ReporteDiscrepancia` |
| `GET/PUT /api/admin/reglas` · `/api/admin/festivos` | admin_plataforma | CRUD reglas legales y festivos |
| `GET /api/admin/empresas` | admin_plataforma | Qué empresas usan la plataforma y quién las administra |
| `POST /api/admin/empresas` | admin_plataforma | Onboarding manual: crea la empresa e invita a su primer admin_empresa |
| `PUT /api/admin/empresas/:id/admin` | admin_plataforma | Reasigna (reemplaza) el admin_empresa: invita uno nuevo y desvincula al actual |
| `DELETE /api/admin/empresas/:id/admin/:usuarioId` | admin_plataforma | Quita al admin_empresa indicado — desvincula, NO borra su cuenta |
| `PUT /api/admin/empresas/:id/estado` | admin_plataforma | Suspende/reactiva la empresa — bloquea de verdad el acceso de admin_empresa/colaboradores (403) mientras está suspendida |

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
- [x] **Fase 3 — extracción por imagen: DESBLOQUEADA** (código completo: `POST /api/comprobantes/extraer`, capa multi-proveedor Gemini/Claude, editable antes de calcular). Key de Gemini nueva y funcional en `.env` (`IA_PROVEEDOR=gemini`, modelo `gemini-flash-latest`, ya el que usa `proveedorGemini.ts`). Verificado con una llamada real de punta a punta: comprobante sintético (imagen PNG generada con salario/período/auxilio) subido a `POST /api/comprobantes/extraer` → Gemini extrajo correctamente `salarioBasicoMensual: 2000000`, `periodoDesde/Hasta`, `recibeAuxilioTransporte: true`, y hasta generó una `advertenciaExtraccion` razonable notando que el comprobante no detallaba conceptos individuales. Mismo endpoint que usa `SubirComprobante.tsx` en el wizard anónimo — no se tocó código, solo la credencial.
- [x] **Fase 4 — chat contador: DESBLOQUEADA** (`POST /api/chat/explicar`, `chatService.ts`). Antes solo hablaba con Claude directo (bloqueado por falta de key real de Anthropic); ahora pasa por la misma capa multi-proveedor de la Fase 3 (`services/ia/`) — se extendió `ProveedorExtraccionIA`/`tipos.ts` con una segunda interfaz Strategy, `ProveedorChatIA` (`chat(promptSistema, historial, pregunta): Promise<string>`), implementada tanto en `ProveedorGemini` (REST `generateContent`, sin `responseSchema` — texto libre) como en `ProveedorClaude` (`messages.create` sin `tools`). El factory `services/ia/index.ts` ahora expone `proveedorChat()` además de `proveedorExtraccion()`, ambos leyendo el mismo `IA_PROVEEDOR` — así extracción y chat comparten switch de proveedor/modelo, y cambiar de proveedor más adelante (o volver a Claude cuando llegue una key real) no vuelve a bloquear nada ni toca este archivo. El prompt de sistema sigue serializando el `ResultadoNomina` completo (líneas, totales, advertencias, cita legal) e instruye a NUNCA recalcular ni contradecir las cifras — eso no cambió. UI sin cambios: `ChatContador.tsx` en `Resultado.tsx` y `DashboardColaborador.tsx`. Verificado con `POST /api/chat/explicar` real (Gemini, `IA_PROVEEDOR=gemini`): explicó correctamente por qué se descontó salud/pensión (4%/4% sobre el salario básico, sin incluir auxilio) citando CST; segunda llamada con `historial` de 2 turnos respondió coherente al contexto previo. `ANTHROPIC_API_KEY` sigue siendo un placeholder — no se necesita para que la Fase 4 funcione hoy.
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
- [x] **Comprobante de nómina imprimible** (`ComprobanteNomina.tsx`): plantilla con encabezado (empresa/empleado/período/salario básico/valor día/valor hora ordinaria/días laborados), tabla de ingresos salariales (concepto, % de recargo, N° horas, total), ingresos no salariales, deducciones (concepto, %, total) y neto a pagar — con `@media print` para "Imprimir/PDF" (solo el comprobante, sin el resto de la SPA). `ResultadoNomina` gana `valorDia`/`valorHoraOrdinaria`/`diasLaborados` (calculados en `ensamblarResultado.ts`, poblados por ambas calculadoras — `valorHoraOrdinaria` usa el divisor vigente al CIERRE del periodo). Montado en 3 lugares: wizard anónimo (`Resultado.tsx`, botón "Ver comprobante detallado", identidad vacía porque no hay empleado real), y modo empresa (`PeriodosEmpresa.tsx`, un comprobante por recibo liquidado con N° `NC-000123` y botón "Ver comprobante" — adapta `Recibo` de Prisma a `ResultadoNomina` igual que el portal colaborador). Verificado con 1 test nuevo de cabecera (114/114 en `@pv/reglas`), `tsc` limpio en los 3 paquetes, y en navegador real: salario $2.500.000, 15-1jul → valor día $83.333, valor hora $11.905, 13 días laborados, tabla completa con recargo dominical 90%/12h y deducciones de ley, neto $1.387.456. El portal colaborador se montó después, ver más abajo
- [x] **Rediseño de captura de turnos en modo empresa** (`PeriodosEmpresa.tsx`): turnos ahora se agrupan por colaborador en tarjetas colapsables (ícono + nombre + contador de turnos/horas totales; expandir para ver/editar/eliminar cada turno), en vez de una lista plana repitiendo el nombre en cada fila. Colaboradores de salario fijo se listan aparte con una nota de que no requieren turnos. Layout mobile-first: cada turno apila fecha arriba y horas abajo en pantallas angostas (antes era una fila de 4-5 campos que desbordaba). **Edición de periodo con auditoría**: `PUT /empresa/periodos/:id` (`editarPeriodo` en `periodosService.ts`) permite corregir `fechaInicio`/`fechaFin` **solo en borrador** (uno liquidado se revierte primero, vía `revertirPeriodo` ya existente) y exige una nota de motivo — se persiste en `PeriodoNomina.notaEdicion`/`editadoEn` (migración `20260718000000_periodo_nota_edicion`) y se muestra como "✎ Editado — <nota>" en la lista y el detalle del periodo. Verificado con 114/114 tests, `tsc` limpio, y script de servicios en el contenedor (`scriptsVerificacionPeriodos.ts`): edición en borrador OK, edición en liquidado rechazada (422), y flujo revertir→editar OK
- [x] **Autocompletar turnos según horario habitual** (modo empresa): se extrajo `HorarioSemanalEditor.tsx` del wizard anónimo (`PasoSemana.tsx`, antes tenía el editor de "Tu semana habitual" inline) para reutilizarlo tal cual en `PeriodosEmpresa.tsx` — mismo componente, misma UX, en ambos lugares. Cada colaborador, al expandir su tarjeta de turnos, tiene su propio horario habitual (solo en el navegador, no se persiste — cada `Turno` guardado ya trae sus propias horas explícitas) y un botón "Autocompletar turnos del periodo según este horario": genera un `Turno` por cada día del periodo donde el horario dice "trabajo", saltando fechas que ya tienen turno capturado (no pisa ediciones manuales) y festivos (por defecto descanso, igual que el wizard — si de verdad se trabajó el festivo se agrega a mano). Verificado: refactor de `PasoSemana.tsx` confirmado en navegador real sin cambio de comportamiento (mismo horario habitual, misma derivación de "Días del periodo", toggle de un día de la semana propaga correctamente a los 15 días del periodo); `tsc` limpio en los 3 paquetes, 114/114 tests en `@pv/reglas`
  - **Fix**: los turnos generados por "Autocompletar" quedaban huérfanos si el usuario ajustaba el horario habitual *después* de generarlos — cambiar un día a "Descanso" no eliminaba el turno ya creado para ese día, ni actualizaba sus horas si cambiaban. Se agregó un set `autogenerados` (por colaborador, en memoria) que marca qué fechas fueron creadas por el botón de autocompletar; al cambiar el horario habitual (`setHorarioDe`), esos turnos se resincronizan automáticamente (se eliminan si el día pasa a descanso, se actualizan las horas si cambiaron) — los turnos editados o borrados a mano salen del set y ya no se tocan. `tsc` limpio, 114/114 tests en `@pv/reglas` (sin cambios de motor, fix acotado a `PeriodosEmpresa.tsx`)
- [x] **Correo ya registrado — registro de empresa e invitación de colaborador**: antes, si el correo ya tenía una cuenta en Supabase Auth, `POST /auth/registro` y `POST /empresa/empleados/:id/invitar` devolvían el mensaje crudo de Supabase (en inglés) con un 422 genérico, indistinguible de cualquier otro fallo. Ahora `authService.ts` detecta explícitamente el código de error de Supabase (`email_exists` en `createUser`, `user_already_exists` en `inviteUserByEmail`) y lanza `ErrorConflicto` (misma clase reutilizada del guard de borrado en `empleadosService.ts`), que el controller mapea a **409** con mensaje en español y accionable: "Ya existe una cuenta con este correo. Inicia sesión en vez de registrarte." (registro) / "Este correo ya tiene una cuenta en NomiCheck. Verifica que sea la persona correcta." (invitar). `AuthEmpresa.tsx` agrega un botón "Ir a iniciar sesión" cuando el error de registro es este caso, que cambia al modo login sin perder el flujo. Verificado en el contenedor contra la DB real: registro duplicado del mismo correo → 409 con el mensaje esperado; invitar a un empleado con un correo que ya es admin de otra empresa → 409 (`ErrorConflicto`) sin crear registros huérfanos; `tsc` limpio en `@pv/api` y `@pv/web`
- [x] **Membresía por empresa, invitación in-app e historial** (migración `20260718120000_membresia_empresa_historial`): una cuenta (`Usuario`) puede pertenecer a varias empresas a lo largo del tiempo. Se quitó el `@unique` de `Empleado.usuarioId` (relación 1:N) y se agregó `Empleado.invitacionAceptadaEn` (null+usuarioId = pendiente; con fecha = aceptada) + `Usuario.email` (denormalizado desde Auth, backfill puntual). Un **índice único parcial** garantiza a lo sumo una membresía activa aceptada por cuenta. `invitarColaborador` ahora bifurca en tres: correo nuevo → invite de Supabase (unido); cuenta existente **libre** → vínculo **pendiente** que le aparece como **notificación in-app** (`GET /colaborador/invitaciones`, `POST .../:id/aceptar|rechazar`); cuenta **activa en otra empresa** → **409** (bloqueo, decisión del usuario). `retirarEmpleado` limpia `Usuario.empresaId` dejando la cuenta libre y el `Empleado` como **historial** (`GET /colaborador/empresas`). El middleware `requiereAuth` resuelve el `empleadoId` como el `Empleado` activo **aceptado** (ya no depende del vínculo único). UI colaborador (`DashboardColaborador.tsx`): sección "Invitaciones" con aceptar/rechazar + sección "Mis empresas" con badges (activa/pendiente/retirada). UI empresa (`DashboardEmpresa.tsx`): badge de estado de cuenta por empleado (sin cuenta / invitación pendiente / cuenta activa) y mensaje de invitación diferenciado. Verificado con un script de servicios en el contenedor (12 checks: invitar libre→pendiente, aceptar→activa+empresaId, invitar ocupada→409, retiro→desvincula+historial, reinvitar tras retiro, backstop del índice único parcial) + 114/114 tests en `@pv/reglas` y `tsc` limpio en `@pv/api` y `@pv/web`. Nota: la aceptación in-app solo aplica a cuentas existentes; las cuentas nuevas mantienen el flujo de correo de Supabase
- [x] **Guardar liquidación con "delayed auth"** (verificador anónimo → historial personal; migración `20260718140000_liquidacion_historial`): botón "Guardar liquidación" en el resultado anónimo (`Resultado.tsx`). Si no hay sesión, el patrón intercepta: guarda el `ResultadoNomina` que se está viendo en `pendingAction` (**localStorage**, no memoria — sobrevive al reload de un redirect OAuth), abre el `AuthModal` y, apenas hay sesión, un interceptor (`onAuthStateChange` + chequeo al montar en `AuthFlowManager`, montado a nivel App) dispara `POST /api/liquidations` de forma transparente, muestra un toast y limpia el `pendingAction` (idempotente: se consume antes del await, se re-encola si falla). **Backend**: nuevo modelo `Liquidacion` (snapshot JSONB del resultado, propiedad de un `Usuario`, con netos/periodo denormalizados); `POST/GET /api/liquidations` (`requiereAuth`, scoping por `req.usuario.id`, cualquier rol). **Cuenta individual server-side**: `POST /api/auth/registro-individual` crea el usuario con `admin.createUser({ email_confirm: true })` + perfil `Usuario(rol: "individual")` sin empresa — así el `signInWithPassword` del cliente trae **sesión inmediata** (sin correo de confirmación) y el guardado diferido se dispara al toque (mismo patrón de compensación que el registro de empresa). Store dependency-free con `useSyncExternalStore` (sin Zustand — el proyecto no tiene store global). Verificado por HTTP con JWT real en el contenedor (registro individual → sesión inmediata → POST 201 → GET lista con snapshot + denormalización; POST sin token → 401) y end-to-end en el navegador real (llenar el `AuthModal`, registro → sesión → guardado → `GET /liquidations` confirma la fila con neto/periodo/snapshot, `pendingAction` limpiado); `tsc` limpio en `@pv/api` y `@pv/web`. La vista de listado ("Mis liquidaciones") se montó después, ver más abajo
- [x] **Selección de empleados por periodo, fechas legibles y enlaces cruzados de login**:
  - **Selección de empleados** (migración `20260719000000_periodo_empleados_incluidos`): nueva tabla puente `PeriodoNominaEmpleado` — antes `liquidarPeriodo` liquidaba implícitamente a TODOS los empleados activos de la empresa, sin poder excluir a nadie de un periodo puntual. Se autopuebla con los activos al **crear** el periodo (`crearPeriodo`) y es editable con `PUT /empresa/periodos/:id/empleados` **solo en borrador** (mismo criterio que editar fechas/turnos — reemplazo completo, valida que los ids pertenezcan a la empresa). `liquidarPeriodo` ahora filtra por esta tabla (además de seguir exigiendo `activo=true`). Backfill de periodos existentes: `liquidado`/`pagado` reconstruidos desde quién de hecho tiene un `ReciboPago` (más preciso que "todos los activos"); `borrador` desde los activos actuales (mismo comportamiento implícito previo). UI (`PeriodosEmpresa.tsx`): tarjeta "Colaboradores en este periodo (N de M)" con checkboxes que persisten al toque; la captura de turnos y la nota de salario fijo solo muestran/cuentan a los seleccionados. Verificado con script de servicios en el contenedor (5 checks: autopoblado, desmarcar excluye del recibo, liquidar solo incluye seleccionados, editar tras liquidar rechazado, empleado ajeno rechazado).
  - **Fechas legibles**: `formatFechaLegible`/`formatRangoFechas` en `packages/reglas/src/utils.ts` ("1 junio 2026", rango sin repetir mes/año si coinciden: "1 — 15 junio 2026" / "28 junio — 5 julio 2026"). Reemplaza los `YYYY-MM-DD` crudos en la lista y detalle de periodos (`PeriodosEmpresa.tsx`), el comprobante (`ComprobanteNomina.tsx`) y el portal colaborador (`DashboardColaborador.tsx`). 4 tests nuevos (118/118 en `@pv/reglas`).
  - **Enlaces cruzados de login**: antes no había ninguna forma de llegar a `/colaborador` desde la UI (solo se conocía por el link de invitación de Supabase) — se agregaron enlaces "¿Eres colaborador? Ingresa aquí" en `AuthEmpresa.tsx`, "¿Eres empresa? Ingresa aquí" en `AuthColaborador.tsx`, y un enlace al portal colaborador en el footer del wizard anónimo (`App.tsx`). El login **ya estaba** diferenciado por rol vía las rutas separadas `/empresa` y `/colaborador` (cada una con su propio formulario); lo que faltaba era la navegabilidad entre ellas.
  - Verificado con `tsc` limpio en `@pv/api`/`@pv/web`, 118/118 tests, y en navegador real: `/empresa` y `/colaborador` muestran su enlace cruzado correcto.
- [x] **Tipos de contrato completos en el modo empresa + calculadoras anónimas por concepto**:
  - **tipoContrato lado empresa**: el motor y el verificador anónimo ya soportaban los 6 valores, pero el formulario de empleado, el tipo de `apiEmpresa.ts` y el enum zod de `validation/empresa.ts` solo aceptaban 3 — se amplían a los 6 (`fijo`, `obra_labor`, `tiempo_parcial` nuevos en empresa). Sin migración (columna String). `costosService`/`liquidacionService` ya tratan cualquier no-aprendiz como ordinario (recibo completo + provisión de prestaciones), que es lo correcto.
  - **Calculadoras anónimas por concepto** (hermanas de la de indemnización): hub "Calculadoras" en el wizard anónimo (paso `calculadoras`, 4 tarjetas — prima, cesantías, recargos, indemnización; el enlace del paso 1 ahora apunta al hub) con pantallas propias `PrimaCalculadora.tsx`/`CesantiasCalculadora.tsx`/`RecargosCalculadora.tsx` y endpoints `POST /{prima|cesantias|recargos}/calcular` (rate-limit de cálculo, zod→400, cálculo→422).
    - **Prima y cesantías** reusan `calcularPrestacionesSociales` (sin código nuevo en el motor). Cesantías resuelve el auxilio de transporte vigente server-side (`auxilio_transporte` del catálogo, hace base CST art. 249) y advierte si el salario supera 2 SMLMV.
    - **Recargos**: nuevo `packages/reglas/src/recargos.ts` — `lineasRecargos()` (constructor de líneas compartido: `CalculadoraPorTurnos` ahora delega en él, mismos valores, 41 tests del motor sin cambios) y `calcularRecargos()` (salario + 7 categorías de horas + fecha de referencia → líneas con divisor y porcentajes vigentes; replica la convención de doble línea para dominicales nocturnas). 9 tests nuevos, incluida equivalencia con `CalculadoraPorTurnos` (127/127 en `@pv/reglas`).
  - Verificado: `tsc` limpio en api/web, curl a los 3 endpoints (prima semestre completo = medio salario; cesantías SMLMV+auxilio año completo = $2.022.222; recargos $19.500 con doble línea dominical nocturna) y navegador real (hub → las 3 pantallas calculan con los mismos valores).
- [x] **Bug: `prestaciones.ts` excluía el auxilio de transporte de la base de prima** (`packages/reglas/src/prestaciones.ts`): la Ley 1ª de 1963, art. 7 dice que el auxilio "se entiende incorporado al salario para todos los efectos" — en la práctica esto aplica a cesantías (CST art. 249) **y prima** (CST art. 306); la excepción documentada por doctrina/jurisprudencia (CSJ) es solo vacaciones, que compensa un gasto de transporte que no se causa durante las vacaciones. El código ya trataba bien cesantías y vacaciones, pero calculaba prima sobre el salario ordinario sin el auxilio — un `it()` existente en `prestaciones.test.ts` incluso lo afirmaba explícitamente ("el auxilio de transporte solo afecta la base de cesantías, NO prima ni vacaciones"), documentando el bug como si fuera comportamiento correcto. Confirmado por inconsistencia interna: `costoEmpleador.ts` (fórmula independiente para el panel de costos) ya calculaba la prima incluyendo el auxilio — la divergencia entre los dos módulos era la pista. Corregido: prima ahora usa la misma base que cesantías (`salarioConAuxilio`). Se propagó a la API de la calculadora anónima de prima (`datosPrimaSchema` gana `recibeAuxilioTransporte`, antes no existía el campo; `calcularPrima` resuelve el monto vigente y advierte el tope de 2 SMLMV, mismo patrón que cesantías — factorizado en `resolverAuxilioDeclarado()` para no duplicarlo) y a `PrimaCalculadora.tsx` (checkbox nuevo). `liquidacionService.ts` ya pasaba el auxilio a `calcularPrestacionesSociales` para la provisión de prima real del recibo de empresa — se corrige automáticamente sin tocar ese archivo. Verificado: 130/130 tests en `@pv/reglas` (test actualizado con el valor correcto), curl real ($1.000.000 + auxilio $249.095 → prima $1.249.095), script de servicios confirmando que el recibo real de un periodo liquidado también refleja la provisión corregida, y navegador real con el checkbox nuevo. `tsc` limpio en `@pv/api` y `@pv/web`.
- [x] **Advertencia de IBC para tiempo parcial bajo el SMLMV** (cierre del pendiente de §07): `advertenciaIbcTiempoParcial()` en `advertenciasContrato.ts`, conectada en ambas calculadoras laborales. Investigación previa a implementar: la nota original decía que el IBC debía "elevarse al mínimo" si el salario parcial es menor a 1 SMLMV — esa es la regla **pre-2020**; el Decreto 1174 de 2020 creó el **Piso de Protección Social (BEPS)** como régimen alternativo con cotización reducida para estos casos. Cuál régimen aplica depende de si el trabajador ya cotiza por otra vía — dato que el verificador no conoce — así que se optó por **advertir, no recalcular** (mismo principio que `advertenciaTerminoNoIndefinido`: nunca reclasificar en silencio una zona legal que depende de contexto externo). Salud/pensión se siguen calculando sobre el IBC real. 3 tests nuevos (130/130 en `@pv/reglas`).
- [x] **Las advertencias del motor ahora se persisten en el `ReciboPago`** (migración `20260719120000_recibo_advertencias`, solo dev): antes `liquidacionService` solo guardaba `lineas` — `ResultadoNomina.advertencias` (preaviso/indemnización de término no indefinido, IBC de tiempo parcial, tope de horas extra, etc.) se descartaba al persistir, así que un empleado con contrato fijo nunca veía esa advertencia en su recibo real (solo en el verificador anónimo). Nueva columna `ReciboPago.advertencias` (`Json`, default `[]`), poblada para empleados y contratistas. UI: banner ámbar (mismo estilo que `Resultado.tsx`) en la tarjeta de recibo tanto en `PeriodosEmpresa.tsx` (empresa) como en `DashboardColaborador.tsx` (portal colaborador). Verificado con script de servicios en el contenedor (empleado tiempo parcial bajo SMLMV con contrato no indefinido → el recibo persiste ambas advertencias) y `tsc` limpio en api/web.
- [x] **Vista "Mis liquidaciones"** (cierra el pendiente no bloqueante del delayed auth, §13): el `GET /api/liquidations` ya existía; faltaba la UI. Nuevo `MisLiquidaciones.tsx` en el wizard anónimo (`listarMisLiquidaciones()` en `api.ts`) — lista cada liquidación guardada con fecha legible y neto, con "Ver comprobante" que reutiliza `ComprobanteNomina` directamente sobre el snapshot JSON (`Liquidacion.resultado` ya es un `ResultadoNomina` completo). Alcanzable desde un botón "Mis liquidaciones" en `HeaderProfile.tsx`, visible solo si hay sesión activa (`App.tsx` ahora rastrea la sesión de Supabase vía `getSession`/`onAuthStateChange` — antes no lo hacía en absoluto). Verificado en navegador real de punta a punta: calcular nómina → guardar liquidación (registro individual) → botón "Mis liquidaciones" aparece → lista la liquidación con "1 — 15 agosto 2026" y neto $1.139.176 → comprobante `LQ-000003` correcto; cuenta y liquidación de prueba limpiadas de la DB local y de Supabase Auth (producción) al terminar.
- [x] **Login con Google para el flujo de "guardar liquidación"**: `AuthModal.tsx` gana "Continuar con Google" (`supabase.auth.signInWithOAuth`) — el `pendingAction` ya vivía en `localStorage` (no en memoria) precisamente para sobrevivir al reload del redirect OAuth, así que no hizo falta tocar ese mecanismo. Como Supabase Auth crea la cuenta directo en el redirect (sin pasar por `registrarIndividual`), no queda perfil `Usuario` — nuevo `POST /api/auth/perfil-individual` (a propósito sin `requiereAuth`, que exige que el perfil ya exista) lo crea de forma idempotente la primera vez, tomando el nombre de `user_metadata`. `AuthFlowManager` llama este endpoint antes de guardar la liquidación pendiente. Verificado con 6 checks en el contenedor simulando un login real de Google (usuario creado directo en Auth, sin perfil previo): crea el perfil, idempotente en la segunda llamada, no duplica el `Usuario`, 401 sin token.
- [x] **Selector de fecha con calendario (`DateField`) y tres componentes nuevos de UI** (Empty State, Skeleton, Combobox — inspirados en namethatui.com): se terminó de conectar el datepicker (`react-day-picker` + `@radix-ui/react-popover`, instalados en una sesión paralela pero sin usar) a un componente reutilizable `DateField.tsx` — reemplaza los `<input type="date">` nativos en fecha de ingreso/retiro de empleado y fecha de inicio/fin de periodo (con mínimo encadenado). Además: `EmptyState.tsx` (ícono + título + descripción, reemplaza los `<p>` sueltos de "no hay X" en colaboradores/contratistas/periodos), `Skeleton.tsx` (placeholder animado en vez de "Cargando…" de texto plano) y `Combobox.tsx` (select con filtro por texto, mismo `Popover` sin dependencias nuevas — aplicado al selector de tipo de contrato del formulario de empleado). Nota de infra: `docker-compose.yml` gana `CI=true` en el entorno compartido — sin eso el entrypoint quedaba colgado pidiendo confirmación interactiva cuando un volumen de `node_modules` no calzaba con el lockfile, sin TTY para responder (nos pasó al instalar las dependencias del datepicker). Verificado con `tsc` limpio en `@pv/web` y en navegador real: calendario abre y resalta el día en menta, EmptyState se ve en "Aún no tienes colaboradores", Combobox filtra en vivo ("apre" → las 2 opciones de aprendizaje SENA) y marca la selección con ✓.
- [x] **Bug: crear colaborador con documento duplicado devolvía 500/502 sin mensaje** (`empleadosService.ts`): `crearEmpleado` no atrapaba la violación del `@@unique([empresaId, documento])` — un documento reutilizado (incluso de un empleado ya retirado, cuyo documento sigue reservado por su historial de nómina) tumbaba la petición sin JSON, y el frontend mostraba "Error de red". Ahora se atrapa `PrismaClientKnownRequestError` código `P2002` y se relanza como `ErrorConflicto` → 409 con mensaje claro. Verificado en navegador real: crear, retirar, y volver a crear con el mismo documento → "Ya existe un colaborador con el documento "999" en tu empresa."
- [x] **Bug: badge "Invitación pendiente" persistía en empleados retirados** (`DashboardEmpresa.tsx`): `EstadoCuenta` no consideraba `activo` — un empleado retirado con invitación sin aceptar seguía mostrando el recordatorio, que ya no tiene sentido (nada que reenviar/aceptar en la práctica). Se oculta ese caso puntual (`!activo && usuarioId && !invitacionAceptadaEn` → sin badge); "Cuenta activa" se conserva porque es historial real. El botón de invitar/reinvitar también se restringe a empleados activos.
- [x] **"Olvidé mi contraseña" en los logins de empresa y colaborador**: nuevo modo "olvide" en `AuthEmpresa.tsx`/`AuthColaborador.tsx` (`supabase.auth.resetPasswordForEmail`) + `ResetPasswordForm.tsx` compartido, montado en `EmpresaApp.tsx`/`PortalColaborador.tsx` cuando `onAuthStateChange` dispara `PASSWORD_RECOVERY` (el enlace del correo ya trae sesión válida; solo falta pedir la contraseña nueva y llamar `updateUser`). Requiere que la URL de redirect esté permitida en la configuración de Auth de Supabase (URL allowlist) — no es algo que el código controle.
- [x] **Login con Google en el portal del colaborador**: `AuthColaborador.tsx` gana el mismo botón "Continuar con Google" que ya tenía `AuthEmpresa.tsx` (`signInWithOAuth`, sin cambios de backend — un colaborador solo existe si una empresa lo invitó primero, así que un correo no invitado que entra con Google sigue bloqueado por `requiereAuth` con 403, comportamiento ya correcto).
- [x] **Login unificado por rol + panel de super admin (listado de empresas)**: antes había que saber de antemano a qué portal ir (`/empresa` vs `/colaborador` vs `/admin`) — entrar con Google no llevaba a ningún lado automáticamente. Nuevo `GET /api/auth/whoami` (`requiereAuth`, responde `{ rol, empresaId, empleadoId }` de `req.usuario`) + helper compartido `apps/web/src/lib/irAPortal.ts` (`irAPortalSegunRol()`) que lo consulta y redirige a `/admin`/`/empresa`/`/colaborador`/`/` según el rol real.
  - **Nueva ruta `/login`** (`Login.tsx`, montada en `main.tsx`): pantalla de acceso única (Google + correo/contraseña, sin registro) — tras autenticar, llama `irAPortalSegunRol()`. Enlazada desde el footer del wizard anónimo ("¿Ya tienes cuenta? Ingresa aquí").
  - **Los 3 portales existentes (`EmpresaApp.tsx`, `PortalColaborador.tsx`, `AdminPlataforma.tsx`) verifican el rol al detectar sesión** y rebotan con `irAPortalSegunRol()` si no coincide con el portal en el que están montados — cubre el caso de entrar con Google directo a un portal que no le corresponde a la cuenta (antes se quedaba viendo un dashboard vacío o fallando en silencio). `/empresa`, `/colaborador`, `/admin` siguen funcionando igual que antes para quien llega directo (bookmark, enlace viejo) — no se fusionaron en una sola SPA (decisión explícita: menor riesgo, cambio acotado).
  - **Super admin — listado de empresas (solo lectura en esta ronda, ampliado después)**: nuevo `GET /api/admin/empresas` (`empresasAdminService.ts`, `prisma.empresa.findMany` con conteo de empleados/contratistas y join al `Usuario` con `rol: "admin_empresa"`) y sección "Empresas" en `DashboardAdmin.tsx` (nombre, NIT, sector, colaboradores, quién administra, fecha de registro) — primera vista de la plataforma sobre sus propias empresas, hoy solo administraba reglas legales y festivos. Crear/reasignar/suspender empresas quedó fuera de alcance a propósito en esta ronda (confirmado con el usuario); las tres se implementaron en rondas posteriores (ver entradas más abajo).
  - Verificado: 8 checks en el contenedor (`whoami` responde rol/empresaId correctos, 401 sin token; `admin_empresa` recibe 403 en `/admin/empresas`; `admin_plataforma` ve la empresa de prueba con su admin correcto) y en navegador real de punta a punta — login en `/login` con cuenta `admin_plataforma` → redirige a `/admin` y la sección "Empresas" lista datos reales de producción; entrar directo en `/colaborador` con una cuenta `admin_empresa` → rebota automáticamente a `/empresa` sin quedarse en el portal equivocado. `tsc` limpio en `@pv/api` y `@pv/web`; cuentas y empresa de prueba limpiadas de la DB local y de Supabase Auth (producción).
- [x] **Comprobante de nómina imprimible en el portal colaborador** (cierra el pendiente de §13): mismo patrón que empresa/anónimo — botón "Ver comprobante" por recibo (`ComprobanteNomina.tsx` reusado tal cual). Requirió ampliar `listarRecibosPropios` (`colaboradorService.ts`) para incluir `empleado: { nombre, documento }` y `periodo.empresa.nombre` (antes solo traía `periodo`/`reportes` — el comprobante necesita el encabezado completo); `ReciboPropio` en `apiColaborador.ts` gana esos campos + `liquidadoEn`. Verificado con script de servicios en el contenedor (empresa + colaborador invitado y aceptado + periodo liquidado real: el recibo trae `periodo.empresa.nombre`, `empleado.nombre/documento` y `liquidadoEn`, tanto por el servicio directo como por `GET /colaborador/recibos` con JWT real) y en navegador real: comprobante `NC-000024` con empresa, empleado, identificación y montos correctos. `tsc` limpio en `@pv/api` y `@pv/web`; datos y cuenta de prueba limpiados de la DB local y de Supabase Auth (producción).
- [x] **`DateField` unificado también en el verificador anónimo ("modo ghost")**: el datepicker con calendario visible se había conectado primero solo en los formularios de empresa (fecha de ingreso/retiro, periodos) — quedaban 11 `<input type="date">` nativos en el flujo sin cuenta: `PasoSalario.tsx` (desde/hasta), `PasoRevision.tsx` (desde/hasta tras extraer comprobante), y las 4 calculadoras anónimas (`CesantiasCalculadora.tsx`, `PrimaCalculadora.tsx`, `RecargosCalculadora.tsx`, `IndemnizacionCalculadora.tsx`). Todos reemplazados por el mismo `DateField.tsx` — mismo componente, mismo estilo, en toda la app sin excepción. Verificado con `tsc` limpio en `@pv/web` y en navegador real: el calendario abre igual en el paso salario del wizard y en la calculadora de indemnización.
- [x] **Checkbox de autocompletar SMLMV también en modo ghost**: el checkbox "Autocompletar salario mínimo vigente" (ya existente en los formularios de empleado/contratista de empresa) se agregó a los 6 lugares del flujo anónimo donde se declara un salario mensual: `PasoSalario.tsx`, `PasoRevision.tsx` (tras extraer comprobante), y las 4 calculadoras (`CesantiasCalculadora`, `PrimaCalculadora`, `RecargosCalculadora`, `IndemnizacionCalculadora`). Requirió que `App.tsx` pasara el `parametros` (ya cargado con `obtenerParametros()`) como prop nueva a los 6 componentes — antes ninguno lo recibía. Verificado con `tsc` limpio en `@pv/web` y en navegador real: marcar el check en el paso salario autocompleta `1750905`; el mismo check aparece y funciona en la calculadora de prima.
- [x] **`DateRangeField` — un solo calendario en modo rango para elegir "un período"**: reemplaza el patrón de dos `DateField` lado a lado (Desde/Hasta) donde ambas fechas son literalmente los dos extremos de un mismo período — no donde son conceptos distintos (fecha de ingreso vs. fecha de corte de una calculadora, que siguen siendo dos `DateField` separados). Nuevo `DateRangeField.tsx`: mismo `Popover`/`Calendar` de `react-day-picker` pero `mode="range"` con 2 meses visibles, franja resaltada entre extremos, y el trigger muestra `formatRangoFechas(desde, hasta)`. Aplicado en `PasoSalario.tsx` (período a revisar — conserva el cálculo automático de "hasta" según periodicidad cuando solo se elige el primer clic; un rango completo elegido a mano desmarca la periodicidad a "personalizado", mismo criterio que antes), `PasoRevision.tsx` (período tras extraer comprobante) y `PeriodosEmpresa.tsx` (crear y editar periodo de nómina). Verificado con `tsc` limpio en `@pv/api`/`@pv/web` y en navegador real: dos meses visibles, clic en 15 y 25 de julio resalta la franja intermedia y el campo muestra "15 — 25 julio 2026"; mismo comportamiento confirmado en "Nuevo periodo" del panel de empresa.
- [x] **Producción sincronizada: las 9 migraciones pendientes se aplicaron contra Supabase producción** (`prisma migrate deploy`, confirmado con el usuario antes de ejecutar): `empleado_fecha_ingreso`, `empleado_fecha_retiro`, `empleado_tipo_contrato`, `contratistas_servicios`, `periodo_nota_edicion`, `membresia_empresa_historial`, `liquidacion_historial`, `periodo_empleados_incluidos`, `recibo_advertencias` — todas aditivas, sin tocar datos existentes. `prisma migrate status` confirma el esquema al día. El backfill puntual de `Usuario.email` (necesario tras `membresia_empresa_historial`) no encontró nada que rellenar: producción tiene 0 usuarios y 0 empresas — el proyecto real de Supabase está limpio, sin uso todavía. Scripts de verificación de solo lectura borrados tras usarlos.
- [x] **Super admin puede crear una empresa nueva + invitar su primer admin_empresa** (alcance confirmado con el usuario: sin reasignar/suspender por ahora): nuevo `crearEmpresaConAdmin()` en `authService.ts`, mismo patrón de invitación nativa de Supabase que `invitarColaborador` (`inviteUserByEmail` — la persona invitada define su propia contraseña por correo, el admin_plataforma nunca la conoce ni la fija; a diferencia de `registrarEmpresa`, que exige password inmediato porque ahí sí es la misma persona registrándose). Compensación en cadena si algo falla a mitad de camino: `Empresa` se crea primero (falla rápido y sin enviar correo si el NIT ya existe); si el correo del admin ya existe se borra la `Empresa` y se lanza `ErrorConflicto` (409); si falla la creación del `Usuario` se borra también el usuario de Auth recién invitado. `POST /api/admin/empresas` (`crearEmpresaAdminSchema`, reusa el shape de empresa de `registroSchema`). UI: botón "+ Nueva empresa" en la sección `Empresas` de `DashboardAdmin.tsx` que revela un formulario inline. Verificado: `tsc` limpio en `@pv/api`/`@pv/web`, 403 confirmado para `admin_empresa` intentando crear, NIT duplicado rechazado antes de intentar invitar (sin correo enviado), y compensación confirmada (la empresa no queda huérfana si la invitación falla). El camino feliz completo (invitación real 201) no se pudo verificar en vivo esta vez porque el proyecto de Supabase tocó su límite de envío de correos por las muchas cuentas de prueba creadas en la sesión — la lógica reusa el patrón de `invitarColaborador`, ya verificado exitosamente en producción real en una ronda anterior. El formulario del frontend sí se verificó visualmente completo en el navegador real (sin enviar, para no gastar más cupo de correo).
- [x] **Super admin: reasignar/quitar admin_empresa y suspender/reactivar empresas** (cierra el pendiente explícito de la ronda anterior). Decisiones de alcance confirmadas con el usuario antes de implementar:
  - **"Quitar" desvincula, no borra**: `quitarAdminEmpresa()` en `authService.ts` pone `rol: "individual"` y `empresaId: null` en el `Usuario` — su cuenta de Supabase Auth y su fila `Usuario` NO se tocan, queda como cualquier cuenta individual sin empresa. Reversible.
  - **"Reasignar" reemplaza**: `reasignarAdminEmpresa()` invita a un admin nuevo (mismo patrón `inviteUserByEmail` que `crearEmpresaConAdmin`) y desvincula (mismo efecto que "quitar") a cualquier admin_empresa que ya tuviera esa empresa — nunca queda más de uno a la vez. Orden pensado para minimizar el daño si algo falla: se crea primero el reemplazo (si falla, el admin actual queda intacto, se compensa borrando la cuenta de Auth recién invitada); solo si eso funciona se desvincula al anterior.
  - **Suspender bloquea de verdad**: nuevo campo `Empresa.activa` (`Boolean @default(true)`, migración `20260720120000_empresa_activa`, solo dev). `middleware/auth.ts` (`requiereAuth`) ahora busca la `Empresa` del `perfil.empresaId` (si tiene una) y responde 403 en cualquier request si está suspendida — afecta a admin_empresa Y colaboradores por igual (ambos tienen `empresaId` en su `Usuario`); admin_plataforma nunca tiene `empresaId`, así que nunca se bloquea a sí mismo. Reactivar es el mismo endpoint con `activa: true`.
  - `listarEmpresasAdmin()` ahora incluye `id` en cada admin (antes solo `nombre`/`email` — necesario para poder targetear a quién reasignar/quitar) y el campo `activa`.
  - Nuevas rutas: `PUT /admin/empresas/:id/admin` (reasignar), `DELETE /admin/empresas/:id/admin/:usuarioId` (quitar — valida que el usuario realmente sea admin_empresa DE ESA empresa antes de tocar nada, para que una URL manipulada no pueda desvincular a alguien de otra empresa), `PUT /admin/empresas/:id/estado` (suspender/reactivar).
  - UI en `DashboardAdmin.tsx`: cada fila de empresa gana un botón "Reasignar admin" (`UserCog`, abre un formulario inline) y un botón "Suspender"/"Reactivar" (`Pause`/`Play`, con `confirm()` nativo); cada admin listado gana un ícono de basura (`Trash2`) para "quitar" (también con `confirm()`); badge "Suspendida" junto al nombre cuando `!activa`.
  - Verificado con un script de servicios contra el contenedor de dev (11 checks): listado trae `admins[].id`; reasignar invita al nuevo (201), el admin anterior queda `rol: individual, empresaId: null`, el nuevo queda `admin_empresa` vinculado; quitar desvincula (204) y el usuario queda `individual`; intentar quitar un admin que pertenece a OTRA empresa se rechaza (422, protección IDOR); suspender bloquea con 403 a un admin_empresa vigente de esa empresa intentando usar cualquier ruta `/empresa/...`; reactivar restaura el acceso (200) de inmediato. También verificado en navegador real con una cuenta admin_plataforma de prueba: los botones aparecen, "quitar" con confirm() nativo se aplicó correctamente (el hang del `confirm()` es una limitación conocida del tooling de automatización del navegador, no del producto — funciona normal para un usuario real), y el formulario de "reasignar" abre/cierra bien. Cuentas y empresas de prueba limpiadas de la DB local y de Supabase Auth al terminar; confirmado que las 2 empresas reales (`Ynt-abs`, `Restaurante Resplandor (dev)`) quedaron intactas con `activa: true`.

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
