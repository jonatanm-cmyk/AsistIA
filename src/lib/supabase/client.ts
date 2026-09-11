"use client";
import { createBrowserClient } from "@supabase/ssr";
import { exigirConfigPublica } from "./env";

/** Cliente de navegador. Solo se usa en la pantalla de login y al cerrar sesión. */
export function createClient() {
  const { url, key } = exigirConfigPublica();
  return createBrowserClient(url, key);
}
