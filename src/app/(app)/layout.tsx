import AppShell from "@/components/shell/AppShell";
import { requireSesion } from "@/lib/session";

/**
 * Layout del backoffice.
 *
 * Resuelve la sesión EN EL SERVIDOR y se la pasa ya hecha al shell. Consecuencia
 * práctica: el HTML que llega al navegador ya trae el menú correcto para el rol.
 * No hay un momento en que la pantalla esté montada pero vacía esperando a un
 * fetch, que es de donde salía la lentitud percibida del panel anterior.
 *
 * Este layout NO se vuelve a ejecutar al navegar entre vistas del grupo: Next
 * mantiene el shell montado y solo cambia el contenido. Una navegación es una
 * consulta a la vista nueva, no un remontaje del panel entero.
 */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sesion = await requireSesion();
  return <AppShell sesion={sesion}>{children}</AppShell>;
}
