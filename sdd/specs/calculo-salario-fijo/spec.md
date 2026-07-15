# Capacidad: Cálculo de nómina de salario fijo (conceptos)

Valida la liquidación de un empleado con salario mensual fijo, cuyo
comprobante se compone de conceptos por código (devengos y deducciones) en
vez de horas/turnos — típico de nómina ejecutiva o administrativa con
beneficios extralegales.

## Requisitos

1. El sistema DEBE recibir como entrada: salario básico mensual, y una lista
   abierta de conceptos declarados por el usuario o extraídos del
   comprobante, cada uno con: código/nombre, tipo (devengo legal, devengo
   extralegal, deducción legal, deducción por convenio), cantidad/base y
   valor.

2. El sistema DEBE calcular y validar los aportes obligatorios de ley sobre
   el ingreso base de cotización (IBC): salud 4 %, pensión 4 %.
   - Ejemplo (fixture nómina ejecutiva, sueldo básico $12.958.400): salud
     esperada $518.336, pensión esperada $518.336 — coincide con el
     comprobante.

3. El sistema DEBE calcular el fondo de solidaridad pensional solo cuando el
   IBC sea ≥ 4 SMLMV, aplicando el porcentaje escalonado vigente (1 %–2 %
   según rango), y NO DEBE exigirlo por debajo de ese umbral.
   - Ejemplo (fixture): IBC $12.958.400 > 4×SMLMV 2026 ($7.003.620) →
     solidaridad esperada 1 % = $129.584, coincide con el comprobante.

4. El sistema DEBE reconocer devengos extralegales (ej. prima legal de
   servicio, auxilio de vivienda, medicina prepagada, seguro de vida) como
   conceptos que **no** llevan aportes ni afectan el cálculo de salud/pensión
   salvo que el usuario indique explícitamente que son salariales.

5. El sistema DEBE reconocer deducciones por convenio (créditos con
   entidades financieras, seguros, ahorro) como valores fijos declarados por
   el usuario/comprobante, sin intentar recalcularlos — solo se suman al
   total de deducciones.

6. El sistema DEBE calcular retención en la fuente cuando el ingreso mensual
   supere el umbral vigente de la tabla del Estatuto Tributario, usando el
   procedimiento aplicable, y señalar como advertencia (no error duro) si el
   valor declarado en el comprobante difiere del calculado en más de un
   margen razonable — la retefuente depende de variables personales (aportes
   voluntarios, dependientes) que el sistema puede no conocer del todo.

7. El sistema DEBE validar que `total devengos - total deducciones = neto a
   pagar` declarado en el comprobante, y señalar cualquier descuadre.

8. El resultado final DEBE presentar cada concepto con semáforo (coincide /
   difiere / no verificable) y el neto a pagar esperado, con disclaimer de
   que es informativo y no reemplaza asesoría contable/legal certificada.

## Fixture de referencia
Comprobante real de nómina ejecutiva (antigüedad 07/07/2021, sueldo básico
$12.958.400/mes) con conceptos M460 (prima legal), 1BAV (aux. vivienda), BN07
(medicina prepagada), BNSB (seguro vida), M010 (sueldo básico), deducciones
por créditos AV Villas/Banco de Bogotá, seguro vida, Colsanitas, salud,
pensión, solidaridad y retención en la fuente — usar sus valores de
devengos, deducciones y neto a pagar ($11.343.010,67) como caso de prueba de
regresión.
