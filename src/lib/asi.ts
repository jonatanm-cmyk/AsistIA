import "server-only";

/**
 * Lo común a los dos webhooks del contrato con automatización.
 * =============================================================================
 *
 *   asi-10-ingesta   empuja un documento a la cola de ingesta  (asíncrono, 202)
 *   asi-20-probar    pregunta al agente en modo prueba         (síncrono, 3-7 s)
 *
 * Comparten UN MISMO TOKEN, y es intencionado por parte de ellos: es la
 * credencial del backoffice contra n8n, no la de un flujo concreto. Por eso se
 * lee aquí una sola vez y no en cada módulo.
 *
 * `ASI_INGESTA_TOKEN` se sigue aceptando porque es como se llamaba cuando solo
 * existía el primer webhook. Nombrarlo por el flujo fue un error mío: el token
 * nunca fue de la ingesta.
 */

/** El token, o `null` si no está configurado. */
export function tokenAsi(): string | null {
  const valor = process.env.ASI_WEBHOOK_TOKEN ?? process.env.ASI_INGESTA_TOKEN;
  return valor && valor.trim() !== "" ? valor : null;
}

/**
 * Explica un fallo de `fetch` en una frase que sirva para algo.
 *
 * Importa distinguir el corte por tiempo del resto: "sin respuesta en 25 s" le
 * dice al usuario que vuelva a intentarlo, mientras que un `ENOTFOUND` le dice
 * a quien mantiene esto que la URL está mal. Mezclarlos en un "error de red"
 * genérico obliga a abrir los logs para saber cuál de las dos cosas pasó.
 */
export function explicarFalloRed(error: unknown, tiempoMaximoMs: number): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return `sin respuesta en ${Math.round(tiempoMaximoMs / 1000)} s`;
  }
  return error instanceof Error ? error.message : String(error);
}
