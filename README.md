# AsistIA 

Backoffice de AsistIA sobre el esquema `asistia` que aplicó la historia D0.
Next.js 15 con App Router y TypeScript: **el front y el back son el mismo
proyecto** — las vistas son Server Components y las escrituras son Server
Actions, sin API REST intermedia.

---

## 1. Arrancar

```bash
npm install
cp .env.example .env.local     # y rellena DATABASE_URL + las claves de Supabase
npm run dev
```

Comprueba la conexión antes que nada, en `http://localhost:3000/api/health`.
Es pública a propósito y responde sin sesión:

```json
{ "ok": true, "postgres": "PostgreSQL 17.6", "esquema": { "tablas": 16, "funciones": 6, "politicas": 14, "empresas": 3 } }
```

Si `ok` es `false`, el campo `pista` dice qué mirar.

### La cadena de conexión

Está en **un solo sitio**: `DATABASE_URL` en `.env.local`. Nada más la lee. Los
valores salen del perfil del equipo, `Automatizaciones\instancias\asistia.env`
(bloque `ASISTIA_PG*`).

```
postgresql://postgres.<proyecto>:<contraseña>@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=no-verify
```

Cuatro detalles que cuestan una tarde si se pasan por alto:

| Detalle | Por qué |
|---|---|
| **Host del pooler**, no `db.<proyecto>.supabase.co` | La conexión directa de Supabase es solo IPv6 salvo que se contrate el añadido de IPv4. Desde una máquina sin IPv6 se queda en *timeout* sin explicar nada. Comprobado en esta máquina: el host directo no responde; el del pooler sí. |
| **Usuario `postgres.<proyecto>`** | Por el pooler el usuario lleva el identificador del proyecto. `postgres` a secas solo vale por conexión directa. |
| **Puerto 5432**, no 6543 | Lo que importa no es *pooler sí o no*, es el **modo**: 5432 es modo **sesión** y conserva el estado; 6543 es modo **transacción**. Este backoffice fija `app.empresa_id` con `set_config` en cada transacción, y los flujos de n8n dependen de lo mismo. |
| **`sslmode=no-verify`**, no `require` | Las versiones nuevas de `pg` tratan `require` como `verify-full`, y el certificado de Supabase no valida contra la CA del sistema. La conexión sigue cifrada; lo que se omite es validar el certificado. |

Y la contraseña va **codificada en porcentaje**: `@` → `%40`, `#` → `%23`. La de
este proyecto **empieza por `@`**; sin codificar, la URL se parte por ahí y el
error que sale es `password authentication failed`, que manda a buscar en el
sitio equivocado.

### Las claves de Supabase

Supabase renombró las claves de API en 2025. El código **acepta los dos juegos**,
así que da igual cuál tengas a mano:

| Nombre actual | Nombre antiguo | Dónde |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | viaja al navegador, es su función |
| `SUPABASE_SECRET_KEY` (`sb_secret_…`) | `SUPABASE_SERVICE_ROLE_KEY` | **solo servidor**, nunca con prefijo `NEXT_PUBLIC_` |

La secreta es **opcional**: sin ella funciona todo menos la casilla "crear
también el usuario" del alta de empresas. Panel de Supabase → *Project Settings
→ API Keys → Secret keys → Reveal*.

### ⚠️ El rol con el que te conectas importa

En Supabase el rol `postgres` tiene **BYPASSRLS** — lo dice la cabecera del
propio `01-esquema-asistia.sql`, verificado el 11-sep. Conectando como
`postgres`, **las políticas de RLS no se evalúan**: el aislamiento entre
empresas depende solo del código.

Para desarrollo sirve. Para producción, aplica `db/02-rol-app.sql`, que crea
`asistia_app` sin BYPASSRLS, y apunta `DATABASE_URL` a ese rol. Entonces la RLS
vuelve a ser una defensa real.

Mientras tanto, el código no se fía: **toda consulta de `src/lib/queries/`
filtra por `empresa_id` de forma explícita**, además de fijar `app.empresa_id`.
Dos cinturones, porque uno de los dos puede estar desabrochado.

### Datos de prueba

```bash
npm run sql -- db/seed-empresa.sql
```

