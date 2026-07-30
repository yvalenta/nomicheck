# 🔄 Valores Actualizables (Tabla Maestra 2026)

Este archivo es la **única fuente de verdad** para los valores que cambian cada año o cada vigencia. Ningún otro archivo del baúl debe escribir un número "a mano" — todos deben remitir aquí con la nota `(ver [[05_Valores_Actualizables]])`. Así, cuando el Gobierno expida el decreto de enero, **solo se edita este archivo** y el resto del baúl queda correcto automáticamente.

> 🗓️ **Última verificación legal de los valores vigentes (2026):** 21 de julio de 2026.
> 🗓️ **Verificación de los valores históricos 2020-2025 (§1 y §2):** 30 de julio de 2026, contra dos fuentes independientes y el Gestor Normativo de Función Pública.
> 🔗 **Última pasada de trazabilidad:** 30 de julio de 2026.
> ⚠️ Todo valor en este archivo debe llevar su fuente (decreto, ley o resolución) y su fecha de vigencia. Si no tiene fuente, no se usa.

## Dos clases de número (y por qué importa)

No todos los números de la nómina se actualizan igual, y confundirlos es lo que desincroniza el baúl del sistema:

| Clase | Dónde vive el valor | Cómo cambia | Ejemplo |
|---|---|---|---|
| **Valor parametrizado** | Fila de `ReglaLegal` en la base, con `clave`, `valor`, `vigenteDesde`, `vigenteHasta` y `fuente`. Se siembra desde `apps/api/prisma/semillaLegal.ts` | Se agrega una **fila nueva** con la vigencia nueva. Nunca se edita la vieja: así una liquidación retroactiva de marzo sigue usando el valor de marzo | `smlmv`, `recargo_dominical` |
| **Constante estructural** | `packages/reglas/src/constantes.ts`, como constante del motor | Solo con un cambio de **ley**, y entonces se toca el código y se documenta acá | Año comercial de 360 días, divisor 720 de vacaciones, tabla del Fondo de Solidaridad |

Cada valor parametrizado de este archivo lleva su **`clave`** al lado. Esa clave es el enganche exacto entre este texto y lo que el motor resuelve en tiempo de cálculo — el mapa completo está en [[07_Trazabilidad_Codigo]].

---

## 1. Salario y Auxilio de Transporte 2026

| Concepto | `clave` | Valor 2026 | Norma |
|---|---|---|---|
| Salario Mínimo Legal Mensual Vigente (SMLMV) | `smlmv` | **$1.750.905** | Decreto 1469 del 29 de diciembre de 2025 |
| Auxilio de Transporte | `auxilio_transporte` | **$249.095** | Decreto 1470 del 29 de diciembre de 2025 |
| Tope de salario para tener derecho al auxilio (en SMLMV) | `auxilio_transporte_tope_smlmv` | **2** | Requisito histórico del decreto de auxilio de transporte |
| Ingreso mínimo total (SMLMV + Auxilio) | — (derivado) | **$2.000.000** | — |
| Auxilio de conectividad digital (teletrabajo) | — (mismo valor y condiciones del auxilio de transporte) | $249.095 | Art. 53, Ley 2466 de 2025 |

Quién tiene derecho a cada uno y cómo entran a la base de cada cálculo: [[01_Ingresos_y_Jornada]] (devengo), [[02_Descuentos_al_Trabajador]] (el auxilio **no** hace base de salud/pensión), [[03_Beneficios_de_Ley]] (el auxilio **sí** entra a prima y cesantías, **no** a vacaciones).

### Historia desde 2020

Una liquidación retroactiva tiene derecho al valor de **su** fecha, no al de hoy. Por eso los años anteriores no se borran al llegar enero: se cierran. Cada decreto de diciembre fija el año siguiente y deroga expresamente al anterior, así que estos son tramos cerrados de 1-ene a 31-dic.

| Año | SMLMV | Auxilio de transporte | Decretos (mismo día, número consecutivo) |
|---|---|---|---|
| 2020 | $877.803 | $102.854 | 2360 y 2361 del 26 de diciembre de 2019 |
| 2021 | $908.526 | $106.454 | 1785 y 1786 del 29 de diciembre de 2020 |
| 2022 | $1.000.000 | $117.172 | 1724 y 1725 del 15 de diciembre de 2021 |
| 2023 | $1.160.000 | $140.606 | 2613 y 2614 del 28 de diciembre de 2022 |
| 2024 | $1.300.000 | $162.000 | 2292 y 2293 del 29 de diciembre de 2023 |
| 2025 | $1.423.500 | $200.000 | 1572 y 1573 del 24 de diciembre de 2024 |
| **2026** | **$1.750.905** | **$249.095** | **1469 y 1470 del 29 de diciembre de 2025** |

