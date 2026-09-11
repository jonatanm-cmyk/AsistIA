import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withBootstrap } from "@/lib/db";
import type { Rol, Sesion } from "@/types/asistia";

/**
 * Quién está mirando, resuelto una sola vez por petición.
 *
 * `cache()` de React deduplica: aunque el layout, la página y tres widgets
 * llamen a `getSesion()`, la consulta a Supabase y a `usuarios` ocurre una vez.
 * Sin esto cada frontera de Suspense del dashboard abriría su propia conexión.
 */
/**
 * El usuario de Supabase Auth, sin más. Separado de `getSesion()` para poder
 * distinguir dos situaciones que no son la misma:
 *
 *   · nadie ha iniciado sesión                  -> ambos null
 *   · ha iniciado sesión pero no está dado de
 *     alta en AsistIA (o está bloqueado)        -> este devuelve usuario,
 *                                                  `getSesion()` devuelve null
 *
 * Antes las dos se veían igual desde fuera, y la segunda acababa en un bucle de
 * redirecciones entre / y /login. Ahora /login la reconoce y lo dice.
 */
export const getUsuarioAuth = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getSesion = cache(async (): Promise<Sesion | null> => {
  const user = await getUsuarioAuth();

  if (!user) return null;

  const fila = await withBootstrap((q) =>
    q.row<{
      id: string;
      email: string;
      nombre: string | null;
      rol: Rol;
      estado: string;
      empresa_id: string | null;
      empresa_nombre: string | null;
      empresa_estado: string | null;
    }>(
      `select u.id, u.email, u.nombre, u.rol, u.estado,
              u.empresa_id, e.nombre as empresa_nombre, e.estado as empresa_estado
         from usuarios u
         left join empresas e on e.id = u.empresa_id
        where u.auth_user_id = $1`,
      [user.id]
    )
  );

  // Autenticado en Supabase pero sin fila en `usuarios`: la cuenta no está dada
  // de alta en AsistIA. No es una sesión válida para el backoffice.
  if (!fila) return null;
  if (fila.estado !== "ACTIVO") return null;

  return {
    usuarioId: fila.id,
    authUserId: user.id,
    email: fila.email,
    nombre: fila.nombre,
    rol: fila.rol,
    empresaId: fila.empresa_id,
    empresaNombre: fila.empresa_nombre,
    empresaEstado: (fila.empresa_estado as Sesion["empresaEstado"]) ?? null,
  };
});

/** La sesión, o fuera. Para páginas y handlers que no tienen sentido sin ella. */
export async function requireSesion(): Promise<Sesion> {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  return sesion;
}

/** La sesión de un INTERSIM, o a /unauthorized. */
export async function requireIntersim(): Promise<Sesion> {
  const sesion = await requireSesion();
  if (sesion.rol !== "INTERSIM") redirect("/unauthorized");
  return sesion;
}

/**
 * La empresa del usuario. Un ADMIN_EMPRESA siempre tiene una (lo garantiza un
 * CHECK del esquema); un INTERSIM no, y por eso no puede usar las vistas de
 * empresa sin elegir una antes.
 */
export async function requireEmpresa(): Promise<Sesion & { empresaId: string }> {
  const sesion = await requireSesion();
  if (!sesion.empresaId) redirect("/intersim");
  return sesion as Sesion & { empresaId: string };
}

/** El `Tenant` que espera `withTenant`. */
export function tenantDe(sesion: Sesion) {
  return { empresaId: sesion.empresaId, rol: sesion.rol };
}
