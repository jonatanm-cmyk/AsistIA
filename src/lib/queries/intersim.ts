import "server-only";
import { withTenant, type Tenant } from "@/lib/db";
import type { EstadoEmpresa } from "@/types/asistia";

/**
 * Consultas del dashboard de Intersim (`/intersim`): volumen y consumo de
 * TODAS las empresas (D44).
 *
 * Estas consultas no llevan filtro por `empresa_id` a propósito: son la vista
 * agregada. Quien las llama pasa un `Tenant` con rol INTERSIM, y las páginas
 * que las usan están detrás de `requireIntersim()` y del middleware. Si un
 * ADMIN_EMPRESA llegara aquí, la RLS le devolvería solo sus filas — siempre que
 * la conexión no use un rol con BYPASSRLS. De ahí que la puerta sea el rol de
 * la sesión, no la consulta.
 */

export interface ResumenPlataforma {
  empresas_total: number;
  empresas_activas: number;
  empresas_pendientes: number;
  empresas_desactivadas: number;
  canales_habilitados: number;
  conversaciones_mes: number;
  mensajes_mes: number;
  tokens_mes: number;
  escalados_mes: number;
  conversaciones_mes_previo: number;
  tokens_mes_previo: number;
  errores_24h: number;
}

export function resumenPlataforma(t: Tenant) {
  return withTenant(t, async (q) => {
    const fila = await q.row<ResumenPlataforma>(
      `with mes as (
         select date_trunc('month', current_date)::date              as inicio,
                (date_trunc('month', current_date) - interval '1 month')::date as inicio_previo
       )
       select
         (select count(*)::int from empresas)                               as empresas_total,
         (select count(*)::int from empresas where estado = 'ACTIVA')       as empresas_activas,
         (select count(*)::int from empresas where estado = 'PENDIENTE')    as empresas_pendientes,
         (select count(*)::int from empresas where estado = 'DESACTIVADA')  as empresas_desactivadas,
         (select count(*)::int from canales where estado = 'HABILITADO')    as canales_habilitados,
         (select coalesce(sum(conversaciones_nuevas), 0)::int from uso_diario, mes
           where fecha >= mes.inicio)                                       as conversaciones_mes,
         (select coalesce(sum(mensajes_entrantes + mensajes_salientes), 0)::int from uso_diario, mes
           where fecha >= mes.inicio)                                       as mensajes_mes,
         (select coalesce(sum(tokens_entrada + tokens_salida), 0)::int from uso_diario, mes
           where fecha >= mes.inicio)                                       as tokens_mes,
         (select count(*)::int from escalados, mes
           where creado_en::date >= mes.inicio)                             as escalados_mes,
         (select coalesce(sum(conversaciones_nuevas), 0)::int from uso_diario, mes
           where fecha >= mes.inicio_previo and fecha < mes.inicio)         as conversaciones_mes_previo,
         (select coalesce(sum(tokens_entrada + tokens_salida), 0)::int from uso_diario, mes
           where fecha >= mes.inicio_previo and fecha < mes.inicio)         as tokens_mes_previo,
         (select count(*)::int from errores
           where ocurrido_en >= now() - interval '24 hours')                as errores_24h`
    );
    return fila!;
  });
}

export interface PuntoPlataforma {
  fecha: string;
  conversaciones: number;
  mensajes: number;
  tokens: number;
}

export function seriePlataforma(t: Tenant, dias: number) {
  return withTenant(t, (q) =>
    q.rows<PuntoPlataforma>(
      `with dias as (
         select generate_series(
                  current_date - ($1::int - 1), current_date, interval '1 day'
                )::date as fecha
       ),
       agg as (
         select fecha,
                sum(conversaciones_nuevas)::int as conversaciones,
                sum(mensajes_entrantes + mensajes_salientes)::int as mensajes,
                sum(tokens_entrada + tokens_salida)::int as tokens
           from uso_diario
          where fecha >= current_date - ($1::int - 1)
          group by fecha
       )
       select to_char(d.fecha, 'YYYY-MM-DD')   as fecha,
              coalesce(a.conversaciones, 0)    as conversaciones,
              coalesce(a.mensajes, 0)          as mensajes,
              coalesce(a.tokens, 0)            as tokens
         from dias d
         left join agg a on a.fecha = d.fecha
        order by d.fecha`,
      [dias]
    )
  );
}

export interface FilaEmpresaConsumo {
  id: string;
  nombre: string;
  estado: EstadoEmpresa;
  plan_nombre: string | null;
  cuota_conversaciones_mes: number | null;
  conversaciones_mes: number;
  tokens_mes: number;
  escalados_mes: number;
  ultima_actividad: string | null;
  /** 0-100+. null si la empresa no tiene plan vigente. */
  uso_cuota: number | null;
}

/**
 * Una fila por empresa con su consumo del mes y cuánto le queda de cuota. Es a
 * la vez la tabla de la vista y la fuente del gráfico de barras de las que más
 * consumen: se calcula una vez y se reparte entre los dos.
 */
export function consumoPorEmpresa(t: Tenant) {
  return withTenant(t, (q) =>
    q.rows<FilaEmpresaConsumo>(
      `with mes as (select date_trunc('month', current_date)::date as inicio),
       u as (
         select empresa_id,
                sum(conversaciones_nuevas)::int as conversaciones_mes,
                sum(tokens_entrada + tokens_salida)::int as tokens_mes,
                max(fecha) as ultimo_dia
           from uso_diario, mes
          where fecha >= mes.inicio
          group by empresa_id
       ),
       esc as (
         select empresa_id, count(*)::int as escalados_mes
           from escalados, mes
          where creado_en::date >= mes.inicio
          group by empresa_id
       )
       select e.id, e.nombre, e.estado,
              p.nombre as plan_nombre,
              p.cuota_conversaciones_mes,
              coalesce(u.conversaciones_mes, 0) as conversaciones_mes,
              coalesce(u.tokens_mes, 0)         as tokens_mes,
              coalesce(esc.escalados_mes, 0)    as escalados_mes,
              (select max(c.ultimo_mensaje_en) from conversaciones c
                where c.empresa_id = e.id)      as ultima_actividad,
              case
                when p.cuota_conversaciones_mes is null
                  or p.cuota_conversaciones_mes = 0 then null
                else round(
                  coalesce(u.conversaciones_mes, 0)::numeric * 100
                  / p.cuota_conversaciones_mes, 1)::float8
              end as uso_cuota
         from empresas e
         left join suscripciones s on s.empresa_id = e.id and s.fin is null
         left join planes p        on p.id = s.plan_id
         left join u               on u.empresa_id = e.id
         left join esc             on esc.empresa_id = e.id
        order by coalesce(u.conversaciones_mes, 0) desc, e.nombre asc`
    )
  );
}

export interface ErrorFlujo {
  id: string;
  empresa_nombre: string | null;
  flujo: string;
  nodo: string | null;
  mensaje: string;
  ocurrido_en: string;
}

export function erroresRecientes(t: Tenant, limite = 10) {
  return withTenant(t, (q) =>
    q.rows<ErrorFlujo>(
      `select er.id::text, e.nombre as empresa_nombre,
              er.flujo, er.nodo, er.mensaje, er.ocurrido_en
         from errores er
         left join empresas e on e.id = er.empresa_id
        order by er.ocurrido_en desc
        limit $1`,
      [limite]
    )
  );
}
