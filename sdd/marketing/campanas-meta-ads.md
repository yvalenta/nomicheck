# Campañas Meta Ads — NomiCheck (v1, jul 2026)

Bloque 3 del entregable del **Prompt Maestro** (`SDD.md §16`). Cuatro campañas —una por audiencia— listas para crear vía el MCP de Meta Ads en **estado pausado**, con confirmación explícita antes de activar. No las creo yo desde este agente: esta ficha es el input verbatim para la sesión que las cree.

**Fundamento de marca:** todo el copy sigue `sdd/marketing/posicionamiento.md` — tono claro/firme/cercano/riguroso/silencioso, nunca alarmista. Cualquier variante creativa que rompa esos adjetivos se descarta antes de subir a la cuenta.

**Landing de destino:** `https://nomicheck.co/lanzamiento` (o el dominio final que se configure). Todas las campañas apuntan a la misma landing con anclas específicas y `utm_campaign` distinto para atribución.

---

## Setup común (aplicar a las 4 campañas)

### Pixel y eventos personalizados

Meta Pixel base + eventos personalizados que el frontend ya emite (ver `apps/web/src/lib/tracking.ts`):

| Evento | Momento | Uso en optimización |
|---|---|---|
| `verificacion_iniciada` | Usuario abre el flujo del verificador (click "Verifica tu pago") | Micro-conversión — evento de "Interés" |
| `verificacion_completada` | El motor produjo un `ResultadoNomina` visible al usuario | **Conversión primaria** — optimizar por este a partir de 50 eventos/semana por conjunto |
| `discrepancia_detectada` | El resultado tiene al menos un semáforo ámbar/rojo | Evento cualificador — usar para audiencia lookalike de Campaña 2 |
| `registro_empresa` | Un dueño completó el signup B2B | **Conversión primaria** para Campañas 3 y 4 |
| `interes_partners` | Contador dio click en "Programa de referidos" | Micro-conversión Campaña 4 |

### Distribución de presupuesto (fase de aprendizaje, 7-14 días)

| Campaña | % del presupuesto total | Justificación |
|---|---|---|
| 1 — Verifica tu pago (A) | **60%** | Adquisición masiva. Alimenta el pool para lookalike de Campaña 2. |
| 2 — ¿Te robaron? (B) | **15%** | Alta intención pero audiencia limitada; escala solo cuando el pool de lookalike de "discrepancia_detectada" tenga suficiente base. |
| 3 — Automatiza tu nómina (C) | **20%** | Menor volumen pero LTV alto; se mantiene incluso con CPA alto por relación CAC/LTV. |
| 4 — Aliado técnico (D) | **5%** | Canal de referidos, siembra a bajo costo. Escala solo si los primeros 3-5 contadores convierten a >10 pymes. |

Reasignación después de 7 días según CPA real. Si Campaña 1 tira por debajo de CPA objetivo (por definir después del primer piloto), rebalance a 40/25/25/10.

### Reglas creative

- **3 variantes de gancho por campaña** antes de escalar cualquier conjunto:
  1. Dolor concreto (ej. "el domingo que trabajaste hasta las 10pm")
  2. Curiosidad ("¿Sabías que tu recargo dominical debe ser el 75% del ordinario?")
  3. Cifra específica ("$127.400 — lo que la ley dice de tu domingo")
- **Primeros 2 segundos deciden**: en Reels/Stories, el hook visual (recibo con semáforo, cifra grande) debe aparecer sin fade.
- **Nunca:** amenazas ("van a demandar a tu empresa"), tono de abogado agresivo, promesa de dinero recuperado. Si un creative pasa por ese lado, se rechaza aunque tenga buen CTR.

### Coherencia visual con landing

- Paleta: teal (`#0d9488`) para correcto, ámbar (`#f59e0b`) para advertencia, coral (`#e11d48`) para discrepancia. Nunca uses solo un color — el semáforo es el hilo visual entre ads y landing.
- Tipografías: Space Grotesk display en overlays de texto grande; JetBrains Mono para cifras.
- El "recibo demo" del hero de la landing debe aparecer al menos en 2 de las 3 variantes creativas de cada campaña — es el elemento memorable compartido.

---

## Campaña 1 — Verifica tu pago (Audiencia A)

**Objetivo Meta:** *Tráfico* (primeras 2 semanas) → migrar a *Conversiones* optimizando por `verificacion_completada` cuando haya volumen (≥ 50 eventos/semana por conjunto).

