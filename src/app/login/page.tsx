import { redirect } from "next/navigation";
import { Bot } from "lucide-react";
import { getSesion, getUsuarioAuth } from "@/lib/session";
import { inicioPara } from "@/components/shell/nav";
import FormularioLogin from "./FormularioLogin";
import CuentaNoHabilitada from "./CuentaNoHabilitada";

export const metadata = { title: "Entrar" };

/**
 * La decisión de "¿ya tiene sesión?" se toma AQUÍ, en el servidor, con la misma
 * función que usa el resto de la app (`getSesion()`).
 *
 * Antes la tomaba también el middleware, con un criterio más laxo —le bastaba
 * la sesión de Supabase—, y en cuanto los dos criterios discrepaban el
 * navegador entraba en bucle: el middleware echaba de /login hacia /, y / hacía
 * el camino inverso. Una sola autoridad, ningún bucle posible.
 *
 * Los tres estados posibles se resuelven aquí, y son distintos:
 *   · sesión completa   -> a su inicio según el rol
 *   · autenticado pero sin dar de alta en AsistIA -> se le explica
 *   · nadie             -> el formulario
 */
export default async function LoginPage() {
  const usuarioAuth = await getUsuarioAuth();
  // Solo se consulta la base si hay alguien autenticado: para un visitante
  // anónimo, /login no toca Postgres.
  const sesion = usuarioAuth ? await getSesion() : null;

  if (sesion) redirect(inicioPara(sesion.rol));

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <Bot className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold text-ink">AsistIA</h1>
          <p className="mt-1 text-sm text-ink-soft">Backoffice de tu agente</p>
        </div>

        {usuarioAuth ? (
          <CuentaNoHabilitada email={usuarioAuth.email ?? "esta cuenta"} />
        ) : (
          <>
            <FormularioLogin />
            <p className="mt-4 text-center text-xs text-ink-faint">
              ¿Sin cuenta? Intersim da de alta las cuentas de empresa.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
