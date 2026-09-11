/**
 * Interruptores de alcance.
 * =============================================================================
 *
 * Cosas construidas que la documentación deja fuera del tramo actual. NO se
 * borran —siguen compilando, con sus consultas y sus pruebas— pero no se le
 * enseñan a quien administra una empresa.
 *
 * Se agrupan aquí, y no como `if` sueltos por las vistas, para que volver a
 * encenderlas sea cambiar una línea y no ir a buscarlas.
 *
 * Este archivo NO lleva "use client": lo leen tanto el menú (cliente) como las
 * páginas (servidor).
 */

/**
 * Las conversaciones y su transcripción.
 *
 * D44: «Las conversaciones no se ven aquí: se atienden en Chatwoot. Por eso el
 * panel ni siquiera puede leer la tabla `mensajes`.»
 *
 * Lo construimos antes de que existiera esa decisión. Se oculta en vez de
 * borrarse por dos razones:
 *
 *  1. Es la única vista que muestra QUÉ FRAGMENTOS citó cada respuesta del
 *     agente. Eso no está en Chatwoot y es lo que convierte «el bot dijo una
 *     barbaridad» en algo diagnosticable.
 *  2. La ruta sigue viva en `/conversaciones`: quien tenga el enlace entra.
 *     Sirve para depurar sin volver a escribirla.
 *
 * AVISO: cuando se aplique `sql\02-acceso-backoffice.sql` y el panel deje de
 * conectarse con un rol con BYPASSRLS, estas consultas fallarán con
 * *permission denied* sobre `mensajes`. Ocultarlas no arregla eso; solo evita
 * que un usuario se tope con el error. La decisión de fondo —retirarla o
 * pedir permiso de lectura sobre `mensajes`— sigue abierta con Rodri.
 */
export const MOSTRAR_CONVERSACIONES = false;

/**
 * Edición del canal desde el panel de la empresa.
 *
 * D12: el número pasa por el onboarding del Meta Tech Provider y **lo habilita
 * Intersim**. Y el contrato 3 cambió de dueño el 11-sep: con `F1` aplazada,
 * `chatwoot_account_id` y `chatwoot_inbox_id` entran por una segunda llamada a
 * `fn_alta_empresa`, no por un formulario.
 *
 * Dejar que un `ADMIN_EMPRESA` escriba esos ids permite romper el enrutado de
 * sus propios mensajes sin querer. La vista queda de solo lectura.
 */
export const EMPRESA_EDITA_CANAL = false;