**Buyer persona:** Mesero, cajero, operador de call center, personal de bodega, aseadora doméstica en Bogotá/Medellín/Cali/Barranquilla. 18-40 años. Salario entre 1 y 2 SMLMV. Usa el celular como computador principal.

**Segmentación:**

| Parámetro | Valor |
|---|---|
| Ubicación | Colombia — Bogotá, Medellín, Cali, Barranquilla, Bucaramanga, Cartagena (incluir residentes y visitantes recientes) |
| Edad | 18–40 |
| Idioma | Español |
| Intereses | Trabajo en restaurantes, servicio al cliente, call center, retail, construcción, servicio doméstico, ofertas de empleo (broad — dejar que el algoritmo depure) |
| Comportamientos | Usuarios de Android de gama media/baja (proxy de nivel socioeconómico C-D) |
| Exclusiones | Personas que ya visitaron la landing en los últimos 7 días (evita reoferta a Audiencia B, que tiene otra campaña) |
| Detalles avanzados | Sin restricción de cargo — la mayoría del target no lo tiene declarado |

**Ubicaciones (Placements):** Reels de Instagram + Stories de Instagram + Reels de Facebook. Solo verticales, dispositivos móviles. Sin Audience Network.

**Formato de anuncios:** Video vertical 9:16, 15-30 seg, subtítulos siempre visibles (mayoría del público escucha sin audio).

**Gancho creativo (3 variantes iniciales):**
1. **Dolor:** *"¿Trabajaste un domingo hasta las 10pm? Mira lo que te debieron pagar."* → cámara sobre un recibo real → aparece semáforo rojo con la cifra faltante.
2. **Curiosidad:** *"Tu recargo dominical es del 75%. ¿Tu jefe lo sabe?"* → semáforo verde/rojo comparando cifras.
3. **Cifra:** *"Domingo + 4 horas nocturnas = $127.400 más. Si te pagaron menos, algo pasó."* → desglose línea a línea con CST art. 179 citado.

**Copy del anuncio (bajo el video):**

> **Verifica gratis lo que te pagaron.**
> Sube la foto de tu comprobante o cuéntanos tu horario. En dos minutos ves cada cifra con la ley que la respalda. Sin registro, sin tarjeta, sin nombre.

**CTA:** "Verificar gratis" — Botón `Learn More` linkeando a `/lanzamiento?utm_campaign=verifica-tu-pago&utm_source=meta&utm_medium=paid_social&utm_content={{ad.name}}`.

**KPIs de éxito (primeros 14 días):**
- CTR ≥ 1.8%
- CPA por `verificacion_completada` ≤ $2.500 COP
- Tasa de `discrepancia_detectada` ≥ 30% de las verificaciones (indicador de calidad del target)

---

## Campaña 2 — ¿Te robaron en la liquidación? (Audiencia B)

**Objetivo Meta:** *Conversiones* directo — optimizar por `verificacion_completada` y, cuando pool ≥ 500, migrar a `discrepancia_detectada`.

**Buyer persona:** Mismo perfil demográfico de A pero **con evento de intención**: buscó "derechos laborales", "cuánto me deben de liquidación", "recargo dominical Colombia" o visitó la landing sin completar la verificación.

**Segmentación:**

| Parámetro | Valor |
|---|---|
| Ubicación | Colombia — nacional (sin filtro de ciudad, la intención supera al perfil demográfico) |
| Edad | 18–50 (más amplio que Campaña 1 — la sospecha activa aparece en todas las edades) |
| Intereses | "Derechos laborales", "Ministerio del Trabajo", "salario mínimo Colombia", "Código Sustantivo del Trabajo", "liquidación laboral" |
| Audiencias personalizadas | (1) Visitantes de `/lanzamiento` últimos 30 días que **no** dispararon `verificacion_completada`. (2) Visitantes de `/lanzamiento` que **sí** dispararon `verificacion_completada` (retargeting suave). |
| Lookalikes | 1% Colombia basado en usuarios con `discrepancia_detectada` (crear cuando el pool ≥ 500) |
| Exclusiones | Quienes ya se registraron en el B2B (Campañas 3/4) |

**Ubicaciones:** Feed de Instagram + Feed de Facebook + Stories. Formato mixto imagen/video.

**Formato:**
- Feed: **carrusel de 3-5 tarjetas** mostrando ejemplos anonimizados. Cada tarjeta es una discrepancia real de una verificación pasada (con datos numéricos plausibles pero inventados). Ejemplo: "María, cajera, jul 2026" → semáforo rojo → "Le pagaron $50.000 de recargo dominical. La ley dice $87.500."
- Stories: video vertical con narrador en off recorriendo un comprobante en primer plano.

