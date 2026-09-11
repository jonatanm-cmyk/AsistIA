import { Phone } from "lucide-react";
import { requireEmpresa, tenantDe } from "@/lib/session";
import { listarCanales } from "@/lib/queries/canal";
import FormularioCanal from "./FormularioCanal";
import { Alerta, Card, CardHeader, EmptyState, EstadoBadge, PageHeader } from "@/components/ui";
import { fechaHora } from "@/lib/format";
import { EMPRESA_EDITA_CANAL } from "@/lib/alcance";
import type { Canal } from "@/types/asistia";

export const metadata = { title: "Canal de WhatsApp" };

/**
 * El canal de la empresa, DE SOLO LECTURA.
 *
 * D12: el número pasa por el onboarding del Meta Tech Provider y lo habilita
 * Intersim. Y desde el 11-sep, con `F1` aplazada, los ids de Chatwoot entran
 * por una segunda llamada a `fn_alta_empresa`, no por un formulario.
 *
 * Dejar que un administrador de empresa escribiera `chatwoot_inbox_id` le
 * permitía romper el enrutado de sus propios mensajes sin enterarse: ese id es
 * justo por el que `fn_resolver_empresa` decide de quién es una conversación
 * entrante.
 *
 * El formulario NO se borró: sigue en `FormularioCanal.tsx` con su acción, para
 * cuando `F1` se retome y sea Intersim quien lo use. Se enciende desde
 * `lib/alcance.ts`.
 */
export default async function CanalPage() {
  const sesion = await requireEmpresa();
  const canales = await listarCanales(tenantDe(sesion), sesion.empresaId);
  // Un canal por empresa en la v1 (solo WhatsApp). Si hubiera varios, manda el
  // habilitado.
  const canal = canales.find((c) => c.estado === "HABILITADO") ?? canales[0] ?? null;

  return (
    <>
      <PageHeader
        titulo="Canal de WhatsApp"
        descripcion="El número por el que atiende tu agente."
        acciones={canal ? <EstadoBadge estado={canal.estado} /> : undefined}
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader
              titulo="Datos del número"
              descripcion={
                EMPRESA_EDITA_CANAL
                  ? "Identificadores que devuelve el onboarding de Meta, más el inbox de Chatwoot."
                  : "Los rellena Intersim cuando habilita tu número."
              }
            />
            <div className="card-pad">
              {EMPRESA_EDITA_CANAL ? (
                <FormularioCanal canal={canal} />
              ) : canal ? (
                <DatosCanal canal={canal} />
              ) : (
                <EmptyState
                  titulo="Todavía no hay número asignado"
                  descripcion="Intersim lo conecta cuando el onboarding del Tech Provider termina. Mientras tanto puedes ir configurando el agente y cargando documentos."
                />
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Alerta tono="info" titulo="Quién hace qué">
            El alta del número y su token los gestiona el Tech Provider de Meta, fuera de AsistIA.
            Intersim los enlaza a tu cuenta. Por eso esta pantalla es informativa: si algo no
            cuadra, escríbenos en vez de cambiarlo.
          </Alerta>

          <Card>
            <CardHeader titulo="Cómo llega un mensaje" />
            <ol className="card-pad space-y-3 text-sm text-ink-muted">
              {[
                "Meta entrega el mensaje al inbox de Chatwoot de tu empresa.",
                "Chatwoot avisa al flujo por webhook.",
                "El flujo resuelve tu empresa por la cuenta o el inbox de Chatwoot.",
                "Si la conversación está en modo humano, el agente calla.",
                "Si no, responde con tu configuración y tu conocimiento.",
              ].map((paso, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                    {i + 1}
                  </span>
                  <span>{paso}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function DatosCanal({ canal }: { canal: Canal }) {
  return (
    <dl className="space-y-4">
      <Dato
        etiqueta="Número"
        valor={canal.display_phone_number}
        destacado
        icono={<Phone className="h-4 w-4" />}
      />
      <Dato etiqueta="Phone number ID" valor={canal.phone_number_id} mono />
      <Dato etiqueta="WABA ID" valor={canal.waba_id} mono />
      <Dato
        etiqueta="Inbox de Chatwoot"
        valor={canal.chatwoot_inbox_id !== null ? String(canal.chatwoot_inbox_id) : null}
        mono
      />
      <Dato
        etiqueta="Habilitado"
        valor={canal.habilitado_en ? fechaHora(canal.habilitado_en) : "Pendiente de habilitar"}
      />
    </dl>
  );
}

function Dato({
  etiqueta,
  valor,
  mono,
  destacado,
  icono,
}: {
  etiqueta: string;
  valor: string | null;
  mono?: boolean;
  destacado?: boolean;
  icono?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
        {icono}
        {etiqueta}
      </dt>
      <dd
        className={[
          "text-right",
          destacado ? "text-base font-semibold text-ink" : "text-sm text-ink",
          mono ? "font-mono text-xs" : "",
          !valor ? "text-ink-faint" : "",
        ].join(" ")}
      >
        {valor ?? "sin asignar"}
      </dd>
    </div>
  );
}
