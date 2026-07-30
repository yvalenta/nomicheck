# 💰 Lo que el trabajador gana (Ingresos y Jornada)

Para liquidar correctamente, primero hay que sumar todo lo que el trabajador produjo en el mes. En la ley esto se llama "Devengado", pero aquí lo llamaremos **Total Ganado**.

Este archivo cubre solo el **devengo**. Lo que se le resta después está en [[02_Descuentos_al_Trabajador]]; lo que la empresa le guarda aparte, en [[03_Beneficios_de_Ley]]; lo que la empresa aporta encima del salario, en [[06_Aportes_Patronales_y_Parafiscales]]. Todos los valores en pesos y porcentajes vienen de [[05_Valores_Actualizables]].

## Valores Base
*   **Salario Mínimo Legal Vigente (SMLV):** ver el valor vigente y su norma en [[05_Valores_Actualizables]]. Nunca se debe escribir este número directamente en el código o en la documentación; siempre se remite a esa tabla porque cambia cada 1 de enero (y, como pasó en 2026, puede quedar sujeto a litigio judicial).
*   **Auxilio de Transporte:** Se le paga obligatoriamente a quienes ganan hasta 2 Salarios Mínimos (el tope exacto es un valor parametrizado, ver [[05_Valores_Actualizables]]). Si la empresa le pone transporte gratuito (ruta), no se paga este auxilio. Valor vigente también en [[05_Valores_Actualizables]].
    *   Aunque el auxilio aparece **entre los ingresos** del comprobante, **no** hace base para salud ni pensión ([[02_Descuentos_al_Trabajador]]) y **sí** hace base para prima y cesantías, pero **no** para vacaciones ([[03_Beneficios_de_Ley]]). Es el número que más se equivoca en una nómina, precisamente por entrar y salir de las bases según el cálculo.
*   **Auxilio de Conectividad Digital:** Es el equivalente al auxilio de transporte, pero para quienes trabajan bajo la modalidad de teletrabajo regulada por la reforma laboral (Ley 2466 de 2025). Mismo valor y mismas condiciones que el auxilio de transporte.
*   **Auxilio de sostenimiento del aprendiz SENA:** no es salario y no es auxilio de transporte — es un tercer concepto, entre el 50% y el 75% de un SMLMV según la etapa (Ley 789 de 2002, art. 30). Rango exacto en [[05_Valores_Actualizables]]. Un contrato declarado como "indefinido" con un salario dentro de ese rango es señal de un aprendiz mal registrado.
*   **Honorarios (prestación de servicios):** el contratista independiente no devenga salario, factura honorarios. No genera prestaciones sociales ni aportes patronales, y su base de seguridad social es distinta — ver [[06_Aportes_Patronales_y_Parafiscales]].

## Horas Extras y Recargos (Trabajo Adicional)
La semana laboral máxima es de 42 horas desde el 15 de julio de 2026 (ver [[05_Valores_Actualizables]] para el detalle de cómo se llegó a esa cifra y para el valor vigente de cada porcentaje). Todo lo que pase de ahí, o lo que se trabaje de noche o en días de descanso, tiene un costo adicional.

Para calcular cuánto vale 1 hora de trabajo normal se divide el salario mensual por el **divisor de hora ordinaria** — 210 con la jornada de 42 horas, 220 con la de 44 (ver [[05_Valores_Actualizables]], que lo guarda con vigencias para que una liquidación de junio de 2026 siga usando 220):

`Valor hora ordinaria = Salario Mensual / divisor_hora_ordinaria`

Es el mismo resultado que `(Salario / 30 días) / 7 horas al día`, pero como un parámetro con fecha, no como una división a mano.

### La diferencia entre un recargo y una hora extra (regla que casi nadie escribe)
*   Un **recargo** se paga sobre una hora que el trabajador *ya tenía que trabajar*: la hora ordinaria ya viene incluida en el salario mensual, así que **solo se paga el porcentaje adicional**.
*   Una **hora extra** es tiempo que no estaba en la jornada: se paga **la hora completa más el porcentaje** (`× (1 + porcentaje)`).

