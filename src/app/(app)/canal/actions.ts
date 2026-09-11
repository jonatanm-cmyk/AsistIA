"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEmpresa, tenantDe } from "@/lib/session";
import { actualizarCanal, crearCanal } from "@/lib/queries/canal";
import { ESTADOS_CANAL } from "@/types/asistia";

export type ResultadoAccion = { ok: true; mensaje: string } | { ok: false; error: string };

/** Cadena vacía -> null. Un `text unique` con "" choca en el segundo registro. */
const textoOpcional = z
  .string()
  .trim()
  .max(255)
  .transform((v) => (v === "" ? null : v));

const esquema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  phone_number_id: textoOpcional,
  display_phone_number: textoOpcional,
  waba_id: textoOpcional,
  chatwoot_inbox_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0), "El inbox debe ser un número"),
  estado: z.enum(ESTADOS_CANAL),
});

/**
 * Guarda los identificadores del número.
 *
 * AsistIA no hace el onboarding del número ni gestiona el token: eso es del
 * Meta Tech Provider, que es de otro equipo. Aquí solo se anotan los ids que
 * ese onboarding devuelve y el inbox de Chatwoot al que quedan enlazados, que
 * es lo que el flujo `ASI_` necesita para resolver la empresa de un mensaje
 * entrante (`fn_resolver_empresa`).
 */
export async function guardarCanal(
  _previo: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await requireEmpresa();
  const t = tenantDe(sesion);

  const parseado = esquema.safeParse({
    id: formData.get("id") ?? "",
    phone_number_id: formData.get("phone_number_id") ?? "",
    display_phone_number: formData.get("display_phone_number") ?? "",
    waba_id: formData.get("waba_id") ?? "",
    chatwoot_inbox_id: formData.get("chatwoot_inbox_id") ?? "",
    estado: formData.get("estado"),
  });

  if (!parseado.success) {
    return { ok: false, error: parseado.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const { id, ...datos } = parseado.data;

  try {
    if (id) {
      await actualizarCanal(t, sesion.empresaId, id, datos);
    } else {
      await crearCanal(t, sesion.empresaId, datos);
    }
    revalidatePath("/canal");
    revalidatePath("/panel");
    return { ok: true, mensaje: "Canal guardado." };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);

    // Los índices únicos de `canales` son la defensa contra enlazar el mismo
    // número o el mismo inbox a dos empresas. Merece un mensaje que se entienda.
    if (/duplicate key|unique/i.test(mensaje)) {
      return {
        ok: false,
        error:
          "Ese número o ese inbox de Chatwoot ya están enlazados a otra empresa. Revisa los identificadores.",
      };
    }
    console.error("[canal] guardar", error);
    return { ok: false, error: "No se pudo guardar el canal." };
  }
}