Crea los planes y **EduConecta** con todo lo que las vistas necesitan: canal
habilitado, dos versiones de configuración del agente con sus reglas, cuatro
documentos (uno en cada estado, para ver todos los distintivos), 52
conversaciones con 260 mensajes repartidos en 45 días, escalados por los cuatro
motivos, y errores de flujo. Para deshacerlo: `db/seed-empresa-cleanup.sql`.

Dos detalles del seed que no son casuales:

- Las conversaciones se crean con **`fn_registrar_mensaje`**, la misma puerta
  que usan los flujos `ASI_`. El seed ejercita el contrato real, no una versión
  paralela que podría divergir.
- **`uso_diario` se calcula a partir de esos mensajes**, no con números
  inventados. Así lo que dice el dashboard cuadra con lo que se ve en
  `/conversaciones`; con cifras aleatorias, cualquiera que sumara descubriría
  que no cuadran y dejaría de fiarse de la pantalla.

También hay `db/seed.sql`, con tres empresas ficticias con prefijo `demo-`, por
si quieres probar la vista de plataforma con varias.

### Usuarios

`usuarios.auth_user_id` apunta a Supabase Auth, así que un usuario son **dos
cosas**: la cuenta de Auth y la fila en `asistia.usuarios`. Sin la segunda,
alguien puede autenticarse y aun así no entrar — es lo que impide que
cualquier cuenta de Auth se asome al panel.

```bash
# Usuario de Intersim: ve todas las empresas
npm run usuario -- --email tu@correo.com --rol INTERSIM --nombre "Tu nombre" --generar-password

# Administrador de una empresa: ve solo la suya
npm run usuario -- --email admin@empresa.com --rol ADMIN_EMPRESA --empresa educonecta --generar-password
```

El script enlaza las dos cosas y evita el paso que más se falla: copiar el UUID
a mano. Con `--generar-password` crea una contraseña fuerte y la muestra **una
vez**; con `--password "..."` la eliges tú. Es idempotente: repetirlo corrige el
rol o la empresa en vez de reventar.

Si no hay `SUPABASE_SECRET_KEY`, el script no puede crear la cuenta de Auth y te
dice qué hacer en el panel. A partir del segundo cliente, el alta completa se
hace desde `/intersim/empresas/nueva`, que crea empresa y usuario de una vez.

#### Si te sale "tu cuenta aún no está habilitada"

Significa que tu cuenta de Supabase Auth existe pero **no hay fila en
`asistia.usuarios`**. Pasa sobre todo tras un `seed-empresa-cleanup.sql`: ese
script borra las filas de usuario, pero no puede borrar las cuentas de Auth,
que viven fuera de esta base.

Se arregla volviendo a aplicar el seed: **reenlaza solo** la cuenta de Auth
cuyo correo coincida con el `responsable_email` de la empresa.

```bash
npm run sql -- db/seed-empresa.sql     # dice "administrador reenlazado desde auth.users"
```

Para cualquier otro correo, `npm run usuario` con los mismos argumentos: como es
idempotente y la cuenta de Auth ya existe, solo recrea la fila y no pide
contraseña.

### Subida de archivos e ingesta (`F3`)

Al subir un PDF o un DOCX, el panel hace **tres cosas en este orden**:

1. **Extrae el texto** y lo guarda en `documentos.texto_extraido`.
2. Guarda el original en Supabase Storage, bucket privado `conocimiento`, en
   `<empresa_id>/<sha256>.<ext>` — para que una política por prefijo aísle los
   archivos igual que la RLS aísla las filas.
3. Registra la fila en `PENDIENTE` y avisa al webhook de ingesta.

**El paso 1 no es opcional**: el flujo `ASI_10_INGESTA` lee `texto_extraido` y
el supuesto `S4`, y se comprueba leyendo el cuerpo de `fn_ingesta_tomar`, que
devuelve esa columna. Desde el 13-sep-2026 el flujo **también** sabe bajarse el
original de Storage y extraerlo él, así que hay dos caminos válidos; seguimos
usando `texto_extraido` porque es el que está probado de punta a punta.

Va primero a propósito: si el PDF es un escaneo sin OCR, la extracción falla y
se le dice al usuario **antes** de subir 20 MB que no servirían de nada.

