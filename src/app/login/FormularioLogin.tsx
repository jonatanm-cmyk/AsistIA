"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function FormularioLogin() {
  return (
    <Suspense>
      <Formulario />
    </Suspense>
  );
}

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const destino = params.get("destino") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });

    if (err) {
      // El mensaje de Supabase es genérico a propósito (no revela si el correo
      // existe). Lo traducimos sin añadir información.
      setError(
        err.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : "No se pudo iniciar sesión. Inténtalo de nuevo."
      );
      setCargando(false);
      return;
    }

    // replace + refresh: replace para que "atrás" no vuelva al login, refresh
    // para que los Server Components se re-rendericen ya con la sesión.
    router.replace(destino);
    router.refresh();
  }

  return (
    <form onSubmit={entrar} className="card card-pad space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@empresa.com"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      <button type="submit" disabled={cargando} className="btn-primary w-full">
        {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
        {cargando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
