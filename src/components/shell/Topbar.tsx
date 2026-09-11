"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { tituloDeRuta } from "./nav";
import type { Sesion } from "@/types/asistia";

interface Props {
  sesion: Sesion;
  onAbrirMenu: () => void;
}

export default function Topbar({ sesion, onAbrirMenu }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  const iniciales = (sesion.nombre ?? sesion.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  async function cerrarSesion() {
    setSaliendo(true);
    await createClient().auth.signOut();
    // refresh() para que el middleware vuelva a evaluar y limpie el caché del
    // router; sin él Next podría servir la vista anterior desde caché.
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/85 px-4 backdrop-blur lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onAbrirMenu}
          aria-label="Abrir menú"
          className="rounded-lg p-2 text-ink-soft hover:bg-slate-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{tituloDeRuta(pathname)}</p>
          <p className="truncate text-xs text-ink-faint">
            {sesion.rol === "INTERSIM"
              ? "Vista de plataforma"
              : (sesion.empresaNombre ?? "Mi empresa")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-ink">{sesion.nombre ?? sesion.email}</p>
          <p className="text-xs text-ink-faint">
            {sesion.rol === "INTERSIM" ? "Intersim" : "Administrador"}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
          {iniciales}
        </span>
        <button
          onClick={cerrarSesion}
          disabled={saliendo}
          className="rounded-lg p-2 text-ink-soft transition hover:bg-slate-100 hover:text-status-critical disabled:opacity-50"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
