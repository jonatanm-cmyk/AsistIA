"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireIntersim, tenantDe } from "@/lib/session";
import { actualizarEmpresa, crearEmpresa } from "@/lib/queries/empresas";
import { SUPABASE_URL, claveSecretaSupabase } from "@/lib/supabase/env";
import { ESTADOS_CANAL, ESTADOS_EMPRESA } from "@/types/asistia";

export type ResultadoAccion = { ok: true; mensaje: string } | { ok: false; error: string };

/** Cadena vacía -> null. Un `text unique` con "" choca en el segundo registro. */
const opcional = z
  .string()
  .trim()
  .max(255)
  .transform((v) => (v === "" ? null : v));

const numeroOpcional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), "Debe ser un número entero");

const esquemaAlta = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio").max(200),
  client_key: z
    .string()
    .trim()
    .min(2, "La clave de cliente es obligatoria")
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Solo minúsculas, números y guiones"),
  responsable_nombre: z.string().trim().min(2, "El responsable es obligatorio").max(200),
  responsable_email: z.string().trim().email("Correo del responsable no válido"),
  chatwoot_account_id: numeroOpcional,
  plan_codigo: z.string().trim().min(1, "Elige un plan"),

  crear_usuario: z.coerce.boolean().optional(),
  usuario_email: z.string().trim().email("Correo del usuario no válido").or(z.literal("")),
  usuario_password: z.string().min(8, "La contraseña necesita 8 caracteres").or(z.literal("")),

  // Bloque canal (contrato 3). Todo opcional: sin `phone_number_id` la función
  // ignora el bloque entero y el alta sigue siendo válida.
  canal_phone_number_id: opcional,
  canal_display_phone_number: opcional,
  canal_waba_id: opcional,
  canal_chatwoot_inbox_id: numeroOpcional,
  canal_estado: z.enum(ESTADOS_CANAL).optional(),
});

/**
 * Alta de empresa (historia `D2`, decisión D45: el alta la hace Intersim).
 *
 * ORDEN, Y POR QUÉ ES ESTE
 *
 *   1. La cuenta de Supabase Auth, si se pidió. Vive fuera de Postgres, así que
 *      no puede entrar en la transacción de la base.
 *   2. `fn_alta_empresa` con su uuid: empresa, suscripción, canal, usuario y
 *      configuración inicial, todo en una llamada atómica.
 *
 * Auth va primero porque la función necesita el uuid. El riesgo de ese orden es
 * dejar una cuenta de Auth huérfana si el paso 2 falla; se cubre reutilizando
 * la cuenta existente cuando el correo ya está registrado, de modo que
 * reintentar el formulario termina el trabajo en vez de chocar.
 */
