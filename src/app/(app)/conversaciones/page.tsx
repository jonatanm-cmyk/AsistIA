import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { requireEmpresa, tenantDe } from "@/lib/session";
import { listarConversaciones } from "@/lib/queries/conversaciones";
import Filtros from "./Filtros";
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
import { compacto, fechaHora, hace, num } from "@/lib/format";
import type { EstadoConversacion } from "@/types/asistia";

export const metadata = { title: "Conversaciones" };

const POR_PAGINA = 25;

export default async function ConversacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sesion = await requireEmpresa();

  const pagina = Math.max(1, Number(primero(sp.p)) || 1);
  const estado = (primero(sp.estado) ?? "TODAS") as EstadoConversacion | "TODAS";

  const filas = await listarConversaciones(tenantDe(sesion), sesion.empresaId, {
    estado: estado === "ABIERTA" || estado === "CERRADA" ? estado : "TODAS",
    soloEscaladas: primero(sp.escaladas) === "1",
    busqueda: primero(sp.q) ?? "",
    limite: POR_PAGINA,
    desplazamiento: (pagina - 1) * POR_PAGINA,
  });

  // `count(*) over ()` viene en cada fila; sin filas no hay total que leer.
  const total = filas[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <PageHeader
        titulo="Conversaciones"
        descripcion="Qué respondió el agente y con qué documentos. La bandeja para atender es Chatwoot."
      />

      <div className="mb-4">
        <Filtros />
      </div>

      <Card>
        <Tabla>
          <Thead>
            <Th>Cliente</Th>
            <Th>Estado</Th>
            <Th alineacion="right">Mensajes</Th>
            <Th alineacion="right">Tokens</Th>
            <Th alineacion="right">Inicio</Th>
            <Th alineacion="right">Último mensaje</Th>
          </Thead>
          <Tbody>
            {filas.length === 0 ? (
              <FilaVacia
                columnas={6}
                mensaje="Ninguna conversación coincide con estos filtros."
              />
            ) : (
              filas.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/conversaciones/${c.id}`} className="block">
                      <span className="flex items-center gap-1.5 font-medium text-ink hover:text-brand-700">
                        {c.nombre_perfil ?? c.telefono}
                        {c.escalada && (
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-status-serious"
                            aria-label="Escalada a una persona"
                          />
                        )}
                      </span>
                      {c.nombre_perfil && (
                        <span className="block text-xs tabular text-ink-faint">{c.telefono}</span>
                      )}
                    </Link>
                  </Td>
                  <Td>
                    <EstadoBadge estado={c.estado} />
                  </Td>
                  <Td alineacion="right" className="tabular">
                    {num(c.mensajes)}
                  </Td>
                  <Td alineacion="right" className="tabular text-ink-soft">
                    {compacto(c.tokens)}
                  </Td>
                  <Td alineacion="right" className="whitespace-nowrap text-xs text-ink-soft">
                    {fechaHora(c.abierta_en)}
                  </Td>
                  <Td alineacion="right" className="whitespace-nowrap text-xs text-ink-soft">
                    {hace(c.ultimo_mensaje_en)}
                  </Td>
                </tr>
              ))
            )}
          </Tbody>
        </Tabla>

        {paginas > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
            <p className="text-xs text-ink-soft tabular">
              {num(total)} conversaciones · página {pagina} de {paginas}
            </p>
            <div className="flex gap-2">
              <EnlacePagina sp={sp} destino={pagina - 1} deshabilitado={pagina <= 1}>
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </EnlacePagina>
              <EnlacePagina sp={sp} destino={pagina + 1} deshabilitado={pagina >= paginas}>
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </EnlacePagina>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

function EnlacePagina({
  sp,
  destino,
  deshabilitado,
  children,
}: {
  sp: Record<string, string | string[] | undefined>;
  destino: number;
  deshabilitado: boolean;
  children: React.ReactNode;
}) {
  if (deshabilitado) {
    return (
      <span className="btn-secondary pointer-events-none opacity-40" aria-disabled>
        {children}
      </span>
    );
  }
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(sp)) {
    const v = Array.isArray(valor) ? valor[0] : valor;
    if (v) params.set(clave, v);
  }
  params.set("p", String(destino));
  return (
    <Link href={`/conversaciones?${params}`} scroll={false} className="btn-secondary">
      {children}
    </Link>
  );
}

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}
