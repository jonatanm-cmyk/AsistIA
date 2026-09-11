"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { guardarCanal, type ResultadoAccion } from "./actions";
import { ESTADOS_CANAL, type Canal } from "@/types/asistia";

const ETIQUETA_ESTADO: Record<(typeof ESTADOS_CANAL)[number], string> = {
  PENDIENTE: "Pendiente de habilitar",
  HABILITADO: "Habilitado",
  DESHABILITADO: "Deshabilitado",
};

export default function FormularioCanal({ canal }: { canal: Canal | null }) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(guardarCanal, null);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="id" value={canal?.id ?? ""} />

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="display_phone_number">
            Número visible
          </label>
          <input
            id="display_phone_number"
            name="display_phone_number"
            className="input tabular"
            placeholder="+591 700 00000"
            defaultValue={canal?.display_phone_number ?? ""}
          />
          <p className="mt-1.5 text-xs text-ink-faint">Solo para mostrarlo. No se usa para enrutar.</p>
        </div>

        <div>
          <label className="label" htmlFor="estado">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            className="input"
            defaultValue={canal?.estado ?? "PENDIENTE"}
          >
            {ESTADOS_CANAL.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO[e]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="phone_number_id">
            Phone number ID
          </label>
          <input
            id="phone_number_id"
            name="phone_number_id"
            className="input tabular"
            placeholder="1234567890"
            defaultValue={canal?.phone_number_id ?? ""}
          />
          <p className="mt-1.5 text-xs text-ink-faint">Lo devuelve el onboarding de Meta.</p>
        </div>

        <div>
          <label className="label" htmlFor="waba_id">
            WABA ID
          </label>
          <input
            id="waba_id"
            name="waba_id"
            className="input tabular"
            placeholder="9876543210"
            defaultValue={canal?.waba_id ?? ""}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="chatwoot_inbox_id">
            Inbox de Chatwoot
          </label>
          <input
            id="chatwoot_inbox_id"
            name="chatwoot_inbox_id"
            type="number"
            min={1}
            className="input tabular"
            placeholder="42"
            defaultValue={canal?.chatwoot_inbox_id ?? ""}
          />
          <p className="mt-1.5 text-xs text-ink-faint">
            Es la pieza que enlaza un mensaje entrante con esta empresa. Sin esto el flujo no
            sabe de quién es la conversación.
          </p>
        </div>
      </div>

      <Guardar nuevo={!canal} />
    </form>
  );
}

function Guardar({ nuevo }: { nuevo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? "Guardando…" : nuevo ? "Registrar canal" : "Guardar cambios"}
    </button>
  );
}
