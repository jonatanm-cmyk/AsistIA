-- =============================================================================
-- AsistIA · deshacer `seed-empresa.sql`
-- =============================================================================
-- Borra EduConecta y todo lo que cuelga de ella. Los planes NO se tocan: los
-- necesita el formulario de alta y no son datos de prueba.
--
-- El orden va de hija a madre, respetando las claves foráneas, y todo en una
-- transacción: si algo falla no queda medio borrado.
--
--   node ../sql/aplicar-sql.js db/seed-empresa-cleanup.sql
--
-- OJO: esto borra la fila de `usuarios`, pero NO la cuenta de Supabase Auth.
-- Eso se hace desde el panel (Authentication -> Users). Dejar la cuenta sin su
-- fila es el estado seguro: puede autenticarse pero el backoffice no le abre.
-- =============================================================================

set search_path to asistia, public, extensions;
select set_config('app.rol', 'INTERSIM', false);

begin;

create temporary table _e on commit drop as
select id from empresas where client_key = 'educonecta';

-- Avisar en voz alta de lo que se lleva por delante. Borrar la fila de un
-- usuario sin poder borrar su cuenta de Supabase Auth lo deja en un estado
-- incómodo: puede autenticarse pero el backoffice lo rechaza. Volver a aplicar
-- `seed-empresa.sql` lo reenlaza solo, pero conviene saberlo antes.
do $$
declare r record;
begin
  for r in select u.email from usuarios u where u.empresa_id in (select id from _e) loop
    raise notice 'Se borra la fila de %, su cuenta de Auth queda huérfana hasta reaplicar el seed', r.email;
  end loop;
end $$;

delete from mensajes_fragmentos
 where mensaje_id in (select id from mensajes where empresa_id in (select id from _e));

delete from escalados          where empresa_id in (select id from _e);
delete from mensajes            where empresa_id in (select id from _e);
delete from conversaciones      where empresa_id in (select id from _e);
delete from clientes_finales    where empresa_id in (select id from _e);
delete from fragmentos          where empresa_id in (select id from _e);
delete from documentos          where empresa_id in (select id from _e);
delete from reglas_negocio      where empresa_id in (select id from _e);
delete from configuraciones_agente where empresa_id in (select id from _e);
delete from canales             where empresa_id in (select id from _e);
delete from uso_diario          where empresa_id in (select id from _e);
delete from errores             where empresa_id in (select id from _e);
delete from suscripciones       where empresa_id in (select id from _e);
delete from usuarios            where empresa_id in (select id from _e);
delete from empresas            where id in (select id from _e);

commit;
