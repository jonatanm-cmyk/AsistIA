import "server-only";
import { withTenant, type Tenant } from "@/lib/db";
import type { EstadoCanal, EstadoEmpresa, MotivoEscalado } from "@/types/asistia";

/**
 * Consultas del dashboard de una empresa (`/panel`).
 *
 * Reglas que sigue todo este archivo:
 *
 *  1. `empresa_id` va SIEMPRE en el WHERE, aunque la RLS ya filtre. La RLS es la
 *     red de seguridad; si `DATABASE_URL` apunta al rol `postgres` (BYPASSRLS)
 *     el filtro explícito es la única defensa. Ver la cabecera de `db.ts`.
 *  2. Una función = una consulta = un widget. Cada una se envuelve en su propio
 *     `<Suspense>`, así que la página no espera a la más lenta.
 *  3. Las series temporales se rellenan con `generate_series`: un día sin
 *     actividad es un 0 en el gráfico, no un hueco que la línea salta.
 *  4. Los escalados se cuentan de la tabla `escalados`, NO de
 *     `uso_diario.escalados`: `fn_registrar_mensaje` incrementa conversaciones,
 *     mensajes y tokens, pero nunca esa columna. Contarla daría siempre cero.
 */

export interface ResumenEmpresa {
  nombre: string;
  estado: EstadoEmpresa;
  client_key: string;
  creada_en: string;
  plan_nombre: string | null;
  cuota_conversaciones_mes: number | null;
  cuota_documentos: number | null;
  moneda: string | null;
  precio_mensual: string | null;
}

export function resumenEmpresa(t: Tenant, empresaId: string) {
  return withTenant(t, (q) =>
    q.row<ResumenEmpresa>(
      `select e.nombre, e.estado, e.client_key, e.creada_en,
              p.nombre as plan_nombre, p.cuota_conversaciones_mes,
              p.cuota_documentos, p.moneda, p.precio_mensual
         from empresas e
         left join suscripciones s on s.empresa_id = e.id and s.fin is null
         left join planes p on p.id = s.plan_id
        where e.id = $1`,
      [empresaId]
    )
  );
}

export interface PuntoUso {
  fecha: string;
  conversaciones: number;
  entrantes: number;
  salientes: number;
  tokens: number;
  escalados: number;
}

/** Serie diaria de los últimos `dias` días, con los huecos rellenos a cero. */
export function serieUso(t: Tenant, empresaId: string, dias: number) {
  return withTenant(t, (q) =>
    q.rows<PuntoUso>(
      `with dias as (
         select generate_series(
                  current_date - ($2::int - 1),
                  current_date,
                  interval '1 day'
                )::date as fecha
       ),
       esc as (
         select creado_en::date as fecha, count(*)::int as total
           from escalados
          where empresa_id = $1
            and creado_en >= current_date - ($2::int - 1)
          group by 1
       )
       select to_char(d.fecha, 'YYYY-MM-DD')            as fecha,
              coalesce(u.conversaciones_nuevas, 0)::int as conversaciones,
              coalesce(u.mensajes_entrantes, 0)::int    as entrantes,
              coalesce(u.mensajes_salientes, 0)::int    as salientes,
              coalesce(u.tokens_entrada + u.tokens_salida, 0)::int as tokens,
              coalesce(e.total, 0)::int                 as escalados
         from dias d
         left join uso_diario u on u.fecha = d.fecha and u.empresa_id = $1
         left join esc e        on e.fecha = d.fecha
        order by d.fecha`,
      [empresaId, dias]
    )
  );
}

export interface TotalesPeriodo {
  conversaciones: number;
  conversaciones_previo: number;
  mensajes: number;
  mensajes_previo: number;
  tokens: number;
  tokens_previo: number;
  escalados: number;
  escalados_previo: number;
}

/**
 * Totales de la ventana actual y de la inmediatamente anterior del mismo
 * tamaño, para poder mostrar la variación. Una sola consulta: dos ventanas con
 * `filter`, no dos viajes a la base.
 */
