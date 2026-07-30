# 🎁 Beneficios de Ley (Prestaciones Sociales)

Estos son dineros que la empresa debe ir guardando por cada día que el empleado trabaja, para pagárselos en fechas específicas. Para calcularlos, **SÍ** se debe sumar el auxilio de transporte al salario base (valor vigente en [[05_Valores_Actualizables]]) — con la excepción de las vacaciones, ver §4.

Estas cuatro prestaciones se causan **día por día**, así que aparecen dos veces en la vida del contrato: como **provisión** mensual mientras el contrato está vivo, y como **pago efectivo** cuando se liquidan o cuando el contrato termina ([[04_Fin_del_Contrato]]). Los conceptos de tiempo (mes de 30 días, año de 360) están en [[00_Indice_Nomina]]; los valores, en [[05_Valores_Actualizables]].

> Nota: si el trabajador no tiene derecho a auxilio de transporte (por ejemplo, porque gana más de 2 SMLMV o porque la empresa le da ruta gratuita, ver [[01_Ingresos_y_Jornada]]), estas fórmulas simplemente usan $0 en el término "Auxilio de Transporte", no se elimina el término de la fórmula.

## Provisión vs. pago (distinción que el comprobante debe respetar)
*   Una **provisión** es un pasivo del empleador: plata que ya se causó a favor del trabajador pero que **no** se le entrega este mes. Va listada en el comprobante para que se vea que se está causando, pero **no** entra al neto a pagar ni al total de devengos del periodo.
*   Un **pago de liquidación final** sí es dinero que el trabajador recibe. Se calcula con las mismas fórmulas, sobre los días efectivamente servidos ([[04_Fin_del_Contrato]]).

Sumar la provisión al neto del mes es un error que infla el pago y descuadra la contabilidad; son códigos de línea distintos precisamente para que no pueda pasar por accidente ([[07_Trazabilidad_Codigo]]).

## ¿Qué es "Salario Base"? (Salario Variable y Pagos No Salariales)

No todo lo que el trabajador recibe cuenta para estas 4 prestaciones. La ley (artículos 127, 128 y 129 del CST, modificados por la Ley 50 de 1990) hace una distinción:

*   **SÍ es salario** (entra a la base) si es **habitual** y es una **contraprestación directa del trabajo** — sin importar cómo se llame: comisiones, porcentaje sobre ventas, bonificaciones habituales, horas extra que se pagan seguido.
*   **NO es salario** (no entra a la base) si es:
    *   **Ocasional**, pagado por mera liberalidad (ej. un bono único de fin de año, no repetido).
    *   **Pactado por escrito** entre empresa y trabajador como "no constitutivo de salario" (siempre que conste el acuerdo).
    *   Un **reembolso** para que el trabajador cumpla sus funciones (viáticos de representación, herramientas de trabajo) — no una ganancia para él.
    *   **Propinas voluntarias del cliente** (ej. el "servicio" del 10% en un restaurante): no las paga la empresa, así que nunca son salario.

> ⚠️ **Salario Variable:** si el trabajador tiene pagos que cambian mes a mes, la base para Prima, Cesantías, Intereses y Vacaciones **no** es el último salario devengado, sino el **promedio de lo devengado en el último año** (o del tiempo trabajado, si lleva menos de un año). Cada prestación tiene su propio artículo, aunque la regla del promedio sea la misma: cesantías, art. 253 CST; prima, art. 306 CST; vacaciones, art. 192 num. 2 CST.

> 🔀 **Pero no todo lo variable entra a las cuatro por igual.** Hay que separar dos cosas que suelen ir juntas en la misma columna de una planilla:
>
> | Qué es | Cesantías, intereses y prima | Vacaciones |
> |---|---|---|
> | **Salario ordinario variable** — comisiones, bonificaciones habituales | ✅ entra | ✅ **entra** |
> | **Trabajo suplementario** — horas extra y trabajo en días de descanso obligatorio | ✅ entra | ❌ **NO entra** |
> | **Auxilio de transporte** | ✅ entra | ❌ NO entra |
>
> La exclusión de las horas extra y del dominical no es doctrina: es texto expreso del **CST art. 192 num. 1** — *"se exceptúa el valor del trabajo en días de descanso obligatorio y el valor del trabajo suplementario en horas extras"*. Es decir que las vacaciones se liquidan sobre el salario **ordinario**, mientras las otras tres se liquidan sobre todo lo salarial.
>
> Meter las extras en la misma bolsa que las comisiones **sobreliquida las vacaciones** de quien hizo muchas horas extra. Por eso el motor las recibe en dos campos distintos (`devengosVariables` y `devengosSuplementarios`, ver [[07_Trazabilidad_Codigo]]) y no en uno solo con un descuento encima: son dos bases, no una base con ajuste.

## 1. Prima de Servicios
Es medio salario que se paga en junio y medio salario que se paga en diciembre. Equivale al 8.33% mensual.
*   **Fórmula:** `(Salario Base + Auxilio de Transporte) x Días Trabajados en el semestre / 360`
*   **Tope:** máximo 180 días por semestre, aunque el semestre calendario tenga más (CST art. 306, mod. Ley 1788 de 2016). Ver [[05_Valores_Actualizables]].

## 2. Cesantías
Es un ahorro para cuando el trabajador se quede sin empleo. Equivale a un mes de salario por cada año trabajado. Se le consignan a un fondo en febrero del año siguiente. Equivale al 8.33% mensual.
*   **Fórmula:** `(Salario Base + Auxilio de Transporte) x Días Trabajados en el año / 360`

## 3. Intereses sobre las Cesantías
Por guardarle esas cesantías durante el año, la empresa debe pagarle al trabajador un interés del 12% anual (Ley 52 de 1975, art. 1). Esto se paga directo al trabajador en enero.
*   **Fórmula:** `(Valor total de las Cesantías acumuladas x Días Trabajados en el año x 0.12) / 360`
*   Ojo al orden: los intereses se calculan **sobre las cesantías ya calculadas**, no sobre el salario. Si la base de cesantías está mal, el error se propaga acá.

## 4. Vacaciones
Son 15 días de descanso pagado por cada año de trabajo. Para este cálculo **NO** se suma el auxilio de transporte. Equivale al 4.17% mensual.
*   **Fórmula:** `(Salario Base x Días Trabajados) / 720`
*   El divisor 720 no es arbitrario: son 2 × 360, porque 15 días de vacaciones al año equivalen a medio mes por año servido. Ver [[05_Valores_Actualizables]].

## Quién NO genera estas prestaciones
*   El **contratista independiente** (prestación de servicios): factura honorarios, no devenga salario. Si en la práctica se le exige horario y subordinación, hay un contrato realidad — y entonces sí se le deben las cuatro. Ver [[06_Aportes_Patronales_y_Parafiscales]].
*   El **aprendiz SENA**: el auxilio de sostenimiento no es salario (Ley 789 de 2002, art. 30), ver [[01_Ingresos_y_Jornada]].

---

*Estas cuatro prestaciones son también el grueso del costo real de un empleado para la empresa: ver el cálculo completo en [[06_Aportes_Patronales_y_Parafiscales]]. Su pago al terminar el contrato, en [[04_Fin_del_Contrato]]. Códigos de línea que las implementan, en [[07_Trazabilidad_Codigo]].*
