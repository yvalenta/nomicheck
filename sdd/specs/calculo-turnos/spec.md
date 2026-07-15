# Capacidad: Cálculo de nómina por turnos

Calcula la liquidación esperada de un empleado pagado por días/horas
trabajados (horario base + excepciones), aplicando recargos y horas extra
según la ley laboral colombiana vigente en la fecha del periodo.

## Requisitos

1. El sistema DEBE recibir como entrada: rango de fechas del periodo, salario
   básico mensual, número de domingos trabajados, y una lista de excepciones
   (días con horario distinto al base o días adicionales trabajados en
   lunes/festivo).

2. El sistema DEBE aplicar el horario base por defecto cuando no hay
   excepción declarada para un día: martes a sábado 10:00 a.m.–5:00 p.m. (7 h
   diurnas ordinarias), domingo 10:00 a.m.–4:00 p.m. (6 h diurnas con recargo
   dominical), lunes y festivos en descanso (0 h).

3. El sistema DEBE calcular el valor de la hora ordinaria como
   `salario básico ÷ divisor`, donde el divisor depende de la fecha del
   periodo: 220 (jornada 44 h/semana) para periodos que terminan antes del
   15-jul-2026, y 210 (jornada 42 h/semana) desde el 15-jul-2026 en adelante.
   - Ejemplo (fixture Restaurante Resplandor, periodo 16–30 jun 2026, salario
     $1.750.905): valor hora = $7.959 (divisor 220).

4. Si el periodo de liquidación cruza una fecha de corte normativo (ej.
   1-jul-2026 cambio de recargo dominical, o 15-jul-2026 cambio de divisor de
   jornada), el sistema DEBE calcular cada tramo del periodo con la tarifa
   vigente en esos días y presentar los tramos por separado en el resultado.

5. El sistema DEBE aplicar el recargo dominical/festivo vigente en la fecha
   de cada día trabajado en domingo o festivo: 80 % hasta el 30-jun-2026,
   90 % desde el 1-jul-2026, 100 % desde el 1-jul-2027.
   - Ejemplo (fixture Resplandor): 16 horas dominicales/festivas en el
     periodo, recargo de $15.121 (tarifa 80 % vigente en ese periodo,
     anterior al corte de 1-jul-2026), subtotal $241.943.

6. El sistema DEBE aplicar recargo nocturno del 35 % sobre la hora ordinaria
   a toda hora trabajada entre las 7:00 p.m. y las 6:00 a.m., incluyendo horas
   dentro de excepciones declaradas por el usuario que crucen ese horario.

7. El sistema DEBE calcular como hora extra cualquier hora trabajada por
   encima de la jornada diaria ordinaria del día (7 h entre semana, 6 h
   domingo), clasificándola en: extra diurna (25 % de recargo), extra
   nocturna (75 % de recargo), o extra dominical/festiva (recargo dominical
   vigente + 25 %, según corresponda al momento del día).

8. El sistema DEBE detectar automáticamente los festivos colombianos que
   caen dentro del rango de fechas del periodo (tabla `Festivo`, ver
   `admin-reglas`) y confirmarlos con el usuario antes de calcular, en vez de
   depender solo de lo que el usuario recuerde.

9. El sistema DEBE validar coherencia: si el número de domingos declarado por
   el usuario no coincide con los domingos reales del rango de fechas, o si
   una excepción implica más horas que la jornada máxima legal diaria sin que
   el usuario lo haya marcado como extra, el sistema DEBE señalarlo antes de
   presentar el resultado final.

10. El sistema NO DEBE presentar el cálculo final hasta tener: rango de
    fechas, domingos trabajados, y confirmación de excepciones (aunque sea
    "ninguna").

11. El resultado final DEBE incluir, como mínimo: total de horas ordinarias,
    total de horas dominicales/festivas con su recargo, horas extra por tipo,
    auxilio de transporte si aplica, y el estimado de pago total, con
    disclaimer de que es informativo y no reemplaza la liquidación oficial.

## Fixture de referencia
Comprobante real "Restaurante Resplandor" (Alexandra del Socorro Gutiérrez,
periodo 16/06/2026–30/06/2026, salario básico $1.750.905, 15 días laborados)
— usar sus valores de recargo nocturno, recargo dominical/festivo, horas
extra y total consignado como caso de prueba de regresión.
