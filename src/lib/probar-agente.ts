import "server-only";
import { z } from "zod";
import { explicarFalloRed, tokenAsi } from "./asi";

/**
 * Prueba del agente (contrato 2: `F2` -> `A2`).
 * =============================================================================
 *
 *   POST /webhook/asi-20-probar
 *   cabecera  X-ASI-Token: <el MISMO token que la ingesta>
 *   cuerpo    { empresa_id, texto }
 *
 *   200  { respuesta, material_relevante, fragmentos[], guardarrail_ok,
 *          escalar, modelo, latencia_ms }
 *   400  { error }   falta un campo
 *   403              sin token o token incorrecto
 *
 * ES SÍNCRONO, Y ESO CAMBIA EL DISEÑO
 *
 * A diferencia de la ingesta, aquí se espera a que el agente conteste de
 * verdad: 3-7 s según quien lo construyó. El timeout de 8 s de `ingesta.ts` se
 * quedaría corto justo en las respuestas largas, que son las que más interesa
 * revisar antes de publicar una versión. De ahí los 25 s: margen para un
 * arranque en frío del flujo o un día lento del modelo, y aun así un techo que
 * evita dejar el botón girando para siempre.
 *
 * CORRE EN MODO PRUEBA: no escribe nada, no usa memoria de conversación y no
 * cuenta contra el tope diario. Se puede pulsar sin consecuencias.
 */

const TIEMPO_MAXIMO_MS = 25_000;

/**
 * Lo que devuelve el flujo.
 *
 * Todo lo que no sea `respuesta` lleva valor por defecto a propósito. Esto es
 * una respuesta de otro sistema, que va a seguir evolucionando: si un día deja
 * de mandar `modelo`, lo correcto es enseñar la respuesta del agente sin esa
 * etiqueta, no romper la prueba entera por un adorno.
 */
const esquemaRespuesta = z.object({
  respuesta: z.string(),
  material_relevante: z.boolean().catch(false),
  fragmentos: z
    .array(
      z.object({
        fragmento_id: z.string().catch(""),
        similitud: z.number().catch(0),
      })
    )
    .catch([]),
  guardarrail_ok: z.boolean().catch(true),
  escalar: z.string().catch("NO"),
  modelo: z.string().catch(""),
  latencia_ms: z.number().catch(0),
});

export type RespuestaPrueba = z.infer<typeof esquemaRespuesta>;

export type ResultadoPrueba =
  | { estado: "ok"; datos: RespuestaPrueba }
  | { estado: "sin-configurar" }
  | { estado: "fallo"; detalle: string };

export async function probarAgente(
  empresaId: string,
  texto: string
): Promise<ResultadoPrueba> {
  const url = process.env.ASI_PROBAR_WEBHOOK_URL;
  const token = tokenAsi();

  // Sin token la respuesta es 403 fija: no hay nada que intentar.
  if (!url || !token) return { estado: "sin-configurar" };

  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "X-ASI-Token": token },
      body: JSON.stringify({ empresa_id: empresaId, texto }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      cache: "no-store",
    });

    if (!respuesta.ok) {
      // El 400 trae el motivo en `error`; aprovecharlo evita que el usuario
      // vea un "HTTP 400" pelado que no le dice qué arreglar.
      const motivo = await leerMotivo(respuesta);
      return { estado: "fallo", detalle: motivo ?? `HTTP ${respuesta.status}` };
    }

    const crudo = await respuesta.json();
    const parseado = esquemaRespuesta.safeParse(crudo);

    if (!parseado.success) {
      console.error("[probar] respuesta inesperada del flujo:", crudo);
      return { estado: "fallo", detalle: "el flujo respondió algo que no se entiende" };
    }

    return { estado: "ok", datos: parseado.data };
  } catch (error) {
    return { estado: "fallo", detalle: explicarFalloRed(error, TIEMPO_MAXIMO_MS) };
  }
}

/** El `error` del cuerpo, si lo hay. Nunca lanza: es información extra. */
async function leerMotivo(respuesta: Response): Promise<string | null> {
  try {
    const cuerpo = await respuesta.json();
    const motivo = (cuerpo as { error?: unknown })?.error;
    return typeof motivo === "string" && motivo.trim() !== "" ? motivo : null;
  } catch {
    return null;
  }
}
