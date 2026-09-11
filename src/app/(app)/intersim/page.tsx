import { Suspense } from "react";
import Link from "next/link";
import { Building2, Coins, MessageSquare, TriangleAlert, Users } from "lucide-react";
import { requireIntersim, tenantDe } from "@/lib/session";
import {
  consumoPorEmpresa,
  erroresRecientes,
  resumenPlataforma,
  seriePlataforma,
} from "@/lib/queries/intersim";
import GraficoLineas from "@/components/charts/GraficoLineas";
import { Barras } from "@/components/charts/Barras";
import { FilaTarjetas, Tarjeta } from "@/components/charts/Tarjeta";
import RangoPeriodo from "@/components/ui/RangoPeriodo";
import { diasDeParams } from "@/components/ui/rango";
import {
  Card,
  CardHeader,
  EstadoBadge,
  FilaVacia,
  PageHeader,
  SkeletonGrafico,
  SkeletonTarjeta,
  Tabla,
  Tbody,
  Td,
  Th,
  Thead,
} from "@/components/ui";
import { compacto, fechaHora, hace, num, porcentaje } from "@/lib/format";
import type { Tenant } from "@/lib/db";

export const metadata = { title: "Plataforma" };

/**
 * Dashboard de Intersim: volumen y consumo de todas las empresas (D44).
 *
 * Misma arquitectura que `/panel` —un widget, una consulta, un Suspense— pero
 * otra audiencia y otras preguntas. Aquí lo que importa es: cuántas empresas
 * hay vivas, cuánto consumen, cuáles se están pasando de cuota y qué se está
 * rompiendo en los flujos.
 */
export default async function PlataformaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const dias = diasDeParams(sp.dias);
  const sesion = await requireIntersim();
  const t = tenantDe(sesion);

  return (
    <>
      <PageHeader
        titulo="Plataforma"
        descripcion="Volumen y consumo de todas las empresas suscritas."
        acciones={<RangoPeriodo />}
      />

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
          <Cifras t={t} />
        </Suspense>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Suspense fallback={<SkeletonGrafico />}>
              <Volumen t={t} dias={dias} />
            </Suspense>
          </div>
          <Suspense fallback={<SkeletonGrafico alto="h-52" />}>
            <TopConsumo t={t} />
          </Suspense>
        </div>

        <Suspense fallback={<SkeletonGrafico alto="h-56" />}>
          <TablaEmpresas t={t} />
        </Suspense>

        <Suspense fallback={<SkeletonGrafico alto="h-40" />}>
          <Errores t={t} />
        </Suspense>
      </div>
    </>
  );
}

async function Cifras({ t }: { t: Tenant }) {
  const r = await resumenPlataforma(t);

  return (
    <FilaTarjetas>
      <Tarjeta
        etiqueta="Empresas activas"
        valor={r.empresas_activas}
        pie={`${num(r.empresas_pendientes)} pendientes · ${num(r.empresas_total)} en total`}
        icono={<Building2 className="h-4 w-4" />}
      />
      <Tarjeta
        etiqueta="Conversaciones del mes"
        valor={r.conversaciones_mes}
        anterior={r.conversaciones_mes_previo}
        pie="vs. mes anterior"
        subirEs="bueno"
        icono={<Users className="h-4 w-4" />}
      />
      <Tarjeta
        etiqueta="Tokens del mes"
        valor={r.tokens_mes}
        anterior={r.tokens_mes_previo}
        pie="vs. mes anterior"
        subirEs="neutro"
        compactar
        icono={<Coins className="h-4 w-4" />}
      />
      <Tarjeta
        etiqueta="Errores (24 h)"
        valor={r.errores_24h}
        pie={`${num(r.escalados_mes)} escalados este mes`}
        subirEs="malo"
        icono={<TriangleAlert className="h-4 w-4" />}
      />
    </FilaTarjetas>
  );
}

async function Volumen({ t, dias }: { t: Tenant; dias: number }) {
  const serie = await seriePlataforma(t, dias);

  return (
    <Card>
      <CardHeader
        titulo="Volumen diario"
        descripcion="Conversaciones nuevas y mensajes de toda la plataforma."
      />
      <div className="card-pad">
        <GraficoLineas
          datos={serie}
          series={[
            { clave: "mensajes", etiqueta: "Mensajes", slot: 1 },
            { clave: "conversaciones", etiqueta: "Conversaciones nuevas", slot: 2 },
          ]}
        />
      </div>
    </Card>
  );
}

