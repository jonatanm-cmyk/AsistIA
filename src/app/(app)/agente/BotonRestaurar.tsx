"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, RotateCcw } from "lucide-react";
import { restaurarVersion, type ResultadoAccion } from "./actions";

/**
 * Restaurar una versión, en dos pasos.
 *
 * La confirmación no es ceremonia: restaurar cambia lo que el agente responde
 * a partir del siguiente mensaje. Y el texto dice que se crea una versión
 * nueva, porque es lo que va a ver en el historial justo después y si no lo
 * esperaba parecería un error.
 */
export default function BotonRestaurar({ id, version }: { id: string; version: number }) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    restaurarVersion,
    null
  );
  const [confirmando, setConfirmando] = useState(false);

  if (estado && !estado.ok) {
    return <span className="text-xs text-red-700">{estado.error}</span>;
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-muted transition hover:bg-brand-50 hover:text-brand-700"
        title={`Restaurar la v${version}`}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restaurar
      </button>
    );
  }

  return (
    <form action={accion} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="configuracion_id" value={id} />
      <p className="text-right text-[11px] leading-snug text-ink-soft">
        Se copiará la v{version} a una versión nueva y el agente pasará a usarla.
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-muted hover:bg-slate-100"
        >
          Cancelar
        </button>
        <Confirmar />
      </div>
    </form>
  );
}

function Confirmar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      Restaurar
    </button>
  );
}
