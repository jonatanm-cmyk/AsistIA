import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { inicioPara } from "@/components/shell/nav";

/**
 * "/" no pinta nada: reparte. Cada rol tiene su propio inicio y así el
 * dashboard de empresa y el de plataforma son dos rutas distintas, cada una con
 * sus datos y su caché, en vez de una página que decide por dentro qué mostrar.
 */
export default async function Raiz() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  redirect(inicioPara(sesion.rol));
}