export function totalesPeriodo(t: Tenant, empresaId: string, dias: number) {
  return withTenant(t, async (q) => {
    const fila = await q.row<TotalesPeriodo>(
      `with corte as (
         select current_date - ($2::int - 1) as inicio_actual,
                current_date - ($2::int * 2 - 1) as inicio_previo
       ),
       u as (
         select
           coalesce(sum(conversaciones_nuevas) filter (where fecha >= c.inicio_actual), 0)::int as conversaciones,
           coalesce(sum(conversaciones_nuevas) filter (where fecha <  c.inicio_actual), 0)::int as conversaciones_previo,
           coalesce(sum(mensajes_entrantes + mensajes_salientes) filter (where fecha >= c.inicio_actual), 0)::int as mensajes,
           coalesce(sum(mensajes_entrantes + mensajes_salientes) filter (where fecha <  c.inicio_actual), 0)::int as mensajes_previo,
           coalesce(sum(tokens_entrada + tokens_salida) filter (where fecha >= c.inicio_actual), 0)::int as tokens,
           coalesce(sum(tokens_entrada + tokens_salida) filter (where fecha <  c.inicio_actual), 0)::int as tokens_previo
         from uso_diario, corte c
        where empresa_id = $1 and fecha >= c.inicio_previo
       ),
       e as (
         select
           count(*) filter (where creado_en::date >= c.inicio_actual)::int as escalados,
           count(*) filter (where creado_en::date <  c.inicio_actual)::int as escalados_previo
         from escalados, corte c
        where empresa_id = $1 and creado_en::date >= c.inicio_previo
       )
       select u.*, e.* from u, e`,
      [empresaId, dias]
    );
    return (
      fila ?? {
        conversaciones: 0,
        conversaciones_previo: 0,
        mensajes: 0,
        mensajes_previo: 0,
        tokens: 0,
        tokens_previo: 0,
        escalados: 0,
        escalados_previo: 0,
      }
    );
  });
}

export interface EscaladoPorMotivo {
  motivo: MotivoEscalado;
  total: number;
}

export function escaladosPorMotivo(t: Tenant, empresaId: string, dias: number) {
  return withTenant(t, (q) =>
    q.rows<EscaladoPorMotivo>(
      `select motivo, count(*)::int as total
         from escalados
        where empresa_id = $1
          and creado_en >= current_date - ($2::int - 1)
        group by motivo
        order by total desc`,
      [empresaId, dias]
    )
  );
}

export interface EstadoServicio {
  canal_estado: EstadoCanal | null;
  canal_numero: string | null;
  config_version: number | null;
  config_tono: string | null;
  config_creada_en: string | null;
  reglas_activas: number;
  docs_ingestados: number;
  docs_pendientes: number;
  docs_error: number;
  conversaciones_abiertas: number;
  conversaciones_mes: number;
}

/**
 * Semáforo de "¿está el agente listo para atender?". Responde de un vistazo las
 * cuatro cosas que una empresa configura (D16) más el pulso de hoy.
 */
export function estadoServicio(t: Tenant, empresaId: string) {
  return withTenant(t, async (q) => {
    const fila = await q.row<EstadoServicio>(
      `select
         (select c.estado from canales c
           where c.empresa_id = $1
           order by (c.estado = 'HABILITADO') desc, c.creado_en desc limit 1) as canal_estado,
         (select c.display_phone_number from canales c
           where c.empresa_id = $1
           order by (c.estado = 'HABILITADO') desc, c.creado_en desc limit 1) as canal_numero,
         (select cf.version from configuraciones_agente cf
           where cf.empresa_id = $1 and cf.vigente) as config_version,
         (select cf.tono from configuraciones_agente cf
           where cf.empresa_id = $1 and cf.vigente) as config_tono,
         (select cf.creada_en from configuraciones_agente cf
           where cf.empresa_id = $1 and cf.vigente) as config_creada_en,
         (select count(*)::int from reglas_negocio r
           join configuraciones_agente cf on cf.id = r.configuracion_id and cf.vigente
          where r.empresa_id = $1 and r.activa) as reglas_activas,
         (select count(*)::int from documentos
           where empresa_id = $1 and estado = 'INGESTADO') as docs_ingestados,
         (select count(*)::int from documentos
           where empresa_id = $1 and estado in ('PENDIENTE', 'INGESTANDO')) as docs_pendientes,
         (select count(*)::int from documentos
           where empresa_id = $1 and estado = 'ERROR') as docs_error,
         (select count(*)::int from conversaciones
           where empresa_id = $1 and estado = 'ABIERTA') as conversaciones_abiertas,
         (select coalesce(sum(conversaciones_nuevas), 0)::int from uso_diario
           where empresa_id = $1 and fecha >= date_trunc('month', current_date)) as conversaciones_mes`,
      [empresaId]
    );
    return fila!;
  });
}

export interface ConversacionReciente {
  id: string;
  estado: string;
  ultimo_mensaje_en: string;
  telefono: string;
  nombre_perfil: string | null;
  mensajes: number;
  escalada: boolean;
}

export function conversacionesRecientes(t: Tenant, empresaId: string, limite = 8) {
  return withTenant(t, (q) =>
    q.rows<ConversacionReciente>(
      `select c.id, c.estado, c.ultimo_mensaje_en,
              cf.telefono, cf.nombre_perfil,
              (select count(*)::int from mensajes m where m.conversacion_id = c.id) as mensajes,
              exists (select 1 from escalados e where e.conversacion_id = c.id) as escalada
         from conversaciones c
         join clientes_finales cf on cf.id = c.cliente_final_id
        where c.empresa_id = $1
        order by c.ultimo_mensaje_en desc
        limit $2`,
      [empresaId, limite]
    )
  );
}
