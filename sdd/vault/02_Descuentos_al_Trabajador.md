# ✂️ Lo que se le resta al pago (Descuentos)

Al trabajador no le llega todo el dinero que ganó. La ley obliga a descontarle porcentajes para su seguridad social, y la empresa puede descontar préstamos, pero con límites estrictos. En contabilidad esto se llama "Deducido".

Lo que se descuenta se calcula sobre lo que se devengó — cómo se arma ese devengo está en [[01_Ingresos_y_Jornada]]. Todos los porcentajes y topes de este archivo son valores parametrizados: viven en [[05_Valores_Actualizables]].

## La base: el IBC (Ingreso Base de Cotización)
Para calcular la salud y la pensión, **NO** se suma el auxilio de transporte. La base es solo el salario más las horas extras, recargos y comisiones.

*   **Pago a Salud:** se le descuenta el porcentaje de ley de su IBC (hoy 4%, ver [[05_Valores_Actualizables]]).
*   **Pago a Pensión:** se le descuenta el porcentaje de ley de su IBC (hoy 4%, ver [[05_Valores_Actualizables]]).
*   **Tope superior del IBC:** por alto que sea el salario, el IBC se topa en 25 SMLMV (ver [[05_Valores_Actualizables]]). Sobre el excedente no se cotiza. En periodos menores a un mes el tope se prorratea.
*   **Fondo de Solidaridad Pensional:** si el IBC llega a 4 Salarios Mínimos o más, se le descuenta un porcentaje adicional obligatorio que **no es fijo**: sube por rangos, del 1% hasta el 2% según cuántos salarios mínimos gane. Tabla completa en [[05_Valores_Actualizables]]. Lo paga entero el trabajador, sumado a su 4% de pensión.

> ℹ️ **No todos cotizan lo mismo.** El aprendiz SENA en etapa práctica cotiza **solo salud**, no pensión; en etapa lectiva el SENA gestiona la afiliación y no se le descuenta ninguno de los dos. El contratista independiente no está en este archivo: paga su seguridad social completa sobre una base distinta, ver [[06_Aportes_Patronales_y_Parafiscales]].

## Descuentos por Préstamos, Ahorro o Convenio (autorizados por el trabajador)
Si el trabajador pidió un adelanto, un préstamo, autorizó un ahorro o un aporte a un fondo AFC, o rompió algo y aceptó por escrito que se lo cobren, aplica un tope legal:

> ⚠️ **Regla del 50% (CST art. 149):**
> El **total de deducciones** —las de ley más las autorizadas por el trabajador— no puede superar el 50% de lo devengado del periodo (porcentaje exacto en [[05_Valores_Actualizables]]).
>
> Si se pasa del tope, lo que se recorta son **las deducciones autorizadas por convenio**, proporcionalmente entre todas ellas. **Nunca** se recortan los aportes obligatorios de ley (salud, pensión, fondo de solidaridad): esos no son negociables. Y el recorte se le informa al trabajador, no se hace en silencio.

*Precisión legal: el Art. 149 CST, por regla general, prohíbe cualquier descuento —incluso autorizado por escrito— que afecte el salario mínimo, salvo que exista mandamiento judicial. El tope del 50% aplica sobre todo a descuentos a favor de cooperativas y cajas de ahorro (Art. 155-156 CST) y es la práctica que el Ministerio del Trabajo también admite para préstamos y anticipos autorizados por el trabajador (Art. 151 CST, acuerdo escrito entre las partes). La libranza (Ley 1527 de 2012) es la excepción expresa: puede llevarse el descuento más allá del tope ordinario cuando el crédito se pactó bajo ese régimen.*

> 🔧 **Hueco conocido entre esta regla y el sistema.** El derecho también protege un **piso**: un descuento por préstamo no debería dejar al trabajador recibiendo menos de un (1) Salario Mínimo. El motor **hoy no aplica ese piso** — aplica el tope del 50% sobre el devengado y recorta el convenio, que en la mayoría de los casos produce el mismo resultado protector, pero no en todos (por ejemplo, un salario alto con muchas deducciones de ley puede quedar por debajo del mínimo sin superar el 50%). Está anotado como deuda en [[07_Trazabilidad_Codigo]] — este baúl documenta la regla legal completa, y el instrumento de sincronía deja constancia de que falta implementarla.

## Embargos Judiciales (distinto de los descuentos por préstamo)
Cuando el descuento no lo autorizó el trabajador sino que lo ordena un juez, aplican reglas distintas a la de arriba, así que el sistema de nómina no debe confundirlas. Y hay **dos regímenes de embargo**, no uno:

### 1. Embargo ordinario (bancos, tarjetas de crédito, deudas civiles)
*   Primero se aparta un (1) Salario Mínimo completo, que es **totalmente inembargable** (CST art. 154). En un periodo menor a un mes ese salario mínimo se prorratea, o el excedente daría cero siempre.
*   Sobre el **excedente** (lo que sobra por encima de ese salario mínimo) solo se puede embargar **una quinta parte, el 20%** (CST art. 155). El juez no puede ordenar más que eso, y el sistema recorta la orden al tope legal dejando constancia.

### 2. Embargo por alimentos o a favor de una cooperativa
*   Aquí **no** hay salario mínimo intocable: se puede embargar hasta el **50% de cualquier salario, incluido el mínimo** (CST art. 156). La ley le da prioridad constitucional a la cuota alimentaria y trato especial a las obligaciones con cooperativas y fondos de empleados.
*   Es un régimen aparte, no "el 50% del excedente". Confundirlo con el ordinario es el error más común: sobre un salario mínimo, el embargo ordinario da **cero** y el de alimentos da **la mitad**.

Porcentajes exactos de ambos regímenes: [[05_Valores_Actualizables]].

*   El auxilio de transporte, por su naturaleza, generalmente no se incluye en la base para calcular el embargo, porque su fin es cubrir el desplazamiento al trabajo, no es un ingreso disponible.

> 🔑 **Diferencia clave para el sistema:** son **tres** flujos de validación independientes y no deben mezclarse en el mismo cálculo.
> 1. **Deducciones de ley** (salud, pensión, fondo): no tienen tope, no se recortan nunca.
> 2. **Deducciones por convenio** (préstamo, ahorro, AFC): comparten el tope del 50% del devengado y se recortan proporcionalmente entre ellas si se pasan.
> 3. **Embargo judicial**: trae su propio tope legal según el régimen (ordinario o alimentos/cooperativa) y se calcula **aparte**, sin entrar al tope del 50% ni consumirlo.

---

*Códigos de línea y claves de parámetro que implementan cada regla de este archivo: [[07_Trazabilidad_Codigo]].*
