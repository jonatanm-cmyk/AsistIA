/**
 * Definición del periodo, COMPARTIDA entre servidor y cliente.
 *
 * Vive en su propio archivo, sin "use client", a propósito: todo lo que exporta
 * un módulo marcado como cliente se convierte en una referencia de cliente, y
 * un Server Component que intente llamarlo falla en ejecución con
 * "Attempted to call X from the server but X is on the client".
 *
 * Regla general para este proyecto: si una función la necesitan los dos lados,
 * no puede vivir en el mismo archivo que el componente de cliente que la usa.
 */

export const OPCIONES_PERIODO = [
  { dias: 7, etiqueta: "7 días" },
  { dias: 30, etiqueta: "30 días" },
  { dias: 90, etiqueta: "90 días" },
] as const;

export const DIAS_VALIDOS: readonly number[] = OPCIONES_PERIODO.map((o) => o.dias);

export const DIAS_POR_DEFECTO = 30;

/**
 * Lee y valida `?dias=`. Cualquier cosa fuera de la lista cae al valor por
 * defecto: el parámetro viene de la URL, que la escribe quien quiera.
 */
export function diasDeParams(valor: string | string[] | undefined): number {
  const n = Number(Array.isArray(valor) ? valor[0] : valor);
  return DIAS_VALIDOS.includes(n) ? n : DIAS_POR_DEFECTO;
}