Confundir las dos es el error más costoso de una nómina: pagar un recargo nocturno como si fuera hora extra infla la nómina, y pagar una hora extra como si fuera recargo le roba al trabajador la hora ordinaria.

### Los porcentajes
Los valores vigentes están todos en [[05_Valores_Actualizables]]; acá va solo la regla:

*   **Recargo Nocturno** (trabajar de noche, sin ser hora extra): se paga **solo** el porcentaje.
*   **Recargo Dominical o Festivo:** se paga **solo** el porcentaje. **NO es un valor fijo** — es una tabla progresiva que sube cada julio hasta llegar al 100% en 2027. El sistema debe mirar la **fecha del turno**, no la fecha de hoy. Tabla completa en [[05_Valores_Actualizables]].
*   **Hora Extra de Día:** hora completa + porcentaje.
*   **Hora Extra de Noche:** hora completa + porcentaje.

### Cuando se cruzan dos recargos, se suman
Los recargos son **acumulativos**, no excluyentes. Una hora trabajada un domingo a las 10 de la noche genera **dos** líneas separadas en el comprobante: el recargo dominical *y* el recargo nocturno. Cada una es una línea propia con su norma, para que se pueda auditar por separado:

| Hora trabajada | Qué se paga |
|---|---|
| Nocturna ordinaria | recargo nocturno |
| Dominical/festiva diurna | recargo dominical |
| Dominical/festiva nocturna | recargo dominical **+** recargo nocturno (dos líneas) |
| Extra diurna | hora completa + recargo de extra diurna |
| Extra nocturna | hora completa + recargo de extra nocturna |
| Extra dominical diurna | hora completa + (recargo dominical + recargo de extra diurna) |
| Extra dominical nocturna | hora completa + (recargo dominical + recargo de extra nocturna) |

> ⚠️ **Regla de Horario Nocturno (¡cambió!):** desde el 25 de diciembre de 2025 la jornada nocturna empieza a las **7:00 p.m.** (antes empezaba a las 9:00 p.m.). Cualquier turno entre las 7:00 p.m. y las 9:00 p.m. que antes se pagaba como diurno, ahora se paga como nocturno. Ver [[05_Valores_Actualizables]].

> ⚠️ **Tope legal de horas extra — se advierte, no se bloquea.** La ley prohíbe que un trabajador haga más de 2 horas extras al día, o más de 12 en la semana (valores en [[05_Valores_Actualizables]]). Pero **exceder el tope no reduce lo que hay que pagarle**: por primacía de la realidad, el tiempo trabajado se paga completo. Lo que corresponde es **pagar y advertir** la infracción, porque el empleador queda expuesto a sanción del Ministerio de Trabajo — no descontarle al trabajador la consecuencia de una decisión del empleador. La Ley 2466 de 2025 eliminó el requisito de autorización previa del Ministerio para pactarlas, pero no el tope ni las sanciones.

## Distribución Flexible de la Jornada (novedad de la Ley 2466 de 2025)
La ley ahora permite repartir las horas de la semana en 5 o 6 días (no necesariamente de lunes a sábado), siempre que exista un día de descanso a la semana. Ese día de descanso no tiene que coincidir con el domingo, y esta flexibilidad no puede usarse para reducir el salario total del trabajador.

## Ausentismo (días no remunerados)
Los días que el trabajador no laboró y que **no** están cubiertos por incapacidad, licencia ni vacaciones no generan derecho al salario de esos días (CST art. 140, leído a contrario).

*   **Fórmula:** `(Salario Básico Mensual / 30) x Días de ausencia no remunerada`
*   En el comprobante figura como **una línea aparte, del lado de las deducciones**, no como un salario básico ya rebajado. Es a propósito: el trabajador tiene que poder ver cuántos días se le descontaron y a qué tasa, en vez de recibir un salario básico distinto cada mes sin explicación.
*   No es una deducción de ley como salud o pensión: no se le está restando algo de lo que ganó, es salario que no se causó. Por eso no comparte el tope del 50% de [[02_Descuentos_al_Trabajador]].

---

*Cómo se relaciona cada regla de este archivo con lo que el motor calcula (códigos de línea y claves de parámetro): [[07_Trazabilidad_Codigo]].*
