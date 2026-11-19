"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { guardarConexion, type ResultadoAccion } from "./actions";

export default function FormularioConexion({
  correo,
  numero,
  urlConexion,
}: {
  correo: string;
  numero: string;
  urlConexion: string;
}) {
  const [email, setEmail] = useState(correo);
  const [telefono, setTelefono] = useState(numero);
  const [editado, setEditado] = useState(false);
  const [estado, accion, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    async (previo, datos) => {
      const resultado = await guardarConexion(previo, datos);
      setEditado(false);
      return resultado;
    },
    null
  );
  // Tener datos precargados no confirma que el cliente los haya revisado. El
  // enlace solo aparece tras guardar ambos y vuelve a bloquearse si se editan.
  const confirmado = estado?.ok && !editado && !pendiente;

  return (
    <div className="space-y-5">
      <form action={accion} className="space-y-4" onChange={() => setEditado(true)}>
        {estado && (!estado.ok || confirmado) && (
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

        <fieldset disabled={pendiente} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Datos para conectar tu WhatsApp</legend>
          <div>
            <label className="label" htmlFor="conexion_correo">Correo para tus credenciales</label>
            <input
              id="conexion_correo"
              name="responsable_email"
              type="email"
              autoComplete="email"
              className="input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby="conexion_correo_ayuda"
            />
            <p id="conexion_correo_ayuda" className="mt-1.5 text-xs text-ink-soft">
              Aquí recibirás el acceso a tu bandeja cuando termine la conexión.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="conexion_numero">Número que vas a conectar</label>
            <input
              id="conexion_numero"
              name="display_phone_number"
              type="tel"
              autoComplete="tel"
              className="input tabular"
              placeholder="+591 71234567"
              required
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              aria-describedby="conexion_numero_ayuda"
            />
            <p id="conexion_numero_ayuda" className="mt-1.5 text-xs text-ink-soft">
              Con el código de país, como <span className="tabular">+591 71234567</span>. El mismo
              número que vas a conectar en la ventana de Meta.
            </p>
          </div>
        </fieldset>
        <Guardar />
      </form>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        {confirmado ? (
          <>
            <a href={urlConexion} target="_blank" rel="noopener noreferrer" className="btn-primary">
              Conectar mi WhatsApp
            </a>
            <p className="text-xs text-ink-soft">También puedes copiar este enlace y abrirlo en otra computadora:</p>
            <p className="select-text break-all text-sm text-ink">{urlConexion}</p>
          </>
        ) : (
          <>
            <button type="button" disabled className="btn-secondary" aria-describedby="conexion_ayuda">
              Conectar mi WhatsApp
            </button>
            <p id="conexion_ayuda" className="text-xs text-ink-soft">
              Guarda el correo y el número para habilitar tu enlace personalizado.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? "Guardando…" : "Guardar correo y número"}
    </button>
  );
}