*Valores y números de decreto verificados el 30 de julio de 2026 contra dos fuentes independientes y, donde discrepaban, contra el Gestor Normativo de Función Pública. **2020-01-01 es el piso de lo liquidable**: antes de esa fecha el sistema no tiene con qué calcular y lanza excepción en vez de inventar un valor.*

> ⚠️ **Situación jurídica del decreto (importante):** El Decreto 1469 de 2025 estuvo suspendido provisionalmente por el Consejo de Estado entre el 12 de febrero de 2026 y el 17 de julio de 2026, mientras se resolvía una demanda de nulidad por falta de motivación técnica del incremento del 23,7%. El 17 de julio de 2026 el Consejo de Estado **revocó la suspensión** y el decreto volvió a tener plena vigencia. Durante todo el proceso el valor pagado a los trabajadores **nunca cambió** ($1.750.905), porque el Gobierno expidió un decreto transitorio (Decreto 159 de 2026) que mantuvo la misma cifra. El proceso de nulidad de fondo sigue abierto: si el sistema de nómina necesita blindarse contra un fallo definitivo que anule el decreto, este es el punto a vigilar. Fuente: Consejo de Estado, Sección Segunda, auto del 17 de julio de 2026.

**Regla de negocio recomendada para el software:** guardar el SMLMV como un parámetro con vigencia (`fecha_inicio`, `fecha_fin`, `valor`, `fuente`) y no como una constante fija en el código, precisamente porque este valor puede volver a estar en disputa judicial. Esto ya está implementado: es la tabla `ReglaLegal`.

---

## 2. UVT (Unidad de Valor Tributario) 2026

La fija la DIAN por resolución antes de fin de año, aplicándole al valor anterior la variación del IPC entre el 1 de octubre del año pasado y el 1 de octubre del año en curso. `clave`: `uvt`.

| Año | UVT | Norma |
|---|---|---|
| 2020 | $35.607 | Resolución DIAN 000084 de 2019 |
| 2021 | $36.308 | Resolución DIAN 000111 del 11 de diciembre de 2020 |
| 2022 | $38.004 | Resolución DIAN 000140 de 2021 |
| 2023 | $42.412 | Resolución DIAN 001264 del 18 de noviembre de 2022 |
| 2024 | $47.065 | Resolución DIAN 000187 de 2023 |
| 2025 | $49.799 | Resolución DIAN 000193 del 4 de diciembre de 2024 |
| **2026** | **$52.374** | **Resolución DIAN 000238 del 15 de diciembre de 2025** |

**Uso en nómina:** topes de retención en la fuente por salarios, sanciones mínimas, y otros topes tributarios que dependen de la nómina (ver §8).

> ⚠️ **Tener la UVT de un año no alcanza para recalcular la retención de ese año.** Los topes del art. 336 del E.T. los cambió la Ley 2277 de 2022 (el tope anual bajó de 5.040 a 1.340 UVT) y esa misma ley unificó la tabla de tarifas marginales del art. 383. Esa tabla es una **constante estructural** del motor, no un valor con vigencia — así que una retención anterior a 2023 saldría con los topes de entonces y las tarifas de ahora. El sistema prefiere lanzar antes que devolver un número plausible y falso: **el piso de la retención es 2023**, aunque el de la nómina sea 2020.

---

## 3. Jornada Laboral y Horario Nocturno (¡cambió respecto a años anteriores!)

| Concepto | `clave` | Valor 2026 | Norma |
|---|---|---|---|
| Jornada máxima semanal | — (constante estructural) | **42 horas** desde el 15 de julio de 2026 | Ley 2101 de 2021, art. 3 |
| Horario nocturno | — (constante estructural) | **7:00 p.m. a 6:00 a.m.** | Ley 2466 de 2025, vigente desde el **25 de diciembre de 2025** (antes era de 9:00 p.m. a 6:00 a.m.) |

