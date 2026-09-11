import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY_PUBLICA, SUPABASE_URL } from "./env";

/** Ver la nota en `server.ts`: la unión de formas impide inferir este tipo. */
type CookieAEscribir = { name: string; value: string; options: CookieOptions };

/**
 * Refresca el token de Supabase y devuelve la respuesta con las cookies ya
 * puestas, más el id de usuario autenticado (o null).
 *
 * Tiene que correr en el middleware: si no, los Server Components trabajan con
 * un token caducado y la sesión se cae sola a mitad de navegación.
 */
export async function actualizarSesion(request: NextRequest): Promise<{
  response: NextResponse;
  authUserId: string | null;
}> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY_PUBLICA, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieAEscribir[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() y no getSession(): getUser valida el token contra Supabase.
  // getSession se fía de la cookie, que el navegador puede haber manipulado.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, authUserId: user?.id ?? null };
}
