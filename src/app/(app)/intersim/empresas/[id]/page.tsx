import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireIntersim, tenantDe } from "@/lib/session";
import {
  listarPlanes,
  obtenerEmpresa,
  planVigenteDe,
  usuariosDeEmpresa,
} from "@/lib/queries/empresas";
import { estadoServicio } from "@/lib/queries/panel";
import FormularioEdicion from "../FormularioEdicion";
import {
  Card,
  CardHeader,
  EstadoBadge,
  FilaVacia,
  PageHeader,
  Skeleton,
  Tabla,
  Tbody,
  Td,
  Th,
  Thead,
} from "@/components/ui";
import { fecha, fechaHora, num } from "@/lib/format";
import type { Tenant } from "@/lib/db";

export const metadata = { title: "Empresa" };

export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await requireIntersim();
  const t = tenantDe(sesion);

  const [empresa, planes, planActualId] = await Promise.all([
    obtenerEmpresa(t, id),
    listarPlanes(t),
    planVigenteDe(t, id),
  ]);

  if (!empresa) notFound();

  return (
    <>
      <Link
        href="/intersim/empresas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Empresas
      </Link>

      <PageHeader
        titulo={empresa.nombre}
        descripcion={`${empresa.client_key} · alta el ${fecha(empresa.creada_en)}`}
        acciones={<EstadoBadge estado={empresa.estado} />}
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader titulo="Datos de la cuenta" />
            <div className="card-pad">
              <FormularioEdicion
                empresa={empresa}
                planes={planes}
                planActualId={planActualId}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Suspense fallback={<Skeleton className="h-56 w-full rounded-2xl" />}>
            <Configuracion t={t} empresaId={id} />
          </Suspense>

          <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
            <Usuarios t={t} empresaId={id} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

/**
 * Cómo de lista está la empresa. Reutiliza la misma consulta que el widget de
 * salud del panel de empresa: la pregunta es idéntica, cambia quién la hace.
 */
async function Configuracion({ t, empresaId }: { t: Tenant; empresaId: string }) {
  const e = await estadoServicio(t, empresaId);

  return (
    <Card>
      <CardHeader titulo="Configuración" descripcion="Lo que la empresa lleva montado." />
      <dl className="card-pad space-y-3 text-sm">
        <Fila
          etiqueta="Canal"
          valor={e.canal_numero ?? "Sin número"}
          extra={<EstadoBadge estado={e.canal_estado} />}
        />
        <Fila
          etiqueta="Agente"
          valor={e.config_version ? `v${e.config_version} · ${e.config_tono}` : "Sin configurar"}
        />
        <Fila etiqueta="Reglas activas" valor={num(e.reglas_activas)} />
        <Fila
          etiqueta="Documentos"
          valor={`${num(e.docs_ingestados)} listos${
            e.docs_pendientes ? ` · ${num(e.docs_pendientes)} en cola` : ""
          }${e.docs_error ? ` · ${num(e.docs_error)} con error` : ""}`}
        />
        <Fila etiqueta="Conversaciones del mes" valor={num(e.conversaciones_mes)} />
        <Fila etiqueta="Abiertas ahora" valor={num(e.conversaciones_abiertas)} />
      </dl>
    </Card>
  );
}

function Fila({
  etiqueta,
  valor,
  extra,
}: {
  etiqueta: string;
  valor: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs uppercase tracking-wider text-ink-faint">{etiqueta}</dt>
      <dd className="flex items-center gap-2 text-right text-sm text-ink">
        {valor}
        {extra}
      </dd>
    </div>
  );
}

async function Usuarios({ t, empresaId }: { t: Tenant; empresaId: string }) {
  const usuarios = await usuariosDeEmpresa(t, empresaId);

  return (
    <Card>
      <CardHeader
        titulo="Usuarios"
        descripcion="Una empresa tiene un único administrador."
      />
      <Tabla>
        <Thead>
          <Th>Correo</Th>
          <Th>Estado</Th>
          <Th alineacion="right">Alta</Th>
        </Thead>
        <Tbody>
          {usuarios.length === 0 ? (
            <FilaVacia
              columnas={3}
              mensaje="Sin usuarios. La empresa no puede entrar al backoffice."
            />
          ) : (
            usuarios.map((u) => (
              <tr key={u.id}>
                <Td>
                  <span className="block font-medium text-ink">{u.email}</span>
                  {u.nombre && <span className="block text-xs text-ink-faint">{u.nombre}</span>}
                </Td>
                <Td>
                  <EstadoBadge estado={u.estado} />
                </Td>
                <Td alineacion="right" className="whitespace-nowrap text-xs text-ink-soft">
                  {fechaHora(u.creado_en)}
                </Td>
              </tr>
            ))
          )}
        </Tbody>
      </Tabla>
    </Card>
  );
}
