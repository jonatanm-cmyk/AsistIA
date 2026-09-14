import "server-only";
import { explicarFalloRed, tokenAsi } from "./asi";

/**
 * Aviso al flujo de ingesta.
 * =============================================================================
 *
 * Contrato 1 de la documentación (`F3` -> `A1`):
 *
 *   POST /webhook/asi-10-ingesta          (probado en vivo el 13-sep-2026)
 *   cabecera  X-ASI-Token: <token>
 *   cuerpo    { empresa_id, documento_id, evento: "INGESTAR" }
 *
 *   202 {"recibido":true}  aviso aceptado; la ingesta sigue en segundo plano
 *   400 {"motivo":...}     falta un campo, uuid mal formado, o evento != INGESTAR
 *   403                    sin cabecera X-ASI-Token o token incorrecto
 *
 * El 202 NO significa ingestado: significa recibido. El resultado se lee en
 * `documentos.estado` + `error_detalle`.
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
 * EL VALOR DE `evento` ES `INGESTAR`, Y SOLO ESE.
 *
 * Aquí se mandaban SUBIDO y REEMPLAZADO, inventados cuando la documentación
 * nombraba el campo sin enumerar los valores. El documento del 13-sep del
 * equipo de automatización lo cerró: cualquier cosa distinta de `INGESTAR`
 * devuelve `400`. Es decir, ninguna subida habría llegado nunca a procesarse.
 *
 * La distinción nuevo/reemplazo no se pierde, cambia de sitio: el flujo trata
 * las dos igual a propósito —reingesta = borrar fragmentos e insertar— así que
 * `era_nuevo` ya solo decide QUÉ SE LE DICE AL USUARIO, no qué se manda.
 */

/** Lo único que acepta el flujo. Ver la tabla de respuestas de arriba. */
export const EVENTO_INGESTAR = "INGESTAR" as const;

export interface AvisoIngesta {
  empresaId: string;
  documentoId: string;
}

export type ResultadoAviso =
  | { estado: "enviado" }
  | { estado: "sin-configurar" }
  | { estado: "fallo"; detalle: string };

const TIEMPO_MAXIMO_MS = 8000;

export async function avisarIngesta(aviso: AvisoIngesta): Promise<ResultadoAviso> {
  const url = process.env.ASI_INGESTA_WEBHOOK_URL;
  const token = tokenAsi();

  // Sin token el flujo responde 403 SIEMPRE: mandar el POST solo serviría para
  // ensuciar los logs de n8n y enseñarle al usuario un fallo que no es suyo.
  // Falta media configuración, que es lo mismo que no tenerla.
  if (!url || !token) return { estado: "sin-configurar" };

  try {
    // Con timeout: un webhook colgado no puede dejar al usuario mirando un
    // botón de "subiendo" indefinidamente.
    const corte = AbortSignal.timeout(TIEMPO_MAXIMO_MS);

    const respuesta = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-ASI-Token": token,
      },
      body: JSON.stringify({
        empresa_id: aviso.empresaId,
        documento_id: aviso.documentoId,
        evento: EVENTO_INGESTAR,
      }),
      signal: corte,
      cache: "no-store",
    });

    if (!respuesta.ok) {
      return { estado: "fallo", detalle: `HTTP ${respuesta.status}` };
    }
    return { estado: "enviado" };
  } catch (error) {
    return { estado: "fallo", detalle: explicarFalloRed(error, TIEMPO_MAXIMO_MS) };
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
