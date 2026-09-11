"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compacto, diaCorto, num } from "@/lib/format";

/**
 * Gráfico de líneas con crosshair y tooltip.
 *
 * Decisiones que no son cosméticas:
 *
 *  - UN SOLO EJE Y. Nunca dos escalas en el mismo gráfico: dos ejes hacen que
 *    dos series parezcan cruzarse cuando no lo hacen. Si necesitas comparar
 *    magnitudes distintas (mensajes y tokens), son dos gráficos.
 *  - Ancho medido con ResizeObserver en vez de un viewBox elástico. Estirar el
 *    viewBox deforma los trazos y el texto; medir cuesta unas líneas y da
 *    geometría correcta a cualquier ancho.
 *  - Los colores vienen de `--series-N` (paleta validada para daltonismo y
 *    contraste). Con dos o más series siempre hay leyenda: el color nunca es
 *    el único indicio de qué es qué.
 *  - Rejilla horizontal y nada más. Las verticales compiten con los datos.
 */

/**
 * El componente es genérico sobre la forma del punto para que `clave` solo
 * acepte campos que existan de verdad en los datos. Escribir
 * `{ clave: "mensajess" }` es un error de compilación, no un gráfico plano que
 * nadie nota hasta que alguien pregunta por qué la línea está en cero.
 */
export interface PuntoGrafico {
  fecha: string;
}

export interface SerieLinea<T extends PuntoGrafico> {
  clave: Extract<keyof T, string>;
  etiqueta: string;
  /** 1-4. Slot de la paleta categórica; se asignan en orden, nunca se ciclan. */
  slot: 1 | 2 | 3 | 4;
}

interface Props<T extends PuntoGrafico> {
  datos: T[];
  series: SerieLinea<T>[];
  /** Formato del valor en el tooltip y el eje. */
  compactarEje?: boolean;
  alto?: number;
}

const MARGEN = { top: 12, right: 12, bottom: 26, left: 44 };