El aviso al flujo (contrato 1) usa `ASI_INGESTA_WEBHOOK_URL` y
`ASI_WEBHOOK_TOKEN`. **Pueden quedar vacías**: el documento se guarda igual en
`PENDIENTE` y el flujo lo recogerá cuando exista. El cuerpo es
`{ empresa_id, documento_id, evento: "INGESTAR" }` — `evento` no admite ningún
otro valor, cualquier otra cosa devuelve `400`.

### Probar el agente (contrato 2)

El botón **Probar** de `/agente` llama a `ASI_PROBAR_WEBHOOK_URL` con el mismo
token y espera la respuesta (3-7 s). Corre en modo prueba: no escribe, no usa
memoria y no cuenta contra el tope diario.

Prueba **la versión guardada**, no lo que hay escrito en el formulario: el
flujo arma el prompt leyendo la configuración vigente en la base. La pantalla lo
dice y muestra qué versión está probando, porque no hay forma de deducirlo
mirando la respuesta.

Pegar texto funciona sin bucket y sin extracción.

---

## 2. La arquitectura

Esto es lo que se pidió replicar de mundoKids, con los añadidos que evitan el
problema del panel anterior.

### Una vista, una ruta

```
src/app/
├── layout.tsx                    tipografía y metadatos. NO monta el shell
├── page.tsx                      "/" reparte según el rol
├── login/ · unauthorized/        pantallas sin shell
├── api/health/                   prueba de conexión
└── (app)/                        ← el grupo con shell
    ├── layout.tsx                resuelve la sesión y monta AppShell
    ├── panel/                    dashboard de la empresa
    ├── agente/ conocimiento/ canal/ conversaciones/ uso/
    └── intersim/                 dashboard de plataforma
        └── empresas/[id] · nueva
```

Comparado con el panel de TutorIA, que mantenía todo en un `activeTab` con un
`switch` de 15 ramas dentro de una sola página:

| | TutorIA | Aquí |
|---|---|---|
| Cambiar de vista | `setState` → re-render de todo el panel | navegación a otra ruta, prefetch automático |
| De dónde vienen los datos | `useEffect` + `axios` **después** de montar | ya vienen en el HTML |
| Enlazar una vista | imposible, todo es `/` | cada vista tiene su URL |
| Filtros y rangos | estado de React, se pierden al navegar | van en la URL |
| Coste de una vista nueva | otra rama del `switch` | una carpeta y una línea en `nav.ts` |

### Por qué se ve rápido

1. **Los datos se piden en el servidor.** No hay `useEffect` que dispare un
   `fetch` cuando el componente ya está montado. El HTML llega con los números.
2. **Cada widget tiene su `<Suspense>`.** El dashboard no espera a la consulta
   más lenta: pinta el armazón, y cada tarjeta aparece cuando la suya responde.
   Las consultas salen en paralelo porque son componentes hermanos.
3. **`loading.tsx` por ruta.** El clic en el menú responde al instante, aunque
   la base tarde.
4. **El shell no se remonta.** Al navegar, Next sustituye solo el contenido:
   la barra lateral y la superior siguen montadas, sin repintarse.
5. **`cache()` en la sesión.** Layout, página y cinco widgets llaman a
   `getSesion()`; la consulta ocurre una vez por petición.

> El contraste concreto: el dashboard de TutorIA era **un** endpoint
> (`/dashboard/stats`) que hacía doce agregaciones antes de responder nada.
> Toda la pantalla esperaba a la más lenta. Aquí son seis consultas
> independientes que llegan cuando pueden.

### Capas

```
src/
├── middleware.ts        refresca el token y decide si hay sesión (Edge)
├── lib/
│   ├── db.ts            pool + withTenant() ← el archivo importante
│   ├── session.ts       getSesion() / requireIntersim() / requireEmpresa()
│   ├── supabase/        clientes de Auth (servidor, navegador, middleware)
│   ├── queries/         SQL por vista. Ningún componente escribe SQL
│   └── format.ts        números, fechas, "hace 5 min"
├── types/asistia.ts     tipos y uniones sacados de los CHECK del esquema
├── components/
│   ├── shell/           AppShell, Sidebar, Topbar, nav.ts
│   ├── ui/              primitivas (Server Components, 0 KB de JS)
│   └── charts/          gráficos propios, sin librería
└── app/…/actions.ts     las escrituras: Server Actions validadas con Zod
```

