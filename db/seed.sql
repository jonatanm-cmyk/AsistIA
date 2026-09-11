-- =============================================================================
-- AsistIA · datos de prueba para el backoffice
-- =============================================================================
-- Pobla el esquema `asistia` con planes, tres empresas y ~45 días de actividad
-- para que los dashboards se vean con datos reales.
--
-- NO TOCA EL ESQUEMA. Solo inserta filas, y es reejecutable: si ya se aplicó,
-- actualiza en vez de duplicar.
--
-- CÓMO SE APLICA
--   node ..\sql\aplicar-sql.js db\seed.sql
-- o pegándolo en el editor SQL del panel de Supabase.
--
-- CÓMO SE BORRA
--   db\seed-cleanup.sql
--
-- AVISO: son datos inventados. No lo apliques sobre una base con clientes
-- reales; las tres empresas usan client_key con prefijo `demo-` justamente para
-- poder distinguirlas y borrarlas de golpe.
-- =============================================================================

set search_path to asistia, public, extensions;

-- Las políticas de RLS necesitan saber quién escribe. Elevarse a INTERSIM aquí
-- es lo mismo que hace `fn_resolver_empresa` en su propio ámbito, y es local a
-- esta sesión.
select set_config('app.rol', 'INTERSIM', false);

begin;

-- -----------------------------------------------------------------------------
-- 1. Planes
-- -----------------------------------------------------------------------------
insert into planes (codigo, nombre, cuota_conversaciones_mes, cuota_documentos,
                    precio_mensual, precio_habilitacion, precio_conversacion_extra, moneda)
values
  ('demo-inicial',   'Inicial',   500,   20,  49.00,  150.00, 0.0800, 'USD'),
  ('demo-crecim',    'Crecimiento', 2000, 100, 149.00, 150.00, 0.0600, 'USD'),
  ('demo-corp',      'Corporativo', 10000, 500, 499.00, 300.00, 0.0400, 'USD')
on conflict (codigo, vigente_desde) do update
   set nombre = excluded.nombre,
       cuota_conversaciones_mes = excluded.cuota_conversaciones_mes,
       cuota_documentos = excluded.cuota_documentos,
       precio_mensual = excluded.precio_mensual;

-- -----------------------------------------------------------------------------
-- 2. Empresas
-- -----------------------------------------------------------------------------
insert into empresas (client_key, nombre, responsable_nombre, responsable_email,
                      chatwoot_account_id, estado, activada_en)
values
  ('demo-educonecta', 'EduConecta',      'Marcela Rivas',  'marcela@educonecta.demo', 1001, 'ACTIVA',     now() - interval '40 days'),
  ('demo-ferreteria', 'Ferretería Andes','Jorge Camacho',  'jorge@ferrandes.demo',    1002, 'ACTIVA',     now() - interval '22 days'),
  ('demo-clinicasur', 'Clínica Sur',     'Paola Ledezma',  'paola@clinicasur.demo',   1003, 'PENDIENTE',  null)
on conflict (client_key) do update
   set nombre = excluded.nombre,
       responsable_nombre = excluded.responsable_nombre,
       responsable_email = excluded.responsable_email,
       estado = excluded.estado;

-- -----------------------------------------------------------------------------
-- 3. Suscripciones (una vigente por empresa)
-- -----------------------------------------------------------------------------
insert into suscripciones (empresa_id, plan_id, inicio)
select e.id, p.id, current_date - 40
  from empresas e
  join (values ('demo-educonecta','demo-crecim'),
               ('demo-ferreteria','demo-inicial'),
               ('demo-clinicasur','demo-inicial')) as m(client_key, plan_codigo)
    on m.client_key = e.client_key
  join planes p on p.codigo = m.plan_codigo
 where not exists (
   select 1 from suscripciones s where s.empresa_id = e.id and s.fin is null
 );

-- -----------------------------------------------------------------------------
-- 4. Canales
-- -----------------------------------------------------------------------------
insert into canales (empresa_id, tipo, phone_number_id, display_phone_number,
                     waba_id, chatwoot_inbox_id, estado, habilitado_en)
select e.id, 'WHATSAPP', c.phone, c.visible, c.waba, c.inbox, c.estado,
       case when c.estado = 'HABILITADO' then now() - interval '38 days' end
  from empresas e
  join (values
        ('demo-educonecta', '5901000001', '+591 700 11111', 'WABA-1001', 2001::bigint, 'HABILITADO'),
        ('demo-ferreteria', '5901000002', '+591 700 22222', 'WABA-1002', 2002::bigint, 'HABILITADO'),
        ('demo-clinicasur', null,         '+591 700 33333', null,        2003::bigint, 'PENDIENTE')
       ) as c(client_key, phone, visible, waba, inbox, estado)
    on c.client_key = e.client_key
