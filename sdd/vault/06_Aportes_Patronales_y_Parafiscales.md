# 🏢 Lo que paga la empresa (Aportes Patronales y Parafiscales)

El baúl original solo explicaba lo que se le descuenta **al trabajador** ([[02_Descuentos_al_Trabajador]]). Pero la empresa también aporta dinero por su cuenta, encima del salario. Esto es indispensable para calcular el "costo total de nómina" de un empleado, no solo lo que él recibe.

Todos los porcentajes de este archivo están tabulados en [[05_Valores_Actualizables]] §9, con su norma y su condición de exoneración.

## 1. Aportes a Seguridad Social que paga la empresa

La base es la misma que la del trabajador: el IBC, es decir el salario **sin** auxilio de transporte (ver [[02_Descuentos_al_Trabajador]] para cómo se arma esa base y para el tope de 25 SMLMV, que también aplica acá).

*   **Salud (a cargo del empleador):** 8.5% de la base.
*   **Pensión (a cargo del empleador):** 12% de la base.
*   **ARL (Riesgos Laborales):** Lo paga 100% la empresa. El porcentaje varía según el nivel de riesgo de la actividad (de Riesgo I a Riesgo V), desde 0.522% hasta 6.96% de la base. Depende de la clase de riesgo asignada por la ARL, no es un valor único — la tabla por clase está en [[05_Valores_Actualizables]].

> ⚠️ **Exoneración de aportes (E.T. art. 114-1):** Las empresas que son personas jurídicas contribuyentes del impuesto de renta, o personas naturales que empleen 2 o más trabajadores, **están exoneradas** de pagar el 8.5% de salud y los aportes parafiscales (SENA e ICBF) por cada trabajador que gane **menos de 10 SMLMV**. Esto no exonera el aporte a pensión (12%), que siempre se paga completo. Si el trabajador gana 10 SMLMV o más, la empresa sí debe pagar salud y parafiscales completos por él.
>
> *La exoneración la creó la Ley 1607 de 2012, art. 25 (que introdujo el art. 114-1 del Estatuto Tributario) y la modificó la Ley 1819 de 2016, art. 65. Se cita el art. 114-1 del E.T. porque es la norma vigente compilada.*

> 🔍 **Y si la empresa NO es contribuyente de renta** —una entidad sin ánimo de lucro, por ejemplo— la exoneración no aplica y paga todo completo. El sistema no puede asumir la exoneración por defecto sin decirlo: cambia el costo de nómina en más de 13 puntos porcentuales.

## 2. Aportes Parafiscales (solo si no aplica la exoneración, o para trabajadores de 10+ SMLMV)

*   **SENA:** 2% de la base.
*   **ICBF (Instituto Colombiano de Bienestar Familiar):** 3% de la base.
*   **Caja de Compensación Familiar:** 4% de la base. **Este aporte NUNCA se exonera** — se paga siempre, sin importar cuánto gane el trabajador ni el tipo de empleador.

## 3. Resumen del "costo de nómina" para el empleador

Para saber cuánto le cuesta realmente un trabajador a la empresa (más allá de su salario), hay que sumar:

`Salario + Auxilio de Transporte + Prestaciones Sociales (ver [[03_Beneficios_de_Ley]]) + Aportes a Seguridad Social del empleador + Parafiscales (si aplican) + Dotación (si aplica, ver abajo)`

Las prestaciones entran acá como **provisión mensual**, no como pago: son un pasivo que se va causando día por día, aunque se desembolse en junio, diciembre o al terminar el contrato ([[04_Fin_del_Contrato]]).

## 4. Dotación (Calzado y Vestido de Labor)

*   Obligatoria para trabajadores que ganan **hasta 2 SMLMV** — mismo umbral del auxilio de transporte, ver [[05_Valores_Actualizables]].
*   Se entrega 3 veces al año (30 de abril, 31 de agosto y 20 de diciembre), a quienes lleven más de 3 meses vinculados (CST art. 230 y 232).
*   No es un pago en dinero: es un elemento físico (uniforme, calzado). No constituye salario y **no** entra a ninguna de las bases de [[03_Beneficios_de_Ley]].

## 5. El contratista independiente (prestación de servicios)

No es un empleado y **no genera ninguno de los costos de arriba**: ni prestaciones, ni parafiscales, ni aportes patronales. Paga su seguridad social por su cuenta, y sobre una base propia:

*   **IBC del independiente:** 40% de su ingreso mensual, no el 100% (Ley 1819 de 2016, art. 244).
*   **Salud:** 12.5% de ese IBC — paga el 100%, no hay empleador que asuma la otra mitad.
*   **Pensión:** 16% de ese IBC.

> ⚠️ **La trampa que esto habilita.** Contratar por prestación de servicios a alguien que en realidad trabaja con horario, subordinación y exclusividad es un **contrato realidad**: legalmente es un empleado, y el empleador debe todas las prestaciones y aportes de este archivo desde el primer día, más las sanciones. La diferencia de costo es justamente lo que hace tentadora la mala clasificación, y por eso un sistema de nómina honesto debe poder señalarla.

## 6. Aprendices SENA

El aprendiz en etapa práctica recibe un auxilio de sostenimiento (entre el 50% y el 75% de un SMLMV, ver [[05_Valores_Actualizables]]), que **no es salario**. No genera prestaciones sociales ni los aportes patronales ordinarios de este archivo; su régimen de seguridad social es especial (solo salud en etapa práctica, ver [[02_Descuentos_al_Trabajador]]).

---

*Nota: todos los porcentajes de esta hoja son tarifas ordinarias del régimen contributivo general. No cubren regímenes especiales (magisterio, fuerzas armadas, régimen de trabajadoras del servicio doméstico con IBC especial, ni el Piso de Protección Social para quienes ganan menos de un SMLMV por labor parcial).*

*Dónde está implementado cada aporte y por qué estos porcentajes son constantes de código y no parámetros con vigencia: [[07_Trazabilidad_Codigo]].*
