"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
// Desde un módulo compartido: `diasDeParams` la necesitan también las páginas,
// que son de servidor, y no puede exportarse desde aquí.
import { OPCIONES_PERIODO, diasDeParams } from "./rango";

/**
 * Selector de periodo. Escribe el rango en la URL, no en estado de React.
 *
 * Eso da tres cosas gratis: el rango se comparte pegando el enlace, "atrás"
 * vuelve al rango anterior, y los datos se recalculan en el servidor —el
 * navegador no recibe las 90 filas para filtrarlas él.
 *
 * `useTransition` mantiene la vista anterior visible mientras llega la nueva,
 * con el indicador de carga al lado. Sin él la pantalla parpadearía a vacío.
 */
export default function RangoPeriodo() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = useTransition();

  const actual = diasDeParams(params.get("dias") ?? undefined);

  function elegir(dias: number) {
    const nuevos = new URLSearchParams(params);
    nuevos.set("dias", String(dias));
    iniciar(() => router.replace(`${pathname}?${nuevos}`, { scroll: false }));
  }

  return (
    <div className="flex items-center gap-2">
      {pendiente && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
      <div
        role="group"
        aria-label="Periodo"
        className="inline-flex rounded-xl border border-slate-300 bg-white p-0.5"
      >
        {OPCIONES_PERIODO.map((o) => (
          <button
            key={o.dias}
            onClick={() => elegir(o.dias)}
            aria-pressed={actual === o.dias}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              actual === o.dias
                ? "bg-brand-600 text-white"
                : "text-ink-muted hover:bg-slate-100 hover:text-ink"
            )}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}
