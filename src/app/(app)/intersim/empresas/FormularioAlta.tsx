"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, TriangleAlert } from "lucide-react";
import { altaEmpresa, type ResultadoAccion } from "./actions";
import type { Plan } from "@/types/asistia";
import { moneda, num } from "@/lib/format";

export default function FormularioAlta({ planes }: { planes: Plan[] }) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(altaEmpresa, null);
  const [crearUsuario, setCrearUsuario] = useState(true);
  // Apagado por defecto: lo normal es que el onboarding del Tech Provider aún
  // no haya terminado cuando se da de alta la empresa.
  const [conCanal, setConCanal] = useState(false);
  const [nombre, setNombre] = useState("");
  // La clave se sugiere a partir del nombre hasta que alguien la toca a mano.
  // A partir de ahí manda lo escrito: la clave es permanente y no puede
  // cambiar sola porque se corrija una errata en el nombre.
  const [clave, setClave] = useState("");
  const [claveTocada, setClaveTocada] = useState(false);
  const claveEfectiva = claveTocada ? clave : sugerirClave(nombre);

  return (
    <form action={accion} className="space-y-5">
      {estado && !estado.ok && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{estado.error}</span>
        </div>
      )}

      <section className="card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">La empresa</h2>
        </div>
        <div className="card-pad grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="nombre">
              Nombre
            </label>
            <input
              id="nombre"
              name="nombre"
              className="input"
              required
              maxLength={200}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="EduConecta"
            />
          </div>

          <div>
            <label className="label" htmlFor="client_key">
              Clave de cliente
            </label>
            <input
              id="client_key"
              name="client_key"
              className="input"
              required
              maxLength={60}
              pattern="[a-z0-9][a-z0-9\-]*"
              value={claveEfectiva}
              onChange={(e) => {
                setClaveTocada(true);
                setClave(e.target.value);
              }}
              placeholder="educonecta"
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              Identificador estable de la empresa en flujos y registros. Minúsculas, números y
              guiones. No se cambia después.
            </p>
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
              placeholder="12"
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              Puedes dejarlo vacío y enlazarlo cuando exista la cuenta.
            </p>
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
              maxLength={200}
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
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              Aquí llegan los avisos cuando el agente escala a una persona.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="plan_codigo">
              Plan
            </label>
            {/* El valor es el CÓDIGO, no el uuid: `fn_alta_empresa` busca el plan
                por código para poder versionar precios sin romper las llamadas. */}
            <select id="plan_codigo" name="plan_codigo" className="input" required defaultValue="">
              <option value="" disabled>
                Elige un plan
              </option>
              {planes.map((p) => (
                <option key={p.id} value={p.codigo}>
                  {p.nombre} — {num(p.cuota_conversaciones_mes)} conversaciones/mes ·{" "}
                  {moneda(p.precio_mensual, p.moneda)}
                </option>
              ))}
            </select>
            {planes.length === 0 && (
              <p className="mt-1.5 text-xs text-red-700">
                No hay planes vigentes en la base. Créalos antes de dar de alta empresas.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="border-b border-slate-100 px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              name="crear_usuario"
              checked={crearUsuario}
              onChange={(e) => setCrearUsuario(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">
                Crear también el usuario que administrará la cuenta
              </span>
              <span className="block text-xs text-ink-soft">
                Una empresa tiene un único administrador. Podrá entrar de inmediato.
              </span>
            </span>
          </label>
        </div>

        {crearUsuario && (
          <div className="card-pad grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="usuario_email">
                Correo de acceso
              </label>
              <input
                id="usuario_email"
                name="usuario_email"
                type="email"
                className="input"
                required={crearUsuario}
              />
            </div>
            <div>
              <label className="label" htmlFor="usuario_password">
                Contraseña inicial
              </label>
              <input
                id="usuario_password"
                name="usuario_password"
                type="text"
                minLength={8}
                className="input"
                required={crearUsuario}
                placeholder="Mínimo 8 caracteres"
              />
              <p className="mt-1.5 text-xs text-ink-faint">
                Se la pasas por un canal seguro y que la cambie al entrar.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="border-b border-slate-100 px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={conCanal}
              onChange={(e) => setConCanal(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">
                Enlazar ya el número de WhatsApp
              </span>
              <span className="block text-xs text-ink-soft">
                Solo si el onboarding del Tech Provider ya terminó. Puedes dejarlo para después.
              </span>
            </span>
          </label>
        </div>

        {conCanal && (
          <div className="card-pad grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="canal_phone_number_id">
                Phone number ID
              </label>
              <input
                id="canal_phone_number_id"
                name="canal_phone_number_id"
                className="input tabular"
                required={conCanal}
                placeholder="109384756201938"
              />
              <p className="mt-1.5 text-xs text-ink-faint">
                Sin este campo se ignora el bloque entero.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="canal_display_phone_number">
                Número visible
              </label>
              <input
                id="canal_display_phone_number"
                name="canal_display_phone_number"
                className="input tabular"
                placeholder="+591 700 11223"
              />
            </div>
            <div>
              <label className="label" htmlFor="canal_waba_id">
                WABA ID
              </label>
              <input id="canal_waba_id" name="canal_waba_id" className="input tabular" />
            </div>
            <div>
              <label className="label" htmlFor="canal_chatwoot_inbox_id">
                Inbox de Chatwoot
              </label>
              <input
                id="canal_chatwoot_inbox_id"
                name="canal_chatwoot_inbox_id"
                type="number"
                min={1}
                className="input tabular"
                placeholder="2001"
              />
              <p className="mt-1.5 text-xs text-ink-faint">
                Es por donde el flujo sabrá de quién es cada conversación entrante.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="canal_estado">
                Estado del canal
              </label>
              <select
                id="canal_estado"
                name="canal_estado"
                className="input"
                defaultValue="PENDIENTE"
              >
                <option value="PENDIENTE">Pendiente de habilitar</option>
                <option value="HABILITADO">Habilitado</option>
              </select>
            </div>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Crear />
      </div>
    </form>
  );
}

function Crear() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? "Creando…" : "Crear empresa"}
    </button>
  );
}

/** "EduConecta S.R.L." -> "educonecta-srl". Solo una sugerencia. */
function sugerirClave(nombre: string): string {
  return nombre
    .normalize("NFD")
    // Quita las tildes ya separadas por NFD. Sin esto, "Bogotá" -> "bogot-".
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
