# NomiCheck — Software Design Document · v2.2

> **SDD v2.2** · Plataforma de nómina Colombia con dos modos: **verificador anónimo** de comprobantes de pago y **versión empresa** para liquidar nómina de colaboradores, con verificación y reporte de discrepancias por parte del empleado.
> Stack: pnpm monorepo TypeScript · React 19 + Vite + Tailwind CSS (SPA) · Express + Prisma + **Supabase (Postgres + Auth + RLS)** · `packages/reglas` (motor puro compartido) · Claude API (extracción + chat).

| Metadato | Valor |
|---|---|
| Versión | 2.2 — rebrand a NomiCheck, wizard de turnos basado en tiempo (salario proporcional + deducciones automáticas) y UI FinTech |
| Estado | Definición del pivot, en implementación |
| Stack | TypeScript end-to-end · React 19 · Express · Prisma sobre Supabase Postgres · Supabase Auth · Claude API |
| Actualizado | Julio 2026 |
| Documentos de referencia | `PLAN.md` (v1, superseded) · `sdd/` (metodología v1, archivada) · Advance Fitness SDD v2.0 (formato) |

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
| Panel admin de reglas legales y festivos con historial de vigencias | Prestaciones sociales completas (cesantías, intereses, vacaciones) — solo prima cuando aparece como concepto |
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
7. Deducciones de ley automáticas sobre IBC = devengado salarial (base + recargos + extras, SIN auxilio de transporte).
8. Advertencia de descanso compensatorio cuando se trabajan ≥ 3 domingos en el periodo (CST art. 181).
9. Fixture de regresión (Resplandor, 16–30 jun 2026, horario default): base $875.453 + recargo dominical 12 h × 80 % = $76.403 + auxilio $124.548 − salud/pensión $76.148 → neto $1.000.255.

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
| Claude API (Anthropic) | IA | Extracción (visión + JSON schema) y chat contador; API key solo en servidor |
| Vitest | Tests | Motor de reglas con los 2 comprobantes reales como regresión |

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
- [x] Fase 3 — extracción por imagen (`POST /api/comprobantes/extraer`, Claude visión + tool-use, editable antes de calcular). Pendiente: probar con `ANTHROPIC_API_KEY` real (hoy placeholder)
- [ ] Fase 4 — chat contador
- [ ] Fase 5 — cuentas + empresa + empleados
- [ ] Fase 6 — liquidación y recibos
- [ ] Fase 7 — portal colaborador + discrepancias
- [ ] Fase 8 — panel admin de reglas

---

## 14 — Visión a futuro (sin fase asignada)

Ideas del "proyecto grande" para no perderlas — ninguna entra al MVP:

- **SaaS multi-empresa con pricing**: plan gratuito (verificador) como embudo hacia planes de pago por empleados activos.
- **PILA / aportes patronales**: liquidar también el costo patronal (salud, pensión, ARL, parafiscales, cesantías) — la contabilidad completa del empleador.
- **Prestaciones sociales**: cesantías, intereses, prima automática, vacaciones y provisiones mensuales.
- **Exportes contables**: integración o archivo plano hacia Siigo/Alegra/World Office.
- **Notificaciones**: email al colaborador cuando hay recibo nuevo o respuesta a su reporte.
- **Firma/acuse del recibo** por el colaborador (valor probatorio).
- **Histórico del colaborador entre empleos**: su hoja de vida salarial le pertenece a él, no a la empresa.
- **Comparador de ofertas**: "¿me conviene este turno/salario?" usando el mismo motor.
- **API pública del motor de reglas** legales colombianas (el activo más defendible del proyecto).
- **Nómina electrónica DIAN** cuando el producto madure hacia empleadores formales medianos.
