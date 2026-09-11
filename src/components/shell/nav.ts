import type { Rol } from "@/types/asistia";
import { MOSTRAR_CONVERSACIONES } from "@/lib/alcance";

/**
 * EL PUNTO DE EXTENSIÓN DE LA NAVEGACIÓN.
 *
 * Añadir una vista al backoffice son dos cosas: una carpeta con su `page.tsx`
 * bajo `src/app/(app)/`, y una entrada aquí. Nada más: no hay switch gigante,
 * no hay estado global de pestaña activa, y la ruta activa se deduce del
 * pathname.
 *
 * `roles` es una lista blanca. Vacía no existe: si algo es para todos, pon los
 * dos roles explícitamente — así se lee qué ve cada quien sin interpretar.
 */
export interface ItemNav {
  href: string;
  etiqueta: string;
  icono: NombreIcono;
  roles: Rol[];
  /** Coincidencia exacta en vez de por prefijo. Para rutas raíz como "/". */
  exacto?: boolean;
  /** Fuera del menú, pero la ruta sigue viva. */
  oculto?: boolean;
}

export interface SeccionNav {
  titulo: string;
  items: ItemNav[];
}

/**
 * `oculto` saca la entrada del menú SIN borrar la ruta. La página sigue
 * existiendo y respondiendo: quien tenga el enlace entra. Ver `lib/alcance.ts`
 * para el porqué de cada una.
 */

export type NombreIcono =
  | "panel"
  | "bot"
  | "libro"
  | "whatsapp"
  | "chat"
  | "consumo"
  | "edificio"
  | "globo";

export const SECCIONES: SeccionNav[] = [
  {
    titulo: "Mi empresa",
    items: [
      { href: "/panel", etiqueta: "Resumen", icono: "panel", roles: ["ADMIN_EMPRESA"] },
      { href: "/agente", etiqueta: "Mi agente", icono: "bot", roles: ["ADMIN_EMPRESA"] },
      {
        href: "/conocimiento",
        etiqueta: "Base de conocimiento",
        icono: "libro",
        roles: ["ADMIN_EMPRESA"],
      },
      { href: "/canal", etiqueta: "Canal de WhatsApp", icono: "whatsapp", roles: ["ADMIN_EMPRESA"] },
      {
        href: "/conversaciones",
        etiqueta: "Conversaciones",
        icono: "chat",
        roles: ["ADMIN_EMPRESA"],
        // D44: se atienden en Chatwoot, no aquí. La ruta se conserva como
        // herramienta de depuración (es la única que muestra qué fragmentos
        // citó el agente). Ver `lib/alcance.ts`.
        oculto: !MOSTRAR_CONVERSACIONES,
      },
      { href: "/uso", etiqueta: "Consumo y plan", icono: "consumo", roles: ["ADMIN_EMPRESA"] },
    ],
  },
  {
    titulo: "Intersim",
    items: [
      { href: "/intersim", etiqueta: "Plataforma", icono: "globo", roles: ["INTERSIM"], exacto: true },
      {
        href: "/intersim/empresas",
        etiqueta: "Empresas",
        icono: "edificio",
        roles: ["INTERSIM"],
      },
    ],
  },
];

/** Las secciones que este rol puede ver, ya filtradas y sin secciones vacías. */
export function seccionesPara(rol: Rol): SeccionNav[] {
  return SECCIONES.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.oculto && i.roles.includes(rol)),
  })).filter((s) => s.items.length > 0);
}

/** Dónde aterriza cada rol al entrar por "/". */
export function inicioPara(rol: Rol): string {
  return rol === "INTERSIM" ? "/intersim" : "/panel";
}

/** Título de la ruta actual, para el breadcrumb del Topbar. */
export function tituloDeRuta(pathname: string): string {
  for (const seccion of SECCIONES) {
    for (const item of seccion.items) {
      if (item.exacto ? pathname === item.href : pathname.startsWith(item.href)) {
        return item.etiqueta;
      }
    }
  }
  return "Backoffice";
}