**La reducción de jornada fue en cuatro escalones, no de un salto.** Cada uno cambia el divisor de la hora ordinaria (`clave`: `divisor_hora_ordinaria`), y cada uno entró a regir un 15 de julio:

| Vigencia | Jornada semanal | Divisor | Norma |
|---|---|---|---|
| Hasta el 14 de julio de 2023 | 48 horas | **240** | CST art. 161 |
| 15 de julio de 2023 – 14 de julio de 2024 | 47 horas | **235** | Ley 2101 de 2021, art. 3 |
| 15 de julio de 2024 – 14 de julio de 2025 | 46 horas | **230** | Ley 2101 de 2021, art. 3 |
| 15 de julio de 2025 – 14 de julio de 2026 | 44 horas | **220** | Ley 2101 de 2021, art. 3 |
| **Desde el 15 de julio de 2026** | **42 horas** | **210** | Ley 2101 de 2021, art. 3 |

*El divisor baja cuando baja la jornada: el salario mensual no se toca, así que el valor de la hora ordinaria **sube** en cada escalón. Es la lectura del Ministerio del Trabajo, y es la postura que el motor implementa. Una liquidación retroactiva tiene que usar el divisor de su fecha, no el de hoy — con el de hoy, un periodo de 2024 subestimaría el valor de la hora en casi un 9%.*

> ✏️ Este es un cambio crítico frente a la versión anterior de este baúl: el horario nocturno **ya no empieza a las 9:00 p.m., sino a las 7:00 p.m.** Cualquier cálculo hecho con el horario viejo subestima el recargo nocturno de los trabajadores. Ver la regla en [[01_Ingresos_y_Jornada]].

> 🔢 **Sobre el divisor:** el valor de una hora ordinaria es `Salario mensual / divisor_hora_ordinaria`. El divisor **no es un número redondo elegido a dedo**: son las horas semanales × 5 semanas comerciales (42 × 5 = 210). Es el mismo resultado que `(Salario / 30 días) / 7 horas al día`, pero como un solo parámetro con vigencia, para que una liquidación de junio de 2026 siga usando 220 y una de 2024 use 230.

---

## 4. Recargo por Domingo o Festivo (tabla progresiva — ¡ya no es un valor fijo del 75%!)

La Ley 2466 de 2025 subió el recargo dominical/festivo de forma gradual. **No existe un único porcentaje**: depende de la fecha en la que se trabajó. `clave`: `recargo_dominical`.

| Vigencia | Recargo dominical/festivo | Norma |
|---|---|---|
| 1 de enero de 2003 – 30 de junio de 2025 | 75% | Ley 789 de 2002, art. 26 (CST art. 179) |
| 1 de julio de 2025 – 30 de junio de 2026 | 80% | Ley 2466 de 2025, art. 2 |
| **1 de julio de 2026 – 30 de junio de 2027 (vigente hoy)** | **90%** | Ley 2466 de 2025, art. 2 |
| Desde el 1 de julio de 2027 | 100% | Ley 2466 de 2025, art. 2 |

> ⚠️ **Regla de bloqueo actualizada:** al liquidar cualquier turno dominical o festivo, el sistema debe verificar la **fecha exacta** del turno y aplicar el porcentaje correspondiente a esa fecha, no solo el porcentaje "actual". Esto es indispensable para liquidaciones retroactivas o correcciones de nómina de meses anteriores.

> 🔎 **Por qué los cuatro tramos están sembrados y no solo el vigente.** El motor resuelve esta clave **incondicionalmente** al abrir cada tramo de días, antes de saber si alguien trabajó domingo — y el resolutor lanza excepción si no encuentra vigencia. Con solo los tramos de 2025-2027 en la base, toda liquidación por turnos fechada fuera de esa ventana se caía, y el 1-jul-2027 se habría caído la nómina completa. Los cuatro tramos están sembrados y hay un test que verifica que ninguna clave quede con la ventana cerrada hacia el futuro ([[07_Trazabilidad_Codigo]] §5).

*Nota: el recargo nocturno ordinario (35%) y la hora extra nocturna (75%) no cambiaron de porcentaje, solo cambió el horario en el que empiezan a contar (ver §3).*

---

## 5. Recargos y horas extra (porcentajes)