**Gancho creativo (3 variantes):**
1. **Dolor:** *"El mes pasado te sentiste raro con tu comprobante. Hoy puedes saber si tenías razón."*
2. **Curiosidad:** *"Tres cifras que suelen faltar en el pago de fin de mes."* → carrusel con recargo dominical, hora extra nocturna, liquidación de prima.
3. **Cifra:** *"$127.400 — la diferencia promedio que encuentran quienes verifican su domingo."*

**Copy del anuncio:**

> **Verifica lo que te deben — con la ley al lado.**
> No te decimos qué hacer. Te decimos qué dice el CST sobre cada peso de tu último pago. En dos minutos, gratis, sin registro.

**CTA:** "Calcula lo que te deben" — link a `/lanzamiento?utm_campaign=te-robaron&utm_source=meta&utm_medium=paid_social&utm_content={{ad.name}}#caso-real` (ancla al ejemplo real).

**KPIs (primeros 14 días):**
- Tasa de conversión sobre visita ≥ 15% (audiencia caliente)
- CPA por `verificacion_completada` ≤ $1.500 COP
- Tasa de `discrepancia_detectada` ≥ 60% (mucho mayor que Campaña 1 — es intención declarada)

---

## Campaña 3 — Automatiza tu nómina sin miedo a la ley (Audiencia C)

**Objetivo Meta:** *Generación de leads* (formulario nativo Meta) — el signup B2B tiene fricción, mejor capturar email primero y follow-up manual/email nurture.

**Buyer persona:** Dueño o administrador de restaurante, comercio, oficina pequeña o taller. 5-50 empleados. Sin área de RRHH. Hoy liquida en Excel o paga a un contador mensual.

**Segmentación:**

| Parámetro | Valor |
|---|---|
| Ubicación | Colombia — nacional, priorizar ciudades intermedias donde el ecosistema de contadores es más caro/limitado |
| Edad | 28–55 |
| Intereses | Software de gestión contable (Siigo, Alegra, Contapyme, Nubox), asociaciones de pymes (Acopi, Fenalco), "gerencia de restaurantes", "administración de comercio" |
| Datos demográficos | Cargo: "propietario de negocio", "gerente general", "administrador" — donde Meta permita ese detalle |
| Audiencias personalizadas | Retargeting de visitantes de `/lanzamiento` que llegaron a la sección "puente B2B" (deep scroll o click en CTA "¿Tienes un negocio?"). Este es el **caballo de Troya** — el trabajador comparte el PDF y el dueño llega curioseando. |
| Exclusiones | Empresas ya registradas |

**Ubicaciones:** Feed de Facebook + Feed de Instagram + Marketplace. Sin Reels ni Stories — el buyer profesional consume feed, no vertical.

**Formato:**
- **Video corto explicativo** (60-90 seg): tono profesional, muestra el flujo real de la app (crear periodo → capturar turnos → liquidar → cada colaborador verifica). Sin voz alta, con música ambiente.
- **Testimonial simulado** (2ª variante): dueño de restaurante ficticio dice "antes le pagaba a un contador $600.000 al mes y a veces me equivocaba. Ahora liquido yo mismo con NomiCheck y cada línea cita la ley." Actor con contexto realista de restaurante.

**Gancho creativo (3 variantes):**
1. **Dolor:** *"Pagar mal la liquidación no es un error contable. Es un pasivo legal."*
2. **Curiosidad:** *"El motor de nómina que usan los contadores, ahora tú lo usas directo."*
3. **Cifra:** *"Un contador cuesta $600.000/mes. NomiCheck Empresas cuesta menos que un almuerzo por empleado."* (validar cifras exactas con producto antes de subir)

**Copy del anuncio:**

> **Liquida nómina sin miedo a incumplir.**
> Prestaciones sociales, seguridad social, retención en la fuente — el motor calcula cada línea con la ley vigente y cita el artículo detrás. Tus colaboradores verifican solos su recibo. Tú duermes tranquilo.
>
> Prueba gratis 30 días. Sin tarjeta.

**CTA:** "Prueba NomiCheck Empresas" — Formulario de leads nativo pidiendo: nombre, email, teléfono, número de empleados, sector. Redirige después a `/lanzamiento?utm_campaign=empresas&utm_source=meta&utm_medium=paid_social#empresas`.

**KPIs (primeros 14 días):**
- Costo por lead (CPL) ≤ $12.000 COP
- Tasa de lead-a-signup (después del follow-up manual) ≥ 25%
- Al menos 3 empresas con >5 empleados registradas la primera semana

