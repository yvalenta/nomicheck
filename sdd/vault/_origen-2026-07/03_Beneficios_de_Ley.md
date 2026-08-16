# 🎁 Beneficios de Ley (Prestaciones Sociales)

Estos son dineros que la empresa debe ir guardando por cada día que el empleado trabaja, para pagárselos en fechas específicas. Para calcularlos, **SÍ** se debe sumar el auxilio de transporte al salario base (valor vigente en [[05_Valores_Actualizables]]).

> Nota: si el trabajador no tiene derecho a auxilio de transporte (por ejemplo, porque gana más de 2 SMLMV o porque la empresa le da ruta gratuita), estas fórmulas simplemente usan $0 en el término "Auxilio de Transporte", no se elimina el término de la fórmula.

## 1. Prima de Servicios
Es medio salario que se paga en junio y medio salario que se paga en diciembre. Equivale al 8.33% mensual.
*   **Fórmula:** `(Salario Base + Auxilio de Transporte) x Días Trabajados en el semestre / 360`

## 2. Cesantías
Es un ahorro para cuando el trabajador se quede sin empleo. Equivale a un mes de salario por cada año trabajado. Se le consignan a un fondo en febrero del año siguiente. Equivale al 8.33% mensual.
*   **Fórmula:** `(Salario Base + Auxilio de Transporte) x Días Trabajados en el año / 360`

## 3. Intereses sobre las Cesantías
Por guardarle esas cesantías durante el año, la empresa debe pagarle al trabajador un interés del 12% anual. Esto se paga directo al trabajador en enero.
*   **Fórmula:** `(Valor total de las Cesantías acumuladas x Días Trabajados en el año x 0.12) / 360`

## 4. Vacaciones
Son 15 días de descanso pagado por cada año de trabajo. Para este cálculo **NO** se suma el auxilio de transporte. Equivale al 4.17% mensual.
*   **Fórmula:** `(Salario Base x Días Trabajados) / 720`
