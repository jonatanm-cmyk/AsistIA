import { notFound } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, Bot, ShieldAlert, User, UserCog } from "lucide-react";
import { requireEmpresa, tenantDe } from "@/lib/session";
import {
  detalleConversacion,
  escaladosDeConversacion,
  mensajesDeConversacion,
  type MensajeDetalle,
} from "@/lib/queries/conversaciones";
import { Card, CardHeader, EstadoBadge, PageHeader } from "@/components/ui";
import { fechaHora, num } from "@/lib/format";
import { ETIQUETA_MOTIVO } from "@/types/asistia";

export const metadata = { title: "Conversación" };

/**
 * Transcripción con trazabilidad.
 *
 * Lo que aporta frente a Chatwoot: junto a cada respuesta del agente se ven los
 * fragmentos que usó, el modelo, los tokens, la latencia y si el guardarraíl la
 * dejó pasar. Es lo que convierte "el bot dijo una barbaridad" en algo
 * diagnosticable.
 */
export default async function ConversacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesion = await requireEmpresa();
  const t = tenantDe(sesion);

  const conversacion = await detalleConversacion(t, sesion.empresaId, id);
  if (!conversacion) notFound();

  const [mensajes, escalados] = await Promise.all([
    mensajesDeConversacion(t, sesion.empresaId, id),
    escaladosDeConversacion(t, sesion.empresaId, id),
  ]);

  const tokens = mensajes.reduce(
    (s, m) => s + (m.tokens_entrada ?? 0) + (m.tokens_salida ?? 0),
    0
  );

  return (
    <>
      <Link
        href="/conversaciones"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Conversaciones
      </Link>

      <PageHeader
        titulo={conversacion.nombre_perfil ?? conversacion.telefono}
        descripcion={`${conversacion.telefono}${
          conversacion.canal_numero ? ` · atendido en ${conversacion.canal_numero}` : ""
        }`}
        acciones={<EstadoBadge estado={conversacion.estado} />}
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader
              titulo="Transcripción"
              descripcion={`${num(mensajes.length)} mensajes · ${num(tokens)} tokens`}
            />
            <div className="card-pad space-y-4">
              {mensajes.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-faint">
                  No hay mensajes registrados en esta conversación.
                </p>
              ) : (
                mensajes.map((m) => <Burbuja key={m.id} mensaje={m} />)
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader titulo="Datos" />
            <dl className="card-pad space-y-3 text-sm">
              <Dato etiqueta="Abierta" valor={fechaHora(conversacion.abierta_en)} />
              <Dato etiqueta="Último mensaje" valor={fechaHora(conversacion.ultimo_mensaje_en)} />
              <Dato
                etiqueta="Ventana de 24 h"
                valor={
                  conversacion.ventana_24h_hasta
                    ? fechaHora(conversacion.ventana_24h_hasta)
                    : "Cerrada"
                }
              />
              {conversacion.cerrada_en && (
                <Dato etiqueta="Cerrada" valor={fechaHora(conversacion.cerrada_en)} />
              )}
              {conversacion.chatwoot_conversation_id && (
                <Dato
                  etiqueta="Chatwoot"
                  valor={`#${conversacion.chatwoot_conversation_id}`}
                />
              )}
            </dl>
          </Card>

          {escalados.length > 0 && (
            <Card>
              <CardHeader
                titulo="Escalados"
                descripcion="Momentos en que el agente pidió una persona."
              />
              <ul className="card-pad space-y-3">
                {escalados.map((e) => (
                  <li key={e.id} className="flex items-start gap-2.5">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-serious" />
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {ETIQUETA_MOTIVO[e.motivo] ?? e.motivo}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {fechaHora(e.creado_en)}
                        {e.correo_enviado_en
                          ? " · avisado por correo"
                          : " · sin aviso por correo"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wider text-ink-faint">{etiqueta}</dt>
      <dd className="text-right text-sm text-ink">{valor}</dd>
    </div>
  );
}

const AUTORES = {
  CLIENTE: { icono: User, etiqueta: "Cliente", clase: "bg-slate-100 text-ink-muted" },
  AGENTE: { icono: Bot, etiqueta: "Agente", clase: "bg-brand-100 text-brand-700" },
  HUMANO: { icono: UserCog, etiqueta: "Persona", clase: "bg-amber-100 text-amber-800" },
} as const;

function Burbuja({ mensaje }: { mensaje: MensajeDetalle }) {
  const info = AUTORES[mensaje.autor] ?? AUTORES.CLIENTE;
  const Icono = info.icono;
  const esDelCliente = mensaje.autor === "CLIENTE";

  return (
    <div className={clsx("flex gap-3", !esDelCliente && "flex-row-reverse")}>
      <span
        className={clsx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          info.clase
        )}
      >
        <Icono className="h-4 w-4" />
      </span>

      <div className={clsx("min-w-0 max-w-[85%]", !esDelCliente && "text-right")}>
        <div
          className={clsx(
            "inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm",
            esDelCliente
              ? "bg-slate-100 text-ink"
              : mensaje.autor === "AGENTE"
                ? "bg-brand-50 text-ink ring-1 ring-brand-100"
                : "bg-amber-50 text-ink ring-1 ring-amber-100"
          )}
        >
          <p className="whitespace-pre-wrap break-words">{mensaje.contenido}</p>
        </div>

        <p className="mt-1 text-[11px] text-ink-faint">
          {info.etiqueta} · {fechaHora(mensaje.creado_en)}
          {mensaje.estado_entrega !== "NO_APLICA" && ` · ${mensaje.estado_entrega.toLowerCase()}`}
          {mensaje.guardarrail_ok === false && (
            <span className="ml-1 font-semibold text-red-700">· guardarraíl lo frenó</span>
          )}
        </p>

        {mensaje.autor === "AGENTE" && (
          <p className="mt-0.5 text-[11px] text-ink-faint tabular">
            {mensaje.modelo ?? "modelo desconocido"}
            {mensaje.tokens_entrada !== null &&
              ` · ${num((mensaje.tokens_entrada ?? 0) + (mensaje.tokens_salida ?? 0))} tokens`}
            {mensaje.latencia_ms !== null && ` · ${num(mensaje.latencia_ms)} ms`}
          </p>
        )}

        {mensaje.fragmentos.length > 0 && (
          <details className="mt-1.5 text-left">
            <summary className="cursor-pointer text-[11px] font-semibold text-brand-700 hover:underline">
              {mensaje.fragmentos.length}{" "}
              {mensaje.fragmentos.length === 1 ? "fragmento usado" : "fragmentos usados"}
            </summary>
            <ul className="mt-1.5 space-y-1 rounded-lg bg-slate-50 p-2.5">
              {mensaje.fragmentos.map((f, i) => (
                <li key={i} className="text-[11px] text-ink-muted">
                  <span className="font-medium text-ink">{f.nombre}</span>
                  {f.encabezado && ` · ${f.encabezado}`}
                  {f.similitud !== null && (
                    <span className="tabular text-ink-faint">
                      {" "}
                      · {(f.similitud * 100).toFixed(0)} %
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
