"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { editarEmpresa, type ResultadoAccion } from "./actions";
import { ESTADOS_EMPRESA, type Plan } from "@/types/asistia";
import type { FilaEmpresa } from "@/lib/queries/empresas";
import { moneda, num } from "@/lib/format";

const ETIQUETA_ESTADO = {
  PENDIENTE: "Pendiente — el agente no responde todavía",
  ACTIVA: "Activa — el agente atiende",
  DESACTIVADA: "Desactivada — el agente deja de responder",
} as const;

export default function FormularioEdicion({
  empresa,
  planes,
  planActualId,
}: {
  empresa: FilaEmpresa;
  planes: Plan[];
  planActualId: string | null;
}) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(editarEmpresa, null);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="id" value={empresa.id} />

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
        <div className="sm:col-span-2">
          <label className="label" htmlFor="nombre">
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            className="input"
            required
            defaultValue={empresa.nombre}
          />
        </div>

        <div>
          <label className="label" htmlFor="responsable_nombre">
            Responsable
          </label>
          <input
            id="responsable_nombre"
            name="responsable_nombre"
            className="input"
            required
            defaultValue={empresa.responsable_nombre}
          />
        </div>

        <div>
          <label className="label" htmlFor="responsable_email">
            Correo del responsable
          </label>
          <input
            id="responsable_email"
            name="responsable_email"
            type="email"
            className="input"
            required
            defaultValue={empresa.responsable_email}
          />
        </div>

        <div>
          <label className="label" htmlFor="chatwoot_account_id">
            Cuenta de Chatwoot
          </label>
          <input
            id="chatwoot_account_id"
            name="chatwoot_account_id"
            type="number"
            min={1}
            className="input tabular"
            defaultValue={empresa.chatwoot_account_id ?? ""}
          />
        </div>

        <div>
          <label className="label" htmlFor="plan_id">
            Plan
          </label>
          <select
            id="plan_id"
            name="plan_id"
            className="input"
            defaultValue={planActualId ?? ""}
          >
            <option value="">Sin cambios</option>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {num(p.cuota_conversaciones_mes)}/mes · {moneda(p.precio_mensual, p.moneda)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-faint">
            Cambiar de plan cierra la suscripción actual y abre otra. El histórico se conserva.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="estado">
            Estado
          </label>
          <select id="estado" name="estado" className="input" defaultValue={empresa.estado}>
            {ESTADOS_EMPRESA.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO[e]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-faint">
            Desactivar no borra nada: los documentos, la configuración y el historial siguen ahí.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Guardar />
      </div>
    </form>
  );
}

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? "Guardando…" : "Guardar cambios"}
    </button>
  );
}
