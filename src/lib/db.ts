import "server-only";
import { Pool, type PoolClient } from "pg";
import type { Rol } from "@/types/asistia";

/**
 * Acceso a Postgres con aislamiento por empresa.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ---------------------------
 * El esquema `asistia` aísla cada empresa con RLS (D18). Las políticas leen la
 * empresa de la sesión por dos caminos (ver `empresa_actual()` en el SQL):
 *
 *   1. `current_setting('app.empresa_id')`  <- el que usa este backoffice y n8n
 *   2. `usuarios.auth_user_id = auth.uid()` <- el de un cliente Supabase
 *
 * Como aquí hablamos con Postgres por el driver `pg` y no por PostgREST, no hay
 * `auth.uid()`: fijamos `app.empresa_id` y `app.rol` nosotros, SIEMPRE dentro de
 * una transacción y SIEMPRE con `is_local = true`.
 *
 * El `true` no es un detalle: sin él el valor se queda pegado a la conexión y,
 * como el pool la reutiliza, la siguiente petición —de otra empresa— heredaría
 * la empresa de la anterior. Es la fuga de datos clásica de multi-tenant sobre
 * un pool. Con `true` el valor muere al terminar la transacción.
 *
 * ADEMÁS: en Supabase el rol `postgres` tiene BYPASSRLS (verificado 11-sep y
 * anotado en la cabecera del esquema). Si `DATABASE_URL` apunta a `postgres`,
 * las políticas NO se aplican y `app.empresa_id` no protege nada por sí solo.
 * Por eso toda consulta de `src/lib/queries/` filtra además por `empresa_id` de
 * forma explícita: la RLS es la red de seguridad, no la única defensa.
 * En producción usa el rol `asistia_app` de `db/02-rol-app.sql`, que no tiene
 * BYPASSRLS y por tanto sí pasa por las políticas.
 */

const SCHEMA = process.env.DATABASE_SCHEMA ?? "asistia";
const SEARCH_PATH = `${SCHEMA}, public, extensions`;

declare global {
  // El pool sobrevive al hot-reload de desarrollo; sin esto Next abriría un pool
  // nuevo en cada recompilación hasta agotar las conexiones de Supabase.
  //
  // Se guarda junto a la cadena con la que se creó: cuando Next recarga
  // `.env.local` sin reiniciar el proceso, el pool cacheado seguiría hablando
  // con el servidor ANTERIOR. Comparar la cadena hace que cambiar DATABASE_URL
  // surta efecto al guardar, en vez de dar un timeout desconcertante contra un
  // host que ya nadie tiene escrito en ningún sitio.
  // eslint-disable-next-line no-var
  var __asistiaPool: { pool: Pool; cadena: string } | undefined;
}

function cadenaConexion(): string {
  const valor = process.env.DATABASE_URL;
  if (!valor) {
    throw new Error(
      "Falta DATABASE_URL. Copia .env.example a .env.local y rellena la cadena de conexión."
    );
  }
  return valor;
}

function crearPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // El certificado del pooler de Supabase es autofirmado: la conexión va
    // cifrada, lo que se omite es validar la cadena. Equivale a sslmode=no-verify.
    ssl: { rejectUnauthorized: false },
  });
}

/**
 * El pool, creado a demanda. Es una función y no una constante de módulo para
 * que la cadena se lea en la primera consulta y no al importar el archivo: así
 * un `.env.local` incompleto no tumba el arranque entero, y `/api/health` puede
 * contarlo en vez de que la app muera antes de responder.
 */
export function obtenerPool(): Pool {
  const cadena = cadenaConexion();
  const cacheado = globalThis.__asistiaPool;

  if (cacheado) {
    if (cacheado.cadena === cadena) return cacheado.pool;
    // La cadena cambió: se cierra el pool viejo en segundo plano y se abre otro.
    void cacheado.pool.end().catch(() => {});
  }

  const pool = crearPool(cadena);
  // Se cachea SIEMPRE, no solo en desarrollo: como esto es una función y no una
  // constante de módulo, sin caché en producción se abriría un pool por
  // consulta y se agotarían las conexiones del pooler en minutos.
  globalThis.__asistiaPool = { pool, cadena };
  return pool;
}