on conflict (chatwoot_inbox_id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Configuración del agente + reglas
--    Se usa la función real para que las versiones queden como en producción.
-- -----------------------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_config  uuid;
begin
  select id into v_empresa from empresas where client_key = 'demo-educonecta';
  if not exists (select 1 from configuraciones_agente where empresa_id = v_empresa) then
    select configuracion_id into v_config from fn_guardar_configuracion(jsonb_build_object(
      'empresa_id', v_empresa,
      'nombre_agente', 'Coni',
      'tono', 'Cercano y claro',
      'idioma', 'es',
      'max_tokens_respuesta', 600,
      'tope_tokens_conversacion_dia', 20000,
      'reglas', jsonb_build_array(
        jsonb_build_object('tipo','INSTRUCCION','texto','Saluda por el nombre si el cliente lo dio antes.'),
        jsonb_build_object('tipo','INSTRUCCION','texto','Si preguntan por precios de cursos, remite al catálogo vigente y nunca inventes cifras.'),
        jsonb_build_object('tipo','PROHIBICION','texto','No prometas plazas ni descuentos que no estén en la base de conocimiento.'),
        jsonb_build_object('tipo','ESCALAR_SI','texto','El cliente pide anular una matrícula o reclamar un pago.')
      )
    ));
    -- Una segunda versión, para que el historial tenga algo que enseñar.
    perform fn_guardar_configuracion(jsonb_build_object(
      'empresa_id', v_empresa,
      'nombre_agente', 'Coni',
      'tono', 'Cercano y claro',
      'idioma', 'es',
      'max_tokens_respuesta', 700,
      'tope_tokens_conversacion_dia', 20000,
      'reglas', jsonb_build_array(
        jsonb_build_object('tipo','INSTRUCCION','texto','Saluda por el nombre si el cliente lo dio antes.'),
        jsonb_build_object('tipo','INSTRUCCION','texto','Si preguntan por precios de cursos, remite al catálogo vigente y nunca inventes cifras.'),
        jsonb_build_object('tipo','INSTRUCCION','texto','Cierra siempre preguntando si necesita algo más.'),
        jsonb_build_object('tipo','PROHIBICION','texto','No prometas plazas ni descuentos que no estén en la base de conocimiento.'),
        jsonb_build_object('tipo','ESCALAR_SI','texto','El cliente pide anular una matrícula o reclamar un pago.')
      )
    ));
  end if;

  select id into v_empresa from empresas where client_key = 'demo-ferreteria';
  if not exists (select 1 from configuraciones_agente where empresa_id = v_empresa) then
    perform fn_guardar_configuracion(jsonb_build_object(
      'empresa_id', v_empresa,
      'nombre_agente', 'Andes',
      'tono', 'Comercial y resolutivo',
      'idioma', 'es',
      'max_tokens_respuesta', 450,
      'tope_tokens_conversacion_dia', 15000,
      'reglas', jsonb_build_array(
        jsonb_build_object('tipo','INSTRUCCION','texto','Da stock y precio solo si están en el catálogo cargado.'),
        jsonb_build_object('tipo','ESCALAR_SI','texto','Piden factura, garantía o devolución.')
      )
    ));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Documentos y algún fragmento
--    El embedding es un vector de ceros: sirve para que la interfaz tenga qué
--    mostrar, no para buscar. La ingesta real la hace el flujo ASI_.
-- -----------------------------------------------------------------------------
insert into documentos (empresa_id, nombre, tipo, texto_extraido, huella_sha256,
                        bytes, estado, ingestado_en, subido_en)
select e.id, d.nombre, d.tipo, d.texto,
       encode(sha256((e.client_key || d.nombre)::bytea), 'hex'),
       d.bytes, d.estado,
       case when d.estado = 'INGESTADO' then now() - interval '30 days' end,
       now() - interval '31 days'
  from empresas e
  join (values
        ('demo-educonecta','Catálogo de cursos 2026.pdf','PDF',  null, 482000::bigint, 'INGESTADO'),
        ('demo-educonecta','Preguntas frecuentes','TEXTO', 'Horario de atención: lunes a viernes de 8:00 a 18:00. Las matrículas se pagan por transferencia o QR. El certificado se emite a los 15 días de terminar el curso.', 210::bigint, 'INGESTADO'),
        ('demo-educonecta','Política de reembolsos.docx','DOCX', null, 64000::bigint, 'ERROR'),
        ('demo-ferreteria','Catálogo y precios.pdf','PDF', null, 1240000::bigint, 'INGESTADO'),
        ('demo-ferreteria','Condiciones de entrega','TEXTO', 'Entregas en la ciudad en 24 horas. Envíos a provincia por flota, con costo aparte. No hay entregas los domingos.', 150::bigint, 'PENDIENTE')
       ) as d(client_key, nombre, tipo, texto, bytes, estado)
    on d.client_key = e.client_key
on conflict (empresa_id, huella_sha256) do nothing;

update documentos
   set error_detalle = 'No se pudo extraer texto: el archivo parece ser un escaneo sin OCR.'
 where estado = 'ERROR' and error_detalle is null;

insert into fragmentos (documento_id, empresa_id, orden, encabezado, contenido, tokens, embedding)
select d.id, d.empresa_id, f.orden, f.encabezado, f.contenido, f.tokens,
       array_fill(0::real, array[1536])::vector
  from documentos d
  join (values
        ('Preguntas frecuentes', 1, 'Horarios', 'Horario de atención: lunes a viernes de 8:00 a 18:00.', 18),
        ('Preguntas frecuentes', 2, 'Pagos', 'Las matrículas se pagan por transferencia o QR.', 14),
        ('Preguntas frecuentes', 3, 'Certificados', 'El certificado se emite a los 15 días de terminar el curso.', 16),
        ('Catálogo de cursos 2026.pdf', 1, 'Data Science', 'Curso de Ciencia de Datos, 120 horas, modalidad híbrida.', 20)
       ) as f(nombre, orden, encabezado, contenido, tokens)
    on f.nombre = d.nombre
 where d.estado = 'INGESTADO'
on conflict (documento_id, orden) do nothing;

-- -----------------------------------------------------------------------------
-- 7. Conversaciones y mensajes
--    Se generan con fn_registrar_mensaje, la misma puerta que usan los flujos:
--    así `uso_diario` queda cuadrado sin tener que inventarlo aparte.
-- -----------------------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  v_canal   uuid;
  v_cfg     uuid;
  v_conv    bigint;
  v_msg_id  uuid;
  v_res     record;
  i         int;
  n_msgs    int;
  j         int;
  v_tel     text;
  preguntas text[] := array[
    'Hola, ¿cuál es el horario de atención?',
    'Buenas, quiero información sobre el curso de datos',
    '¿Aceptan pago con QR?',
    '¿En cuánto tiempo llega el certificado?',
    'Necesito hablar con alguien de facturación',
    '¿Tienen stock de taladros percutores?',
    'Buenos días, ¿hacen envíos a provincia?',
    '¿Puedo anular mi matrícula?'
  ];
  respuestas text[] := array[
    'Atendemos de lunes a viernes, de 8:00 a 18:00. ¿Te ayudo con algo más?',
    'Claro. El curso de Ciencia de Datos son 120 horas en modalidad híbrida. ¿Quieres que te cuente el temario?',
    'Sí, aceptamos transferencia y QR.',
    'El certificado se emite a los 15 días de terminar el curso.',
    'Eso lo lleva una persona del equipo. Te paso con alguien ahora mismo.',
    'Déjame revisar el catálogo y te confirmo.',
    'Sí, hacemos envíos a provincia por flota, con costo aparte.',
    'Para anular una matrícula te atiende una persona del equipo. Aviso ahora.'
  ];
begin
  for v_empresa, v_canal, v_cfg in
    select e.id, c.id, (select cf.id from configuraciones_agente cf
                         where cf.empresa_id = e.id and cf.vigente)
      from empresas e
      join canales c on c.empresa_id = e.id and c.estado = 'HABILITADO'
     where e.client_key in ('demo-educonecta', 'demo-ferreteria')
  loop
    -- 60 conversaciones repartidas en los últimos 45 días.
    for i in 1..60 loop
      v_conv := (extract(epoch from now())::bigint * 1000) + i
                + ('x' || substr(md5(v_empresa::text), 1, 6))::bit(24)::bigint;
      v_tel := '+5917' || lpad(((i * 7919) % 9999999)::text, 7, '0');
      n_msgs := 2 + (i % 4);

      for j in 1..n_msgs loop
        -- Mensaje del cliente
        select * into v_res from fn_registrar_mensaje(jsonb_build_object(
          'empresa_id', v_empresa,
          'canal_id', v_canal,
          'chatwoot_conversation_id', v_conv,
          'chatwoot_message_id', v_conv * 100 + j * 2,
          'telefono', v_tel,
          'nombre_perfil', case when i % 3 = 0 then null else 'Cliente ' || i end,
          'direccion', 'ENTRANTE',
          'autor', 'CLIENTE',
          'contenido', preguntas[1 + ((i + j) % array_length(preguntas, 1))],
          'tokens_entrada', 20 + (i % 30)
        ));
        v_msg_id := v_res.mensaje_id;

        -- Respuesta del agente
        perform fn_registrar_mensaje(jsonb_build_object(
          'empresa_id', v_empresa,
          'canal_id', v_canal,
          'chatwoot_conversation_id', v_conv,
          'chatwoot_message_id', v_conv * 100 + j * 2 + 1,
          'telefono', v_tel,
          'direccion', 'SALIENTE',
          'autor', 'AGENTE',
          'contenido', respuestas[1 + ((i + j) % array_length(respuestas, 1))],
          'respuesta_a', v_msg_id,
          'estado_entrega', 'DELIVERED',
          'configuracion_id', v_cfg,
          'modelo', 'deepseek-v4.1-flash',
          'tokens_entrada', 400 + (i % 200),
          'tokens_salida', 90 + (i % 120),
          'latencia_ms', 700 + (i % 900),
          'guardarrail_ok', true
        ));
      end loop;

      -- Una de cada seis conversaciones acaba escalando.
      if i % 6 = 0 then
        insert into escalados (conversacion_id, empresa_id, motivo, mensaje_id,
                               correo_enviado_en, creado_en)
        select v_res.conversacion_id, v_empresa,
               (array['NO_SABE','PEDIDO_CLIENTE','REGLA','GUARDARRAIL'])[1 + (i % 4)],
               v_msg_id,
               case when i % 2 = 0 then now() end,
               now() - (i || ' days')::interval * 0.7
        on conflict do nothing;
      end if;
    end loop;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 8. Repartir el uso a lo largo de 45 días
--    fn_registrar_mensaje lo apuntó todo en `current_date`, que dejaría los
--    gráficos con un único pico. Aquí se reparte para que la serie se vea.
-- -----------------------------------------------------------------------------
do $$
declare v_empresa uuid;
begin
  for v_empresa in
    select id from empresas where client_key in ('demo-educonecta', 'demo-ferreteria')
  loop
    delete from uso_diario where empresa_id = v_empresa;

    insert into uso_diario (empresa_id, fecha, conversaciones_nuevas, mensajes_entrantes,
                            mensajes_salientes, tokens_entrada, tokens_salida, escalados)
    select v_empresa,
           d::date,
           -- Menos tráfico los fines de semana: una curva plana no se parece a
           -- ningún negocio real y hace imposible ver si el gráfico funciona.
           greatest(0, (case when extract(isodow from d) in (6,7) then 2 else 6 end
                        + (random() * 6)::int))                                  as conversaciones,
           greatest(0, (case when extract(isodow from d) in (6,7) then 5 else 16 end
                        + (random() * 14)::int))                                 as entrantes,
           greatest(0, (case when extract(isodow from d) in (6,7) then 5 else 15 end
                        + (random() * 13)::int))                                 as salientes,
           (2200 + random() * 3000)::bigint,
           (600 + random() * 900)::bigint,
           0
      from generate_series(current_date - 44, current_date, interval '1 day') d;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 9. Errores de flujo, para la vista de plataforma
-- -----------------------------------------------------------------------------
insert into errores (empresa_id, flujo, nodo, mensaje, detalle, ocurrido_en)
select e.id, x.flujo, x.nodo, x.mensaje, x.detalle::jsonb, now() - x.hace
  from empresas e
  join (values
        ('demo-educonecta','ASI_ingesta','Extraer texto','El PDF no tiene capa de texto', '{"documento":"Política de reembolsos.docx"}', interval '3 hours'),
        ('demo-ferreteria','ASI_agente','Buscar fragmentos','Timeout consultando embeddings', '{"ms":30000}', interval '9 hours'),
        ('demo-educonecta','ASI_canal','Enviar a Chatwoot','429 Too Many Requests', '{"reintentos":3}', interval '20 hours')
       ) as x(client_key, flujo, nodo, mensaje, detalle, hace)
    on x.client_key = e.client_key;

commit;

-- =============================================================================
-- ÚLTIMO PASO, A MANO: los usuarios
-- =============================================================================
-- `usuarios.auth_user_id` apunta a un usuario real de Supabase Auth, así que el
-- seed no puede inventarlo: un id falso crearía una cuenta con la que nadie
-- puede entrar.
--
--   1. Panel de Supabase -> Authentication -> Users -> Add user
--      (marca "Auto Confirm User").
--   2. Copia su UUID y ejecuta UNA de estas dos:
--
-- Usuario de Intersim (ve todas las empresas):
--   insert into asistia.usuarios (auth_user_id, empresa_id, email, nombre, rol)
--   values ('<UUID>', null, '<correo>', 'Tu nombre', 'INTERSIM');
--
-- Administrador de una empresa (ve solo la suya):
--   insert into asistia.usuarios (auth_user_id, empresa_id, email, nombre, rol)
--   select '<UUID>', id, '<correo>', 'Marcela Rivas', 'ADMIN_EMPRESA'
--     from asistia.empresas where client_key = 'demo-educonecta';
--
-- A partir de ahí, las siguientes empresas se dan de alta desde el propio
-- backoffice, que crea el usuario de Auth y la fila en un solo paso.
-- =============================================================================