---

## Campaña 4 — Tu aliado técnico para nómina (Audiencia D)

**Objetivo Meta:** *Generación de leads* con landing dedicada `/lanzamiento#contadores` (ancla al final de la landing base — cuando el volumen justifique, migrar a página propia `/programa-contadores`).

**Buyer persona:** Contador público independiente que atiende 5-20 pymes o profesional de nómina en una asesoría. Ya vive del cálculo manual/hojas y ve el software como amenaza a su margen pero también como aliado si le hace ganar tiempo.

**Segmentación:**

| Parámetro | Valor |
|---|---|
| Ubicación | Colombia — nacional |
| Edad | 28–55 |
| Datos profesionales | Cargo: "contador público", "analista de nómina", "consultor RRHH", "gestor contable" (Meta tiene targeting por cargo profesional para Colombia) |
| Intereses | "Junta Central de Contadores", "Instituto Nacional de Contadores Públicos", "Contapyme", "Siigo Contador", "declaración de renta persona natural" |
| Grupos y páginas | Páginas afines de contaduría y asesoría contable en Colombia |
| Exclusiones | Empresas ya registradas y contadores ya inscritos al programa |

**Ubicaciones:** Feed de Facebook + Feed de Instagram + LinkedIn (si activa después el conector). Sin video vertical.

**Formato:**
- Feed estático con texto largo (el buyer profesional lee). Enfoque en eficiencia y en el motor siempre actualizado.
- Segunda variante: carrusel con 4 tarjetas mostrando (1) auditoría inmutable, (2) motor determinístico con leyes citadas, (3) exportación PILA compatible, (4) programa de referidos con comisión.

**Gancho creativo (3 variantes):**
1. **Dolor:** *"Atiendes 12 pymes y pierdes 8 horas al mes verificando cálculos. NomiCheck te devuelve esas horas."*
2. **Curiosidad:** *"El motor de reglas que audita las liquidaciones, ahora también trabaja para ti."*
3. **Cifra:** *"Programa para contadores: 20% de comisión recurrente por cada pyme que traigas."* (validar % con producto)

**Copy del anuncio:**

> **El motor de reglas actualizado con cada reforma. Ya no persigues decretos.**
> Cada cambio del CST o del salario mínimo entra al motor con su fecha de vigencia. Tus liquidaciones usan la ley del periodo, no la de hoy. Verificas o liquidas — o ambos.
>
> Únete al programa para contadores.

**CTA:** "Conoce el programa para contadores" — Formulario de leads: nombre, email, teléfono, número de clientes atendidos, ciudad. Link a `/lanzamiento?utm_campaign=contadores&utm_source=meta&utm_medium=paid_social#contadores`.

**KPIs (primeros 14 días):**
- CPL ≤ $18.000 COP (aceptamos CPL alto: el LTV de un contador multiplicador es 5-10× el de una pyme directa)
- 5 contadores respondiendo al follow-up manual la primera semana
- Al menos 1 contador convirtiendo a "trae una pyme" en primeras 4 semanas

---

## Instrucciones al agente que ejecute vía MCP de Meta Ads

1. **Crear la cuenta publicitaria** (o usar la que el usuario indique) y confirmar que el pixel base de NomiCheck y los eventos personalizados (`verificacion_iniciada`, `verificacion_completada`, `discrepancia_detectada`, `registro_empresa`, `interes_partners`) están disparando correctamente en `/lanzamiento`.
2. **Crear las 4 campañas en estado `PAUSED`** con los objetivos, segmentaciones, ubicaciones, formatos, copies, CTAs, presupuestos y trackings de arriba.
3. **Estructura por campaña:** 1 Campaña → 1 Conjunto de anuncios inicial → 3 Anuncios (uno por variante de gancho).
4. **Presupuesto**: total mensual sugerido a definir con el usuario. Distribuir según % de la tabla de arriba. Preferir CBO (Campaign Budget Optimization) sobre presupuesto a nivel de conjunto.
5. **Verificar y esperar confirmación explícita del humano antes de activar cualquier campaña.** No activar automáticamente. Esta es una acción que gasta dinero real.
6. **Configurar reglas automáticas** después de activar: pausar automáticamente cualquier anuncio con CPA > 2× el CPA promedio del conjunto después de 3 días con ≥ 20 conversiones.
7. **Reporte semanal automático** al humano con CPA/CTR/tasa de conversión por conjunto — el humano decide reasignación de presupuesto.
