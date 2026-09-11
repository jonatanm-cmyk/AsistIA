import "server-only";
import { withTenant, type Tenant } from "@/lib/db";
import type { Autor, Direccion, EstadoConversacion, MotivoEscalado } from "@/types/asistia";

/**
 * Conversaciones. Lectura y nada más: la bandeja operativa es Chatwoot (D41,
 * D31) y el modo humano/agente se conmuta ahí (D32). Esta vista existe para
 * auditar qué contestó el agente y con qué fragmentos, que es justo lo que
 * Chatwoot no muestra.
 */

export interface FiltroConversaciones {
  estado?: EstadoConversacion | "TODAS";
  soloEscaladas?: boolean;
  busqueda?: string;
  limite?: number;
  desplazamiento?: number;
}

export interface FilaConversacion {
  id: string;
  estado: EstadoConversacion;
  abierta_en: string;
  ultimo_mensaje_en: string;
  ventana_24h_hasta: string | null;
  telefono: string;
  nombre_perfil: string | null;
  mensajes: number;
  escalada: boolean;
  tokens: number;
  total: number;
}

/**
 * Listado paginado. `count(*) over ()` devuelve el total junto a las filas: una
 * sola consulta en vez de una para los datos y otra para el contador.
 */
export function listarConversaciones(
  t: Tenant,
  empresaId: string,
  filtro: FiltroConversaciones = {}
) {
  const {
    estado = "TODAS",
    soloEscaladas = false,
    busqueda = "",
    limite = 25,
    desplazamiento = 0,
  } = filtro;

  return withTenant(t, (q) =>
    q.rows<FilaConversacion>(
      `select c.id, c.estado, c.abierta_en, c.ultimo_mensaje_en, c.ventana_24h_hasta,
              cf.telefono, cf.nombre_perfil,
              (select count(*)::int from mensajes m where m.conversacion_id = c.id) as mensajes,
              exists (select 1 from escalados e where e.conversacion_id = c.id) as escalada,
              (select coalesce(sum(coalesce(m.tokens_entrada,0) + coalesce(m.tokens_salida,0)), 0)::int
                 from mensajes m where m.conversacion_id = c.id) as tokens,
              count(*) over ()::int as total
         from conversaciones c
         join clientes_finales cf on cf.id = c.cliente_final_id
        where c.empresa_id = $1
          and ($2 = 'TODAS' or c.estado = $2)
          and (not $3::boolean or exists (select 1 from escalados e where e.conversacion_id = c.id))
          and ($4 = '' or cf.telefono ilike '%' || $4 || '%'
                       or coalesce(cf.nombre_perfil, '') ilike '%' || $4 || '%')
        order by c.ultimo_mensaje_en desc
        limit $5 offset $6`,
      [empresaId, estado, soloEscaladas, busqueda, limite, desplazamiento]
    )
  );
}

export interface DetalleConversacion {
  id: string;
  estado: EstadoConversacion;
  abierta_en: string;
  ultimo_mensaje_en: string;
  ventana_24h_hasta: string | null;
  cerrada_en: string | null;
  chatwoot_conversation_id: number | null;
  telefono: string;
  nombre_perfil: string | null;
  canal_numero: string | null;
}

export function detalleConversacion(t: Tenant, empresaId: string, id: string) {
  return withTenant(t, (q) =>
    q.row<DetalleConversacion>(
      `select c.id, c.estado, c.abierta_en, c.ultimo_mensaje_en, c.ventana_24h_hasta,
              c.cerrada_en, c.chatwoot_conversation_id,
              cf.telefono, cf.nombre_perfil,
              ca.display_phone_number as canal_numero
         from conversaciones c
         join clientes_finales cf on cf.id = c.cliente_final_id
         join canales ca          on ca.id = c.canal_id
        where c.id = $1 and c.empresa_id = $2`,
      [id, empresaId]
    )
  );
}

export interface MensajeDetalle {
  id: string;
  direccion: Direccion;
  autor: Autor;
  contenido: string;
  creado_en: string;
  estado_entrega: string;
  modelo: string | null;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  latencia_ms: number | null;
  guardarrail_ok: boolean | null;
  fragmentos: { nombre: string; encabezado: string | null; similitud: number | null }[];
}

/**
 * Mensajes con los fragmentos que el agente usó para cada respuesta. El
 * `json_agg` evita el N+1: una consulta trae la conversación entera con su
 * trazabilidad, no una consulta por mensaje.
 */
export function mensajesDeConversacion(t: Tenant, empresaId: string, conversacionId: string) {
  return withTenant(t, (q) =>
    q.rows<MensajeDetalle>(
      `select m.id, m.direccion, m.autor, m.contenido, m.creado_en, m.estado_entrega,
              m.modelo, m.tokens_entrada, m.tokens_salida, m.latencia_ms, m.guardarrail_ok,
              coalesce(
                (select json_agg(json_build_object(
                          'nombre', d.nombre,
                          'encabezado', f.encabezado,
                          'similitud', mf.similitud
                        ) order by mf.similitud desc)
                   from mensajes_fragmentos mf
                   join fragmentos f  on f.id = mf.fragmento_id
                   join documentos d  on d.id = f.documento_id
                  where mf.mensaje_id = m.id),
                '[]'::json
              ) as fragmentos
         from mensajes m
        where m.conversacion_id = $1 and m.empresa_id = $2
        order by m.creado_en asc`,
      [conversacionId, empresaId]
    )
  );
}

export interface EscaladoDetalle {
  id: string;
  motivo: MotivoEscalado;
  creado_en: string;
  correo_enviado_en: string | null;
}

export function escaladosDeConversacion(t: Tenant, empresaId: string, conversacionId: string) {
  return withTenant(t, (q) =>
    q.rows<EscaladoDetalle>(
      `select id, motivo, creado_en, correo_enviado_en
         from escalados
        where conversacion_id = $1 and empresa_id = $2
        order by creado_en desc`,
      [conversacionId, empresaId]
    )
  );
}
