-- =============================================================================
-- AsistIA · una empresa completa, con todo lo que las vistas necesitan
-- =============================================================================
-- Crea EduConecta —el primer cliente según el discovery— con datos suficientes
-- para que NINGUNA vista del backoffice salga vacía:
--
--   /panel          cifras, serie diaria, estado del agente, motivos de escalado
--   /agente         configuración vigente + historial de versiones
--   /conocimiento   documentos en los cuatro estados posibles
--   /canal          número habilitado con sus identificadores
--   /conversaciones listado, detalle, transcripción y fragmentos citados
--   /uso            tokens por día y consumo contra la cuota del plan
--
-- DOS DECISIONES QUE IMPORTAN
--
-- 1. Las conversaciones y los mensajes se crean con `fn_registrar_mensaje`, la
--    misma puerta que usan los flujos ASI_. Nada se inserta a mano en
--    `mensajes`: así el seed ejercita el contrato real y no una versión
--    paralela que podría divergir.
--
-- 2. `uso_diario` NO lleva números inventados: se calcula a partir de las
--    conversaciones y mensajes que este mismo script creó. Consecuencia
--    práctica: lo que dice el dashboard cuadra con lo que se ve al entrar en
--    /conversaciones. Con cifras aleatorias, cualquiera que sumara descubriría
--    que no cuadran y dejaría de fiarse de la pantalla.
--
-- CÓMO SE APLICA
--   node ../sql/aplicar-sql.js db/seed-empresa.sql
--
-- CÓMO SE DESHACE
--   db/seed-empresa-cleanup.sql
--
-- El usuario que administra la empresa NO se crea aquí: vive en Supabase Auth,
-- fuera de la base. Se da de alta con `npm run usuario`.
-- =============================================================================

set search_path to asistia, public, extensions;
select set_config('app.rol', 'INTERSIM', false);

begin;

-- -----------------------------------------------------------------------------
-- 1. Planes (los necesita el desplegable de /intersim/empresas/nueva)
-- -----------------------------------------------------------------------------
insert into planes (codigo, nombre, cuota_conversaciones_mes, cuota_documentos,
                    precio_mensual, precio_habilitacion, precio_conversacion_extra, moneda)
values
  ('inicial',     'Inicial',      500,   20,  49.00,  150.00, 0.0800, 'USD'),
  ('crecimiento', 'Crecimiento', 2000,  100, 149.00,  150.00, 0.0600, 'USD'),
  ('corporativo', 'Corporativo',10000,  500, 499.00,  300.00, 0.0400, 'USD')
on conflict (codigo, vigente_desde) do update
   set nombre                   = excluded.nombre,
       cuota_conversaciones_mes = excluded.cuota_conversaciones_mes,
       cuota_documentos         = excluded.cuota_documentos,
       precio_mensual           = excluded.precio_mensual;

