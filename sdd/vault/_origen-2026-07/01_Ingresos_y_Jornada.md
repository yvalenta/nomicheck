# 💰 Lo que el trabajador gana (Ingresos y Jornada)

Para liquidar correctamente, primero hay que sumar todo lo que el trabajador produjo en el mes. En la ley esto se llama "Devengado", pero aquí lo llamaremos **Total Ganado**.

## Valores Base
*   **Salario Mínimo Legal Vigente (SMLV):** ver el valor vigente y su norma en [[05_Valores_Actualizables]]. Nunca se debe escribir este número directamente en el código o en la documentación; siempre se remite a esa tabla porque cambia cada 1 de enero (y, como pasó en 2026, puede quedar sujeto a litigio judicial).
*   **Auxilio de Transporte:** Se le paga obligatoriamente a quienes ganan hasta 2 Salarios Mínimos. Si la empresa le pone transporte gratuito (ruta), no se paga este auxilio. Valor vigente en [[05_Valores_Actualizables]].
*   **Auxilio de Conectividad Digital:** Es el equivalente al auxilio de transporte, pero para quienes trabajan bajo la modalidad de teletrabajo regulada por la reforma laboral (Ley 2466 de 2025). Mismo valor y mismas condiciones que el auxilio de transporte.

## Horas Extras y Recargos (Trabajo Adicional)
La semana laboral máxima es de 42 horas (ver [[05_Valores_Actualizables]] para el detalle de cómo se llegó a esa cifra). Todo lo que pase de ahí, o lo que se trabaje de noche o en días de descanso, tiene un costo adicional.

Para calcular cuánto vale 1 hora de trabajo normal: `(Salario Mensual / 30 días) / Horas que trabaja al día (usualmente 7 u 8)`.

*   **Hora Extra de Día (6:00 AM a 7:00 PM):** Vale un 25% más.
    *   *Fórmula:* Valor hora normal x 1.25
*   **Hora Extra de Noche (7:00 PM a 6:00 AM):** Vale un 75% más.
    *   *Fórmula:* Valor hora normal x 1.75
*   **Recargo Nocturno (Trabajar de noche, sin ser hora extra):** Vale un 35% más.
    *   *Fórmula:* Valor hora normal x 0.35
*   **Trabajo en Domingo o Festivo:** El recargo **NO es un valor fijo**. Es una tabla progresiva que sube cada julio hasta llegar al 100% en 2027. Ver el detalle exacto y las fechas de corte en [[05_Valores_Actualizables]].
    *   *Fórmula:* Valor hora normal x (1 + recargo vigente en la fecha trabajada)

> ⚠️ **Regla de Horario Nocturno (¡cambió!):** desde el 25 de diciembre de 2025 la jornada nocturna empieza a las **7:00 p.m.** (antes empezaba a las 9:00 p.m.). Cualquier turno entre las 7:00 p.m. y las 9:00 p.m. que antes se pagaba como diurno, ahora se paga como nocturno. Ver [[05_Valores_Actualizables]].

> ⚠️ **Regla de Bloqueo:** La ley prohíbe que un trabajador haga más de 2 horas extras al día, o más de 12 horas extras en la semana. Esta regla no cambió con la reforma laboral, aunque sí se eliminó el requisito de pedir autorización previa al Ministerio de Trabajo para pactarlas (Ley 2466 de 2025), aunque el empleador sigue expuesto a sanciones si abusa de ellas.

## Distribución Flexible de la Jornada (novedad de la Ley 2466 de 2025)
La ley ahora permite repartir las horas de la semana en 5 o 6 días (no necesariamente de lunes a sábado), siempre que exista un día de descanso a la semana. Ese día de descanso no tiene que coincidir con el domingo, y esta flexibilidad no puede usarse para reducir el salario total del trabajador.
