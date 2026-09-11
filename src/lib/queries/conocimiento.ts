import "server-only";
import { withTenant, withTenantWrite, type Tenant } from "@/lib/db";
import type { Documento, EstadoDocumento, TipoDocumento } from "@/types/asistia";

/**
 * Base de conocimiento (F3). La tercera cosa configurable (D16).
 *
 * Reparto de trabajo importante: el backoffice SOLO registra el documento en
 * estado PENDIENTE. Quien lo trocea, calcula embeddings y lo pasa a INGESTADO
 * es el flujo `ASI_` de ingesta (A1). Por eso aquí no hay nada de pgvector: si
 * el backoffice escribiera fragmentos, habría dos ingestas que mantener.
 */

export interface FilaDocumento extends Documento {
  fragmentos: number;
  subido_por_email: string | null;
}

export function listarDocumentos(t: Tenant, empresaId: string, incluirRetirados = false) {
  return withTenant(t, (q) =>
    q.rows<FilaDocumento>(
      `select d.*,
              (select count(*)::int from fragmentos f where f.documento_id = d.id) as fragmentos,
              u.email as subido_por_email
         from documentos d
         left join usuarios u on u.id = d.subido_por
        where d.empresa_id = $1
          and ($2::boolean or d.estado <> 'RETIRADO')
        order by d.subido_en desc`,
      [empresaId, incluirRetirados]
    )
  );
}

export interface ResumenConocimiento {
  total: number;
  ingestados: number;
  pendientes: number;
  con_error: number;
  fragmentos: number;
  cuota_documentos: number | null;
}

export function resumenConocimiento(t: Tenant, empresaId: string) {
  return withTenant(t, async (q) => {
    const fila = await q.row<ResumenConocimiento>(
      `select
         (select count(*)::int from documentos
           where empresa_id = $1 and estado <> 'RETIRADO') as total,
         (select count(*)::int from documentos
           where empresa_id = $1 and estado = 'INGESTADO') as ingestados,
         (select count(*)::int from documentos
           where empresa_id = $1 and estado in ('PENDIENTE','INGESTANDO')) as pendientes,
         (select count(*)::int from documentos
           where empresa_id = $1 and estado = 'ERROR') as con_error,
         (select count(*)::int from fragmentos where empresa_id = $1) as fragmentos,
         (select p.cuota_documentos
            from suscripciones s join planes p on p.id = s.plan_id
           where s.empresa_id = $1 and s.fin is null) as cuota_documentos`,
      [empresaId]
    );
    return fila!;
  });
}

export interface NuevoDocumento {
  empresaId: string;
  nombre: string;
  tipo: TipoDocumento;
  /** Ruta en Supabase Storage; null para tipo TEXTO. */
  storagePath: string | null;
  /** Solo para tipo TEXTO: el contenido pegado por el usuario. */
  textoExtraido: string | null;
  huellaSha256: string;
  bytes: number | null;
  subidoPor: string;
}

/**
 * Registra el documento. Si ya existe uno con la misma huella para esa empresa,
 * el índice `unique (empresa_id, huella_sha256)` lo impide: subir dos veces el
 * mismo PDF no duplica conocimiento ni gasta embeddings de más.
 *
 * Excepción: si el duplicado estaba RETIRADO, se reactiva a PENDIENTE para que
 * el flujo de ingesta lo vuelva a procesar.
 */
export function registrarDocumento(t: Tenant, datos: NuevoDocumento) {
  return withTenantWrite(t, (q) =>
    q.row<Documento & { era_nuevo: boolean }>(
      `insert into documentos
         (empresa_id, nombre, tipo, storage_path, texto_extraido, huella_sha256, bytes, subido_por, estado)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDIENTE')
       on conflict (empresa_id, huella_sha256) do update
          set estado        = 'PENDIENTE',
              nombre        = excluded.nombre,
              storage_path  = excluded.storage_path,
              texto_extraido= excluded.texto_extraido,
              bytes         = excluded.bytes,
              subido_por    = excluded.subido_por,
              subido_en     = now(),
              retirado_en   = null,
              error_detalle = null
       -- xmax = 0 distingue el INSERT del UPDATE del upsert. Lo necesitan el
       -- evento que se manda al flujo de ingesta y el mensaje al usuario:
       -- "subido" y "ya estaba, se reprocesa" no son la misma noticia.
       returning *, (xmax = 0) as era_nuevo`,
      [
        datos.empresaId,
        datos.nombre,
        datos.tipo,
        datos.storagePath,
        datos.textoExtraido,
        datos.huellaSha256,
        datos.bytes,
        datos.subidoPor,
      ]
    )
  );
}

/**
 * Retirar es inmediato (D26): marca RETIRADO y borra los fragmentos, así que el
 * agente deja de poder citarlo en la siguiente consulta. Lo hace la función de
 * la base, que además falla si el documento no es visible para la sesión.
 */
export function retirarDocumento(t: Tenant, documentoId: string) {
  return withTenantWrite(t, (q) =>
    q.rows(`select fn_retirar_documento($1::uuid)`, [documentoId])
  );
}

export const ETIQUETA_ESTADO_DOC: Record<EstadoDocumento, string> = {
  PENDIENTE: "En cola",
  INGESTANDO: "Procesando",
  INGESTADO: "Listo",
  ERROR: "Con error",
  RETIRADO: "Retirado",
};
