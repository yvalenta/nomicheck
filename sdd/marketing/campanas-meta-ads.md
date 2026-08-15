# Campañas Meta Ads — NomiCheck (v1 jul 2026 · **auditada contra producción el 2026-08-15**)

Bloque 3 del entregable del **Prompt Maestro** (`SDD.md §16`). Cuatro campañas —una por audiencia— listas para crear vía el MCP de Meta Ads en **estado pausado**, con confirmación explícita antes de activar. No las creo yo desde este agente: esta ficha es el input verbatim para la sesión que las cree.

**Fundamento de marca:** todo el copy sigue `sdd/marketing/posicionamiento.md` — tono claro/firme/cercano/riguroso/silencioso, nunca alarmista. Cualquier variante creativa que rompa esos adjetivos se descarta antes de subir a la cuenta.

**Landing de destino:** `https://nomicheck.ynt.codes/lanzamiento`. Todas las campañas apuntan a la misma landing con anclas específicas y `utm_campaign` distinto para atribución. Las cuatro anclas (`#hero`, `#caso-real`, `#empresas`, `#contadores`) **existen y se comprobaron** en el landing servido.

> ⚠️ **Este archivo se escribió en jul-2026 y se auditó contra producción el 2026-08-15.** Lo que decía antes no era un borrador impreciso: era falso en cinco puntos, y tres de ellos habrían gastado plata sin devolver nada. Cada corrección queda con su medición al lado.
>
> ~~`https://nomicheck.co/lanzamiento`~~ — **ese dominio no existe**: sin NS, sin registro A y sin MX, medido. Subir las campañas con ese destino mandaba **el presupuesto entero a una URL que no carga**. Producción es `nomicheck.ynt.codes`.
>
> **La regla que este archivo obedece desde hoy:** ninguna frase sube a Meta antes de que exista lo que promete. Un anuncio es una promesa servida a desconocidos, y no hay forma de retirarla — ver `docs/leyes/cobrar-antes-de-servir.md` en `nomicheck_ops`, que es la misma idea del lado del cobro.

**Decisión de negocio, 2026-08-15 — se toma la salida B: empresas y agentes, con reparto 70/30 en frío y CERO gasto en B2C.** Eso reordena este archivo: **la campaña 3 (empresas) y la 4 (contadores) son las que se suben**, y la 1 y la 2 quedan **parqueadas, no borradas** — se reactivan el día que exista una forma de que un humano pague. El costo de esa decisión está escrito junto a la tabla de presupuesto, no escondido: se pierde el pool de retargeting del que la campaña 3 pensaba sacar su mejor audiencia.

**Línea base medida el 2026-08-15: la audiencia humana es CERO.** No baja: cero. El 99,7 % del tráfico a la API es nuestro propio centinela, y lo que queda como humano es casi todo la máquina de la casa. Eso es **bueno para medir** —cualquier cosa que se mueva después será atribuible sin discusión— y a la vez significa que **ningún KPI de este archivo tiene todavía un dato histórico que lo respalde**: son objetivos propuestos, no medidos.

---

## Setup común (aplicar a las 4 campañas)

### Pixel y eventos personalizados

El contrato de eventos vive en **`apps/web/src/lanzamiento/tracking.ts`** (la ruta que decía este archivo, `apps/web/src/lib/tracking.ts`, **no existe**). Los nombres son fuente de verdad: cambiar uno acá sin sincronizarlo con Meta rompe la optimización.

**Lo que este archivo daba por hecho y no es cierto: el frontend NO emite estos eventos hoy.** Medido el 2026-08-15 sobre producción.