-- -----------------------------------------------------------------------------
-- 2. Todo lo demás, en un bloque para poder usar variables
-- -----------------------------------------------------------------------------
do $$
declare
  v_empresa  uuid;
  v_canal    uuid;
  v_cfg      uuid;
  v_plan     uuid;
  v_conv     uuid;
  v_msg      uuid;
  v_res      record;
  v_base     bigint := 770000;   -- base de ids de Chatwoot, para no chocar
  v_cw_conv  bigint;
  v_fecha    timestamptz;
  i          int;
  j          int;
  n_turnos   int;
  v_tel      text;
  v_nombre   text;

  preguntas text[] := array[
    'Hola, quiero información sobre el curso de ciencia de datos',
    'Buenas tardes, ¿cuál es el horario de atención?',
    '¿Aceptan pago con QR o solo transferencia?',
    '¿En cuánto tiempo me entregan el certificado?',
    '¿El curso es presencial o virtual?',
    'Hola, ¿todavía hay cupos para la próxima cohorte?',
    '¿Cuánto cuesta el diplomado completo?',
    'Necesito la factura de mi pago del mes pasado',
    '¿Puedo anular mi matrícula y que me devuelvan el dinero?',
    'Buenos días, ¿dan algún descuento por pago adelantado?',
    '¿Qué requisitos piden para inscribirse?',
    'Hola, no me llegó el enlace de la clase de hoy'
  ];
  respuestas text[] := array[
    'Claro. El curso de Ciencia de Datos son 120 horas en modalidad híbrida. ¿Te cuento el temario?',
    'Atendemos de lunes a viernes, de 8:00 a 18:00. ¿Te ayudo con algo más?',
    'Aceptamos las dos: transferencia bancaria y QR.',
    'El certificado se emite a los 15 días de terminar el curso.',
    'Es híbrido: clases en vivo por videollamada y dos sesiones presenciales al mes.',
    'Déjame revisar la disponibilidad de la próxima cohorte y te confirmo.',
    'El diplomado completo está en el catálogo vigente. ¿Quieres que te pase el detalle por escrito?',
    'La facturación la lleva una persona del equipo. Te paso con alguien ahora mismo.',
    'Las anulaciones las gestiona una persona del equipo. Aviso ahora mismo.',
    'Los descuentos por pago adelantado los confirma el equipo comercial. Te paso con ellos.',
    'Para inscribirte necesitas cédula, formulario de inscripción y el comprobante de pago.',
    'Reviso el envío del enlace y te digo. Si no llega en unos minutos, te paso con soporte.'
  ];
