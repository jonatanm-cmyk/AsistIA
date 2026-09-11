import { Suspense } from "react";
import { FileText, Type } from "lucide-react";
import { requireEmpresa, tenantDe } from "@/lib/session";
import { listarDocumentos, resumenConocimiento } from "@/lib/queries/conocimiento";
import { Medidor } from "@/components/charts/Barras";
import SubirDocumento from "./SubirDocumento";
import BotonRetirar from "./BotonRetirar";
import {
  Alerta,
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
import { fechaHora, num } from "@/lib/format";
import type { Tenant } from "@/lib/db";

export const metadata = { title: "Base de conocimiento" };

export default async function ConocimientoPage() {
  const sesion = await requireEmpresa();
  const t = tenantDe(sesion);

  return (
    <>
      <PageHeader
        titulo="Base de conocimiento"
        descripcion="Lo único sobre lo que el agente puede responder. Si no está aquí, no lo sabe."
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
            <ListaDocumentos t={t} empresaId={sesion.empresaId} />
          </Suspense>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader titulo="Añadir documento" />
            <div className="card-pad">
              <SubirDocumento />
            </div>
          </Card>

          <Suspense fallback={<Skeleton className="h-48 w-full rounded-2xl" />}>
            <Resumen t={t} empresaId={sesion.empresaId} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function Resumen({ t, empresaId }: { t: Tenant; empresaId: string }) {
  const r = await resumenConocimiento(t, empresaId);

  return (
    <Card>
      <CardHeader titulo="Estado" />
      <div className="card-pad space-y-4">
        <Medidor
          etiqueta="Documentos del plan"
          usado={r.total}
          tope={r.cuota_documentos}
          unidad="docs"
        />

        <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
          <Dato etiqueta="Listos" valor={num(r.ingestados)} />
          <Dato etiqueta="En cola" valor={num(r.pendientes)} />
          <Dato etiqueta="Con error" valor={num(r.con_error)} resaltar={r.con_error > 0} />
          <Dato etiqueta="Fragmentos" valor={num(r.fragmentos)} />
        </dl>

        {r.con_error > 0 && (
          <Alerta tono="critico" titulo="Hay documentos que no se pudieron procesar">
            Vuelve a subirlos. Si siguen fallando, avisa a Intersim con el nombre del archivo.
          </Alerta>
        )}
      </div>
    </Card>
  );
}

function Dato({
  etiqueta,
  valor,
  resaltar,
}: {
  etiqueta: string;
  valor: string;
  resaltar?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-faint">{etiqueta}</dt>
      <dd
        className={`mt-0.5 text-lg font-bold tabular ${resaltar ? "text-red-700" : "text-ink"}`}
      >
        {valor}
      </dd>
    </div>
  );
}

async function ListaDocumentos({ t, empresaId }: { t: Tenant; empresaId: string }) {
  const docs = await listarDocumentos(t, empresaId);

  return (
    <Card>
      <CardHeader
        titulo="Documentos"
        descripcion="El agente solo cita los que están listos."
      />
      <Tabla>
        <Thead>
          <Th>Documento</Th>
          <Th>Estado</Th>
          <Th alineacion="right">Fragmentos</Th>
          <Th alineacion="right">Subido</Th>
          <Th />
        </Thead>
        <Tbody>
          {docs.length === 0 ? (
            <FilaVacia
              columnas={5}
              mensaje="Todavía no hay documentos. Sube uno para que el agente tenga de qué hablar."
            />
          ) : (
            docs.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <Td>
                  <span className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-soft">
                      {d.tipo === "TEXTO" ? (
                        <Type className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink" title={d.nombre}>
                        {d.nombre}
                      </span>
                      <span className="block text-xs text-ink-faint">
                        {d.tipo}
                        {d.bytes ? ` · ${(d.bytes / 1024).toFixed(0)} KB` : ""}
                        {d.subido_por_email ? ` · ${d.subido_por_email}` : ""}
                      </span>
                    </span>
                  </span>
                </Td>
                <Td>
                  <EstadoBadge estado={d.estado} />
                  {d.estado === "ERROR" && d.error_detalle && (
                    <span
                      className="mt-1 block max-w-[16rem] truncate text-xs text-red-700"
                      title={d.error_detalle}
                    >
                      {d.error_detalle}
                    </span>
                  )}
                </Td>
                <Td alineacion="right" className="tabular text-ink-soft">
                  {d.estado === "INGESTADO" ? num(d.fragmentos) : "—"}
                </Td>
                <Td alineacion="right" className="whitespace-nowrap text-xs text-ink-soft">
                  {fechaHora(d.subido_en)}
                </Td>
                <Td alineacion="right">
                  <BotonRetirar id={d.id} nombre={d.nombre} />
                </Td>
              </tr>
            ))
          )}
        </Tbody>
      </Tabla>
    </Card>
  );
}
