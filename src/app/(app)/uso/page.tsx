import { Suspense } from "react";
import { requireEmpresa, tenantDe } from "@/lib/session";
import { resumenEmpresa, serieUso, totalesPeriodo } from "@/lib/queries/panel";
import { resumenConocimiento } from "@/lib/queries/conocimiento";
import GraficoLineas from "@/components/charts/GraficoLineas";
import { Medidor } from "@/components/charts/Barras";
import { FilaTarjetas, Tarjeta } from "@/components/charts/Tarjeta";
import RangoPeriodo from "@/components/ui/RangoPeriodo";
import { diasDeParams } from "@/components/ui/rango";
import {
  Card,
  CardHeader,
  PageHeader,
  SkeletonGrafico,
  SkeletonTarjeta,
} from "@/components/ui";
import { moneda, num } from "@/lib/format";
import type { Tenant } from "@/lib/db";

export const metadata = { title: "Consumo y plan" };

/**
 * Consumo. Separado del resumen a propósito: en `/panel` los tokens son una
 * cifra de contexto; aquí son el tema, y tienen su propio gráfico con su propio
 * eje. Meterlos en el gráfico de mensajes habría exigido un segundo eje Y, que
 * es la forma más rápida de que dos series parezcan cruzarse sin hacerlo.
 */
export default async function UsoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const dias = diasDeParams(sp.dias);
  const sesion = await requireEmpresa();
  const t = tenantDe(sesion);

  return (
    <>
      <PageHeader
        titulo="Consumo y plan"
        descripcion="Lo que llevas gastado este periodo y cuánto te queda de cuota."
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
          <Cifras t={t} empresaId={sesion.empresaId} dias={dias} />
        </Suspense>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Suspense fallback={<SkeletonGrafico />}>
              <GraficoTokens t={t} empresaId={sesion.empresaId} dias={dias} />
            </Suspense>
          </div>
          <Suspense fallback={<SkeletonGrafico alto="h-52" />}>
            <Plan t={t} empresaId={sesion.empresaId} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function Cifras({ t, empresaId, dias }: { t: Tenant; empresaId: string; dias: number }) {
  const tot = await totalesPeriodo(t, empresaId, dias);
  const pie = `vs. ${dias} días previos`;
  const porConversacion = tot.conversaciones
    ? Math.round(tot.tokens / tot.conversaciones)
    : 0;

  return (
    <FilaTarjetas>
      <Tarjeta
        etiqueta="Tokens totales"
        valor={tot.tokens}
        anterior={tot.tokens_previo}
        pie={pie}
        compactar
      />
      <Tarjeta etiqueta="Tokens por conversación" valor={porConversacion} pie="media del periodo" />
      <Tarjeta
        etiqueta="Conversaciones"
        valor={tot.conversaciones}
        anterior={tot.conversaciones_previo}
        pie={pie}
        subirEs="bueno"
      />
      <Tarjeta
        etiqueta="Mensajes"
        valor={tot.mensajes}
        anterior={tot.mensajes_previo}
        pie={pie}
      />
    </FilaTarjetas>
  );
}

async function GraficoTokens({
  t,
  empresaId,
  dias,
}: {
  t: Tenant;
  empresaId: string;
  dias: number;
}) {
  const serie = await serieUso(t, empresaId, dias);

  return (
    <Card>
      <CardHeader
        titulo="Tokens por día"
        descripcion="Entrada más salida, tal como los registran los flujos."
      />
      <div className="card-pad">
        {/* Una sola serie: sin leyenda. El título ya dice qué es. */}
        <GraficoLineas
          datos={serie}
          series={[{ clave: "tokens", etiqueta: "Tokens", slot: 1 }]}
          compactarEje
        />
      </div>
    </Card>
  );
}

async function Plan({ t, empresaId }: { t: Tenant; empresaId: string }) {
  const [empresa, conocimiento] = await Promise.all([
    resumenEmpresa(t, empresaId),
    resumenConocimiento(t, empresaId),
  ]);

  // Conversaciones del mes en curso: la cuota del plan es mensual, así que
  // comparar contra el rango de 7/30/90 días daría un porcentaje sin sentido.
  const delMes = await (async () => {
    const serie = await serieUso(t, empresaId, 31);
    const mes = new Date().getMonth();
    return serie
      .filter((p) => new Date(`${p.fecha}T00:00:00`).getMonth() === mes)
      .reduce((s, p) => s + p.conversaciones, 0);
  })();

  return (
    <Card className="h-full">
      <CardHeader
        titulo={empresa?.plan_nombre ? `Plan ${empresa.plan_nombre}` : "Sin plan vigente"}
        descripcion="Las cuotas se cuentan por mes natural."
      />
      <div className="card-pad space-y-5">
        <Medidor
          etiqueta="Conversaciones del mes"
          usado={delMes}
          tope={empresa?.cuota_conversaciones_mes ?? null}
        />
        <Medidor
          etiqueta="Documentos"
          usado={conocimiento.total}
          tope={conocimiento.cuota_documentos}
          unidad="docs"
        />

        {empresa?.precio_mensual && (
          <div className="border-t border-slate-100 pt-4">
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-muted">Mensualidad</dt>
                <dd className="font-semibold tabular text-ink">
                  {moneda(empresa.precio_mensual, empresa.moneda ?? "USD")}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-muted">Cuota mensual</dt>
                <dd className="tabular text-ink">
                  {num(empresa.cuota_conversaciones_mes ?? 0)} conversaciones
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-faint">
              Pasarte de la cuota no corta el servicio: se factura como conversaciones extra.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