### `withTenant`: el corazón del aislamiento

```ts
await withTenant({ empresaId, rol }, async (q) => {
  return q.rows("select … from conversaciones where empresa_id = $1", [empresaId]);
});
```

Abre una transacción, fija `app.empresa_id` y `app.rol` **con `is_local =
true`**, ejecuta, y cierra. El `true` no es cosmético: sin él el valor se queda
pegado a la conexión, el pool la reutiliza, y la siguiente petición —de otra
empresa— hereda la anterior. Es la fuga clásica de multi-tenant sobre un pool.

`withTenant` es de **solo lectura** (`begin read only`): una consulta que intente
escribir desde una vista de lectura la rechaza Postgres. Para escribir,
`withTenantWrite`.

### Quién comprueba los permisos

El middleware corre en Edge, donde no existe `pg`, así que **no decide roles**:
solo mira si hay sesión. Meter el rol en el JWT haría que un usuario degradado
siguiera entrando con su token viejo hasta que caducara.

El rol se comprueba donde se puede leer la base: `requireIntersim()` y
`requireEmpresa()` dentro de cada página. Una consulta más, deduplicada por
`cache()`, a cambio de una sola fuente de verdad.

---

## 3. Los dashboards

### `/panel` — la empresa

| Widget | Sale de |
|---|---|
| Conversaciones, mensajes, escalados, tokens + variación | `uso_diario` y `escalados`, dos ventanas en una consulta |
| Mensajes por día (líneas, entrantes vs. salientes) | `uso_diario` con `generate_series` para no dejar huecos |
| Estado del agente: canal, versión, documentos, cuota | subconsultas sobre `canales`, `configuraciones_agente`, `documentos` |
| Por qué escala (barras) | `escalados` agrupado por motivo |
| Últimas conversaciones | `conversaciones` + `clientes_finales` |

### `/intersim` — la plataforma (D44)

Empresas por estado, volumen del mes con comparación, tokens, errores de las
últimas 24 h, volumen diario agregado, quién consume más, tabla de todas las
empresas con su porcentaje de cuota, y los últimos errores de los flujos `ASI_`.

### Dos cosas del esquema que condicionan las consultas

1. **Los escalados se cuentan de la tabla `escalados`, no de
   `uso_diario.escalados`.** `fn_registrar_mensaje` incrementa conversaciones,
   mensajes y tokens, pero nunca esa columna. Contarla daría siempre cero.
2. **Las series se rellenan con `generate_series`.** Un día sin actividad tiene
   que ser un 0 en el gráfico, no un hueco que la línea salta.

### Los gráficos

Hechos a mano en SVG, sin librería de charts. Reglas que siguen:

- **Un solo eje Y, siempre.** Dos escalas hacen que dos series parezcan cruzarse
  cuando no lo hacen. Por eso los tokens tienen su propio gráfico en `/uso` en
  vez de compartir el de mensajes.
- **Paleta validada** para contraste y daltonismo, en `--series-1..4` de
  `globals.css`. Los slots se asignan en orden y no se ciclan.
- **El color nunca informa solo.** Junto a un estado siempre va la palabra;
  junto a una cuota en rojo, el porcentaje escrito.
- **Crosshair y tooltip** en las líneas; etiqueta directa en las barras.
- **Ancho medido con `ResizeObserver`**, no un `viewBox` elástico que deforma
  trazos y texto.

---

## 3a. Dos cosas que no se hacen a mano

**El alta de empresa pasa por `fn_alta_empresa`** (historia `D2`), no por
`INSERT` sueltos. En una llamada atómica crea empresa, suscripción, canal,
usuario administrador y una configuración inicial vigente — esa última garantiza
que ninguna empresa exista sin agente, así que el panel no tiene que tratar el
caso "empresa sin configurar" en cada pantalla. Es idempotente por `client_key`.