begin
  select id into v_plan from planes where codigo = 'crecimiento';

  -- ---------------------------------------------------------------------------
  -- 2.1 La empresa
  -- ---------------------------------------------------------------------------
  insert into empresas (client_key, nombre, responsable_nombre, responsable_email,
                        chatwoot_account_id, estado, creada_en, activada_en)
  values ('educonecta', 'EduConecta', 'Camilo V.', 'camilo.v@intersim.io',
          1001, 'ACTIVA', now() - interval '60 days', now() - interval '52 days')
  on conflict (client_key) do update
     set nombre = excluded.nombre,
         responsable_nombre = excluded.responsable_nombre,
         responsable_email  = excluded.responsable_email,
         estado = 'ACTIVA'
  returning id into v_empresa;

  -- Suscripción vigente. El índice parcial `suscripciones_vigente_uidx` impide
  -- que haya dos abiertas, así que se comprueba antes de insertar.
  if not exists (select 1 from suscripciones where empresa_id = v_empresa and fin is null) then
    insert into suscripciones (empresa_id, plan_id, inicio)
    values (v_empresa, v_plan, (now() - interval '52 days')::date);
  end if;

  -- ---------------------------------------------------------------------------
  -- 2.1b Reenlazar al administrador si su cuenta de Auth ya existe
  --
  -- POR QUÉ: el cleanup borra las filas de `usuarios` de la empresa, pero NO
  -- puede borrar las cuentas de Supabase Auth (viven fuera de esta base). Sin
  -- esto, un ciclo cleanup + seed dejaba la cuenta huérfana: podía autenticarse
  -- y el backoffice la rechazaba con "tu cuenta aún no está habilitada", sin
  -- pista de por qué ni de cómo arreglarlo.
  --
  -- Solo ENLAZA una cuenta que ya exista. Nunca crea cuentas ni contraseñas:
  -- eso es de `npm run usuario`, y requiere que alguien elija la contraseña.
  -- ---------------------------------------------------------------------------
  insert into usuarios (auth_user_id, empresa_id, email, nombre, rol, estado)
  select a.id, v_empresa, a.email, 'Camilo V.', 'ADMIN_EMPRESA', 'ACTIVO'
    from auth.users a
   where a.email = (select responsable_email from empresas where id = v_empresa)
   limit 1
  on conflict (auth_user_id) do update
     set empresa_id = excluded.empresa_id,
         rol        = excluded.rol,
         estado     = 'ACTIVO';

  if exists (select 1 from usuarios where empresa_id = v_empresa) then
    raise notice '  administrador reenlazado desde auth.users';
  else
    raise notice '  sin cuenta de Auth para el responsable: créala con `npm run usuario`';
  end if;

  -- ---------------------------------------------------------------------------
  -- 2.2 Canal de WhatsApp
  -- ---------------------------------------------------------------------------
  insert into canales (empresa_id, tipo, phone_number_id, display_phone_number,
                       waba_id, chatwoot_inbox_id, estado, habilitado_en, creado_en)
  values (v_empresa, 'WHATSAPP', '109384756201938', '+591 700 11223',
          '842910375620184', 2001, 'HABILITADO',
          now() - interval '50 days', now() - interval '58 days')
  on conflict (chatwoot_inbox_id) do update
     set estado = 'HABILITADO'
  returning id into v_canal;

  -- ---------------------------------------------------------------------------
  -- 2.3 Configuración del agente: dos versiones, para que el historial exista
  -- ---------------------------------------------------------------------------
  if not exists (select 1 from configuraciones_agente where empresa_id = v_empresa) then
    perform fn_guardar_configuracion(jsonb_build_object(
      'empresa_id', v_empresa,
      'nombre_agente', 'Coni',
      'tono', 'Cercano y claro',
      'idioma', 'es',
      'max_tokens_respuesta', 600,
      'tope_tokens_conversacion_dia', 20000,
      'reglas', jsonb_build_array(
        jsonb_build_object('tipo','INSTRUCCION','texto','Saluda por su nombre si el cliente ya se identificó antes.'),
        jsonb_build_object('tipo','INSTRUCCION','texto','Si preguntan por precios, remite al catálogo vigente y nunca inventes cifras.'),
        jsonb_build_object('tipo','PROHIBICION','texto','No prometas cupos, becas ni descuentos que no estén en la base de conocimiento.'),
        jsonb_build_object('tipo','ESCALAR_SI','texto','El cliente pide anular una matrícula, reclamar un pago o una factura.')
      )
    ));

    -- La versión que queda vigente.
    select configuracion_id into v_cfg from fn_guardar_configuracion(jsonb_build_object(
      'empresa_id', v_empresa,
      'nombre_agente', 'Coni',
      'tono', 'Cercano y claro',
      'idioma', 'es',
      'max_tokens_respuesta', 700,
      'tope_tokens_conversacion_dia', 25000,
      'reglas', jsonb_build_array(
        jsonb_build_object('tipo','INSTRUCCION','texto','Saluda por su nombre si el cliente ya se identificó antes.'),
        jsonb_build_object('tipo','INSTRUCCION','texto','Si preguntan por precios, remite al catálogo vigente y nunca inventes cifras.'),
        jsonb_build_object('tipo','INSTRUCCION','texto','Cierra siempre preguntando si necesita algo más.'),
        jsonb_build_object('tipo','PROHIBICION','texto','No prometas cupos, becas ni descuentos que no estén en la base de conocimiento.'),
        jsonb_build_object('tipo','PROHIBICION','texto','No pidas datos de tarjeta ni números de cuenta por este canal.'),
        jsonb_build_object('tipo','ESCALAR_SI','texto','El cliente pide anular una matrícula, reclamar un pago o una factura.'),
        jsonb_build_object('tipo','ESCALAR_SI','texto','El cliente se queja dos veces seguidas o pide hablar con una persona.')
      )
    ));
  else
    select id into v_cfg from configuraciones_agente where empresa_id = v_empresa and vigente;
  end if;

  -- ---------------------------------------------------------------------------
  -- 2.4 Base de conocimiento: los cuatro estados, para ver todos los distintivos
  -- ---------------------------------------------------------------------------
  insert into documentos (empresa_id, nombre, tipo, texto_extraido, huella_sha256,
                          bytes, estado, subido_en, ingestado_en, error_detalle)
  select v_empresa, d.nombre, d.tipo, d.texto,
         encode(sha256(('educonecta:' || d.nombre)::bytea), 'hex'),
         d.bytes, d.estado,
         now() - interval '48 days',
         case when d.estado = 'INGESTADO' then now() - interval '48 days' + interval '6 minutes' end,
         case when d.estado = 'ERROR'
              then 'No se pudo extraer texto: el archivo parece un escaneo sin OCR.' end
    from (values
      ('Catálogo de cursos 2026.pdf', 'PDF',   null,
       482000::bigint, 'INGESTADO'),
      ('Preguntas frecuentes', 'TEXTO',
       'Horario de atención: lunes a viernes de 8:00 a 18:00. Las matrículas se pagan por transferencia bancaria o QR. El certificado se emite a los 15 días de terminar el curso. Los cursos son híbridos: clases en vivo por videollamada y dos sesiones presenciales al mes. Requisitos de inscripción: cédula de identidad, formulario de inscripción y comprobante de pago.',
       412::bigint, 'INGESTADO'),
      ('Reglamento académico.pdf', 'DOCX', null,
       128000::bigint, 'PENDIENTE'),
      ('Política de reembolsos (escaneo).pdf', 'PDF', null,
       96000::bigint, 'ERROR')
    ) as d(nombre, tipo, texto, bytes, estado)
  on conflict (empresa_id, huella_sha256) do nothing;

  -- Fragmentos de los documentos ya ingestados. El embedding es un vector de
  -- ceros: sirve para que la interfaz tenga qué mostrar, no para buscar. La
  -- ingesta de verdad, con embeddings reales, la hace el flujo ASI_.
  insert into fragmentos (documento_id, empresa_id, orden, encabezado, contenido, tokens, embedding)
  select d.id, v_empresa, f.orden, f.encabezado, f.contenido, f.tokens,
         array_fill(0::real, array[1536])::vector
    from documentos d
    join (values
      ('Preguntas frecuentes', 1, 'Horarios',     'Horario de atención: lunes a viernes de 8:00 a 18:00.', 18),
      ('Preguntas frecuentes', 2, 'Pagos',        'Las matrículas se pagan por transferencia bancaria o QR.', 16),
      ('Preguntas frecuentes', 3, 'Certificados', 'El certificado se emite a los 15 días de terminar el curso.', 17),
      ('Preguntas frecuentes', 4, 'Modalidad',    'Los cursos son híbridos: clases en vivo y dos presenciales al mes.', 19),
      ('Preguntas frecuentes', 5, 'Requisitos',   'Requisitos: cédula, formulario de inscripción y comprobante de pago.', 18),
      ('Catálogo de cursos 2026.pdf', 1, 'Ciencia de Datos', 'Curso de Ciencia de Datos: 120 horas, modalidad híbrida, cohortes trimestrales.', 24),
      ('Catálogo de cursos 2026.pdf', 2, 'Diplomados',       'Diplomado en Analítica de Negocios: 240 horas, seis módulos.', 20)
    ) as f(nombre, orden, encabezado, contenido, tokens)
      on f.nombre = d.nombre
   where d.empresa_id = v_empresa and d.estado = 'INGESTADO'
  on conflict (documento_id, orden) do nothing;

  -- ---------------------------------------------------------------------------
  -- 2.5 Conversaciones, por la misma puerta que usan los flujos
  -- ---------------------------------------------------------------------------
  if not exists (select 1 from conversaciones where empresa_id = v_empresa) then
    for i in 1..52 loop
      -- Repartidas en 45 días. Se usa (i-1) para que la primera caiga HOY: con
      -- i, la más reciente quedaba ayer y el último punto de la gráfica salía en
      -- cero, que se lee como una caída del servicio y no como "el día acaba de
      -- empezar".
      v_fecha  := now() - ((45.0 * (i - 1) / 51.0) || ' days')::interval
                        - ((i % 11) || ' hours')::interval;
      v_cw_conv := v_base + i;
      v_tel     := '+5917' || lpad(((i * 7919) % 9999999)::text, 7, '0');
      v_nombre  := case when i % 4 = 0 then null else 'Cliente ' || i end;
      n_turnos  := 1 + (i % 4);

      for j in 1..n_turnos loop
        -- Mensaje del cliente
        select * into v_res from fn_registrar_mensaje(jsonb_build_object(
          'empresa_id', v_empresa,
          'canal_id',   v_canal,
          'chatwoot_conversation_id', v_cw_conv,
          'chatwoot_message_id', v_cw_conv * 100 + j * 2,
          'telefono', v_tel,
          'nombre_perfil', v_nombre,
          'chatwoot_contact_id', 300000 + i,
          'direccion', 'ENTRANTE',
          'autor', 'CLIENTE',
          'contenido', preguntas[1 + ((i + j) % array_length(preguntas, 1))],
          'tokens_entrada', 18 + (i % 25)
        ));
        v_conv := v_res.conversacion_id;
        v_msg  := v_res.mensaje_id;

        -- Respuesta del agente
        perform fn_registrar_mensaje(jsonb_build_object(
          'empresa_id', v_empresa,
          'canal_id',   v_canal,
          'chatwoot_conversation_id', v_cw_conv,
          'chatwoot_message_id', v_cw_conv * 100 + j * 2 + 1,
          'telefono', v_tel,
          'direccion', 'SALIENTE',
          'autor', 'AGENTE',
          'contenido', respuestas[1 + ((i + j) % array_length(respuestas, 1))],
          'respuesta_a', v_msg,
          'estado_entrega', case when i % 17 = 0 then 'FAILED' else 'READ' end,
          'configuracion_id', v_cfg,
          'modelo', 'deepseek-v4.1-flash',
          'tokens_entrada', 380 + (i % 240),
          'tokens_salida',  85 + (i % 130),
          'latencia_ms',    640 + (i % 1100),
          'guardarrail_ok', (i % 23 <> 0)
        ));
      end loop;

      -- `fn_registrar_mensaje` sella todo con now(): aquí se reparte en el
      -- tiempo para que la serie diaria y el listado tengan forma de historia
      -- y no de un único pico en el día de hoy.
      with ord as (
        select id, (row_number() over (order by creado_en, id) - 1) as k
          from mensajes where conversacion_id = v_conv
      )
      update mensajes m
         set creado_en = v_fecha + (ord.k * interval '2 minutes')
        from ord where ord.id = m.id;

      update conversaciones
         set abierta_en        = v_fecha,
             ultimo_mensaje_en = v_fecha + ((n_turnos * 2 - 1) * interval '2 minutes'),
             ventana_24h_hasta = v_fecha + interval '24 hours',
             -- Las de hace más de dos días ya están cerradas, como en Chatwoot.
             estado     = case when v_fecha < now() - interval '2 days'
                               then 'CERRADA' else 'ABIERTA' end,
             cerrada_en = case when v_fecha < now() - interval '2 days'
                               then v_fecha + interval '3 hours' end
       where id = v_conv;

      -- Una de cada cinco necesita a una persona.
      if i % 5 = 0 then
        insert into escalados (conversacion_id, empresa_id, motivo, mensaje_id,
                               correo_enviado_en, creado_en)
        values (v_conv, v_empresa,
                (array['NO_SABE','PEDIDO_CLIENTE','REGLA','GUARDARRAIL'])[1 + ((i / 5) % 4)],
                v_msg,
                case when i % 10 = 0 then v_fecha + interval '1 minute' end,
                v_fecha + interval '3 minutes');
      end if;
    end loop;
  end if;

  -- ---------------------------------------------------------------------------
  -- 2.6 Qué fragmentos citó cada respuesta (la trazabilidad de /conversaciones)
  -- ---------------------------------------------------------------------------
  insert into mensajes_fragmentos (mensaje_id, fragmento_id, similitud)
  select m.id, f.id, round((0.71 + random() * 0.26)::numeric, 3)::real
    from mensajes m
    cross join lateral (
      select id from fragmentos
       where empresa_id = v_empresa
       order by md5(m.id::text || id::text)   -- determinista: reejecutar no cambia el reparto
       limit 2
    ) f
   where m.empresa_id = v_empresa and m.autor = 'AGENTE'
  on conflict do nothing;

  -- ---------------------------------------------------------------------------
  -- 2.7 uso_diario, DERIVADO de lo anterior
  --     Ver la nota de la cabecera: si estas cifras no cuadran con las tablas,
  --     el dashboard miente y se nota a la primera suma.
  -- ---------------------------------------------------------------------------
  delete from uso_diario where empresa_id = v_empresa;

  insert into uso_diario (empresa_id, fecha, conversaciones_nuevas, mensajes_entrantes,
                          mensajes_salientes, tokens_entrada, tokens_salida, escalados)
  select v_empresa,
         d.fecha,
         coalesce(c.n, 0),
         coalesce(m.entrantes, 0),
         coalesce(m.salientes, 0),
         coalesce(m.tok_in, 0),
         coalesce(m.tok_out, 0),
         coalesce(e.n, 0)
    from (select generate_series(current_date - 44, current_date, interval '1 day')::date as fecha) d
    left join (
      select abierta_en::date as fecha, count(*)::int as n
        from conversaciones where empresa_id = v_empresa group by 1
    ) c on c.fecha = d.fecha
    left join (
      select creado_en::date as fecha,
             count(*) filter (where direccion = 'ENTRANTE')::int as entrantes,
             count(*) filter (where direccion = 'SALIENTE')::int as salientes,
             coalesce(sum(tokens_entrada), 0)::bigint            as tok_in,
             coalesce(sum(tokens_salida), 0)::bigint             as tok_out
        from mensajes where empresa_id = v_empresa group by 1
    ) m on m.fecha = d.fecha
    left join (
      select creado_en::date as fecha, count(*)::int as n
        from escalados where empresa_id = v_empresa group by 1
    ) e on e.fecha = d.fecha;

  -- ---------------------------------------------------------------------------
  -- 2.8 Un par de errores de flujo, que se ven en la vista de plataforma
  -- ---------------------------------------------------------------------------
  if not exists (select 1 from errores where empresa_id = v_empresa) then
    insert into errores (empresa_id, flujo, nodo, mensaje, detalle, ocurrido_en)
    values
      (v_empresa, 'ASI_ingesta', 'Extraer texto',
       'El PDF no tiene capa de texto',
       '{"documento":"Política de reembolsos (escaneo).pdf"}'::jsonb,
       now() - interval '5 hours'),
      (v_empresa, 'ASI_canal', 'Enviar a Chatwoot',
       '429 Too Many Requests',
       '{"reintentos":3,"espera_ms":2000}'::jsonb,
       now() - interval '19 hours');
  end if;
