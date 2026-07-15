# Capacidad: Extracción automática de comprobantes

Permite al usuario subir su comprobante de pago (PDF o imagen) y obtiene los
datos estructurados necesarios para alimentar `calculo-turnos` o
`calculo-salario-fijo`, sin que el usuario tenga que digitarlos a mano.

## Requisitos

1. El sistema DEBE aceptar como entrada un archivo PDF o imagen (JPG/PNG) del
   comprobante, subido por el usuario desde el navegador.

2. El sistema DEBE procesar el archivo del lado del servidor (`apps/api`),
   nunca en el navegador, para no exponer la API key de Claude.

3. El sistema DEBE enviar el contenido del comprobante a Claude (visión) con
   un prompt que solicite una salida **estructurada** (JSON) que siga un
   schema fijo, cubriendo los campos comunes a ambos modos de cálculo
   (empleado, periodo, salario básico, auxilio de transporte) más los campos
   específicos del modo detectado (turnos: días laborados, recargos, horas
   extra; fijo: lista de conceptos con código/valor).

4. El sistema DEBE validar la respuesta de Claude contra el schema antes de
   usarla — si no cumple el schema o faltan campos obligatorios, DEBE
   pedir al usuario que confirme o corrija los campos faltantes en un
   formulario, en vez de asumir valores.

5. El sistema DEBE detectar automáticamente cuál de los dos modos
   (`calculo-turnos` o `calculo-salario-fijo`) corresponde al comprobante
   subido, en base a la estructura de conceptos detectada, y permitir al
   usuario corregir la detección si es incorrecta.

6. El sistema NO DEBE persistir el archivo subido más allá del tiempo de
   procesamiento de la solicitud — se descarta tras extraer los datos (no hay
   almacenamiento de comprobantes de terceros por defecto en v1).

7. El sistema DEBE mostrar al usuario los datos extraídos antes de calcular,
   permitiéndole editar cualquier campo antes de confirmar.

## Fixtures de referencia
Los dos comprobantes reales recibidos (Restaurante Resplandor y nómina
ejecutiva) como imágenes de prueba: el JSON extraído debe reproducir los
valores visibles en cada uno (salario, periodo, conceptos, totales).
