"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  BookOpen,
  Loader2,
  MessageSquareText,
  ShieldAlert,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";
import { probar, type ResultadoAccionPrueba } from "./actions";
import { MAX_CARACTERES_PRUEBA } from "@/types/asistia";

/**
 * Probar el agente antes de publicarlo.
 *
 * POR QUÉ ESTO NO ES UN BOTÓN DENTRO DEL FORMULARIO
 *
 * Dos razones, y la segunda es la de peso:
 *
 * 1. Técnica: un <form> dentro de otro <form> no es HTML válido, y este panel
 *    manda su propio campo a su propia Server Action.
 *
 * 2. De verdad: la prueba NO usa lo que hay escrito arriba. El flujo arma el
 *    prompt leyendo la configuración vigente en la base. Si el botón viviera
 *    entre los campos del formulario, todo el mundo asumiría lo contrario —que
 *    prueba lo que está viendo— y la primera vez que alguien edite el tono,
 *    pruebe, y lea una respuesta con el tono viejo, va a pensar que el agente
 *    ignora su configuración. Separarlo y decirlo en voz alta cuesta una frase.
 *
 * Se puede pulsar sin miedo: el flujo corre en modo prueba, no escribe nada, no
 * usa memoria y no cuenta contra el tope diario de la empresa.
 */
export default function PanelPrueba({ version }: { version: number | null }) {
  const [estado, accion] = useActionState<ResultadoAccionPrueba | null, FormData>(probar, null);

  if (version === null) {
    return (
      <section className="card card-pad">
        <h2 className="text-sm font-semibold text-ink">Probar el agente</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Guarda una configuración primero. Sin ella no hay agente al que preguntar.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Probar el agente</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Hazle una pregunta como se la haría un cliente. Se prueba la{" "}
          <strong className="font-semibold text-ink-muted">versión guardada (v{version})</strong>:
          si acabas de cambiar algo arriba, guarda antes. No se envía nada a nadie ni cuenta
          contra tu tope diario.
        </p>
      </div>

      <form action={accion} className="card-pad space-y-3">
        <div>
          <label className="label" htmlFor="texto_prueba">
            Pregunta de prueba
          </label>
          <textarea
            id="texto_prueba"
            name="texto"
            rows={2}
            required
            maxLength={MAX_CARACTERES_PRUEBA}
            className="input resize-y text-sm"
            placeholder="¿Cuánto cuesta una limpieza dental?"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-ink-faint">Tarda entre 3 y 7 segundos: contesta de verdad.</p>
          <BotonProbar />
        </div>

        {estado && !estado.ok && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{estado.error}</span>
          </p>
        )}

        {estado?.ok && <Respuesta datos={estado.datos} />}
      </form>
    </section>
  );
}

function BotonProbar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-secondary shrink-0">
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <MessageSquareText className="h-4 w-4" />
      )}
      {pending ? "Preguntando…" : "Probar"}
    </button>
  );
}

/**
 * El resultado.
 *
 * La respuesta manda y va primero, en grande. Lo demás son avisos que solo
 * aparecen cuando dicen algo: una fila de insignias siempre visibles se vuelve
 * decoración y se deja de leer a la tercera prueba.
 */
function Respuesta({ datos }: { datos: Extract<ResultadoAccionPrueba, { ok: true }>["datos"] }) {
  const similitudMaxima = datos.fragmentos.reduce((max, f) => Math.max(max, f.similitud), 0);
  const escalaria = datos.escalar !== "NO";
  const noSupo = escalaria && datos.escalar === "NO_SABE" && !datos.material_relevante;

  return (
    <div role="status" className="space-y-3 border-t border-slate-100 pt-4">
      <div className="rounded-xl border border-slate-200 bg-surface-muted px-4 py-3">
        {/* `whitespace-pre-wrap`: el agente responde con saltos de línea y
            listas. Colapsarlos convertiría una respuesta ordenada en un
            párrafo, que no es lo que va a ver el cliente en WhatsApp. */}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{datos.respuesta}</p>
      </div>

      {/* No supo y ofrece pasar con una persona: `material_relevante: false` y
          `escalar: NO_SABE` son la MISMA noticia contada dos veces —no encontró
          en qué apoyarse—, así que se dice una sola vez. Es el caso más común
          de una empresa recién dada de alta. */}
      {noSupo ? (
        <Aviso
          icono={<BookOpen className="mt-0.5 h-4 w-4 shrink-0" />}
          tono="atencion"
          titulo="No encontró en qué apoyarse"
          detalle="Nada en tus documentos respondía a esto, así que ofreció pasar con una persona en vez de inventarse la respuesta. Si esperabas otra cosa, comprueba que el documento esté INGESTADO."
        />
      ) : (
        <>
          {!datos.material_relevante && (
            <Aviso
              icono={<BookOpen className="mt-0.5 h-4 w-4 shrink-0" />}
              tono="atencion"
              titulo="Respondió sin material de tu conocimiento"
              detalle="No encontró nada relevante en tus documentos. Si esperabas otra cosa, revisa que el documento esté INGESTADO."
            />
          )}

          {escalaria && (
            <Aviso
              icono={<UserRoundCheck className="mt-0.5 h-4 w-4 shrink-0" />}
              tono="atencion"
              titulo="Con esta pregunta, el agente pasaría la conversación a una persona"
              detalle={motivoEscalado(datos.escalar)}
            />
          )}
        </>
      )}

      {!datos.guardarrail_ok && (
        <Aviso
          icono={<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
          tono="peligro"
          titulo="El guardarraíl saltó"
          detalle="La respuesta chocó con una de tus reglas. Vale la pena revisarla antes de dejar esta versión vigente."
        />
      )}

      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-faint">
        <Dato termino="Fragmentos usados" valor={String(datos.fragmentos.length)} />
        {datos.fragmentos.length > 0 && (
          <Dato termino="Similitud máxima" valor={`${Math.round(similitudMaxima * 100)} %`} />
        )}
        {datos.modelo && <Dato termino="Modelo" valor={datos.modelo} />}
        {datos.latencia_ms > 0 && (
          <Dato
            termino="El modelo tardó"
            valor={`${(datos.latencia_ms / 1000).toFixed(1)} s`}
          />
        )}
      </dl>
    </div>
  );
}

/**
 * Los valores de `escalar` que manda el flujo.
 *
 * La documentación solo nombraba `NO`; probando en vivo apareció `NO_SABE`, así
 * que habrá más. El `default` enseña el valor crudo en vez de tragárselo: es
 * feo, pero es información, y avisa de que hay un caso que traducir.
 */
function motivoEscalado(escalar: string): string {
  switch (escalar) {
    case "NO_SABE":
      return "No supo responder con lo que tiene, así que ofreció pasar con alguien del equipo.";
    default:
      return `Es lo que harían tus reglas de tipo «Escalar si». Motivo que devolvió el agente: ${escalar}.`;
  }
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex gap-1.5">
      <dt>{termino}:</dt>
      <dd className="tabular font-medium text-ink-muted">{valor}</dd>
    </div>
  );
}

/** El color nunca va solo: siempre lleva icono y un título que dice lo mismo. */
function Aviso({
  icono,
  tono,
  titulo,
  detalle,
}: {
  icono: React.ReactNode;
  tono: "atencion" | "peligro";
  titulo: string;
  detalle: string;
}) {
  const estilos =
    tono === "peligro"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${estilos}`}>
      {icono}
      <span>
        <strong className="font-semibold">{titulo}.</strong> {detalle}
      </span>
    </div>
  );
}