Los porcentajes en sí llevan años sin cambiar; lo que cambió con la Ley 2466 de 2025 fue la **franja horaria** en que aplican (§3) y el dominical (§4). Aun así son valores parametrizados, no constantes, porque una reforma futura puede moverlos:

| Concepto | `clave` | Valor | Norma |
|---|---|---|---|
| Recargo nocturno (no es hora extra) | `recargo_nocturno` | **35%** | Ley 2466 de 2025, art. 3 |
| Hora extra diurna | `hora_extra_diurna` | **25%** adicional | CST art. 168 |
| Hora extra nocturna | `hora_extra_nocturna` | **75%** adicional | CST art. 168 |
| Recargo dominical/festivo | `recargo_dominical` | ver §4 | Ley 2466 de 2025, art. 2 |

Cómo se combinan entre sí (una hora extra nocturna en domingo no es la suma ingenua de tres recargos): [[01_Ingresos_y_Jornada]].

### Tope de trabajo suplementario

| Concepto | `clave` | Valor | Norma |
|---|---|---|---|
| Máximo de horas extra al día | `max_horas_extra_dia` | **2** | D.L. 13 de 1967, art. 1 |
| Máximo de horas extra a la semana | `max_horas_extra_semana` | **12** | Ley 6 de 1981 |

> ⚠️ Exceder el tope **no recorta el pago**: por primacía de la realidad, lo trabajado se paga. El sistema paga y **advierte** la infracción. La explicación completa está en [[01_Ingresos_y_Jornada]].

---

## 6. Aportes del trabajador a seguridad social

| Concepto | `clave` | Valor | Norma |
|---|---|---|---|
| Aporte a salud (empleado) | `aporte_salud_empleado` | **4%** del IBC | Ley 100 de 1993 |
| Aporte a pensión (empleado) | `aporte_pension_empleado` | **4%** del IBC | Ley 100 de 1993 |
| Tope superior del IBC (en SMLMV) | `ibc_tope_smlmv` | **25** | Ley 100 de 1993, art. 18 mod. Ley 797 de 2003, art. 5 |

Qué entra y qué no entra al IBC: [[02_Descuentos_al_Trabajador]]. Lo que aporta la empresa sobre la misma base: [[06_Aportes_Patronales_y_Parafiscales]].

### Fondo de Solidaridad Pensional (tabla progresiva por rango salarial)

Aplica a quienes devengan un Ingreso Base de Cotización igual o superior a 4 SMLMV (`clave`: `fondo_solidaridad_umbral_smlmv` = **4**; para 2026: **$7.003.620**). La tarifa **sube por rangos** — no es un 1% fijo:

| Rango (en SMLMV) | Aporte adicional al Fondo de Solidaridad |
|---|---|
| De 4 hasta 16 | 1,0% |
| De 16 hasta 17 | 1,2% |
| De 17 hasta 18 | 1,4% |
| De 18 hasta 19 | 1,6% |
| De 19 hasta 20 | 1,8% |
| Más de 20 | 2,0% |

*Fuente: Art. 2.2.14.1.6 del Decreto 1833 de 2016 (compilatorio), vigente a la fecha de esta revisión. Este aporte lo paga en su totalidad el trabajador, sumado a su 4% de pensión. Ver [[02_Descuentos_al_Trabajador]].*

> ℹ️ **Constante estructural, no valor parametrizado:** solo el *umbral* (4 SMLMV) es una `clave`. La tabla de tarifas vive en `constantes.ts` porque cambia con una ley, no con un decreto anual. Si la reforma pensional se aprueba, se toca código — no basta con editar una fila.

> 🔭 **A vigilar:** hay proyectos de reforma pensional en discusión en el Congreso que proponen tarifas más altas para este fondo (hasta 3% en el tramo superior). Mientras no se sancione y publique una ley que las modifique, la tabla vigente es la de arriba.

---

## 7. Topes de deducción y de embargo

Dos regímenes distintos que **no deben mezclarse** — la diferencia conceptual está explicada en [[02_Descuentos_al_Trabajador]]:

| Concepto | `clave` | Valor | Norma |
|---|---|---|---|
| Tope de deducciones sobre el salario devengado | `limite_deducciones_salario` | **50%** | CST art. 149 (num. 2, excepción de libranza: Ley 1527 de 2012) |
| Fracción embargable del excedente — embargo **ordinario** | `embargo_ordinario_fraccion_excedente` | **20%** (un quinto) | CST art. 154 y 155 |
| Tope del embargo por **alimentos o cooperativa** | `embargo_alimentos_pct_max` | **50%** de *cualquier* salario, incluido el mínimo | CST art. 156 |

