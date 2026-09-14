import clsx from "clsx";
import Link from "next/link";

/**
 * Primitivas de interfaz. Todas son Server Components (ninguna lleva "use
 * client"), así que no suman nada al bundle del navegador.
 */

// ---------------------------------------------------------------------------
// Contenedores
// ---------------------------------------------------------------------------
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <section className={clsx("card", className)}>{children}</section>;
}

export function CardHeader({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-xs text-ink-soft">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

export function PageHeader({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-ink-soft">{descripcion}</p>}
      </div>
      {acciones && <div className="flex items-center gap-2">{acciones}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
type TonoBadge = "neutro" | "bien" | "aviso" | "serio" | "critico" | "marca";

const CLASES_BADGE: Record<TonoBadge, string> = {
  neutro: "bg-slate-100 text-ink-muted ring-slate-200",
  bien: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  aviso: "bg-amber-50 text-amber-700 ring-amber-200",
  serio: "bg-orange-50 text-orange-700 ring-orange-200",
  critico: "bg-red-50 text-red-700 ring-red-200",
  marca: "bg-brand-50 text-brand-700 ring-brand-200",
};

export function Badge({
  children,
  tono = "neutro",
  icono,
}: {
  children: React.ReactNode;
  tono?: TonoBadge;
  icono?: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        CLASES_BADGE[tono]
      )}
    >
      {icono}
      {children}
    </span>
  );
}

/**
 * Traduce un literal de la base a etiqueta + tono. Un solo sitio: si el color
 * de un estado se decide en cada vista, acaban discrepando.
 *
 * El color nunca va solo — siempre acompaña a la palabra, que es la que
 * realmente comunica el estado a quien no distingue los tonos.
 */
const MAPA_ESTADOS: Record<string, { etiqueta: string; tono: TonoBadge }> = {
  // Empresa
  ACTIVA: { etiqueta: "Activa", tono: "bien" },
  PENDIENTE: { etiqueta: "Pendiente", tono: "aviso" },
  DESACTIVADA: { etiqueta: "Desactivada", tono: "neutro" },
  // Usuario
  ACTIVO: { etiqueta: "Activo", tono: "bien" },
  BLOQUEADO: { etiqueta: "Bloqueado", tono: "critico" },
  // Canal
  HABILITADO: { etiqueta: "Habilitado", tono: "bien" },
  DESHABILITADO: { etiqueta: "Deshabilitado", tono: "neutro" },
  // Documento
  INGESTANDO: { etiqueta: "Procesando", tono: "marca" },
  INGESTADO: { etiqueta: "Listo", tono: "bien" },
  ERROR: { etiqueta: "Con error", tono: "critico" },
  RETIRADO: { etiqueta: "Retirado", tono: "neutro" },
  // Conversación
  ABIERTA: { etiqueta: "Abierta", tono: "marca" },
  CERRADA: { etiqueta: "Cerrada", tono: "neutro" },
  // Entrega del mensaje
  SENT: { etiqueta: "Enviado", tono: "neutro" },
  DELIVERED: { etiqueta: "Entregado", tono: "bien" },
  READ: { etiqueta: "Leído", tono: "bien" },
  FAILED: { etiqueta: "Falló", tono: "critico" },
  NO_APLICA: { etiqueta: "—", tono: "neutro" },
};

export function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  if (!estado) return <span className="text-xs text-ink-faint">—</span>;
  const info = MAPA_ESTADOS[estado] ?? {
    etiqueta: estado.replace(/_/g, " ").toLowerCase(),
    tono: "neutro" as TonoBadge,
  };
  return <Badge tono={info.tono}>{info.etiqueta}</Badge>;
}

// ---------------------------------------------------------------------------
// Vacíos, errores y carga
// ---------------------------------------------------------------------------
export function EmptyState({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-semibold text-ink">{titulo}</p>
      {descripcion && <p className="max-w-md text-sm text-ink-soft">{descripcion}</p>}
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  );
}

export function Alerta({
  tono = "aviso",
  titulo,
  children,
}: {
  tono?: "aviso" | "critico" | "info";
  titulo: string;
  children?: React.ReactNode;
}) {
  const clases = {
    aviso: "border-amber-200 bg-amber-50 text-amber-900",
    critico: "border-red-200 bg-red-50 text-red-900",
    info: "border-brand-200 bg-brand-50 text-brand-900",
  }[tono];
  return (
    <div className={clsx("rounded-xl border px-4 py-3 text-sm", clases)}>
      <p className="font-semibold">{titulo}</p>
      {children && <div className="mt-1 text-[13px] opacity-90">{children}</div>}
    </div>
  );
}

/** Marcador de carga. Lo usan los `loading.tsx` y los `fallback` de Suspense. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={clsx("animate-pulse rounded-lg bg-slate-200/70", className)} style={style} />
  );
}

export function SkeletonTarjeta() {
  return (
    <div className="card card-pad space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function SkeletonGrafico({ alto = "h-64" }: { alto?: string }) {
  return (
    <div className="card card-pad space-y-4">
      <Skeleton className="h-3 w-40" />
      <Skeleton className={clsx("w-full", alto)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabla
// ---------------------------------------------------------------------------
export function Tabla({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-slate-200 bg-slate-50/60">
      <tr>{children}</tr>
    </thead>
  );
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

/**
 * Las clases se escriben enteras a propósito. Tailwind escanea el código como
 * texto: una clase construida (`text-${alineacion}`) no aparece en el CSS
 * generado y el estilo se pierde en producción sin dar ningún error.
 */
const ALINEACION = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

type Alineacion = keyof typeof ALINEACION;

export function Th({
  children,
  alineacion = "left",
}: {
  children?: React.ReactNode;
  alineacion?: Alineacion;
}) {
  return <th className={clsx("th", ALINEACION[alineacion])}>{children}</th>;
}

export function Td({
  children,
  className,
  alineacion = "left",
}: {
  children?: React.ReactNode;
  className?: string;
  alineacion?: Alineacion;
}) {
  return <td className={clsx("td", ALINEACION[alineacion], className)}>{children}</td>;
}

export function FilaVacia({ columnas, mensaje }: { columnas: number; mensaje: string }) {
  return (
    <tr>
      <td colSpan={columnas} className="px-4 py-10 text-center text-sm text-ink-soft">
        {mensaje}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Botones que navegan
// ---------------------------------------------------------------------------
const VARIANTES_BOTON = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
} as const;

export function BotonEnlace({
  href,
  children,
  variante = "secondary",
}: {
  href: string;
  children: React.ReactNode;
  variante?: keyof typeof VARIANTES_BOTON;
}) {
  return (
    <Link href={href} className={VARIANTES_BOTON[variante]}>
      {children}
    </Link>
  );
}
