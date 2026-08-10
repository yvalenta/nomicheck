/**
 * Un error causado por los datos que mandó QUIEN LLAMA, no por el motor.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * El motor tiraba `Error` común para todo, y las rutas del wrapper batch lo
 * atrapan con un `catch` genérico que responde 500 `internal_error`. O sea que
 * "te faltó una coma" y "estamos rotos" salían idénticos.
 *
 * Con el muro x402 adelante eso no es un detalle de cortesía: el muro **cobra
 * antes de ejecutar el handler**, así que el comprador paga, manda un dato mal,
 * recibe un 500, y lo único que puede concluir es que el servicio no sirve.
 * Es un cobro sin entrega por un error suyo que nadie le nombró.
 * Ver `nomicheck_ops/docs/leyes/cobrar-antes-de-servir.md`.
 *
 * El segundo daño se ve más tarde: un 500 que significa "tus datos están mal"
 * es indistinguible de uno que significa "estoy caído", así que cualquier
 * conteo de errores mezcla los dos y las caídas reales se esconden entre el
 * ruido de los datos malos.
 *
 * ── Qué NO es ───────────────────────────────────────────────────────────────
 *
 * No todo error de validación es de quien llama. Se quedan como `Error` común
 * —o sea, 500— dos clases:
 *
 *   - **Las guardas de modo** (`solo acepta datos en modo 'turnos'`): el que
 *     paga no elige qué calculadora corre. Si llega la equivocada, el bug es
 *     nuestro y un 400 le mentiría.
 *   - **`No hay regla legal vigente para X en <fecha>`**: es una afirmación
 *     sobre NUESTRO catálogo, no sobre sus datos. Que le falte una vigencia es
 *     nuestro problema, y responder 400 sería el mismo error de atribución al
 *     revés — culpar al comprador de un hueco propio.
 *
 * Extiende `Error`, así que todo lo que ya hacía `catch (e) { e.message }`
 * sigue funcionando igual: la web no se entera de este cambio.
 */
export class ErrorDeDatos extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeDatos";
    // Sin esto, `instanceof` falla cuando TypeScript compila a ES5 y la clase
    // cruza el límite de un paquete — que es exactamente cómo se usa acá.
    Object.setPrototypeOf(this, ErrorDeDatos.prototype);
  }
}
