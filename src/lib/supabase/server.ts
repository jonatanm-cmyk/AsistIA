import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { exigirConfigPublica } from "./env";

/**
 * `cookies` de createServerClient acepta dos formas (la actual y una obsoleta),
 * y con esa unión TypeScript no puede inferir el tipo de los parámetros del
 * callback. Se anota a mano.
 */
type CookieAEscribir = { name: string; value: string; options: CookieOptions };

/**
 * Cliente de Supabase para Server Components, Route Handlers y Server Actions.
 * Solo lo usamos para IDENTIDAD (quién inició sesión). Los datos de negocio se
 * leen por `pg` en `src/lib/db.ts`, porque el esquema vive en `asistia` y las
 * consultas del dashboard son agregaciones que PostgREST no expresa bien.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = exigirConfigPublica();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieAEscribir[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Un Server Component no puede escribir cookies. No pasa nada: el
          // middleware ya refrescó la sesión antes de llegar aquí.
        }
      },
    },
  });
}
