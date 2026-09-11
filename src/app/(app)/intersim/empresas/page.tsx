import Link from "next/link";
import { Plus } from "lucide-react";
import { requireIntersim, tenantDe } from "@/lib/session";
import { listarEmpresas } from "@/lib/queries/empresas";
import {
  Card,
  EstadoBadge,
  FilaVacia,
  PageHeader,
  Tabla,
  Tbody,
  Td,
  Th,
  Thead,
} from "@/components/ui";
import { fecha, num } from "@/lib/format";

export const metadata = { title: "Empresas" };

export default async function EmpresasPage() {
  const sesion = await requireIntersim();
  const empresas = await listarEmpresas(tenantDe(sesion));

  return (
    <>
      <PageHeader
        titulo="Empresas"
        descripcion="Las cuentas suscritas a AsistIA."
        acciones={
          <Link href="/intersim/empresas/nueva" className="btn-primary">
            <Plus className="h-4 w-4" />
            Nueva empresa
          </Link>
        }
      />

      <Card>
        <Tabla>
          <Thead>
            <Th>Empresa</Th>
            <Th>Estado</Th>
            <Th>Plan</Th>
            <Th>Canal</Th>
            <Th alineacion="right">Usuarios</Th>
            <Th alineacion="right">Documentos</Th>
            <Th alineacion="right">Alta</Th>
          </Thead>
          <Tbody>
            {empresas.length === 0 ? (
              <FilaVacia
                columnas={7}
                mensaje="Todavía no hay empresas. Crea la primera para empezar."
              />
            ) : (
              empresas.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/intersim/empresas/${e.id}`} className="block">
                      <span className="font-medium text-ink hover:text-brand-700">{e.nombre}</span>
                      <span className="block text-xs text-ink-faint">
                        <code>{e.client_key}</code> · {e.responsable_email}
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <EstadoBadge estado={e.estado} />
                  </Td>
                  <Td className="text-ink-soft">{e.plan_nombre ?? "—"}</Td>
                  <Td>
                    <EstadoBadge estado={e.canal_estado} />
                  </Td>
                  <Td alineacion="right" className="tabular">
                    {num(e.usuarios)}
                  </Td>
                  <Td alineacion="right" className="tabular">
                    {num(e.documentos)}
                  </Td>
                  <Td alineacion="right" className="whitespace-nowrap text-xs text-ink-soft">
                    {fecha(e.creada_en)}
                  </Td>
                </tr>
              ))
            )}
          </Tbody>
        </Tabla>
      </Card>
    </>
  );
}