end $$;

commit;

-- -----------------------------------------------------------------------------
-- Comprobación: si algo quedó vacío, decirlo en vez de dejarlo pasar
-- -----------------------------------------------------------------------------
do $$
declare
  v_empresa uuid;
  r record;
begin
  select id into v_empresa from empresas where client_key = 'educonecta';
  if v_empresa is null then raise exception 'La empresa no se creó'; end if;

  for r in
    select 'canales' t, count(*) n from canales where empresa_id = v_empresa
    union all select 'configuraciones', count(*) from configuraciones_agente where empresa_id = v_empresa
    union all select 'reglas',          count(*) from reglas_negocio where empresa_id = v_empresa
    union all select 'documentos',      count(*) from documentos where empresa_id = v_empresa
    union all select 'fragmentos',      count(*) from fragmentos where empresa_id = v_empresa
    union all select 'conversaciones',  count(*) from conversaciones where empresa_id = v_empresa
    union all select 'mensajes',        count(*) from mensajes where empresa_id = v_empresa
    union all select 'escalados',       count(*) from escalados where empresa_id = v_empresa
    union all select 'uso_diario',      count(*) from uso_diario where empresa_id = v_empresa
  loop
    if r.n = 0 then
      raise exception 'Quedó vacío: % — el seed no está completo', r.t;
    end if;
    raise notice '  % : %', rpad(r.t, 16), r.n;
  end loop;
end $$;