| Evento | Momento previsto | **Estado medido** |
|---|---|---|
| `verificacion_iniciada` | Usuario abre el flujo del verificador | **Se emite, pero mide otra cosa**: dispara al *cargar* el landing y al hacer *click* en el CTA — no cuando alguien abre el verificador |
| `verificacion_completada` | El motor produjo un `ResultadoNomina` visible | 🔴 **No lo emite nadie.** Cero llamadas en todo el código. Era la *conversión primaria* de las campañas 1 y 2 |
| `discrepancia_detectada` | El resultado tiene un semáforo ámbar/rojo | 🔴 **No lo emite nadie.** Era la base del lookalike de la campaña 2 |
| `registro_empresa` | Un dueño completó el signup B2B | 🟠 **Dispara al hacer click en el CTA del landing**, no al completar el registro. Optimizar Meta contra eso es **pagar por curiosidad** |
| `interes_partners` | Contador dio click en "Programa de referidos" | 🟠 Se emite, pero el programa que anuncia no existe (ver campaña 4) |

**Y el Pixel no está instalado.** Medido en el landing servido: `typeof window.fbq === "undefined"`. `tracking.ts` lo dice de frente — sin `fbq`, las cinco funciones son no-op. O sea que **hoy no hay ninguna medición de conversión**, y no la habrá por instalar el pixel solo: faltan además los dos eventos que nadie emite.

> **Precondición dura, antes de gastar un peso:** instalar el Pixel base **y** emitir `verificacion_completada` y `registro_empresa` en el momento real (resultado a la vista / registro completado, no click). Sin eso, Meta optimiza contra la señal equivocada y el presupuesto compra clicks de gente que nunca llegó a nada. No es un pendiente de marketing: es trabajo de producto, y va primero.

### Distribución de presupuesto (fase de aprendizaje, 7-14 días)

**Reordenado el 2026-08-15 por la decisión de salida B.** El reparto original —60 % a la campaña 1, que es B2C— llevaba el grueso del dinero a la audiencia que **no puede pagar**: medido, la única forma de pago servida es USDC, y todo lo que un empleado colombiano puede usar es gratis. Traer trabajadores compra costo de hosting, no ingreso.

| Campaña | % original | **% bajo salida B** | Justificación |
|---|---|---|---|
| 1 — Verifica tu pago (A) | ~~60 %~~ | **parqueada (0 %)** | B2C. No hay forma de que un humano pague: cada peso de anuncio compraría costo de hosting, no ingreso |
| 2 — ¿Te robaron? (B) | ~~15 %~~ | **parqueada (0 %)** | B2C, y además optimiza por dos eventos que **nadie emite** |
| 3 — Automatiza tu nómina (C) | ~~20 %~~ | **70 %** | La audiencia elegida. Empresa que puede pagar por transferencia o factura |
| 4 — Aliado técnico (D) | ~~5 %~~ | **30 %** | Multiplicador: un contador trae varias pymes. Sube porque ya no compite con la 1 |

> **El compromiso que esto abre, dicho de frente.** La campaña 3 declaraba su mejor audiencia como retargeting de quienes llegan por la 1 — *el trabajador comparte el PDF y el dueño llega curioseando*, el «caballo de Troya» del archivo original. **Parquear la 1 apaga ese pool**, y la 3 arranca con segmentación por intereses en frío, que rinde peor.
>
> ~~Las dos salidas son defendibles y la elige Yonatan.~~ **Decidido el 2026-08-15: 70/30 en frío, sin gastar un peso en B2C.** Se sabía el costo y se aceptó: no se compra tráfico de una audiencia que no puede pagar ni siquiera para alimentar un lookalike. La consecuencia operativa está aplicada en la segmentación de la campaña 3 — sin audiencia personalizada, todo frío.
>
> **Lo que esto cambia en cómo se lee el piloto:** en frío, el CPL de la primera semana va a salir **peor** que el que este archivo propone como objetivo, y eso no es señal de que la campaña esté mal. Los KPIs de abajo se fijaron suponiendo un pool caliente que ya no existe. Tratarlos como piso y no como meta hasta que haya una vuelta medida.

**Lo que reemplaza al pool apagado, y no cuesta nada.** Arrancar en frío no significa arrancar sin superficie: el B2C sigue **servido gratis** aunque no se le compre tráfico, y la puerta B2B que faltaba ya está puesta. Lo que existe hoy sin gastar un peso:

