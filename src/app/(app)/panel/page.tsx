import { Suspense } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Coins,
  Library,
  MessageSquare,
  Phone,
  Users,
} from "lucide-react";
import { requireEmpresa, tenantDe } from "@/lib/session";
import {
  conversacionesRecientes,
  escaladosPorMotivo,
  estadoServicio,
  resumenEmpresa,
  serieUso,
  totalesPeriodo,
} from "@/lib/queries/panel";
import GraficoLineas from "@/components/charts/GraficoLineas";
import { Barras, Medidor } from "@/components/charts/Barras";
import { FilaTarjetas, Tarjeta } from "@/components/charts/Tarjeta";
import RangoPeriodo from "@/components/ui/RangoPeriodo";
import { diasDeParams } from "@/components/ui/rango";
import {
  Alerta,
  Card,
  CardHeader,
  EstadoBadge,
  PageHeader,
  SkeletonGrafico,
  SkeletonTarjeta,
  Tabla,
  Tbody,
  Td,
  Th,
  Thead,
  FilaVacia,
} from "@/components/ui";
import { ETIQUETA_MOTIVO } from "@/types/asistia";
import { hace, num, porcentaje } from "@/lib/format";
import type { Tenant } from "@/lib/db";
import { MOSTRAR_CONVERSACIONES } from "@/lib/alcance";

export const metadata = { title: "Resumen" };

/**
 * Dashboard de la empresa.
 *
 * LA IDEA ARQUITECTÓNICA, que es lo que cambia respecto al panel anterior:
 * cada widget es un componente `async` con SU PROPIA consulta, envuelto en su
 * propio `<Suspense>`. Next envía el HTML del armazón de inmediato y va
 * inyectando cada widget cuando su consulta termina.
 *
 * Consecuencias medibles:
 *  - La página se ve en cuanto responde la más rápida, no cuando acaba la más
 *    lenta. No hay un único `/dashboard/stats` que haga 12 agregaciones y
 *    bloquee toda la pantalla.
 *  - Las consultas salen EN PARALELO, porque son componentes hermanos y ninguno
 *    espera al anterior.
 *  - No hay `useEffect` con `fetch`: el navegador no pide datos después de
 *    montar. Llegan en el HTML.
 *
 * Si añades un widget, añade un componente `async` y su `<Suspense>`. No toques
 * los demás.
 */
