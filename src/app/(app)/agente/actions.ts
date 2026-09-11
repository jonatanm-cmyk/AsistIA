"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEmpresa, tenantDe } from "@/lib/session";
import { guardarConfiguracion, obtenerVersion } from "@/lib/queries/agente";
import { TIPOS_REGLA } from "@/types/asistia";

/**
 * Server Actions: este archivo ES el backend de la vista.
 *
 * No hay una API REST intermedia porque nadie más la consumiría: los flujos
 * `ASI_` hablan con Postgres directamente (rol `asistia_flujos`), no con este
 * backoffice. Montar `/api/agente` sería una capa de traducción sin cliente.
 *
 * Lo que sí es obligatorio, y es la razón de que exista el esquema Zod: una
 * Server Action es un endpoint HTTP público. El navegador puede mandar lo que
 * quiera. Se valida aquí, en el servidor, siempre.
 */

const esquema = z.object({
  nombre_agente: z.string().trim().min(1, "Ponle un nombre al agente").max(255),
  tono: z.string().trim().min(1, "El tono no puede quedar vacío").max(100),
  idioma: z.string().trim().min(2).max(50),
  max_tokens_respuesta: z.coerce.number().int().min(100).max(4000),
  tope_tokens_conversacion_dia: z.coerce.number().int().min(1000).max(500_000),
  reglas: z
    .array(
      z.object({
        tipo: z.enum(TIPOS_REGLA),
        texto: z.string().trim().max(2000),
        activa: z.boolean(),
      })
    )
    .max(50, "Cincuenta reglas son demasiadas para un prompt"),
});

export type ResultadoAccion =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

export async function guardarAgente(_previo: unknown, formData: FormData): Promise<ResultadoAccion> {
  const sesion = await requireEmpresa();

  // Las reglas viajan como JSON en un campo oculto: son una lista ordenada de
  // objetos y FormData no tiene forma decente de expresar eso.
  let reglasCrudas: unknown = [];
  try {
    reglasCrudas = JSON.parse(String(formData.get("reglas") ?? "[]"));
  } catch {
    return { ok: false, error: "No se pudieron leer las reglas." };
  }

  const parseado = esquema.safeParse({
    nombre_agente: formData.get("nombre_agente"),
    tono: formData.get("tono"),
    idioma: formData.get("idioma"),
    max_tokens_respuesta: formData.get("max_tokens_respuesta"),
    tope_tokens_conversacion_dia: formData.get("tope_tokens_conversacion_dia"),
    reglas: reglasCrudas,
  });

  if (!parseado.success) {
    return { ok: false, error: parseado.error.issues[0]?.message ?? "Datos no válidos." };
  }

  try {
    const { version } = await guardarConfiguracion(tenantDe(sesion), {
      empresaId: sesion.empresaId,
      creadaPor: sesion.usuarioId,
      ...parseado.data,
    });

    // El dashboard muestra la versión vigente, así que también se invalida.
    revalidatePath("/agente");
    revalidatePath("/panel");

    return { ok: true, mensaje: `Guardado como versión ${version}.` };
  } catch (error) {
    console.error("[agente] guardar", error);
    return {
      ok: false,
      error: "No se pudo guardar la configuración. Vuelve a intentarlo.",
    };
  }
}

/**
 * Restaurar una versión anterior (lo que `F2` llama «historial y restaurar»).
 *
 * NO revive la fila antigua marcándola `vigente`. Copia su contenido y lo
 * guarda como una versión NUEVA, por `fn_guardar_configuracion`, igual que un
 * guardado normal.
 *
 * Es deliberado y cambia lo que ve el usuario, así que conviene decirlo: el
 * historial es de solo añadir. Si restaurar moviera el banderín `vigente` hacia
 * atrás, se perdería el rastro de quién restauró y cuándo, y dos restauraciones
 * seguidas serían indistinguibles de no haber hecho nada. Con una versión nueva,
 * el historial cuenta la historia completa.
 *
 * Efecto secundario útil: el número de versión siempre crece, así que
 * `mensajes.configuracion_id` sigue apuntando a la versión exacta con la que se
 * generó cada respuesta. Revivir filas rompería esa trazabilidad.
 */
export async function restaurarVersion(
  _previo: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await requireEmpresa();
  const t = tenantDe(sesion);
  const id = String(formData.get("configuracion_id") ?? "");

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Versión no válida." };
  }

  try {
    const origen = await obtenerVersion(t, sesion.empresaId, id);
    if (!origen) return { ok: false, error: "Esa versión no existe o no es de tu empresa." };
    if (origen.vigente) return { ok: false, error: "Esa versión ya es la vigente." };

    const { version } = await guardarConfiguracion(t, {
      empresaId: sesion.empresaId,
      creadaPor: sesion.usuarioId,
      nombre_agente: origen.nombre_agente,
      tono: origen.tono,
      idioma: origen.idioma,
      max_tokens_respuesta: origen.max_tokens_respuesta,
      tope_tokens_conversacion_dia: origen.tope_tokens_conversacion_dia,
      // Solo las activas: restaurar una regla que estaba desactivada la
      // reactivaría sin que nadie lo haya pedido.
      reglas: origen.reglas
        .filter((r) => r.activa)
        .map((r) => ({ tipo: r.tipo, texto: r.texto, activa: true })),
    });

    revalidatePath("/agente");
    revalidatePath("/panel");

    return {
      ok: true,
      mensaje: `Se restauró la v${origen.version} como versión ${version}. El agente ya responde con ella.`,
    };
  } catch (error) {
    console.error("[agente] restaurar", error);
    return { ok: false, error: "No se pudo restaurar esa versión." };
  }
}