---

## 8. Topes tributarios en UVT (retención en la fuente)

Todos se expresan en UVT y se convierten a pesos con el valor de §2. El motor los usa en la depuración del art. 383/388 del Estatuto Tributario.

| Concepto | `clave` | Valor | Norma |
|---|---|---|---|
| Renta exenta laboral del 25% — tope mensual | `limite_renta_exenta_laboral_uvt_mes` | **790 UVT/mes** | E.T. art. 206, num. 10 |
| Deducción por dependientes — tope mensual | `limite_deduccion_dependientes_uvt_mes` | **32 UVT/mes** (10% del ingreso; una sola deducción sin importar cuántos dependientes) | E.T. art. 387, par. 2 |
| Deducción por medicina prepagada / seguros de salud | `limite_deduccion_salud_uvt_mes` | **16 UVT/mes** | E.T. art. 387, par. 1 |
| Límite de rentas exentas + deducciones — porcentaje | `limite_rentas_exentas_porcentaje` | **40%** del ingreso | E.T. art. 336 (Ley 2277 de 2022) |
| Límite de rentas exentas + deducciones — tope anual | `limite_rentas_exentas_uvt_anual` | **1.340 UVT/año** (se prorratea ÷12; aplica el menor entre este y el 40%) | E.T. art. 336 (Ley 2277 de 2022) |
| Aportes AFC + voluntarios a pensión — porcentaje | `limite_porcentaje_afc` | **30%** del ingreso | E.T. art. 126-1 y 126-4 |
| Aportes AFC + voluntarios a pensión — tope anual | `limite_anual_uvt_afc` | **3.800 UVT/año** (se prorratea ÷12) | E.T. art. 126-1 y 126-4 |

*La tabla de tarifas marginales del art. 383 (los rangos de 0%, 19%, 28%, 33%, 35%, 37%, 39%) es una **constante estructural**: cambia con una ley tributaria, no con la resolución anual de UVT.*

> 🔧 **Hueco de documentación conocido:** la retención en la fuente está **implementada y se vende** por el API (listing 6), pero este baúl no tiene todavía un archivo de reglas que la explique en lenguaje llano — solo estos topes. Ver el plan en [[07_Trazabilidad_Codigo]].

---

## 9. Aportes patronales y parafiscales

Hoy son **constantes estructurales** del motor (`constantes.ts`), no valores parametrizados: ninguna es una `clave` de `ReglaLegal`. Las tarifas y quién queda exonerado están explicadas en [[06_Aportes_Patronales_y_Parafiscales]].

| Concepto | Valor | Norma | ¿Exonerable? |
|---|---|---|---|
| Salud a cargo del empleador | 8,5% del IBC | Ley 100 de 1993, art. 204 | Sí, si el trabajador gana < 10 SMLMV |
| Pensión a cargo del empleador | 12% del IBC | Ley 100 de 1993, art. 20 | No, nunca |
| SENA | 2% | Ley 21 de 1982 | Sí, junto con salud patronal |
| ICBF | 3% | Ley 89 de 1988 | Sí, junto con salud patronal |
| Caja de Compensación Familiar | 4% | Ley 21 de 1982 | **No, nunca** |
| ARL (riesgos laborales) | Clase I 0,522% · II 1,044% · III 2,436% · IV 4,35% · V 6,96% | Decreto 1772 de 1994, art. 13 | No |
| Umbral de la exoneración (en SMLMV) | 10 | Ley 1607 de 2012, art. 25 (E.T. art. 114-1), mod. Ley 1819 de 2016, art. 65 | — |

**Contratista independiente** (prestación de servicios, no hay empleador que asuma la mitad — el contratista paga el 100%):

| Concepto | Valor | Norma |
|---|---|---|
| IBC del independiente | 40% del ingreso mensual | Ley 1819 de 2016, art. 244 |
| Salud del independiente | 12,5% sobre ese IBC | Ley 100 de 1993, art. 204 |
| Pensión del independiente | 16% sobre ese IBC | Ley 100 de 1993, art. 20 |

