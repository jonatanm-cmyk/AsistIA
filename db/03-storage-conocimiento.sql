-- =============================================================================
-- Políticas de Storage para el bucket `conocimiento`
-- =============================================================================
--
-- EL PROBLEMA QUE ARREGLA
--
-- El bucket existía y estaba bien configurado (privado, 20 MB, solo PDF y
-- DOCX), pero `storage.objects` no tenía NI UNA política. En Supabase esa tabla
-- lleva RLS activa de fábrica, y RLS activa sin políticas no significa "pasa
-- todo": significa "no pasa nada". Subir desde el panel daba
--
--     new row violates row-level security policy   (403 AccessDenied)
--
-- Se tardó en ver porque la prueba del bucket se hizo con la clave secreta, que
-- tiene BYPASSRLS: probó todo menos lo único que estaba roto. El panel sube con
-- la sesión del usuario, que es quien sí pasa por estas políticas.
--
-- CÓMO AÍSLA
--
-- La ruta que escribe el backoffice es `<empresa_id>/<sha256>.<ext>`, así que
-- la primera carpeta ES la empresa. `storage.foldername(name)` la devuelve, y
-- se compara con `empresa_actual()`, que para un usuario autenticado resuelve
-- `usuarios.auth_user_id = auth.uid()`. Resultado: nadie puede escribir ni leer
-- fuera del prefijo de su propia empresa, ni aunque manipule la petición.
--
-- Es el mismo aislamiento que la RLS da a las filas, aplicado a los archivos.
--
-- QUÉ NO TOCA
--
-- n8n se descarga los originales con su propia credencial de servicio, que
-- salta la RLS. Estas políticas no le afectan.
--
-- Aplicar con:  npm run sql db/03-storage-conocimiento.sql
-- Es idempotente: se puede volver a lanzar sin miedo.
-- =============================================================================

-- `empresa_actual()` es SECURITY DEFINER, así que se ejecuta con los permisos
-- de quien la creó y puede leer `usuarios`. Pero para NOMBRARLA hace falta
-- usage sobre el esquema, y `authenticated` no lo tenía.
--
-- Esto no abre las tablas: sin `grant select` y con la RLS de `asistia` puesta,
-- `authenticated` sigue sin poder leer ni una fila por PostgREST. Lo único que
-- gana es poder resolver el nombre de las dos funciones de abajo.
grant usage on schema asistia to authenticated;
grant execute on function asistia.empresa_actual() to authenticated;
grant execute on function asistia.es_intersim() to authenticated;

-- Borrar antes de crear: `create policy` no admite `if not exists`, y esto
-- tiene que poder relanzarse.
drop policy if exists conocimiento_leer   on storage.objects;
drop policy if exists conocimiento_subir  on storage.objects;
drop policy if exists conocimiento_actualizar on storage.objects;
drop policy if exists conocimiento_borrar on storage.objects;

-- LEER. Incluye a Intersim: soporte necesita poder abrir el original de una
-- empresa cuando esa empresa reporta que el agente citó algo raro.
create policy conocimiento_leer
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'conocimiento'
    and (
      (storage.foldername(name))[1] = asistia.empresa_actual()::text
      or asistia.es_intersim()
    )
  );

-- SUBIR. Aquí NO va Intersim: quien da de alta el conocimiento es la empresa.
-- Si algún día Intersim sube documentos en nombre de un cliente, que sea una
-- decisión explícita y no un efecto secundario de esta política.
create policy conocimiento_subir
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'conocimiento'
    and (storage.foldername(name))[1] = asistia.empresa_actual()::text
  );

-- ACTUALIZAR. Hace falta porque el panel sube con `upsert: true`: volver a
-- subir el mismo archivo (mismo sha256, misma ruta) es un update, no un insert.
-- Sin esta política, resubir un documento fallaría y solo la primera vez
-- funcionaría — un fallo bastante más difícil de diagnosticar que el otro.
create policy conocimiento_actualizar
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'conocimiento'
    and (storage.foldername(name))[1] = asistia.empresa_actual()::text
  )
  with check (
    bucket_id = 'conocimiento'
    and (storage.foldername(name))[1] = asistia.empresa_actual()::text
  );

-- BORRAR. Hoy el panel NO borra: retirar un documento lo marca RETIRADO y deja
-- el original (D26, la baja no borra). Existe para poder limpiar de verdad
-- cuando una empresa lo pida, sin tener que sacar la clave secreta para ello.
create policy conocimiento_borrar
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'conocimiento'
    and (storage.foldername(name))[1] = asistia.empresa_actual()::text
  );
