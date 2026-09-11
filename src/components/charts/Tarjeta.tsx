import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { compacto, num, variacion } from "@/lib/format";

/**
 * Tarjeta de cifra (stat tile).
 *
 * Cuando el dato es UN número, un número es la forma correcta: un gráfico de
 * un solo valor no añade nada y cuesta más leerlo. La comparación con el
 * periodo anterior va al lado, no en otro widget.
 */

interface Props {
  etiqueta: string;
  valor: number;
  /** Valor del periodo anterior. Si se omite no se muestra variación. */
  anterior?: number;
  /** Texto bajo la cifra: unidad, aclaración o el periodo comparado. */
  pie?: string;
  icono?: React.ReactNode;
  /**
   * Qué significa que suba. "neutro" no colorea la variación: subir tokens no
   * es ni bueno ni malo, subir escalados sí es malo. Marcarlo evita que el
   * color mienta.
   */
  subirEs?: "bueno" | "malo" | "neutro";
  /** Cifras muy largas en formato compacto (12,5 k). */
  compactar?: boolean;
}

export function Tarjeta({
  etiqueta,
  valor,
  anterior,
  pie,
  icono,
  subirEs = "neutro",
  compactar = false,
}: Props) {
  const delta = anterior === undefined ? null : variacion(valor, anterior);

  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
          {etiqueta}
        </p>
        {icono && <span className="text-ink-faint">{icono}</span>}
      </div>

      <p className="mt-2 text-3xl font-bold tracking-tight text-ink">
        {compactar ? compacto(valor) : num(valor)}
      </p>

      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {delta !== null && <Delta valor={delta} subirEs={subirEs} />}
        {pie && <span className="text-ink-faint">{pie}</span>}
      </div>
    </div>
  );
}

function Delta({ valor, subirEs }: { valor: number; subirEs: "bueno" | "malo" | "neutro" }) {
  const sube = valor > 0.5;
  const baja = valor < -0.5;
  const plano = !sube && !baja;

  // El color solo se usa cuando la dirección tiene un significado acordado.
  const tono =
    subirEs === "neutro" || plano
      ? "text-ink-soft"
      : (sube && subirEs === "bueno") || (baja && subirEs === "malo")
        ? "text-emerald-700"
        : "text-red-700";

  const Icono = plano ? Minus : sube ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={clsx("inline-flex items-center gap-1 font-semibold tabular", tono)}>
      <Icono className="h-3.5 w-3.5" />
      {plano ? "sin cambio" : `${valor > 0 ? "+" : ""}${valor.toFixed(1)} %`}
    </span>
  );
}

/** Fila de tarjetas. Reflow automático, mínimo 200 px por tarjeta. */
export function FilaTarjetas({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}