export async function altaEmpresa(
  _previo: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await requireIntersim();

  const parseado = esquemaAlta.safeParse({
    nombre: formData.get("nombre"),
    client_key: formData.get("client_key"),
    responsable_nombre: formData.get("responsable_nombre"),
    responsable_email: formData.get("responsable_email"),
    chatwoot_account_id: formData.get("chatwoot_account_id") ?? "",
    plan_codigo: formData.get("plan_codigo"),
    crear_usuario: formData.get("crear_usuario") === "on",
    usuario_email: formData.get("usuario_email") ?? "",
    usuario_password: formData.get("usuario_password") ?? "",
    canal_phone_number_id: formData.get("canal_phone_number_id") ?? "",
    canal_display_phone_number: formData.get("canal_display_phone_number") ?? "",
    canal_waba_id: formData.get("canal_waba_id") ?? "",
    canal_chatwoot_inbox_id: formData.get("canal_chatwoot_inbox_id") ?? "",
    canal_estado: (formData.get("canal_estado") as string) || undefined,
  });

  if (!parseado.success) {
    return { ok: false, error: parseado.error.issues[0]!.message };
  }
  const d = parseado.data;

  if (d.crear_usuario && (!d.usuario_email || !d.usuario_password)) {
    return { ok: false, error: "Para crear el usuario hacen falta correo y contraseña." };
  }

  // --- 1. La cuenta de Auth ---------------------------------------------
  let admin: { auth_user_id: string; email: string; nombre: string | null } | undefined;

  if (d.crear_usuario) {
    const clave = claveSecretaSupabase();
    if (!clave) {
      return {
        ok: false,
        error:
          "Falta la clave secreta de Supabase (SUPABASE_SECRET_KEY) para crear el usuario. " +
          "Desmarca la casilla y créalo después con `npm run usuario`.",
      };
    }

    const cliente = createAdminClient(SUPABASE_URL, clave, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const resultado = await asegurarCuentaAuth(cliente, d.usuario_email, d.usuario_password);
    if ("error" in resultado) return { ok: false, error: resultado.error };

    admin = {
      auth_user_id: resultado.id,
      email: d.usuario_email,
      nombre: d.responsable_nombre,
    };
  }

  // --- 2. Todo lo demás, en una llamada ----------------------------------
  try {
    const alta = await crearEmpresa(tenantDe(sesion), {
      nombre: d.nombre,
      client_key: d.client_key,
      responsable_nombre: d.responsable_nombre,
      responsable_email: d.responsable_email,
      chatwoot_account_id: d.chatwoot_account_id,
      plan_codigo: d.plan_codigo,
      admin,
      canal: d.canal_phone_number_id
        ? {
            phone_number_id: d.canal_phone_number_id,
            display_phone_number: d.canal_display_phone_number,
            waba_id: d.canal_waba_id,
            chatwoot_inbox_id: d.canal_chatwoot_inbox_id,
            estado: d.canal_estado ?? "PENDIENTE",
          }
        : undefined,
    });

    revalidatePath("/intersim/empresas");
    revalidatePath("/intersim");
    redirect(`/intersim/empresas/${alta.empresa_id}`);
  } catch (error) {
    // `redirect()` funciona lanzando: hay que dejarla pasar.
    if (error && typeof error === "object" && "digest" in error) throw error;

    const mensaje = error instanceof Error ? error.message : String(error);

    // Los mensajes de la función ya vienen redactados para leerse.
    if (/fn_alta_empresa:/.test(mensaje)) {
      return { ok: false, error: mensaje.replace(/^.*fn_alta_empresa:\s*/, "") };
    }
    if (/client_key/.test(mensaje)) {
      return { ok: false, error: `La clave de cliente "${d.client_key}" ya está en uso.` };
    }
    if (/chatwoot_account_id/.test(mensaje)) {
      return { ok: false, error: "Esa cuenta de Chatwoot ya está enlazada a otra empresa." };
    }
    console.error("[empresas] alta", error);
    return { ok: false, error: "No se pudo crear la empresa." };
  }
}

/**
 * Devuelve el uuid de la cuenta de Auth, creándola si no existe.
 *
 * Si el correo YA estaba registrado se reutiliza la cuenta y **no se toca su
 * contraseña**: cambiarla en silencio dejaría fuera a quien ya la estuviera
 * usando. La contraseña del formulario solo se aplica a cuentas nuevas.
 */
async function asegurarCuentaAuth(
  cliente: SupabaseClient,
  email: string,
  password: string
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await cliente.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (data?.user) return { id: data.user.id };

  const yaExiste = /already (been )?registered|already exists/i.test(error?.message ?? "");
  if (!yaExiste) {
    console.error("[empresas] crear usuario auth", error);
    return { error: `No se pudo crear el usuario: ${error?.message ?? "error desconocido"}` };
  }

  // La API de administración no permite buscar por correo, así que se pagina.
  // Con los usuarios de un backoffice esto es una sola página.
  for (let pagina = 1; pagina <= 5; pagina++) {
    const { data: lista, error: errorLista } = await cliente.auth.admin.listUsers({
      page: pagina,
      perPage: 200,
    });
    if (errorLista) break;
    const encontrado = lista.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (encontrado) return { id: encontrado.id };
    if (lista.users.length < 200) break;
  }

  return {
    error: `El correo ${email} ya tiene cuenta en Supabase Auth, pero no se pudo localizar su id. Créala con \`npm run usuario\`.`,
  };
}

const esquemaEdicion = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(2).max(200),
  responsable_nombre: z.string().trim().min(2).max(200),
  responsable_email: z.string().trim().email(),
  chatwoot_account_id: numeroOpcional,
  estado: z.enum(ESTADOS_EMPRESA),
  plan_id: z.string().uuid().or(z.literal("")),
});

export async function editarEmpresa(
  _previo: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await requireIntersim();

  const parseado = esquemaEdicion.safeParse({
    id: formData.get("id"),
    nombre: formData.get("nombre"),
    responsable_nombre: formData.get("responsable_nombre"),
    responsable_email: formData.get("responsable_email"),
    chatwoot_account_id: formData.get("chatwoot_account_id") ?? "",
    estado: formData.get("estado"),
    plan_id: formData.get("plan_id") ?? "",
  });

  if (!parseado.success) {
    return { ok: false, error: parseado.error.issues[0]!.message };
  }
  const { id, plan_id, ...cambios } = parseado.data;

  try {
    await actualizarEmpresa(tenantDe(sesion), id, {
      ...cambios,
      plan_id: plan_id || null,
    });
    revalidatePath(`/intersim/empresas/${id}`);
    revalidatePath("/intersim/empresas");
    revalidatePath("/intersim");
    return { ok: true, mensaje: "Cambios guardados." };
  } catch (error) {
    console.error("[empresas] editar", error);
    return { ok: false, error: "No se pudieron guardar los cambios." };
  }
}
