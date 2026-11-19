"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEmpresa, tenantDe } from "@/lib/session";
import { actualizarCanal, crearCanal, guardarNumeroDeclarado } from "@/lib/queries/canal";
import { actualizarEmpresa, obtenerEmpresa } from "@/lib/queries/empresas";
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

const errorNumero =
  "Escribe el número con el código de país, por ejemplo +591 71234567. Puedes usar +, espacios, guiones y paréntesis.";

const esquemaConexion = z.object({
  responsable_email: z
    .string({ invalid_type_error: "Escribe un correo válido para recibir tus credenciales." })
    .trim()
    .email("Escribe un correo válido para recibir tus credenciales."),
  display_phone_number: z
    .string({ invalid_type_error: errorNumero })
    .trim()
    .regex(/^\+?[\d ().-]+$/, errorNumero)
    .transform((v) => `+${v.replace(/\D/g, "")}`)
    // Diez dígitos como mínimo, porque ese es el piso con código de país
    // (Bolivia: 591 + 8). Si se admitieran ocho, un «63995931» quedaría
    // guardado como «+63995931» —otro país— y el aviso del alta compararía el
    // número conectado contra uno que el cliente nunca quiso declarar.
    .refine((v) => /^\+\d{10,15}$/.test(v), errorNumero),
});

/**
 * Confirma los datos previos al alta. D12 sigue vigente: el cliente declara
 * un número visible, pero los identificadores y la habilitación son de Intersim.
 */
export async function guardarConexion(
  _previo: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await requireEmpresa();
  const t = tenantDe(sesion);
  const parseado = esquemaConexion.safeParse({
    responsable_email: formData.get("responsable_email") ?? "",
    display_phone_number: formData.get("display_phone_number") ?? "",
  });

  if (!parseado.success) {
    return { ok: false, error: parseado.error.issues[0]?.message ?? "Datos no válidos." };
  }

  try {
    // Ni la empresa ni el client_key se aceptan del formulario: los dos salen
    // de la sesión para que no se pueda preparar el alta de otra empresa.
    const empresa = await obtenerEmpresa(t, sesion.empresaId);
    if (!empresa) return { ok: false, error: "No se encontró tu empresa." };

    const canal = await guardarNumeroDeclarado(
      t,
      sesion.empresaId,
      empresa.client_key,
      parseado.data.display_phone_number
    );
    if (!canal) {
      revalidatePath("/canal");
      return { ok: false, error: "Tu WhatsApp ya está conectado. Actualiza la página para ver su estado." };
    }
    await actualizarEmpresa(t, sesion.empresaId, {
      responsable_email: parseado.data.responsable_email,
    });
    revalidatePath("/canal");
    revalidatePath("/panel");
    return { ok: true, mensaje: "Correo y número guardados. Ya puedes conectar tu WhatsApp." };
  } catch (error) {
    console.error("[canal] guardar conexión", error);
    return { ok: false, error: "No se pudieron guardar tus datos. Inténtalo de nuevo." };
  }
}