/** Quién consulta. `empresaId` null + rol INTERSIM = ve todas las empresas. */
export interface Tenant {
  empresaId: string | null;
  rol: Rol;
}

/** Lo que recibe el callback de `withTenant`: consultar, nada más. */
export interface Querier {
  /** Devuelve las filas. Usa SIEMPRE parámetros ($1, $2...), nunca interpolación. */
  rows<T extends object = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[]
  ): Promise<T[]>;
  /** La primera fila, o null. */
  row<T extends object = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[]
  ): Promise<T | null>;
}

function querier(client: PoolClient): Querier {
  return {
    async rows(text, params) {
      const res = await client.query(text, params ? [...params] : undefined);
      return res.rows;
    },
    async row(text, params) {
      const res = await client.query(text, params ? [...params] : undefined);
      return res.rows[0] ?? null;
    },
  };
}

async function fijarSesion(client: PoolClient, tenant: Tenant): Promise<void> {
  // `true` = local a la transacción. Ver la nota de arriba: quitarlo filtra
  // datos entre empresas a través del pool.
  await client.query("select set_config('search_path', $1, true)", [SEARCH_PATH]);
  await client.query("select set_config('app.rol', $1, true)", [tenant.rol]);
  await client.query("select set_config('app.empresa_id', $1, true)", [
    tenant.empresaId ?? "",
  ]);
}

/**
 * Ejecuta consultas de SOLO LECTURA en nombre de `tenant`.
 *
 * La transacción es `read only` de verdad: si una consulta intenta escribir,
 * Postgres la rechaza. Es lo que usan los dashboards y los listados, y evita
 * que un error de programación escriba desde una vista de lectura.
 */
export async function withTenant<T>(
  tenant: Tenant,
  fn: (q: Querier) => Promise<T>
): Promise<T> {
  const client = await obtenerPool().connect();
  try {
    await client.query("begin read only");
    await fijarSesion(client, tenant);
    const resultado = await fn(querier(client));
    await client.query("commit");
    return resultado;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Igual que `withTenant` pero en lectura/escritura, y atómico: si el callback
 * lanza, no queda nada a medias. Para altas, ediciones y las funciones
 * `fn_*` del esquema.
 */
export async function withTenantWrite<T>(
  tenant: Tenant,
  fn: (q: Querier) => Promise<T>
): Promise<T> {
  const client = await obtenerPool().connect();
  try {
    await client.query("begin");
    await fijarSesion(client, tenant);
    const resultado = await fn(querier(client));
    await client.query("commit");
    return resultado;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Consulta elevada a INTERSIM, de solo lectura, para el ÚNICO caso en que aún
 * no sabemos de qué empresa es quien pregunta: resolver la fila de `usuarios` a
 * partir del id de Supabase Auth.
 *
 * Es el mismo truco que usa `fn_resolver_empresa` en el esquema (eleva `app.rol`
 * dentro de su propio ámbito). Aquí el ámbito es una transacción de una sola
 * consulta. No lo uses para nada más.
 */
export async function withBootstrap<T>(fn: (q: Querier) => Promise<T>): Promise<T> {
  return withTenant({ empresaId: null, rol: "INTERSIM" }, fn);
}

/** Ping de arranque: dice claro si la cadena de conexión está mal. */
export async function comprobarConexion(): Promise<
  { ok: true; version: string } | { ok: false; error: string }
> {
  try {
    const client = await obtenerPool().connect();
    try {
      const res = await client.query("select version() as version");
      return { ok: true, version: String(res.rows[0].version) };
    } finally {
      client.release();
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
