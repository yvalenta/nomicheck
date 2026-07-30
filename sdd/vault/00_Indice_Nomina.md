# 📚 Fuente de Verdad: Reglas de Nómina Colombia

Este baúl contiene las reglas matemáticas y legales para liquidar una nómina en Colombia. Está escrito en lenguaje sencillo, evitando términos contables enredados, para que el código y el usuario final hablen el mismo idioma.

## 🧭 Principio de diseño: una sola fuente de verdad

Este baúl tiene dos tipos de contenido, y **no deben mezclarse**:

1.  **Reglas (relativamente estables):** fórmulas, orden de cálculo, topes de bloqueo, quién paga qué. Cambian solo cuando el Congreso o el Gobierno modifican una ley. Viven en los archivos 01 a 04 y 06.
2.  **Valores (cambian cada año o por decisión judicial):** el SMLMV, el auxilio de transporte, la UVT, los porcentajes de recargo dominical mientras dura la transición de la reforma laboral, las tarifas del Fondo de Solidaridad, los topes en UVT de la retención en la fuente. **Todos** viven en un único archivo: [[05_Valores_Actualizables]].

Si en algún momento un número (un peso, un porcentaje, una fecha de corte) aparece escrito directamente en los archivos 01, 02, 03, 04 o 06 en lugar de remitir a `05_Valores_Actualizables`, es una señal de que el baúl se está desactualizando: ese número debería moverse al archivo maestro. Esto evita que, cada enero, alguien tenga que buscar y corregir el mismo valor en cinco archivos distintos.

Hay un tercer tipo de contenido, que no es ni regla ni valor: **el puente con el código.** Vive en [[07_Trazabilidad_Codigo]] y dice qué parte del sistema implementa cada regla de acá. Es lo que permite que el API cite este baúl como su fundamento legal en vez de solo mencionarlo.

## 🗂️ Navegación del Baúl

1. [[01_Ingresos_y_Jornada]] - Lo que el trabajador gana (Salario, horas extras y recargos).
2. [[02_Descuentos_al_Trabajador]] - Lo que se le resta al pago (Salud, pensión, topes legales y embargos).
3. [[03_Beneficios_de_Ley]] - Lo que la empresa le guarda (Prima, cesantías, vacaciones).
4. [[04_Fin_del_Contrato]] - Cómo calcular la liquidación final y las multas por despido.
5. [[05_Valores_Actualizables]] - **La tabla maestra.** Todos los pesos, porcentajes y fechas de corte vigentes hoy, con su norma, su fuente y la `clave` con la que el motor los resuelve. Se revisa cada enero (y cada vez que haya novedad judicial, como pasó con el salario mínimo 2026).
6. [[06_Aportes_Patronales_y_Parafiscales]] - Lo que paga la empresa además del salario (seguridad social patronal, parafiscales, dotación) — necesario para calcular el costo real de nómina, no solo lo que recibe el trabajador. Incluye el régimen del contratista independiente y del aprendiz SENA.
7. [[07_Trazabilidad_Codigo]] - **El puente con el sistema.** Qué archivo del baúl respalda cada parámetro, cada línea del comprobante y cada endpoint del API; qué está cubierto y qué no.

## 🧩 Cómo se conectan entre sí

El recorrido de una liquidación pasa por los archivos en este orden:

| Paso | Archivo | La pregunta que responde | Lo que produce |
|---|---|---|---|
| 1 | [[01_Ingresos_y_Jornada]] | ¿cuánto ganó? | devengo |
| 2 | [[02_Descuentos_al_Trabajador]] | ¿cuánto se le resta? | neto a pagar |
| 3 | [[03_Beneficios_de_Ley]] | ¿cuánto se le guarda? | provisión (**no** es neto) |
| 4 | [[06_Aportes_Patronales_y_Parafiscales]] | ¿cuánto le cuesta a la empresa? | costo del empleador |
| 5 | [[04_Fin_del_Contrato]] | ¿y al terminar? | liquidación + indemnización |

Y en los cinco pasos, cada número sale de [[05_Valores_Actualizables]].

**Conceptos de tiempo vitales:**
*   Para la nómina, todos los meses tienen **30 días** (incluso febrero o los meses de 31).
*   El año de nómina tiene **360 días**. Un año bisiesto no cambia ninguna fórmula.
*   **Jornada máxima legal:** 42 horas a la semana desde el 15 de julio de 2026 (ver el detalle de cómo se llegó a esta cifra, el divisor de hora ordinaria y el nuevo horario nocturno en [[05_Valores_Actualizables]]).

## 🛠️ Cómo mantener este baúl actualizado

Ver la checklist de mantenimiento anual al final de [[05_Valores_Actualizables]]. En resumen: cada vez que el Gobierno publique el decreto de salario mínimo (diciembre) o la DIAN publique la UVT (diciembre), solo se edita ese archivo. Los archivos de reglas (01-04, 06) solo deben tocarse cuando cambia una **ley**, no un valor — por ejemplo, la Ley 2466 de 2025 obligó a corregir el horario nocturno y la fórmula del recargo dominical en [[01_Ingresos_y_Jornada]], porque eso sí fue un cambio de regla, no solo de cifra.

Editar el baúl **no** cambia lo que el sistema calcula: los valores hay que sembrarlos también en la base. El procedimiento de los dos pasos, y el test que falla si se hace solo uno, están en [[07_Trazabilidad_Codigo]].

## ⚠️ Lo que este baúl todavía no cubre

Ser explícito sobre los huecos es parte de ser fuente de verdad. Hoy faltan, y están priorizados en [[07_Trazabilidad_Codigo]]:

*   **Retención en la fuente por salarios** — implementada y vendida por el API, pero acá solo están sus topes en UVT ([[05_Valores_Actualizables]] §8), sin un archivo de reglas que explique la depuración.
*   **Incapacidades y licencias** (maternidad, paternidad, enfermedad general y de origen laboral): quién paga, desde qué día y sobre qué base.
*   **Regímenes especiales**: servicio doméstico, Piso de Protección Social, magisterio, fuerzas armadas.
