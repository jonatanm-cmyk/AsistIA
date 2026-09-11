import "server-only";

/**
 * Aviso al flujo de ingesta.
 * =============================================================================
 *
 * Contrato 1 de la documentación (`F3` -> `A1`):
 *
 *   POST /webhook/asi-10-ingesta
 *   cabecera  X-ASI-Token: <token>
 *   cuerpo    { empresa_id, documento_id, evento }
 *
 * DOS DECISIONES DE DISEÑO
 *
 * 1. Si no hay webhook configurado, NO es un error. El documento ya quedó en
 *    `PENDIENTE` en la base, que es un estado válido y recuperable: cuando el
 *    flujo exista, lo recogerá igual. Así el panel funciona hoy, antes de que
 *    `A1` esté construida.
 *
 * 2. Un fallo del webhook NO tumba la subida. El documento está registrado; lo
 *    único que se pierde es el empujón. Devolver un error al usuario por eso
 *    sería mentirle: pensaría que no se subió, volvería a subirlo, y el
 *    `on conflict` lo dejaría igual que estaba.
 *
 * PENDIENTE DE CONFIRMAR CON RODRI: los valores de `evento`. La documentación
 * nombra el campo pero no enumera los valores. Se mandan SUBIDO y REEMPLAZADO
 * porque es lo que el panel sabe distinguir; si `A1` espera otra cosa, se
 * cambia aquí y en ningún otro sitio.
 */

export type EventoIngesta = "SUBIDO" | "REEMPLAZADO";

export interface AvisoIngesta {
  empresaId: string;
  documentoId: string;
  evento: EventoIngesta;
}

export type ResultadoAviso =
  | { estado: "enviado" }
  | { estado: "sin-configurar" }
  | { estado: "fallo"; detalle: string };

const TIEMPO_MAXIMO_MS = 8000;

export async function avisarIngesta(aviso: AvisoIngesta): Promise<ResultadoAviso> {
  const url = process.env.ASI_INGESTA_WEBHOOK_URL;
  const token = process.env.ASI_INGESTA_TOKEN;

  if (!url) return { estado: "sin-configurar" };

  try {
    // Con timeout: un webhook colgado no puede dejar al usuario mirando un
    // botón de "subiendo" indefinidamente.
    const corte = AbortSignal.timeout(TIEMPO_MAXIMO_MS);

    const respuesta = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { "X-ASI-Token": token } : {}),
      },
      body: JSON.stringify({
        empresa_id: aviso.empresaId,
        documento_id: aviso.documentoId,
        evento: aviso.evento,
      }),
      signal: corte,
      cache: "no-store",
    });

    if (!respuesta.ok) {
      return { estado: "fallo", detalle: `HTTP ${respuesta.status}` };
    }
    return { estado: "enviado" };
  } catch (error) {
    const detalle =
      error instanceof Error && error.name === "TimeoutError"
        ? `sin respuesta en ${TIEMPO_MAXIMO_MS / 1000} s`
        : error instanceof Error
          ? error.message
          : String(error);
    return { estado: "fallo", detalle };
  }
}

/** Frase para el usuario según cómo fue el aviso. El documento ya está guardado. */
export function explicarAviso(resultado: ResultadoAviso): string {
  switch (resultado.estado) {
    case "enviado":
      return "Se está procesando.";
    case "sin-configurar":
      return "Queda en cola: el procesado arrancará cuando el flujo de ingesta esté conectado.";
    case "fallo":
      return `Queda en cola, pero no se pudo avisar al procesador (${resultado.detalle}).`;
  }
}
