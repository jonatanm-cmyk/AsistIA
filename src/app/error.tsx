"use client";

import { useEffect } from "react";
import { AlertOctagon, RotateCw } from "lucide-react";

/**
 * Frontera de error de toda la app.
 *
 * Distingue el fallo más común al montar esto —la cadena de conexión— del
 * resto, porque el mensaje genérico "algo salió mal" hace perder media hora
 * cuando lo que pasa es que falta una variable de entorno.
 */
export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[asistia]", error);
  }, [error]);

  const esConexion =
    /DATABASE_URL|ECONNREFUSED|ENOTFOUND|password authentication|SUPABASE|self.signed|getaddrinfo/i.test(
      error.message
    );

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="card card-pad w-full max-w-lg">
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-700">
          <AlertOctagon className="h-5 w-5" />
        </span>

        {esConexion ? (
          <>
            <h1 className="text-lg font-bold text-ink">No se pudo hablar con la base de datos</h1>
            <p className="mt-2 text-sm text-ink-soft">
              Revisa <code className="rounded bg-slate-100 px-1 py-0.5">.env.local</code>. Lo que
              falla casi siempre es una de estas cuatro:
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted">
              <li>
                El puerto: tiene que ser <strong>5432</strong>, no el 6543 del pooler.
              </li>
              <li>
                <code className="rounded bg-slate-100 px-1 py-0.5">sslmode=no-verify</code>, no{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5">require</code>.
              </li>
              <li>La contraseña, con los caracteres especiales codificados en porcentaje.</li>
              <li>
                Que el esquema <code className="rounded bg-slate-100 px-1 py-0.5">asistia</code>{" "}
                exista en esa base.
              </li>
            </ul>
            <p className="mt-3 text-xs text-ink-faint">
              Para comprobarlo sin adivinar: abre{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">/api/health</code>.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-ink">Algo se rompió en esta vista</h1>
            <p className="mt-2 text-sm text-ink-soft">
              El detalle está en la consola del servidor.
              {error.digest && (
                <>
                  {" "}
                  Referencia: <code className="rounded bg-slate-100 px-1 py-0.5">{error.digest}</code>
                </>
              )}
            </p>
          </>
        )}

        <button onClick={reset} className="btn-primary mt-5">
          <RotateCw className="h-4 w-4" />
          Reintentar
        </button>
      </div>
    </main>
  );
}
