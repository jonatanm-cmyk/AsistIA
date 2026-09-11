"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEmpresa, tenantDe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { registrarDocumento, retirarDocumento } from "@/lib/queries/conocimiento";
import { ErrorExtraccion, extraerTexto } from "@/lib/extraer-texto";
import { avisarIngesta, explicarAviso } from "@/lib/ingesta";

export type ResultadoAccion = { ok: true; mensaje: string } | { ok: false; error: string };

/** Bucket de Supabase Storage donde viven los originales. Ver el README. */
const BUCKET = "conocimiento";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const TIPOS_MIME: Record<string, "PDF" | "DOCX"> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

const esquemaTexto = z.object({
  nombre: z.string().trim().min(1, "Ponle un nombre al documento").max(255),
  contenido: z.string().trim().min(20, "El texto es demasiado corto para servir de conocimiento"),
});

/**
 * Alta de documento (historia `F3`).
 *
 * Tres pasos, en este orden y por esta razón:
 *
 *   1. EXTRAER EL TEXTO. El flujo de ingesta lee `documentos.texto_extraido` y
 *      nunca baja el archivo de Storage (supuesto `S4`, y comprobado en el
 *      cuerpo de `fn_ingesta_tomar`). Sin este paso el documento se queda en
 *      cola para siempre. Va primero para poder fallar ANTES de subir 20 MB
 *      que no servirían de nada.
 *   2. GUARDAR EL ORIGINAL en Storage. Es la copia de respaldo y lo que se
 *      enseña si alguien quiere ver de dónde salió una respuesta.
 *   3. REGISTRAR LA FILA en `PENDIENTE` y avisar al flujo.
 *
 * El troceado y los embeddings siguen siendo de `A1`: si los hiciéramos aquí
 * habría dos ingestas que mantener sincronizadas.
 */
export async function subirDocumento(
  _previo: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await requireEmpresa();
  const t = tenantDe(sesion);
  const modo = String(formData.get("modo") ?? "archivo");

  try {
    // --- Texto pegado: ya viene extraído --------------------------------
    if (modo === "texto") {
      const parseado = esquemaTexto.safeParse({
        nombre: formData.get("nombre"),
        contenido: formData.get("contenido"),
      });
      if (!parseado.success) {
        return { ok: false, error: parseado.error.issues[0]!.message };
      }
      const { nombre, contenido } = parseado.data;

      const doc = await registrarDocumento(t, {
        empresaId: sesion.empresaId,
        nombre,
        tipo: "TEXTO",
        storagePath: null,
        textoExtraido: contenido,
        huellaSha256: sha256(Buffer.from(contenido, "utf8")),
        bytes: Buffer.byteLength(contenido, "utf8"),
        subidoPor: sesion.usuarioId,
      });

      return await terminar(doc!, nombre, sesion.empresaId);
    }

    // --- Archivo ---------------------------------------------------------
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      return { ok: false, error: "Elige un archivo." };
    }
    if (archivo.size > MAX_BYTES) {
      return { ok: false, error: "El archivo pasa de 20 MB." };
    }
    const tipo = TIPOS_MIME[archivo.type];
    if (!tipo) {
      return { ok: false, error: "Solo se admiten PDF y DOCX." };
    }

    const bytes = Buffer.from(await archivo.arrayBuffer());

    // 1. Extraer ANTES de subir: si el PDF es un escaneo, no tiene sentido
    //    gastar Storage ni dejar una fila que nunca se va a poder procesar.
    let texto: string;
    try {
      const extraido = await extraerTexto(bytes, tipo);
      texto = extraido.texto;
    } catch (error) {
      if (error instanceof ErrorExtraccion) return { ok: false, error: error.message };
      throw error;
    }

    const huella = sha256(bytes);

    // La ruta empieza por el id de empresa: así una política de Storage por
    // prefijo aísla los archivos igual que la RLS aísla las filas.
    const ruta = `${sesion.empresaId}/${huella}${tipo === "PDF" ? ".pdf" : ".docx"}`;

    // 2. Guardar el original.
    const supabase = await createClient();
    const { error: errorSubida } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, bytes, { contentType: archivo.type, upsert: true });

    if (errorSubida) {
      console.error("[conocimiento] storage", errorSubida);
      return {
        ok: false,
        error: `No se pudo guardar el archivo (${errorSubida.message}). ¿Existe el bucket "${BUCKET}"?`,
      };
    }

    // 3. Registrar y avisar.
    const doc = await registrarDocumento(t, {
      empresaId: sesion.empresaId,
      nombre: archivo.name,
      tipo,
      storagePath: ruta,
      textoExtraido: texto,
      huellaSha256: huella,
      bytes: archivo.size,
      subidoPor: sesion.usuarioId,
    });

    return await terminar(doc!, archivo.name, sesion.empresaId, texto.length);
  } catch (error) {
    console.error("[conocimiento] subir", error);
    return { ok: false, error: "No se pudo registrar el documento." };
  }
}

/**
 * Avisa al flujo y arma el mensaje. El documento YA está guardado cuando se
 * llega aquí, así que nada de lo que pase a partir de ahora puede devolver
 * `ok: false`: sería decirle al usuario que no se subió algo que sí se subió.
 */
async function terminar(
  doc: { id: string; era_nuevo: boolean },
  nombre: string,
  empresaId: string,
  caracteres?: number
): Promise<ResultadoAccion> {
  const aviso = await avisarIngesta({
    empresaId,
    documentoId: doc.id,
    evento: doc.era_nuevo ? "SUBIDO" : "REEMPLAZADO",
  });

  if (aviso.estado === "fallo") {
    console.warn("[conocimiento] aviso de ingesta falló:", aviso.detalle);
  }

  revalidatePath("/conocimiento");
  revalidatePath("/panel");

  const encabezado = doc.era_nuevo
    ? `"${nombre}" se guardó.`
    : `"${nombre}" ya estaba: se actualizó y se vuelve a procesar.`;

  const detalle = caracteres
    ? ` Se extrajeron ${new Intl.NumberFormat("es-BO").format(caracteres)} caracteres de texto.`
    : "";

  return { ok: true, mensaje: `${encabezado}${detalle} ${explicarAviso(aviso)}` };
}

/**
 * Retirar es inmediato (D26): el documento pasa a RETIRADO y sus fragmentos se
 * borran, así que el agente ya no puede citarlo en la siguiente consulta. El
 * original sigue en Storage: la baja no borra.
 *
 * No se avisa al flujo: el borrado de fragmentos ya lo hace la función de la
 * base, así que no hay nada que procesar.
 */
export async function retirar(_previo: unknown, formData: FormData): Promise<ResultadoAccion> {
  const sesion = await requireEmpresa();
  const id = String(formData.get("id") ?? "");

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Documento no válido." };
  }

  try {
    await retirarDocumento(tenantDe(sesion), id);
    revalidatePath("/conocimiento");
    revalidatePath("/panel");
    return { ok: true, mensaje: "Documento retirado. El agente ya no lo usará." };
  } catch (error) {
    console.error("[conocimiento] retirar", error);
    return { ok: false, error: "No se pudo retirar el documento." };
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
