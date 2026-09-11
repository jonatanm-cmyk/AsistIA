"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import { Loader2, Search } from "lucide-react";

/**
 * Barra de filtros. Igual que el selector de periodo: el estado vive en la URL.
 *
 * La búsqueda usa `defaultValue` y se dispara al enviar (Enter), no en cada
 * tecla: un filtro por pulsación serían diez consultas mientras se escribe un
 * teléfono.
 */
export default function Filtros() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = useTransition();

  const estado = params.get("estado") ?? "TODAS";
  const escaladas = params.get("escaladas") === "1";
  const busqueda = params.get("q") ?? "";

  function aplicar(cambios: Record<string, string | null>) {
    const nuevos = new URLSearchParams(params);
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null || valor === "") nuevos.delete(clave);
      else nuevos.set(clave, valor);
    }
    // Cualquier cambio de filtro vuelve a la primera página: quedarse en la
    // página 4 de un resultado que ahora tiene 2 es una pantalla en blanco.
    nuevos.delete("p");
    iniciar(() => router.replace(`${pathname}?${nuevos}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const valor = new FormData(e.currentTarget).get("q");
          aplicar({ q: String(valor ?? "") });
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          name="q"
          defaultValue={busqueda}
          placeholder="Teléfono o nombre…"
          aria-label="Buscar conversación"
          className="input w-56 pl-9"
        />
      </form>

      <div
        role="group"
        aria-label="Estado"
        className="inline-flex rounded-xl border border-slate-300 bg-white p-0.5"
      >
        {[
          { valor: "TODAS", etiqueta: "Todas" },
          { valor: "ABIERTA", etiqueta: "Abiertas" },
          { valor: "CERRADA", etiqueta: "Cerradas" },
        ].map((o) => (
          <button
            key={o.valor}
            onClick={() => aplicar({ estado: o.valor === "TODAS" ? null : o.valor })}
            aria-pressed={estado === o.valor}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              estado === o.valor
                ? "bg-brand-600 text-white"
                : "text-ink-muted hover:bg-slate-100 hover:text-ink"
            )}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          checked={escaladas}
          onChange={(e) => aplicar({ escaladas: e.target.checked ? "1" : null })}
          className="h-4 w-4 rounded border-slate-300"
        />
        Solo escaladas
      </label>

      {pendiente && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
    </div>
  );
}