export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const dias = diasDeParams(sp.dias);
  const sesion = await requireEmpresa();
  const t = tenantDe(sesion);
  const empresaId = sesion.empresaId;

  return (
    <>
      <PageHeader
        titulo={`Hola, ${sesion.nombre?.split(" ")[0] ?? "buenas"}`}
        descripcion="Cómo está atendiendo tu agente y cuánto estás consumiendo."
        acciones={<RangoPeriodo />}
      />

      {sesion.empresaEstado !== "ACTIVA" && (
        <div className="mb-6">
          <Alerta
            tono={sesion.empresaEstado === "PENDIENTE" ? "aviso" : "critico"}
            titulo={
              sesion.empresaEstado === "PENDIENTE"
                ? "Tu cuenta todavía no está activa"
                : "Tu cuenta está desactivada"
            }
          >
            {sesion.empresaEstado === "PENDIENTE"
              ? "Puedes ir configurando el agente y cargando documentos. El agente empezará a responder cuando Intersim active la cuenta y tu número quede habilitado."
              : "El agente no está respondiendo. Tus datos y tu configuración siguen intactos."}
          </Alerta>
        </div>
      )}

      <div className="space-y-5">
        <Suspense
          fallback={
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SkeletonTarjeta />
              <SkeletonTarjeta />
              <SkeletonTarjeta />
              <SkeletonTarjeta />
            </div>
          }
        >
          <Cifras t={t} empresaId={empresaId} dias={dias} />
        </Suspense>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Suspense fallback={<SkeletonGrafico />}>
              <Actividad t={t} empresaId={empresaId} dias={dias} />
            </Suspense>
          </div>
          <Suspense fallback={<SkeletonGrafico alto="h-52" />}>
            <SaludDelAgente t={t} empresaId={empresaId} />
          </Suspense>
        </div>

        {/* La lista de últimas conversaciones también es "ver conversaciones",
            así que cae bajo la misma decisión (D44) que la vista completa.
            Cuando se oculta, los motivos de escalado ocupan el ancho entero en
            vez de dejar media fila vacía. */}
        <div className={MOSTRAR_CONVERSACIONES ? "grid gap-5 lg:grid-cols-2" : ""}>
          <Suspense fallback={<SkeletonGrafico alto="h-40" />}>
            <MotivosEscalado t={t} empresaId={empresaId} dias={dias} />
          </Suspense>
          {MOSTRAR_CONVERSACIONES && (
            <Suspense fallback={<SkeletonGrafico alto="h-40" />}>
              <Ultimas t={t} empresaId={empresaId} />
            </Suspense>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Widgets. Uno por consulta.
// ---------------------------------------------------------------------------

async function Cifras({ t, empresaId, dias }: { t: Tenant; empresaId: string; dias: number }) {
  const tot = await totalesPeriodo(t, empresaId, dias);
  const pie = `vs. ${dias} días previos`;

  // Tasa de escalado: el dato que de verdad dice si el agente está sirviendo.
  const tasa = tot.conversaciones ? (tot.escalados / tot.conversaciones) * 100 : 0;

  return (
    <FilaTarjetas>
      <Tarjeta
        etiqueta="Conversaciones"
        valor={tot.conversaciones}
        anterior={tot.conversaciones_previo}
        pie={pie}
        subirEs="bueno"
        icono={<Users className="h-4 w-4" />}
      />
      <Tarjeta
        etiqueta="Mensajes"
        valor={tot.mensajes}
        anterior={tot.mensajes_previo}
        pie={pie}
        subirEs="neutro"
        icono={<MessageSquare className="h-4 w-4" />}
      />
      <Tarjeta
        etiqueta="Escalados a persona"
        valor={tot.escalados}
        anterior={tot.escalados_previo}
        pie={`${porcentaje(tasa, 1)} de las conversaciones`}
        subirEs="malo"
        icono={<AlertTriangle className="h-4 w-4" />}
      />
      <Tarjeta
        etiqueta="Tokens"
        valor={tot.tokens}
        anterior={tot.tokens_previo}
        pie={pie}
        subirEs="neutro"
        compactar
        icono={<Coins className="h-4 w-4" />}
      />
    </FilaTarjetas>
  );
}

async function Actividad({ t, empresaId, dias }: { t: Tenant; empresaId: string; dias: number }) {
  const serie = await serieUso(t, empresaId, dias);

  return (
    <Card>
      <CardHeader
        titulo="Mensajes por día"
        descripcion="Lo que entra de los clientes y lo que el agente devuelve."
      />
      <div className="card-pad">
        {/* Entrantes y salientes comparten unidad y escala, así que van en el
            mismo gráfico. Los tokens NO: van aparte, en su propia vista de
            consumo. Dos escalas en un eje es la forma más rápida de mentir. */}
        <GraficoLineas
          datos={serie}
          series={[
            { clave: "entrantes", etiqueta: "Del cliente", slot: 1 },
            { clave: "salientes", etiqueta: "Del agente", slot: 2 },
          ]}
        />
      </div>
    </Card>
  );
}

async function SaludDelAgente({ t, empresaId }: { t: Tenant; empresaId: string }) {
  const [estado, empresa] = await Promise.all([
    estadoServicio(t, empresaId),
    resumenEmpresa(t, empresaId),
  ]);

  const listo =
    estado.canal_estado === "HABILITADO" &&
    estado.config_version !== null &&
    estado.docs_ingestados > 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        titulo="Estado del agente"
        descripcion={listo ? "Todo listo para atender." : "Falta algo por configurar."}
      />
      <div className="card-pad flex-1 space-y-4">
        <Linea
          icono={<Phone className="h-4 w-4" />}
          etiqueta="Canal de WhatsApp"
          valor={estado.canal_numero ?? "Sin número"}
          badge={<EstadoBadge estado={estado.canal_estado} />}
          href="/canal"
        />
        <Linea
          icono={<Bot className="h-4 w-4" />}
          etiqueta="Configuración"
          valor={
            estado.config_version
              ? `v${estado.config_version} · ${estado.config_tono} · ${estado.reglas_activas} reglas`
              : "Sin configurar"
          }
          href="/agente"
        />
        <Linea
          icono={<Library className="h-4 w-4" />}
          etiqueta="Conocimiento"
          valor={
            estado.docs_error > 0
              ? `${num(estado.docs_ingestados)} listos · ${num(estado.docs_error)} con error`
              : estado.docs_pendientes > 0
                ? `${num(estado.docs_ingestados)} listos · ${num(estado.docs_pendientes)} en cola`
                : `${num(estado.docs_ingestados)} documentos listos`
          }
          href="/conocimiento"
        />

        <div className="border-t border-slate-100 pt-4">
          <Medidor
            etiqueta="Conversaciones este mes"
            usado={estado.conversaciones_mes}
            tope={empresa?.cuota_conversaciones_mes ?? null}
          />
          {empresa?.plan_nombre && (
            <p className="mt-2 text-xs text-ink-faint">Plan {empresa.plan_nombre}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Linea({
  icono,
  etiqueta,
  valor,
  badge,
  href,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  valor: string;
  badge?: React.ReactNode;
  href: string;
}) {
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-lg -mx-1 px-1 py-1 hover:bg-slate-50">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-soft">
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
            {etiqueta}
          </span>
          {badge}
        </span>
        <span className="mt-0.5 block truncate text-sm text-ink">{valor}</span>
      </span>
      <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100" />
    </Link>
  );
}

async function MotivosEscalado({
  t,
  empresaId,
  dias,
}: {
  t: Tenant;
  empresaId: string;
  dias: number;
}) {
  const motivos = await escaladosPorMotivo(t, empresaId, dias);

  return (
    <Card>
      <CardHeader
        titulo="Por qué escala a una persona"
        descripcion="Lo que el agente no pudo resolver solo."
      />
      <div className="card-pad">
        <Barras
          datos={motivos.map((m) => ({
            etiqueta: ETIQUETA_MOTIVO[m.motivo] ?? m.motivo,
            valor: m.total,
          }))}
          mostrarPorcentaje
          vacio="Ninguna conversación necesitó a una persona en el periodo."
        />
      </div>
    </Card>
  );
}

async function Ultimas({ t, empresaId }: { t: Tenant; empresaId: string }) {
  const filas = await conversacionesRecientes(t, empresaId, 6);

  return (
    <Card>
      <CardHeader
        titulo="Últimas conversaciones"
        accion={
          <Link href="/conversaciones" className="text-xs font-semibold text-brand-700 hover:underline">
            Ver todas
          </Link>
        }
      />
      <Tabla>
        <Thead>
          <Th>Cliente</Th>
          <Th alineacion="right">Mensajes</Th>
          <Th>Estado</Th>
          <Th alineacion="right">Actividad</Th>
        </Thead>
        <Tbody>
          {filas.length === 0 ? (
            <FilaVacia columnas={4} mensaje="Todavía no hay conversaciones." />
          ) : (
            filas.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/conversaciones/${c.id}`} className="block">
                    <span className="block font-medium text-ink">
                      {c.nombre_perfil ?? c.telefono}
                    </span>
                    {c.nombre_perfil && (
                      <span className="block text-xs text-ink-faint tabular">{c.telefono}</span>
                    )}
                  </Link>
                </Td>
                <Td alineacion="right" className="tabular">
                  {num(c.mensajes)}
                </Td>
                <Td>
                  <span className="flex items-center gap-1.5">
                    <EstadoBadge estado={c.estado} />
                    {c.escalada && (
                      <AlertTriangle
                        className="h-3.5 w-3.5 text-status-serious"
                        aria-label="Escalada a una persona"
                      />
                    )}
                  </span>
                </Td>
                <Td alineacion="right" className="whitespace-nowrap text-xs text-ink-soft">
                  {hace(c.ultimo_mensaje_en)}
                </Td>
              </tr>
            ))
          )}
        </Tbody>
      </Tabla>
    </Card>
  );
}
