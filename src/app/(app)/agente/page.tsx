import { Suspense } from "react";
import { requireEmpresa, tenantDe } from "@/lib/session";
import { configuracionVigente, historialConfiguraciones } from "@/lib/queries/agente";
import FormularioAgente from "./FormularioAgente";
import BotonRestaurar from "./BotonRestaurar";
import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
  Skeleton,
  Tabla,
  Tbody,
  Td,
  Th,
  Thead,
  FilaVacia,
} from "@/components/ui";
import { fechaHora } from "@/lib/format";
import type { Tenant } from "@/lib/db";

export const metadata = { title: "Mi agente" };

export default async function AgentePage() {
  const sesion = await requireEmpresa();
  const t = tenantDe(sesion);
  const configuracion = await configuracionVigente(t, sesion.empresaId);

  return (
    <>
      <PageHeader
        titulo="Mi agente"
        descripcion="Tono y reglas de negocio. Es lo que el agente lleva puesto en cada respuesta."
        acciones={
          configuracion ? (
            <Badge tono="marca">Versión {configuracion.version} vigente</Badge>
          ) : (
            <Badge tono="aviso">Sin configurar</Badge>
          )
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {/* `key` con el id de la versión vigente: al restaurar, el formulario
              tiene que REMONTARSE para que el estado de las reglas se rehaga
              desde la versión nueva. Sin esto, React reutiliza la instancia y
              la lista de reglas se queda con la anterior — la restauración
              habría ocurrido en la base pero no en la pantalla. */}
          <FormularioAgente key={configuracion?.id ?? "nueva"} configuracion={configuracion} />
        </div>

        <div className="xl:col-span-1">
          {/* El historial no bloquea el formulario: llega cuando llegue. */}
          <Suspense fallback={<Skeleton className="h-72 w-full rounded-2xl" />}>
            <Historial t={t} empresaId={sesion.empresaId} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function Historial({ t, empresaId }: { t: Tenant; empresaId: string }) {
  const versiones = await historialConfiguraciones(t, empresaId, 15);

  return (
    <Card>
      <CardHeader
        titulo="Historial de versiones"
        descripcion="Cada guardado queda registrado con quién lo hizo."
      />
      <Tabla>
        <Thead>
          <Th>Versión</Th>
          <Th>Tono</Th>
          <Th alineacion="right">Cuándo</Th>
          <Th />
        </Thead>
        <Tbody>
          {versiones.length === 0 ? (
            <FilaVacia columnas={4} mensaje="Todavía no has guardado ninguna configuración." />
          ) : (
            versiones.map((v) => (
              <tr key={v.id} className={v.vigente ? "bg-brand-50/40" : undefined}>
                <Td>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular text-ink">v{v.version}</span>
                    {v.vigente && <Badge tono="bien">vigente</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    {v.reglas} {v.reglas === 1 ? "regla" : "reglas"}
                    {v.creada_por_email ? ` · ${v.creada_por_email}` : ""}
                  </span>
                </Td>
                <Td className="text-ink-muted">{v.tono}</Td>
                <Td alineacion="right" className="whitespace-nowrap text-xs text-ink-soft">
                  {fechaHora(v.creada_en)}
                </Td>
                <Td alineacion="right">
                  {!v.vigente && <BotonRestaurar id={v.id} version={v.version} />}
                </Td>
              </tr>
            ))
          )}
        </Tbody>
      </Tabla>
    </Card>
  );
}