**Aprendiz SENA en etapa práctica:** auxilio de sostenimiento entre el 50% y el 75% de un SMLMV (Ley 789 de 2002, art. 30). No es salario y no genera prestaciones ni aportes patronales ordinarios.

> 🔧 **Deuda conocida:** por la regla de este baúl, estos porcentajes deberían ser valores parametrizados con vigencia (como el SMLMV), no constantes de código — la exoneración y las tarifas de salud sí se han movido por ley varias veces. Está anotado como deuda en [[07_Trazabilidad_Codigo]], no como error.

---

## 10. Constantes estructurales de prestaciones sociales

Estos números **no cambian con un decreto anual**; son la convención legal de cómo se cuenta el tiempo en la nómina colombiana. Las fórmulas que los usan están en [[03_Beneficios_de_Ley]] y [[04_Fin_del_Contrato]].

| Concepto | Valor | Norma |
|---|---|---|
| Mes comercial | 30 días (incluso febrero y los meses de 31) | CST |
| Año comercial | 360 días | CST art. 249 y 235 |
| Interés sobre las cesantías | 12% anual | Ley 52 de 1975, art. 1 |
| Divisor de vacaciones | 720 (= 2 × 360, por los 15 días hábiles al año) | CST art. 186 |
| Tope de días de prima por semestre | 180 | CST art. 306, mod. Ley 1788 de 2016 |
| Indemnización por despido injusto, indefinido < 10 SMLMV | 30 días el primer año + 20 por año adicional | CST art. 64, mod. Ley 50 de 1990, art. 6 |
| Indemnización por despido injusto, indefinido ≥ 10 SMLMV | 20 días el primer año + 15 por año adicional | CST art. 64, mod. Ley 50 de 1990, art. 6 |
| Umbral de salario que separa las dos escalas de indemnización | 10 SMLMV | CST art. 64 |
| Duración máxima del período de prueba | 2 meses (o ⅕ del plazo pactado si el término fijo es menor a un año) | CST art. 78 y 79 (duración); art. 80 (terminación sin indemnización) |
| Tabla de tarifas marginales de retención en la fuente | rangos en UVT con tarifas 0% · 19% · 28% · 33% · 35% · 37% · 39% | E.T. art. 383, unificado por Ley 2277 de 2022, art. 7 |

---

## 11. Checklist de mantenimiento anual

Cada 1 de enero (o cuando se publique el decreto correspondiente):

- [ ] Nuevo SMLMV (decreto de diciembre del año anterior) — `smlmv`
- [ ] Nuevo Auxilio de Transporte (decreto de diciembre del año anterior) — `auxilio_transporte`
- [ ] Nueva UVT (resolución DIAN de diciembre) — `uvt`
- [ ] **Cerrar el tramo del año que termina** poniéndole `vigenteHasta` al 31 de diciembre, y dejar abierto solo el año nuevo. Este es el paso que se olvida: si no se cierra, quedan dos filas abiertas y el valor viejo sigue siendo resoluble para fechas futuras
- [ ] Verificar litigios pendientes sobre el decreto del salario mínimo
- [ ] Verificar si el Congreso aprobó la reforma pensional (cambiaría la tabla del Fondo de Solidaridad y las tarifas de salud/pensión)
- [ ] Verificar si una ley tributaria movió los topes en UVT del §8 o la tabla del art. 383
- [ ] Cargar los **festivos** del año nuevo (Ley Emiliani) — no son un valor de este archivo pero se siembran junto con las reglas

Además, **una sola vez, antes del 1 de julio de 2027**: el recargo dominical salta al 100%. Ya está sembrado y con su tramo cerrado hasta el 30 de junio de 2027 (§4), así que no hay nada que hacer — solo confirmar que ninguna ley posterior movió ese calendario.

**Editar este archivo no cambia lo que el sistema calcula.** Son tres pasos, y hay un test que falla si se hace solo el primero:

1. Editar acá el valor, con su norma y su vigencia.
2. Sembrarlo en `apps/api/prisma/semillaLegal.ts` como **fila nueva** (nunca editando la vieja) y correr el seed.
3. Actualizar `REGLAS_VERIFICADAS_AL` en `reglasVerificadasService.ts` — es la fecha que el API publica como "catálogo verificado al…".

El detalle, y la advertencia de cuándo el seed **no** alcanza y hace falta una migración, están en [[07_Trazabilidad_Codigo]] §5.
