# Validador de Nómina Colombia — Plan de Proyecto

## Contexto
Herramienta para que un empleado en Colombia introduzca (o suba) su
comprobante de pago y valide si fue calculado correctamente según la
legislación laboral vigente (Ley 2101 de 2021 sobre jornada, Ley 2466 de 2025
sobre recargos, decretos de salario mínimo). La app debe comportarse, en
parte, como un **contador digital**: no solo calcula, sino que también extrae
datos automáticamente de un comprobante real y explica cada concepto en
lenguaje sencillo, de forma transparente y siempre alineada a la ley vigente
en la fecha del periodo liquidado.

Se partió de un prompt conversacional de "analista de nómina" y se decidió
construirlo como aplicación interactiva. Dos comprobantes de ejemplo mostraron
dos familias de nómina distintas en la práctica — **por turnos/recargos**
(ej. Restaurante Resplandor) y **de salario fijo con conceptos/beneficios**
(prima, auxilios, deducciones por convenio) — y la v1 debe soportar ambas.

## Decisiones de alcance (confirmadas con el usuario)
1. **Dos modos de cálculo** conviven en la misma app: turnos y salario fijo.
2. **Rol de contador = ambas cosas:**
   - Extracción automática de datos desde el comprobante (PDF/imagen/texto
     pegado) en vez de solo formularios manuales.
   - Acompañamiento conversacional que explica cada línea del cálculo, como lo
     haría un contador humano.
3. **Actualización de reglas legales:** panel de administración interno
   (protegido) donde se editan valores y fechas de corte (SMLMV, recargos,
   jornada, aportes) sin tocar código ni redeploy.

## Hechos legales verificados (jul-2026) — semilla inicial de datos
- **SMLMV 2026:** $1.750.905 · auxilio de transporte $249.095.
- **Valor hora ordinaria:** salario ÷ 220 (jornada 44 h/sem) hasta el
  14-jul-2026; salario ÷ 210 (jornada 42 h/sem) desde el 15-jul-2026.
- **Recargo dominical/festivo:** 80 % hasta 30-jun-2026 → **90 % desde
  1-jul-2026** (100 % desde jul-2027).
- **Jornada nocturna:** 7:00 p. m.–6:00 a. m. (desde 25-dic-2025), recargo
  **35 %**.
- **Horas extra:** diurna 25 %, nocturna 75 %; extra dominical/festiva suma el
  recargo dominical vigente.
- **Aportes obligatorios empleado:** salud 4 %, pensión 4 %; fondo de
  solidaridad si IBC ≥ 4 SMLMV (escalonado 1–2 %); retención en la fuente
  según tabla vigente si aplica.

Estos valores **no se hardcodean**: son el registro semilla de la tabla de
reglas legales versionada por fecha (ver arquitectura), editable desde el
panel admin.

## Stack
- **Frontend:** React + Vite + TypeScript + Tailwind CSS + **lucide-react**
  (iconos). SPA ligera, sin Node en producción más allá del build estático.
- **Backend:** API ligera en **Node/Express + TypeScript**, necesaria porque
  el panel admin requiere persistir cambios en una base de datos real (no
  archivo estático) y porque la extracción de comprobantes y el chat del
  contador llaman a la API de Claude del lado servidor (nunca exponer la API
  key en el navegador).
- **Base de datos:** **SQLite** (vía Prisma) para v1 — simple, sin servidor
  de DB que administrar; migrar a Postgres si el proyecto crece (Prisma hace
  ese cambio trivial).
- **IA:** Claude (Anthropic API) para dos usos puntuales:
  - Extracción estructurada de datos desde el comprobante subido (PDF/imagen)
    usando visión + salida estructurada (JSON), validada contra un schema
    antes de usarla en el cálculo.
  - Chat del "contador" que explica cada línea, usando como contexto el
    resultado ya calculado por el motor de reglas (el LLM explica, **no**
    calcula — el cálculo siempre lo hace código determinístico).
- **pnpm** como gestor de paquetes en ambos (frontend y backend).

## Arquitectura (simple, sin sobreingeniería)
```
payment_validation/
├─ apps/
│  ├─ web/           # React + Vite + Tailwind (SPA)
│  └─ api/           # Node/Express + Prisma + SQLite
├─ packages/
│  └─ reglas/         # motor de reglas legales + calculadoras (compartido)
```
- **`packages/reglas`** (el corazón del sistema, sin dependencias de UI ni de
  HTTP):
  - `ReglasLegales`: acceso a los valores vigentes en una fecha dada (lee de
    la tabla `reglas_legales` vía API en runtime; en el paquete es solo una
    interfaz + tipo, para que web/api la consuman igual).
  - `CalculadoraNomina` — **patrón Strategy**: una interfaz común
    (`calcular(datosEntrada, reglas): ResultadoNomina`) con dos
    implementaciones, `CalculadoraPorTurnos` y `CalculadoraSalarioFijo`. Es el
    único patrón de diseño explícito que se justifica aquí: dos algoritmos
    intercambiables sobre la misma interfaz, sin necesidad de fábricas ni
    capas extra.
  - Sin ORM, sin acceso a red: funciones puras, fáciles de testear con los 2
    comprobantes reales como casos de prueba.
