"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, GripVertical, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { guardarAgente, type ResultadoAccion } from "./actions";
import {
  TIPOS_REGLA,
  ETIQUETA_TIPO_REGLA,
  TONOS_SUGERIDOS,
  type TipoRegla,
} from "@/types/asistia";
// Solo el tipo: `import type` se borra al compilar, así que no arrastra el
// módulo server-only al bundle del navegador.
import type { ConfiguracionConReglas } from "@/lib/queries/agente";

interface ReglaUI {
  tipo: TipoRegla;
  texto: string;
  activa: boolean;
}

/**
 * Formulario de configuración del agente.
 *
 * Guardar NO edita: crea la versión N+1 y desactiva la anterior. La UI lo dice
 * en voz alta porque cambia lo que el usuario espera del botón — y porque poder
 * ver qué versión estaba vigente cuando el agente dijo algo raro es justo lo
 * que hace auditable al sistema.
 */
export default function FormularioAgente({
  configuracion,
}: {
  configuracion: ConfiguracionConReglas | null;
}) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    guardarAgente,
    null
  );

  const [reglas, setReglas] = useState<ReglaUI[]>(
    configuracion?.reglas.map((r) => ({ tipo: r.tipo, texto: r.texto, activa: r.activa })) ?? []
  );

  function actualizar(i: number, cambio: Partial<ReglaUI>) {
    setReglas((prev) => prev.map((r, j) => (j === i ? { ...r, ...cambio } : r)));
  }

  function mover(i: number, direccion: -1 | 1) {
    const destino = i + direccion;
    if (destino < 0 || destino >= reglas.length) return;
    setReglas((prev) => {
      const copia = [...prev];
      [copia[i], copia[destino]] = [copia[destino], copia[i]];
      return copia;
    });
  }

  return (
    <form action={accion} className="space-y-5">
      {/* El orden del array ES el orden de las reglas en el prompt. */}
      <input type="hidden" name="reglas" value={JSON.stringify(reglas)} />

      {estado && (
        <div
          role="status"
          className={
            estado.ok
              ? "flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              : "flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          }
        >
          {estado.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{estado.ok ? estado.mensaje : estado.error}</span>
        </div>
      )}

      <section className="card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Identidad y tono</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Cómo se presenta y cómo habla. Es lo primero que entra al prompt.
          </p>
        </div>
        <div className="card-pad grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="nombre_agente">
              Nombre del agente
            </label>
            <input
              id="nombre_agente"
              name="nombre_agente"
              className="input"
              required
              maxLength={255}
              defaultValue={configuracion?.nombre_agente ?? "Asistente"}
            />
          </div>

          <div>
            <label className="label" htmlFor="idioma">
              Idioma
            </label>
            <select
              id="idioma"
              name="idioma"
              className="input"
              defaultValue={configuracion?.idioma ?? "es"}
            >
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="pt">Portugués</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="tono">
              Tono
            </label>
            <input
              id="tono"
              name="tono"
              className="input"
              required
              maxLength={100}
              list="tonos"
              defaultValue={configuracion?.tono ?? ""}
              placeholder="Cercano y claro"
            />
            <datalist id="tonos">
              {TONOS_SUGERIDOS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <p className="mt-1.5 text-xs text-ink-faint">
              Texto libre. Las sugerencias son solo eso: describe el tono con tus palabras.
            </p>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Reglas de negocio</h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Se aplican en orden. Las de arriba pesan más cuando dos se contradicen.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setReglas((p) => [...p, { tipo: "INSTRUCCION", texto: "", activa: true }])
            }
            className="btn-secondary shrink-0"
          >
            <Plus className="h-4 w-4" />
            Añadir
          </button>
        </div>

        <div className="card-pad space-y-3">
          {reglas.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-faint">
              Sin reglas. El agente responderá solo con tu base de conocimiento y el tono.
            </p>
          )}

          {reglas.map((regla, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-xl border border-slate-200 bg-surface-muted p-3"
            >
              <div className="flex flex-col items-center pt-1">
                <button
                  type="button"
                  onClick={() => mover(i, -1)}
                  disabled={i === 0}
                  aria-label="Subir regla"
                  className="rounded p-0.5 text-ink-faint hover:text-ink disabled:opacity-30"
                >
                  ▲
                </button>
                <GripVertical className="h-3.5 w-3.5 text-ink-faint" />
                <button
                  type="button"
                  onClick={() => mover(i, 1)}
                  disabled={i === reglas.length - 1}
                  aria-label="Bajar regla"
                  className="rounded p-0.5 text-ink-faint hover:text-ink disabled:opacity-30"
                >
                  ▼
                </button>
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={regla.tipo}
                    onChange={(e) => actualizar(i, { tipo: e.target.value as TipoRegla })}
                    className="input w-auto py-1.5 text-xs"
                    aria-label={`Tipo de la regla ${i + 1}`}
                  >
                    {TIPOS_REGLA.map((t) => (
                      <option key={t} value={t}>
                        {ETIQUETA_TIPO_REGLA[t]}
                      </option>
                    ))}
                  </select>

                  <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={regla.activa}
                      onChange={(e) => actualizar(i, { activa: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    Activa
                  </label>

                  <span className="ml-auto text-xs text-ink-faint tabular">#{i + 1}</span>
                </div>

                <textarea
                  value={regla.texto}
                  onChange={(e) => actualizar(i, { texto: e.target.value })}
                  rows={2}
                  maxLength={2000}
                  className="input resize-y text-sm"
                  placeholder={
                    regla.tipo === "PROHIBICION"
                      ? "No des precios sin confirmar el plan del cliente."
                      : regla.tipo === "ESCALAR_SI"
                        ? "El cliente pide hablar con facturación."
                        : "Si preguntan por horarios, di que atendemos de 8 a 18."
                  }
                />
              </div>

              <button
                type="button"
                onClick={() => setReglas((p) => p.filter((_, j) => j !== i))}
                aria-label={`Eliminar regla ${i + 1}`}
                className="rounded-lg p-1.5 text-ink-faint transition hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Límites de consumo</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Topes técnicos. Suben el coste si los subes, y cortan respuestas si los bajas de más.
          </p>
        </div>
        <div className="card-pad grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="max_tokens_respuesta">
              Tokens por respuesta
            </label>
            <input
              id="max_tokens_respuesta"
              name="max_tokens_respuesta"
              type="number"
              min={100}
              max={4000}
              step={50}
              className="input tabular"
              defaultValue={configuracion?.max_tokens_respuesta ?? 600}
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              600 da respuestas de WhatsApp de largo normal.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="tope_tokens_conversacion_dia">
              Tope diario por conversación
            </label>
            <input
              id="tope_tokens_conversacion_dia"
              name="tope_tokens_conversacion_dia"
              type="number"
              min={1000}
              max={500000}
              step={1000}
              className="input tabular"
              defaultValue={configuracion?.tope_tokens_conversacion_dia ?? 20000}
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              Freno contra una conversación que se dispara sola.
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-ink-faint">
          Guardar crea una versión nueva
          {configuracion ? ` (la v${configuracion.version + 1})` : ""} y desactiva la anterior. No
          se pierde nada.
        </p>
        <BotonGuardar />
      </div>
    </form>
  );
}

/**
 * `useFormStatus` tiene que vivir en un hijo del form: dentro del mismo
 * componente que renderiza el <form> siempre devolvería pending=false.
 */
function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary shrink-0">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? "Guardando…" : "Guardar versión"}
    </button>
  );
}
