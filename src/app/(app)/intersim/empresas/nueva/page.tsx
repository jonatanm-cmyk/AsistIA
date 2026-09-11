import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireIntersim, tenantDe } from "@/lib/session";
import { listarPlanes } from "@/lib/queries/empresas";
import FormularioAlta from "../FormularioAlta";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Nueva empresa" };

export default async function NuevaEmpresaPage() {
  const sesion = await requireIntersim();
  const planes = await listarPlanes(tenantDe(sesion));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/intersim/empresas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Empresas
      </Link>

      <PageHeader
        titulo="Nueva empresa"
        descripcion="La cuenta nace PENDIENTE. Se activa cuando el número esté habilitado."
      />

      <FormularioAlta planes={planes} />
    </div>
  );
}
