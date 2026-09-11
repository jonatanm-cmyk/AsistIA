"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Callejón sin salida con salida.
 *
 * Se ve cuando alguien tiene cuenta en Supabase Auth pero no fila en
 * `asistia.usuarios` (o la tiene BLOQUEADO). Antes esta situación no se veía:
 * el navegador rebotaba entre / y /login hasta agotarse.
 *
 * Lo único que se puede hacer desde aquí es cerrar sesión, así que eso es lo
 * único que ofrece.
 */
export default function CuentaNoHabilitada({ email }: { email: string }) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    await createClient().auth.signOut();
    router.refresh();
  }

  return (
    <div className="card card-pad text-center">
      <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
        <ShieldAlert className="h-5 w-5" />
      </span>

      <h2 className="text-base font-bold text-ink">Tu cuenta aún no está habilitada</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Entraste correctamente con <strong className="text-ink">{email}</strong>, pero esa
        cuenta todavía no está dada de alta en AsistIA. Pídeselo a quien administra la
        plataforma.
      </p>

      <button onClick={salir} disabled={saliendo} className="btn-secondary mt-5 w-full">
        {saliendo && <Loader2 className="h-4 w-4 animate-spin" />}
        {saliendo ? "Cerrando…" : "Cerrar sesión y entrar con otra cuenta"}
      </button>
    </div>
  );
}
