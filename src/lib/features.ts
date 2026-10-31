/**
 * Interruptores de lo que se muestra en la demostración.
 *
 * No borramos código ni datos: solo escondemos la entrada. Para volver a
 * mostrar una sección basta con poner su interruptor en `true`.
 */

/**
 * Integración con Airbnb.
 *
 * Oculta por ahora: la sincronización es simulada (ver
 * `src/lib/airbnb/README.md`) y se prefiere que en la demo solo se vea lo que
 * funciona de verdad. Las reservas de corta estancia siguen apareciendo en el
 * calendario y en la ficha de cada unidad; lo que se esconde es la pantalla de
 * conexión y el botón que lleva a ella.
 */
export const SHOW_AIRBNB_INTEGRATION = false;

/**
 * Modo demostración. Solo con `DEMO_MODE=true` la pantalla de acceso muestra
 * las cuentas de prueba y el aviso de datos ficticios. En producción debe
 * quedar apagado: las cuentas demo comparten una contraseña conocida.
 *
 * Se lee en el servidor (no es NEXT_PUBLIC_), así que basta con reiniciar el
 * servicio para cambiarlo.
 */
export function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}
