-- =============================================================================
-- AsistIA · borrar los datos de prueba
-- =============================================================================
-- Elimina SOLO lo que creó `seed.sql`: las empresas con `client_key` que empieza
-- por `demo-`, todo lo que cuelga de ellas, y los planes `demo-`.
--
-- El orden respeta las claves foráneas, de hija a madre. Va en una transacción:
-- si algo falla no queda medio borrado.
--
--   node ..\sql\aplicar-sql.js db\seed-cleanup.sql
-- =============================================================================

set search_path to asistia, public, extensions;
select set_config('app.rol', 'INTERSIM', false);

begin;

create temporary table _demo on commit drop as
select id from empresas where client_key like 'demo-%';

delete from mensajes_fragmentos
 where mensaje_id in (select id from mensajes where empresa_id in (select id from _demo));

delete from escalados   where empresa_id in (select id from _demo);
delete from mensajes     where empresa_id in (select id from _demo);
delete from conversaciones where empresa_id in (select id from _demo);
delete from clientes_finales where empresa_id in (select id from _demo);
delete from fragmentos   where empresa_id in (select id from _demo);
delete from documentos   where empresa_id in (select id from _demo);
delete from reglas_negocio where empresa_id in (select id from _demo);
delete from configuraciones_agente where empresa_id in (select id from _demo);
delete from canales      where empresa_id in (select id from _demo);
delete from uso_diario   where empresa_id in (select id from _demo);
delete from errores      where empresa_id in (select id from _demo);
delete from suscripciones where empresa_id in (select id from _demo);

-- Los usuarios se borran aquí, pero su cuenta de Supabase Auth NO: eso se hace
-- desde el panel de Authentication. Borrar la fila sin borrar la cuenta deja a
-- alguien que puede autenticarse pero no entrar, que es el comportamiento
-- correcto (`getSesion()` devuelve null si no hay fila en `usuarios`).
delete from usuarios     where empresa_id in (select id from _demo);

delete from empresas     where id in (select id from _demo);
delete from planes       where codigo like 'demo-%';

commit;