async function TopConsumo({ t }: { t: Tenant }) {
  const filas = await consumoPorEmpresa(t);
  const top = filas.filter((f) => f.conversaciones_mes > 0).slice(0, 6);

  return (
    <Card className="h-full">
      <CardHeader titulo="Quién consume más" descripcion="Conversaciones en el mes en curso." />
      <div className="card-pad">
        <Barras
          datos={top.map((f) => ({
            etiqueta: f.nombre,
            valor: f.conversaciones_mes,
            detalle: f.uso_cuota !== null ? `${porcentaje(f.uso_cuota, 0)} de cuota` : undefined,
          }))}
          vacio="Ninguna empresa registró conversaciones este mes."
        />
      </div>
    </Card>
  );
}

async function TablaEmpresas({ t }: { t: Tenant }) {
  const filas = await consumoPorEmpresa(t);

  return (
    <Card>
      <CardHeader
        titulo="Empresas"
        descripcion="Consumo del mes en curso y cuánto les queda de plan."
        accion={
          <Link
            href="/intersim/empresas"
            className="text-xs font-semibold text-brand-700 hover:underline"
          >
            Gestionar
          </Link>
        }
      />
      <Tabla>
        <Thead>
          <Th>Empresa</Th>
          <Th>Estado</Th>
          <Th>Plan</Th>
          <Th alineacion="right">Conversaciones</Th>
          <Th alineacion="right">Cuota</Th>
          <Th alineacion="right">Tokens</Th>
          <Th alineacion="right">Última actividad</Th>
        </Thead>
        <Tbody>
          {filas.length === 0 ? (
            <FilaVacia columnas={7} mensaje="Todavía no hay empresas dadas de alta." />
          ) : (
            filas.map((f) => (
              <tr key={f.id} className="hover:bg-slate-50">
                <Td>
                  <Link
                    href={`/intersim/empresas/${f.id}`}
                    className="font-medium text-ink hover:text-brand-700"
                  >
                    {f.nombre}
                  </Link>
                </Td>
                <Td>
                  <EstadoBadge estado={f.estado} />
                </Td>
                <Td className="text-ink-soft">{f.plan_nombre ?? "—"}</Td>
                <Td alineacion="right" className="tabular">
                  {num(f.conversaciones_mes)}
                </Td>
                <Td alineacion="right">
                  <CuotaCelda uso={f.uso_cuota} />
                </Td>
                <Td alineacion="right" className="tabular text-ink-soft">
                  {compacto(f.tokens_mes)}
                </Td>
                <Td alineacion="right" className="whitespace-nowrap text-xs text-ink-soft">
                  {f.ultima_actividad ? hace(f.ultima_actividad) : "—"}
                </Td>
              </tr>
            ))
          )}
        </Tbody>
      </Tabla>
    </Card>
  );
}

/**
 * El porcentaje de cuota lleva color, pero el número está siempre escrito: el
 * color refuerza, no informa por su cuenta.
 */
function CuotaCelda({ uso }: { uso: number | null }) {
  if (uso === null) return <span className="text-xs text-ink-faint">sin plan</span>;
  const clase =
    uso >= 100 ? "text-red-700 font-semibold" : uso >= 80 ? "text-amber-700 font-semibold" : "text-ink";
  return <span className={`tabular text-sm ${clase}`}>{porcentaje(uso, 0)}</span>;
}

async function Errores({ t }: { t: Tenant }) {
  const filas = await erroresRecientes(t, 8);

  return (
    <Card>
      <CardHeader
        titulo="Errores recientes de los flujos"
        descripcion="Lo que los flujos ASI_ registraron en la tabla `errores`."
      />
      <Tabla>
        <Thead>
          <Th>Cuándo</Th>
          <Th>Empresa</Th>
          <Th>Flujo</Th>
          <Th>Mensaje</Th>
        </Thead>
        <Tbody>
          {filas.length === 0 ? (
            <FilaVacia columnas={4} mensaje="Ningún error registrado. Buena señal." />
          ) : (
            filas.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-xs text-ink-soft">
                  {fechaHora(e.ocurrido_en)}
                </Td>
                <Td className="text-ink-soft">{e.empresa_nombre ?? "—"}</Td>
                <Td>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-ink">
                    {e.flujo}
                    {e.nodo ? ` · ${e.nodo}` : ""}
                  </code>
                </Td>
                <Td className="max-w-md truncate text-ink-muted" >
                  <span title={e.mensaje}>{e.mensaje}</span>
                </Td>
              </tr>
            ))
          )}
        </Tbody>
      </Tabla>
    </Card>
  );
}
