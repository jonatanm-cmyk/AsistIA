import { Suspense } from "react";
import { requireEmpresa, tenantDe } from "@/lib/session";
import { configuracionVigente, historialConfiguraciones } from "@/lib/queries/agente";
import FormularioAgente from "./FormularioAgente";
import BotonRestaurar from "./BotonRestaurar";
import PanelPrueba from "./PanelPrueba";
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

/**
 * NO se espera ninguna consulta aquí.
 *
 * Antes, la página hacía `await configuracionVigente(...)` antes del `return`:
 * el navegador no recibía NADA hasta que la base respondía. Con ~130 ms por ida
 * y vuelta, eso era medio segundo largo de pantalla en blanco tras cada clic en
 * "Mi agente" — justo la lentitud de navegación que se notaba.
 *
 * Ahora la cabecera sale de inmediato y el formulario llega por su `<Suspense>`.
 * Lo único que se pierde es poder poner el número de versión en la cabecera:
 * eso exigiría esperar la consulta, así que la insignia se movió dentro.
 */
export default async function AgentePage() {
  const sesion = await requireEmpresa();
  const t = tenantDe(sesion);

  return (
    <>
      <PageHeader
        titulo="Mi agente"
        descripcion="Tono y reglas de negocio. Es lo que el agente lleva puesto en cada respuesta."
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Suspense
            fallback={
              <div className="space-y-5">
                <Skeleton className="h-52 w-full rounded-2xl" />
                <Skeleton className="h-72 w-full rounded-2xl" />
              </div>
            }
          >
            <Configuracion t={t} empresaId={sesion.empresaId} />
          </Suspense>
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

async function Configuracion({ t, empresaId }: { t: Tenant; empresaId: string }) {
  const configuracion = await configuracionVigente(t, empresaId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {configuracion
            ? "Guardar creará una versión nueva. La anterior se conserva."
            : "Todavía no has configurado el agente."}
        </p>
        {configuracion ? (
          <Badge tono="marca">Versión {configuracion.version} vigente</Badge>
        ) : (
          <Badge tono="aviso">Sin configurar</Badge>
        )}
      </div>

      {/* `key` con el id de la versión vigente: al restaurar, el formulario
          tiene que REMONTARSE para que el estado de las reglas se rehaga desde
          la versión nueva. Sin esto, React reutiliza la instancia y la lista de
          reglas se queda con la anterior — la restauración habría ocurrido en
          la base pero no en la pantalla. */}
      <FormularioAgente key={configuracion?.id ?? "nueva"} configuracion={configuracion} />

      {/* Debajo del formulario y no al lado: se prueba lo que YA está guardado,
          así que el orden de lectura —configuro, guardo, pruebo— es el orden
          real de la tarea. La `key` lo reinicia al restaurar una versión: dejar
          en pantalla la respuesta de la versión anterior sería enseñar un
          resultado que ya no corresponde a lo que hay vigente. */}
      <PanelPrueba
        key={`prueba-${configuracion?.id ?? "nueva"}`}
        version={configuracion?.version ?? null}
      />
    </div>
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