export default function GraficoLineas<T extends PuntoGrafico>({
  datos,
  series,
  compactarEje = false,
  alto = 240,
}: Props<T>) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const [indiceActivo, setIndiceActivo] = useState<number | null>(null);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const ro = new ResizeObserver(([entrada]) => setAncho(entrada.contentRect.width));
    ro.observe(el);
    setAncho(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const w = Math.max(ancho, 320);
    const anchoPlot = w - MARGEN.left - MARGEN.right;
    const altoPlot = alto - MARGEN.top - MARGEN.bottom;

    const maximo = Math.max(
      1,
      ...datos.flatMap((d) => series.map((s) => Number(d[s.clave] ?? 0)))
    );
    // Techo "redondo" para que las marcas del eje sean números legibles.
    const techo = redondearArriba(maximo);

    const x = (i: number) =>
      MARGEN.left + (datos.length <= 1 ? anchoPlot / 2 : (i * anchoPlot) / (datos.length - 1));
    const y = (v: number) => MARGEN.top + altoPlot - (v / techo) * altoPlot;

    return { w, anchoPlot, altoPlot, techo, x, y };
  }, [ancho, alto, datos, series]);

  const vacio = datos.every((d) => series.every((s) => Number(d[s.clave] ?? 0) === 0));

  function alMover(e: React.MouseEvent<SVGSVGElement>) {
    if (!datos.length) return;
    const caja = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - caja.left;
    const rel = (px - MARGEN.left) / Math.max(geo.anchoPlot, 1);
    const i = Math.round(rel * (datos.length - 1));
    setIndiceActivo(Math.min(datos.length - 1, Math.max(0, i)));
  }

  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => geo.techo * f);
  // Como mucho 6 etiquetas en el eje X, repartidas.
  const pasoX = Math.max(1, Math.ceil(datos.length / 6));

  return (
    <div ref={contenedor} className="relative w-full">
      {series.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-4">
          {series.map((s) => (
            <span key={s.clave} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: `var(--series-${s.slot})` }}
              />
              {s.etiqueta}
            </span>
          ))}
        </div>
      )}

      {vacio ? (
        <div
          className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-ink-faint"
          style={{ height: alto }}
        >
          Sin actividad en el periodo
        </div>
      ) : (
        <svg
          width="100%"
          height={alto}
          viewBox={`0 0 ${geo.w} ${alto}`}
          onMouseMove={alMover}
          onMouseLeave={() => setIndiceActivo(null)}
          role="img"
          aria-label={`Evolución de ${series.map((s) => s.etiqueta).join(" y ")}`}
          className="overflow-visible"
        >
          {/* Rejilla y marcas del eje Y */}
          {marcas.map((valor, i) => (
            <g key={i}>
              <line
                x1={MARGEN.left}
                x2={geo.w - MARGEN.right}
                y1={geo.y(valor)}
                y2={geo.y(valor)}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text
                x={MARGEN.left - 8}
                y={geo.y(valor)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--text-muted)"
                className="tabular"
              >
                {compactarEje ? compacto(valor) : num(Math.round(valor))}
              </text>
            </g>
          ))}

          {/* Eje X */}
          {datos.map((d, i) =>
            i % pasoX === 0 || i === datos.length - 1 ? (
              <text
                key={d.fecha}
                x={geo.x(i)}
                y={alto - 8}
                textAnchor={i === 0 ? "start" : i === datos.length - 1 ? "end" : "middle"}
                fontSize={10}
                fill="var(--text-muted)"
              >
                {diaCorto(d.fecha)}
              </text>
            ) : null
          )}

          {/* Crosshair bajo las líneas, para no taparlas */}
          {indiceActivo !== null && (
            <line
              x1={geo.x(indiceActivo)}
              x2={geo.x(indiceActivo)}
              y1={MARGEN.top}
              y2={alto - MARGEN.bottom}
              stroke="var(--axis)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {series.map((s) => {
            const d = datos
              .map((p, i) => `${i === 0 ? "M" : "L"} ${geo.x(i)} ${geo.y(Number(p[s.clave] ?? 0))}`)
              .join(" ");
            return (
              <path
                key={s.clave}
                d={d}
                fill="none"
                stroke={`var(--series-${s.slot})`}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Marcador solo en el punto activo: un punto en cada dato es ruido */}
          {indiceActivo !== null &&
            series.map((s) => (
              <circle
                key={s.clave}
                cx={geo.x(indiceActivo)}
                cy={geo.y(Number(datos[indiceActivo][s.clave] ?? 0))}
                r={4}
                fill={`var(--series-${s.slot})`}
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            ))}
        </svg>
      )}

      {indiceActivo !== null && !vacio && (
        <Tooltip
          punto={datos[indiceActivo]}
          series={series}
          izquierda={geo.x(indiceActivo)}
          anchoTotal={geo.w}
        />
      )}
    </div>
  );
}

function Tooltip<T extends PuntoGrafico>({
  punto,
  series,
  izquierda,
  anchoTotal,
}: {
  punto: T;
  series: SerieLinea<T>[];
  izquierda: number;
  anchoTotal: number;
}) {
  // Se ancla al lado contrario cuando se acerca al borde, para no salirse.
  const alaDerecha = izquierda > anchoTotal / 2;
  return (
    <div
      className="pointer-events-none absolute top-8 z-10 min-w-[9rem] rounded-xl border border-slate-200 bg-white p-3 shadow-card"
      style={
        alaDerecha
          ? { right: Math.max(8, anchoTotal - izquierda + 12) }
          : { left: izquierda + 12 }
      }
    >
      <p className="mb-1.5 text-xs font-semibold text-ink">{diaCorto(punto.fecha)}</p>
      <ul className="space-y-1">
        {series.map((s) => (
          <li key={s.clave} className="flex items-center justify-between gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: `var(--series-${s.slot})` }}
              />
              {s.etiqueta}
            </span>
            <span className="font-semibold tabular text-ink">
              {num(Number(punto[s.clave] ?? 0))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 137 -> 150, 1_340 -> 1_500. Marcas de eje que se leen sin esfuerzo. */
function redondearArriba(n: number): number {
  if (n <= 5) return 5;
  const magnitud = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / (magnitud / 2)) * (magnitud / 2);
}