- **`apps/api`**: capas delgadas típicas de Express —
  `routes → controllers → services`. Services usan `packages/reglas` para
  calcular y Prisma para leer/escribir `reglas_legales` y `festivos`.
  Endpoints:
  - `POST /api/comprobantes/extraer` — recibe el archivo, llama a Claude con
    visión, devuelve JSON estructurado (sin guardar el archivo).
  - `POST /api/nomina/calcular` — recibe datos ya sea de extracción o
    digitados a mano + modo (turnos/fijo), devuelve el desglose esperado.
  - `POST /api/chat/explicar` — recibe el resultado calculado + pregunta del
    usuario, responde vía Claude usando ese resultado como contexto.
  - `GET/PUT /api/admin/reglas` — CRUD de reglas legales (protegido).
- **`apps/web`**: páginas —
  - `Inicio`: elegir modo, subir comprobante o llenar formulario.
  - `Resultado`: tabla comparativa + gráfico (Recharts) + panel de chat con
    el contador.
  - `Admin/Reglas`: tabla editable de reglas legales con historial (fecha de
    vigencia, quién y cuándo se editó).

## Modelo de datos (Prisma, mínimo viable)
- `ReglaLegal`: `id, clave (ej. "recargo_dominical"), valor (decimal),
  vigenteDesde (date), vigenteHasta (date?), fuente (texto/URL), creadoEn`.
- `Festivo`: `id, fecha (date), nombre`.
- `AdminUsuario`: `id, email, passwordHash` (auth simple, solo para el panel;
  no hay cuentas de empleados en v1 — el flujo del usuario final es anónimo,
  sin login, coherente con "transparente y simple").

## Metodología de trabajo: SDD (Spec-Driven Development)
Este proyecto se desarrolla con specs como fuente de verdad, al estilo
OpenSpec pero sin adoptar su framework — solo la disciplina de "proponer
antes de construir". Ver [`sdd/README.md`](sdd/README.md) para el flujo
completo (`proposal.md` → `spec-delta.md` → `tasks.md` → implementación →
archivo del cambio). Las specs vigentes de cada capacidad viven en
`sdd/specs/`:
- [`calculo-turnos`](sdd/specs/calculo-turnos/spec.md)
- [`calculo-salario-fijo`](sdd/specs/calculo-salario-fijo/spec.md)
- [`extraccion-comprobante`](sdd/specs/extraccion-comprobante/spec.md)
- [`chat-contador`](sdd/specs/chat-contador/spec.md)
- [`admin-reglas`](sdd/specs/admin-reglas/spec.md)

Cualquier cambio de comportamiento o alcance (no fixes triviales) empieza con
una propuesta en `sdd/changes/<nombre>/`, no directo en código.

## Detección de festivos
Tabla `Festivo` poblada una vez por año (Ley Emiliani es determinística: los
festivos de traslado al lunes se pueden generar por regla, los de fecha fija
también) — se guarda como datos, no como lógica de calendario compleja, y se
edita desde el mismo panel admin si hay un festivo especial (ej. día cívico
puntual).

## UI/UX
- Visual atractivo: Tailwind + lucide-react, paleta simple (neutro + un color
  de acento), sin dependencias visuales pesadas.
- Flujo transparente: cada resultado muestra de dónde salió cada cifra
  (fórmula + artículo/ley de referencia), no solo el número.
- Semáforo por concepto (verde = coincide con el comprobante, rojo =
  diferencia, gris = no aplica) en la tabla de resultado.
- Disclaimer visible: "estimado informativo, no reemplaza la liquidación
  oficial ni asesoría legal certificada".

## Próximos pasos
1. Definir el schema exacto de `ResultadoNomina` (forma común de salida para
   ambas calculadoras, de la que se alimentan tabla, gráfico y chat).
2. Prototipar el prompt/schema de extracción de Claude con los 2 comprobantes
   reales ya recibidos (probar precisión antes de construir la UI de carga).
3. Cargar la semilla de `ReglaLegal`/`Festivo` en Prisma seed.
4. Scaffold: `pnpm create vite apps/web -- --template react-ts`,
   `apps/api` con Express + Prisma + SQLite.

## Verificación
- Casos de prueba del motor de cálculo con los 2 comprobantes reales:
  reproducir recargo nocturno, dominical/festivo, extras y neto a pagar del
  comprobante 1; devengos/deducciones y neto del comprobante 2.
- Caso límite: periodo que cruza el 1-jul o 15-jul-2026 (cambio de tarifa a
  mitad de quincena).
- Prueba de extracción: subir cada comprobante de ejemplo (como imagen) y
  confirmar que el JSON extraído coincide con los valores visibles.