- **`/servicios` con vista de empresa** — desde el 2026-08-15 ofrece las tres acciones que le faltaban (registrar con NIT, entrar al portal, escribir), junto a la calculadora de ahorro con supuestos editables. Es el mejor argumento B2B que hay y ahora tiene salida.
- **La sección `#empresas` del landing** sigue viva para cualquiera que llegue por su cuenta: el «caballo de Troya» no se desmontó, solo dejó de comprarse.
- **Los indexadores de agentes y de IA llegan solos** —`erc-8004-indexer`, `OAI-SearchBot`, `ClaudeBot`, `Amazonbot`, `Googlebot`— al agent card y a `llms.txt`. Es la única audiencia que hoy existe de verdad, y es la otra mitad de la salida B.

**No reasignar por CPA antes de que exista medición.** El texto original mandaba rebalancear a los 7 días «según CPA real»; hoy no hay CPA real que mirar, porque el pixel no está y la conversión primaria no se emite. Primero la precondición dura de arriba, después el piloto, después el rebalanceo.

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

## Campaña 1 — Verifica tu pago (Audiencia A) · **PARQUEADA**

> **No se sube. Presupuesto 0 % por la decisión de salida B del 2026-08-15.** Se conserva entera y no se borra: el día que exista una forma de que un humano pague, esta es la campaña que se reactiva, y rehacerla desde cero costaría más que leerla. Nada de acá se ejecuta hoy.

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

## Campaña 2 — ¿Te robaron en la liquidación? (Audiencia B) · **PARQUEADA**

> **No se sube. Presupuesto 0 % por la decisión de salida B del 2026-08-15.** Y aunque se reactivara mañana, no podría correr como está escrita: optimiza por `verificacion_completada` y arma su lookalike sobre `discrepancia_detectada`, **y ninguno de los dos lo emite nadie**. Reactivarla exige primero esos dos eventos.

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
3. ~~**Cifra:** *"$127.400 — la diferencia promedio que encuentran quienes verifican su domingo."*~~ 🔴 **NO SUBIR. Es una estadística inventada presentada como medición.**
   *"La diferencia promedio que encuentran quienes verifican"* afirma un dato agregado sobre usuarios reales. **No existe ni puede existir**: la audiencia medida es cero, y el verificador público es **anónimo y sin estado por diseño** — no persiste nada del visitante, así que ese promedio no se podrá calcular nunca a partir de nuestros propios datos, ni con tráfico.
   Es distinto del gancho 3 de la campaña 1 (*"$127.400 — lo que la ley dice de tu domingo"*), que es **un cálculo reproducible** sobre un caso declarado: ese se sostiene si se publica con sus supuestos.
   **Reemplazo propuesto:** *"Cuatro horas de domingo a las 10pm tienen un número exacto en el CST. Mirá cuál es."* — sin promedio, sin promesa de plata recuperada, y verificable contra el motor.

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
| Audiencias personalizadas | ~~Retargeting de visitantes de `/lanzamiento` que llegaron a la sección "puente B2B" (deep scroll o click en CTA "¿Tienes un negocio?"). Este es el **caballo de Troya** — el trabajador comparte el PDF y el dueño llega curioseando.~~ **Ninguna.** El «caballo de Troya» dependía de la campaña 1, parqueada por la decisión de salida B: sin gasto en B2C no hay visitantes que retargetear. **Arranca en frío, y eso es deliberado.** |
| Exclusiones | Empresas ya registradas. *(Y nada más: no hay pool propio del cual excluir todavía.)* |

**Ubicaciones:** Feed de Facebook + Feed de Instagram + Marketplace. Sin Reels ni Stories — el buyer profesional consume feed, no vertical.

**Formato:**
- **Video corto explicativo** (60-90 seg): tono profesional, muestra el flujo real de la app (crear periodo → capturar turnos → liquidar → cada colaborador verifica). Sin voz alta, con música ambiente.
- **Testimonial simulado** (2ª variante): dueño de restaurante ficticio dice "antes le pagaba a un contador $600.000 al mes y a veces me equivocaba. Ahora liquido yo mismo con NomiCheck y cada línea cita la ley." Actor con contexto realista de restaurante.