Dos detalles del contrato que se olvidan fácil: pide el **código** del plan
(`crecimiento`), no su uuid; y el bloque `canal` es el único sitio por el que
hoy entra `chatwoot_inbox_id` — con `F1` aplazada, sin él `fn_resolver_empresa`
no sabe de quién es una conversación entrante.

**Restaurar una versión del agente no revive la fila antigua.** Copia su
contenido y guarda una versión nueva, igual que un guardado normal. El historial
es de solo añadir: si `vigente` pudiera moverse hacia atrás se perdería quién
restauró y cuándo, y `mensajes.configuracion_id` dejaría de apuntar a la versión
exacta con la que se generó cada respuesta.

## 3b. Alcance: lo que está construido pero oculto

`src/lib/alcance.ts` tiene los interruptores de lo que la documentación deja
fuera del tramo actual. **Nada se borra**: las rutas siguen vivas y compilando,
solo salen del menú. Volver a encenderlas es cambiar una línea.

| Interruptor | Por qué está apagado |
|---|---|
| `MOSTRAR_CONVERSACIONES` | D44: las conversaciones se atienden en Chatwoot, y el panel «ni siquiera puede leer la tabla `mensajes`». La ruta `/conversaciones` se conserva porque es lo único que muestra **qué fragmentos citó cada respuesta** — eso no está en Chatwoot. |
| `EMPRESA_EDITA_CANAL` | D12: el número lo habilita Intersim. Dejar que un `ADMIN_EMPRESA` escriba `chatwoot_inbox_id` le permitía romper el enrutado de sus propios mensajes. |

⚠️ Ocultar no arregla los permisos: cuando el panel deje de conectarse con un
rol con BYPASSRLS, las consultas de `/conversaciones` fallarán con *permission
denied* sobre `mensajes`. La decisión de fondo sigue abierta.

### Qué tablas necesita el panel

Para decidir los `grant` del acceso del backoffice:

| Siempre (lectura) | `planes`, `empresas`, `suscripciones`, `usuarios`, `canales`, `configuraciones_agente`, `reglas_negocio`, `documentos`, `fragmentos`, `conversaciones`, `escalados`, `uso_diario`, `errores` |
|---|---|
| **Escritura** | `empresas`, `suscripciones`, `usuarios`, `canales`, `documentos` — y las funciones `fn_guardar_configuracion` y `fn_retirar_documento` |
| **Solo si se encienden las vistas ocultas** | `mensajes`, `mensajes_fragmentos`, `clientes_finales` |

El panel **no escribe** en `mensajes`, `conversaciones` ni `clientes_finales`.

## 4. Añadir una vista

1. Carpeta con su `page.tsx` bajo `src/app/(app)/`.
2. Una entrada en `src/components/shell/nav.ts` con sus `roles`.
3. Si consulta datos, su función en `src/lib/queries/`.
4. Si escribe, su `actions.ts` con esquema Zod.

No hay nada más que tocar. Ni un `switch`, ni un registro de vistas, ni estado
global.

---

## 5. Lo que este backoffice NO hace

Y es a propósito:

| | Quién lo hace |
|---|---|
| Trocear documentos y calcular embeddings | el flujo `ASI_` de ingesta (A1). Aquí el documento queda `PENDIENTE` |
| Atender conversaciones | Chatwoot. El modo humano/agente se conmuta ahí (D32) |
| Onboarding del número y el token | el Tech Provider de Meta. Aquí solo se anotan los ids |
| Escribir mensajes en la base | los flujos, con `fn_registrar_mensaje` |
| Facturar | fuera del sistema en la v1 |

Los flujos `ASI_` hablan con Postgres **directamente** (rol `asistia_flujos`),
no con este backoffice. Por eso no hay una API REST: no tendría cliente.

---

## 6. Comandos

```bash
npm run dev        # desarrollo
npm run build      # compilar
npm run typecheck  # tipos, sin compilar
npm run lint

npm run sql -- db/seed-empresa.sql          # aplicar un .sql contra DATABASE_URL
npm run usuario -- --email … --rol …        # dar de alta un usuario
```

`npm run sql` manda el archivo entero en una sola consulta, sin trocearlo por
`;`: estos scripts llevan bloques `do $$ … $$` con puntos y comas dentro, y
cualquier troceo ingenuo los parte por la mitad.
