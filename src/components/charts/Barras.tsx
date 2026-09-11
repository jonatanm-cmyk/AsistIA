import clsx from "clsx";
import { num, porcentaje } from "@/lib/format";

/**
 * Barras horizontales con etiqueta directa.
 *
 * Por qué horizontales: las categorías tienen nombre ("El agente no supo",
 * "Lo frenó el guardarraíl") y en vertical habría que rotar el texto. Y por
 * qué etiqueta directa en vez de tooltip: son pocas barras y el valor cabe;
 * un tooltip escondería el dato tras una interacción innecesaria.
 *
 * Es un Server Component: cero JavaScript en el navegador.
 */

export interface BarraDato {
  etiqueta: string;
  valor: number;
  /** Texto secundario a la derecha del valor (p. ej. el porcentaje). */
  detalle?: string;
  /** Slot de la paleta. Por defecto todas comparten el slot 1: no son series
   *  distintas, son la misma medida partida en categorías. */
  slot?: 1 | 2 | 3 | 4;
}

export function Barras({
  datos,
  mostrarPorcentaje = false,
  vacio = "Sin datos en el periodo",
}: {
  datos: BarraDato[];
  mostrarPorcentaje?: boolean;
  vacio?: string;
}) {
  if (datos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-faint">{vacio}</p>
    );
  }

  const maximo = Math.max(...datos.map((d) => d.valor), 1);
  const total = datos.reduce((s, d) => s + d.valor, 0);

  return (
    <ul className="space-y-3.5">
      {datos.map((d) => {
        const ancho = Math.max((d.valor / maximo) * 100, d.valor > 0 ? 1.5 : 0);
        return (
          <li key={d.etiqueta}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-ink" title={d.etiqueta}>
                {d.etiqueta}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular text-ink">
                {num(d.valor)}
                {(mostrarPorcentaje || d.detalle) && (
                  <span className="ml-1.5 text-xs font-normal text-ink-faint">
                    {d.detalle ?? porcentaje(total ? (d.valor / total) * 100 : 0)}
                  </span>
                )}
              </span>
            </div>
            {/* La barra arranca en la línea base y termina en punta redondeada:
                el extremo redondo marca dónde acaba el dato de verdad. */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${ancho}%`,
                  background: `var(--series-${d.slot ?? 1})`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Medidor de cuota. Un solo valor contra un tope conocido.
 *
 * El color cambia de tono al acercarse al límite, pero el número y el texto
 * dicen lo mismo: quien no distinga los tonos lee igual que quien sí.
 */
export function Medidor({
  etiqueta,
  usado,
  tope,
  unidad = "",
}: {
  etiqueta: string;
  usado: number;
  tope: number | null;
  unidad?: string;
}) {
  if (!tope) {
    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-sm text-ink-muted">{etiqueta}</span>
          <span className="text-sm font-semibold tabular text-ink">
            {num(usado)} {unidad}
          </span>
        </div>
        <p className="text-xs text-ink-faint">Sin plan vigente: no hay cuota que comparar.</p>
      </div>
    );
  }

  const pct = (usado / tope) * 100;
  const nivel = pct >= 100 ? "excedido" : pct >= 80 ? "cerca" : "holgado";
  const color = {
    holgado: "var(--series-1)",
    cerca: "var(--status-warning)",
    excedido: "var(--status-critical)",
  }[nivel];
  const leyenda = {
    holgado: "dentro del plan",
    cerca: "cerca del límite",
    excedido: "cuota superada",
  }[nivel];

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-muted">{etiqueta}</span>
        <span className="text-sm font-semibold tabular text-ink">
          {num(usado)} <span className="font-normal text-ink-faint">/ {num(tope)} {unidad}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
      <p
        className={clsx(
          "mt-1.5 text-xs",
          nivel === "excedido"
            ? "font-semibold text-red-700"
            : nivel === "cerca"
              ? "font-semibold text-amber-700"
              : "text-ink-faint"
        )}
      >
        {porcentaje(pct, 1)} — {leyenda}
      </p>
    </div>
  );
}
