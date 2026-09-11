"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Bot,
  Building2,
  Globe2,
  LayoutDashboard,
  Library,
  MessageSquare,
  Phone,
  Gauge,
  X,
} from "lucide-react";
import { seccionesPara, type NombreIcono } from "./nav";
import type { Rol } from "@/types/asistia";

const ICONOS: Record<NombreIcono, React.ComponentType<{ className?: string }>> = {
  panel: LayoutDashboard,
  bot: Bot,
  libro: Library,
  whatsapp: Phone,
  chat: MessageSquare,
  consumo: Gauge,
  edificio: Building2,
  globo: Globe2,
};

interface Props {
  rol: Rol;
  empresaNombre: string | null;
  abierto: boolean;
  onCerrar: () => void;
}

/**
 * Navegación lateral. Es un componente de cliente por dos razones concretas:
 * necesita `usePathname()` para marcar la ruta activa, y el cajón de móvil
 * tiene estado. Nada más del shell lo es.
 *
 * Cada entrada es un `<Link>`, no un botón que cambia estado: Next hace
 * prefetch del código y de los datos de la ruta cuando el enlace entra en
 * pantalla, así que al hacer clic la vista ya está descargada.
 */
export default function Sidebar({ rol, empresaNombre, abierto, onCerrar }: Props) {
  const pathname = usePathname();
  const secciones = seccionesPara(rol);

  return (
    <>
      {abierto && (
        <button
          aria-label="Cerrar menú"
          onClick={onCerrar}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white",
          "transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          abierto ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
          <Link href="/" className="flex items-center gap-2.5" onClick={onCerrar}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Bot className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold text-ink">AsistIA</span>
              <span className="block text-[11px] uppercase tracking-wider text-ink-faint">
                {rol === "INTERSIM" ? "Intersim Tech" : "Backoffice"}
              </span>
            </span>
          </Link>
          <button
            onClick={onCerrar}
            aria-label="Cerrar menú"
            className="rounded-lg p-1.5 text-ink-soft hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {empresaNombre && (
          <div className="border-b border-slate-100 px-5 py-3">
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">Empresa</p>
            <p className="truncate text-sm font-semibold text-ink" title={empresaNombre}>
              {empresaNombre}
            </p>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {secciones.map((seccion) => (
            <div key={seccion.titulo} className="mb-5">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                {seccion.titulo}
              </p>
              <ul className="space-y-0.5">
                {seccion.items.map((item) => {
                  const Icono = ICONOS[item.icono];
                  const activo = item.exacto
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onCerrar}
                        aria-current={activo ? "page" : undefined}
                        className={clsx(
                          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                          activo
                            ? "bg-brand-50 text-brand-700"
                            : "text-ink-muted hover:bg-slate-50 hover:text-ink"
                        )}
                      >
                        <span
                          className={clsx(
                            "flex h-8 w-8 items-center justify-center rounded-lg transition",
                            activo
                              ? "bg-brand-100 text-brand-700"
                              : "bg-slate-100 text-ink-soft group-hover:bg-slate-200"
                          )}
                        >
                          <Icono className="h-4 w-4" />
                        </span>
                        {item.etiqueta}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