**Gancho creativo (3 variantes):**
1. **Dolor:** *"Pagar mal la liquidación no es un error contable. Es un pasivo legal."*
2. **Curiosidad:** *"El motor de nómina que usan los contadores, ahora tú lo usas directo."*
3. ~~**Cifra:** *"Un contador cuesta $600.000/mes. NomiCheck Empresas cuesta menos que un almuerzo por empleado."*~~ 🔴 **NO SUBIR.** El archivo pedía *validar cifras exactas con producto*; validado el 2026-08-15: **no hay cifra que validar.** El portal de empresa **no tiene precio** — ni plan, ni mensualidad, ni suscripción, buscado en la API y en los paquetes. Los únicos precios del producto son los US$0,02 por llamada del muro x402, que son de la API y no del portal. La frase inventa un precio y además lo compara.
   **Reemplazo propuesto, mientras no haya precio de lista:** *"El mismo motor que audita liquidaciones, ahora liquidando las tuyas — con el artículo al lado de cada peso."* Sin cifra.

**Copy del anuncio:**

> **Liquida nómina sin miedo a incumplir.**
> Prestaciones sociales, seguridad social, retención en la fuente — el motor calcula cada línea con la ley vigente y cita el artículo detrás. Tus colaboradores verifican solos su recibo. Tú duermes tranquilo.
>
> ~~Prueba gratis 30 días. Sin tarjeta.~~ → **Registra tu empresa y liquida tu primer periodo.**

> 🔴 **La línea tachada prometía dos cosas falsas a la vez.** No hay prueba de 30 días —no existe *trial* en ninguna parte del producto— y al decir «prueba» implica que **después se paga**, cuando tampoco hay precio. Medido el 2026-08-15.
>
> El reemplazo describe **lo que la empresa realmente puede hacer hoy**, que además es fuerte: registrarse con NIT y sector, y liquidar de verdad. Y el registro **sí** es sin tarjeta — eso es cierto, pero se cae solo del texto porque nadie la pide.

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
| Exclusiones | Empresas ya registradas. ~~Y contadores ya inscritos al programa~~ — **no hay programa ni inscripción**, así que esa exclusión no tiene sobre qué aplicarse |

**Ubicaciones:** Feed de Facebook + Feed de Instagram + LinkedIn (si activa después el conector). Sin video vertical.

**Formato:**
- Feed estático con texto largo (el buyer profesional lee). Enfoque en eficiencia y en el motor siempre actualizado.
- Segunda variante: carrusel con 4 tarjetas mostrando (1) auditoría inmutable, (2) motor determinístico con leyes citadas, (3) exportación PILA compatible, ~~(4) programa de referidos con comisión~~.

> **Las tres primeras tarjetas se comprobaron y se sostienen** (2026-08-15): la bitácora de cambios existe (`AuditoriaEmpresa`), el motor cita el artículo en cada línea, y la PILA por periodo es un endpoint real (`GET /empresa/periodos/:id/pila`, con IBC real de cada recibo y no un salario estimado). **La cuarta no**: el programa de referidos no existe. Reemplazarla por una cuarta tarjeta cierta —por ejemplo, la verificación firmada que el colaborador puede hacer por su cuenta— o dejar el carrusel en tres.

**Gancho creativo (3 variantes):**
1. **Dolor:** *"Atiendes 12 pymes y pierdes 8 horas al mes verificando cálculos. NomiCheck te devuelve esas horas."*
2. **Curiosidad:** *"El motor de reglas que audita las liquidaciones, ahora también trabaja para ti."*
3. ~~**Cifra:** *"Programa para contadores: 20% de comisión recurrente por cada pyme que traigas."*~~ 🔴 **NO SUBIR.** Validado el 2026-08-15: **el programa de referidos no existe.** No hay comisiones, ni inscripción de contadores, ni forma de atribuir una pyme a quien la trajo — buscado en la API, los paquetes y la web. Y una comisión del 20 % **recurrente** sobre un producto que **no cobra nada** es un porcentaje de cero.
   **Reemplazo propuesto:** *"Estamos armando el programa para contadores. Si atendés pymes, contanos qué necesitás que haga."* — convierte el anuncio en lo que de verdad es hoy: una conversación, no una oferta.

