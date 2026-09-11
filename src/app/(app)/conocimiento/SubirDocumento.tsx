"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, FileUp, Loader2, TriangleAlert, Type } from "lucide-react";
import clsx from "clsx";
import { subirDocumento, type ResultadoAccion } from "./actions";

/**
 * Alta de documento. Dos formas de la misma cosa: subir un archivo o pegar
 * texto. Se separan en pestañas porque los campos no se solapan y un formulario
 * con la mitad de los campos deshabilitados se lee peor.
 */
export default function SubirDocumento() {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    subirDocumento,
    null
  );
  const [modo, setModo] = useState<"archivo" | "texto">("archivo");

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="modo" value={modo} />

      <div
        role="tablist"
        aria-label="Cómo añadir el documento"
        className="inline-flex rounded-xl border border-slate-300 bg-white p-0.5"
      >
        {(
          [
            { valor: "archivo", etiqueta: "Subir archivo", icono: FileUp },
            { valor: "texto", etiqueta: "Pegar texto", icono: Type },
          ] as const
        ).map(({ valor, etiqueta, icono: Icono }) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={modo === valor}
            onClick={() => setModo(valor)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              modo === valor
                ? "bg-brand-600 text-white"
                : "text-ink-muted hover:bg-slate-100 hover:text-ink"
            )}
          >
            <Icono className="h-3.5 w-3.5" />
            {etiqueta}
          </button>
        ))}
      </div>

      {estado && (
        <div
          role="status"
          className={clsx(
            "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
            estado.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          )}
        >
          {estado.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{estado.ok ? estado.mensaje : estado.error}</span>
        </div>
      )}

      {modo === "archivo" ? (
        <div>
          <label className="label" htmlFor="archivo">
            Archivo
          </label>
          <input
            id="archivo"
            name="archivo"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0
                       file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold
                       file:text-brand-700 hover:file:bg-brand-100"
          />
          <p className="mt-1.5 text-xs text-ink-faint">
            PDF o DOCX, hasta 20 MB. Si subes el mismo archivo dos veces se actualiza, no se
            duplica.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="nombre">
              Título
            </label>
            <input
              id="nombre"
              name="nombre"
              className="input"
              required
              maxLength={255}
              placeholder="Preguntas frecuentes de envíos"
            />
          </div>
          <div>
            <label className="label" htmlFor="contenido">
              Texto
            </label>
            <textarea
              id="contenido"
              name="contenido"
              rows={8}
              required
              className="input resize-y"
              placeholder="Pega aquí el texto que el agente debe conocer…"
            />
          </div>
        </div>
      )}

      <BotonSubir modo={modo} />
    </form>
  );
}

function BotonSubir({ modo }: { modo: "archivo" | "texto" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? "Registrando…" : modo === "archivo" ? "Subir documento" : "Guardar texto"}
    </button>
  );
}
