-- =============================================================================
-- AsistIA · rol de base de datos para el BACKOFFICE
-- =============================================================================
-- POR QUÉ ESTE ARCHIVO EXISTE
--
-- En Supabase el rol `postgres` tiene BYPASSRLS (verificado el 11-sep-2026 y
-- anotado en la cabecera de `01-esquema-asistia.sql`). Si el backoffice se
-- conecta como `postgres`, las políticas de RLS NO se evalúan: un fallo de
-- programación que olvide un `where empresa_id = ...` enseña los datos de otra
-- empresa sin que nada salte.
--
-- Este script crea `asistia_app`: mismo esquema, sin BYPASSRLS. Con él, la RLS
-- es una red de seguridad real y no un adorno.
--
-- Es el equivalente para el backoffice de lo que `asistia_flujos` es para n8n.
-- Se separan a propósito: el backoffice y los flujos tienen permisos distintos
-- (los flujos escriben fragmentos; el backoffice, no) y conviene poder rotar la
-- contraseña de uno sin tocar el otro.
--
-- CÓMO SE APLICA
--   node ..\sql\aplicar-sql.js db\02-rol-app.sql --set asistia.app_password=@ASISTIA_APP_PGPASSWORD
--
-- o, pegándolo en el editor SQL del panel de Supabase, fijando antes:
--   select set_config('asistia.app_password', '<contraseña>', false);
--
-- La contraseña NUNCA va en este archivo ni en el repositorio: va en .env.local,
-- dentro de DATABASE_URL.
-- =============================================================================

set search_path to asistia, public, extensions;

do $$
declare v_pw text := coalesce(current_setting('asistia.app_password', true), '');
begin
    if not exists (select 1 from pg_roles where rolname = 'asistia_app') then
        if v_pw = '' then
            raise exception
              'Falta la contraseña: select set_config(''asistia.app_password'', ''...'', false) antes de ejecutar';
        end if;
        execute format('create role asistia_app login password %L', v_pw);
    elsif v_pw <> '' then
        execute format('alter role asistia_app password %L', v_pw);
    end if;
end $$;

alter role asistia_app set search_path = asistia, public, extensions;

grant usage on schema asistia    to asistia_app;
grant usage on schema extensions to asistia_app;   -- el tipo `vector` vive ahí

-- Lectura de todo (la RLS decide qué filas) y escritura donde el backoffice
-- realmente escribe. Nada de DELETE: retirar un documento pasa por
-- `fn_retirar_documento`, y dar de baja una empresa es un UPDATE de estado.
-- "La baja no borra" también se sostiene con permisos, no solo con disciplina.
grant select on all tables in schema asistia to asistia_app;

grant insert, update on
    asistia.empresas,
    asistia.suscripciones,
    asistia.usuarios,
    asistia.canales,
    asistia.configuraciones_agente,
    asistia.reglas_negocio,
    asistia.documentos
  to asistia_app;

-- Las funciones que el backoffice invoca. `fn_registrar_mensaje` no está: los
-- mensajes los escriben los flujos, no el panel.
grant execute on function asistia.empresa_actual()            to asistia_app;
grant execute on function asistia.es_intersim()               to asistia_app;
grant execute on function asistia.fn_guardar_configuracion(jsonb) to asistia_app;
grant execute on function asistia.fn_retirar_documento(uuid)  to asistia_app;

-- Para que las tablas futuras hereden estos permisos y no haya que volver aquí.
alter default privileges for role postgres in schema asistia
    grant select on tables to asistia_app;
alter default privileges for role postgres in schema asistia
    grant execute on functions to asistia_app;

-- -----------------------------------------------------------------------------
-- Comprobación
-- -----------------------------------------------------------------------------
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'asistia_app' and rolbypassrls) then
        raise exception 'asistia_app tiene BYPASSRLS: la RLS no se aplicaría. Revísalo.';
    end if;
    raise notice 'Listo. Usa esta cadena en .env.local:';
    raise notice '  postgresql://asistia_app:<contraseña>@db.<proyecto>.supabase.co:5432/postgres?sslmode=no-verify';
end $$;