**Copy del anuncio:**

> **El motor de reglas actualizado con cada reforma. Ya no persigues decretos.**
> Cada cambio del CST o del salario mínimo entra al motor con su fecha de vigencia. Tus liquidaciones usan la ley del periodo, no la de hoy. Verificas o liquidas — o ambos.
>
> ~~Únete al programa para contadores.~~ → **Contanos qué necesitás que haga.**

**CTA:** "Conoce el programa para contadores" — Formulario de leads: nombre, email, teléfono, número de clientes atendidos, ciudad. Link a `/lanzamiento?utm_campaign=contadores&utm_source=meta&utm_medium=paid_social#contadores`.

**KPIs (primeros 14 días):**
- CPL ≤ $18.000 COP (aceptamos CPL alto: el LTV de un contador multiplicador es 5-10× el de una pyme directa)
- 5 contadores respondiendo al follow-up manual la primera semana
- Al menos 1 contador convirtiendo a "trae una pyme" en primeras 4 semanas

---

## Instrucciones al agente que ejecute vía MCP de Meta Ads

0. **Puerta de entrada — no seguir si algo de esto falla.** Estas cuatro se comprobaron en rojo el 2026-08-15; hasta que estén en verde, crear campañas es preparar un gasto que no se puede evaluar:

   | Precondición | Cómo se comprueba | Estado 2026-08-15 |
   |---|---|---|
   | El landing carga en el dominio destino | `curl -s -o /dev/null -w '%{http_code}' https://nomicheck.ynt.codes/lanzamiento` → 200 | ✅ (con el dominio corregido) |
   | El Pixel base está instalado | en el landing servido, `typeof window.fbq === "function"` | 🔴 `undefined` |
   | `verificacion_completada` se emite al ver el resultado | disparar el flujo y mirar el evento | 🔴 nadie lo emite |
   | `registro_empresa` se emite **al completar el registro**, no al hacer click | completar el alta y mirar el evento | 🔴 dispara en el click del CTA |

1. **Crear la cuenta publicitaria** (o usar la que el usuario indique) y confirmar que el pixel base y los eventos personalizados (`verificacion_iniciada`, `verificacion_completada`, `discrepancia_detectada`, `registro_empresa`, `interes_partners`) están disparando **de verdad** en `/lanzamiento` — no que existan en el código: que Meta los reciba.
2. **Crear las 4 campañas en estado `PAUSED`** con los objetivos, segmentaciones, ubicaciones, formatos, copies, CTAs, presupuestos y trackings de arriba.
3. **Estructura por campaña:** 1 Campaña → 1 Conjunto de anuncios inicial → 3 Anuncios (uno por variante de gancho).
4. **Presupuesto**: total mensual sugerido a definir con el usuario. Distribuir según % de la tabla de arriba. Preferir CBO (Campaign Budget Optimization) sobre presupuesto a nivel de conjunto.
5. **Verificar y esperar confirmación explícita del humano antes de activar cualquier campaña.** No activar automáticamente. Esta es una acción que gasta dinero real.
   **Y no subir NADA de lo tachado en este archivo.** Son cuatro promesas que el producto no cumple —un promedio de usuarios que no existen, un precio que no existe, una prueba de 30 días que no existe y una comisión sobre cero— más la tarjeta de carrusel y el cierre que dependen de esa última. Cada tachado lleva su reemplazo propuesto al lado. Un anuncio publicado es una promesa servida a desconocidos y **no hay forma de retirarla** — lo mismo que ya nos costó plata del lado del cobro (`leyes/cobrar-antes-de-servir`).
6. **Configurar reglas automáticas** después de activar: pausar automáticamente cualquier anuncio con CPA > 2× el CPA promedio del conjunto después de 3 días con ≥ 20 conversiones.
7. **Reporte semanal automático** al humano con CPA/CTR/tasa de conversión por conjunto — el humano decide reasignación de presupuesto.
