"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import type { Sesion } from "@/types/asistia";

/**
 * El marco: barra lateral + barra superior + el hueco donde entra cada vista.
 *
 * Es cliente solo porque guarda si el cajón de móvil está abierto. La sesión
 * llega ya resuelta desde el layout de servidor, así que este componente no
 * hace ni una llamada: no hay parpadeo de "cargando sesión" ni un fetch en el
 * navegador antes de poder pintar el menú.
 *
 * `children` son Server Components. Al navegar, Next reemplaza solo ese hueco
 * y mantiene montados el sidebar y la topbar: ni se repintan ni pierden scroll.
 */
export default function AppShell({
  sesion,
  children,
}: {
  sesion: Sesion;
  children: React.ReactNode;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface-muted">
      <Sidebar
        rol={sesion.rol}
        empresaNombre={sesion.rol === "ADMIN_EMPRESA" ? sesion.empresaNombre : null}
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar sesion={sesion} onAbrirMenu={() => setMenuAbierto(true)} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
