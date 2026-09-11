/**
 * Variables de Supabase, con los DOS juegos de nombres.
 *
 * Supabase renombró sus claves de API a mitad de 2025:
 *
 *   antes                          ahora
 *   ──────────────────────────     ─────────────────────────
 *   anon key      (eyJhbGci…)      publishable key (sb_publishable_…)
 *   service_role  (eyJhbGci…)      secret key      (sb_secret_…)
 *
 * Funcionan igual y conviven: un proyecto puede tener las dos. Este módulo
 * acepta cualquiera de los dos nombres para que el `.env` de quien lo escribió
 * primero no haya que reescribirlo.
 *
 * IMPORTANTE: las referencias a `process.env.NEXT_PUBLIC_*` están escritas
 * LITERALES a propósito. Next sustituye esas cadenas en tiempo de compilación;
 * si se construyeran dinámicamente (`process.env[nombre]`), en el navegador
 * llegarían como `undefined`.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** La clave pública. Viaja al navegador: es su función, no es un descuido. */
export const SUPABASE_KEY_PUBLICA =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

/** Mensaje único, para no repetir la misma explicación en cuatro sitios. */
export function exigirConfigPublica(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_KEY_PUBLICA) {
    throw new Error(
      "Falta la configuración de Supabase en .env.local: NEXT_PUBLIC_SUPABASE_URL y " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY). " +
        "Panel de Supabase -> Project Settings -> API Keys."
    );
  }
  return { url: SUPABASE_URL, key: SUPABASE_KEY_PUBLICA };
}

/**
 * La clave secreta. SOLO servidor — nunca se importa desde un componente de
 * cliente, y por eso se lee con una función en vez de exportar la constante:
 * así no acaba en un módulo que alguien importe sin darse cuenta.
 */
export function claveSecretaSupabase(): string | null {
  return (
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
  );
}
