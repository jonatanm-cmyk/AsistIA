"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { retirar, type ResultadoAccion } from "./actions";

/**
 * Retirar un documento con confirmación en dos pasos.
 *
 * No es un `confirm()` del navegador: la acción borra los fragmentos, así que
 * el texto de confirmación tiene que decir qué pasa exactamente. Un diálogo
 * nativo no deja explicarlo.
 */
export default function BotonRetirar({ id, nombre }: { id: string; nombre: string }) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(retirar, null);
  const [confirmando, setConfirmando] = useState(false);

  if (estado && !estado.ok) {
    return <span className="text-xs text-red-700">{estado.error}</span>;
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="rounded-lg p-1.5 text-ink-faint transition hover:bg-red-50 hover:text-red-700"
        aria-label={`Retirar ${nombre}`}
        title="Retirar"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <form action={accion} className="flex items-center justify-end gap-1.5">
      <input type="hidden" name="id" value={id} />
      <span className="text-xs text-ink-soft">¿Retirar?</span>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-muted hover:bg-slate-100"
      >
        No
      </button>
      <Confirmar />
    </form>
  );
}

function Confirmar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg bg-status-critical px-2 py-1 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-60"
    >
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      Sí, retirar
    </button>
  );
}
