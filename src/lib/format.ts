/** Formateo consistente en toda la app. Sin dependencias. */

const NUM = new Intl.NumberFormat("es-BO");
const NUM1 = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });

export const num = (n: number | null | undefined): string => NUM.format(n ?? 0);

/** 12500 -> "12,5 k". Para ejes y tarjetas donde el dígito exacto no aporta. */
export function compacto(n: number | null | undefined): string {
  const v = n ?? 0;
  if (Math.abs(v) >= 1_000_000) return `${NUM1.format(v / 1_000_000)} M`;
  if (Math.abs(v) >= 1_000) return `${NUM1.format(v / 1_000)} k`;
  return NUM.format(v);
}

export function porcentaje(n: number | null | undefined, decimales = 0): string {
  return `${(n ?? 0).toFixed(decimales)} %`;
}

export function moneda(valor: string | number | null | undefined, cod = "USD"): string {
  const n = typeof valor === "string" ? Number(valor) : (valor ?? 0);
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: cod,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function fecha(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fechaHora(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("es-BO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "hace 5 min", "hace 2 h", "hace 3 d". */
export function hace(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return "hace un momento";
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  if (seg < 2592000) return `hace ${Math.floor(seg / 86400)} d`;
  return fecha(d);
}

/** Variación porcentual. null cuando el periodo anterior fue 0 (no es "+100 %"). */
export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((actual - anterior) / anterior) * 100;
}

/** "2026-09-11", que es como `uso_diario.fecha` llega desde Postgres. */
export function claveDia(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Etiqueta corta de eje: "11 sep". */
export function diaCorto(clave: string): string {
  const [a, m, d] = clave.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-BO", {
    day: "numeric",
    month: "short",
  });
}
