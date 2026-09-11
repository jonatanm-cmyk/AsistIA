import { NextResponse, type NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/middleware";
import { SUPABASE_KEY_PUBLICA, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * Portero de entrada.
 *
 * Hace DOS cosas y ninguna más:
 *   1. Refresca el token de Supabase (si no, la sesión caduca a media navegación).
 *   2. Manda a /login a quien no esté autenticado.
 *
 * LO QUE YA NO HACE, Y POR QUÉ
 *
 * Antes también sacaba de /login a quien tuviera sesión de Supabase. Eso creaba
 * DOS autoridades distintas sobre la misma pregunta:
 *
 *   · aquí            "está autenticado en Supabase"
 *   · getSesion()     "está autenticado Y tiene fila en `usuarios`"
 *
 * En cuanto discrepaban —una cuenta de Auth sin dar de alta en AsistIA, o
 * bloqueada— el navegador entraba en bucle infinito: el middleware lo echaba de
 * /login hacia /, y / lo devolvía a /login, para siempre.
 *
 * Ahora la pregunta "¿ya tiene sesión?" la responde un solo sitio: `getSesion()`,
 * en la propia página /login. Con una sola autoridad, el bucle no es posible.
 *
 * Los permisos por rol tampoco se deciden aquí: el middleware corre en Edge,
 * donde no existe el driver `pg`, así que no puede leer `usuarios`. Se
 * comprueban en `requireIntersim()` / `requireEmpresa()`.
 */
export async function middleware(request: NextRequest) {
  const ruta = request.nextUrl.pathname;

  // /api/health se salta el middleware ENTERO, no solo la comprobación de
  // sesión. Su razón de ser es diagnosticar la configuración, y tocar Supabase
  // antes de llegar significaría que un NEXT_PUBLIC_SUPABASE_URL mal puesto
  // tumba precisamente la ruta que existe para decírtelo.
  if (ruta === "/api/health") return NextResponse.next();

  // Sin las variables de Supabase no hay sesión posible. Mejor un mensaje que
  // se entiende que un 500 desde dentro del cliente de Auth.
  if (!SUPABASE_URL || !SUPABASE_KEY_PUBLICA) {
    return new NextResponse(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "(antes ANON_KEY) en .env.local. Comprueba la base en /api/health.",
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const { response, authUserId } = await actualizarSesion(request);

  const esRutaPublica = ruta === "/login" || ruta === "/unauthorized";

  if (!authUserId && !esRutaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Para volver donde estaba después de entrar.
    if (ruta !== "/") url.searchParams.set("destino", ruta);
    return redirigir(url, response);
  }

  return response;
}

/**
 * Redirige SIN perder las cookies que `actualizarSesion` acaba de escribir.
 *
 * `NextResponse.redirect()` crea una respuesta limpia. Si se devuelve tal cual,
 * el token que Supabase acaba de refrescar no llega al navegador: se queda con
 * el viejo, que ya fue rotado, y la sesión se cae sola en la siguiente
 * petición. Hay que copiar las cookies de la respuesta original.
 */
function redirigir(url: URL, original: NextResponse): NextResponse {
  const respuesta = NextResponse.redirect(url);
  for (const cookie of original.cookies.getAll()) {
    respuesta.cookies.set(cookie);
  }
  return respuesta;
}

export const config = {
  matcher: [
    /*
     * Todo menos los estáticos de Next, los iconos y los archivos con
     * extensión. Sin esto el middleware correría también para cada .js y .css,
     * que es una llamada a Supabase por recurso.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
