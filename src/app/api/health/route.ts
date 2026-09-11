import { NextResponse } from "next/server";
import { comprobarConexion, withBootstrap } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Prueba de vida. Existe para una sola pregunta: "cambié la cadena de conexión,
 * ¿funciona?". Responde sin necesidad de iniciar sesión ni de que haya datos.
 *
 * No expone la cadena ni la contraseña: solo si conecta, qué versión de
 * Postgres hay al otro lado, y si el esquema `asistia` está completo (16 tablas
 * y 6 funciones, que es lo que verifica el propio DDL al final).
 */
/**
 * Traduce el error de `pg` a la comprobación que toca hacer.
 *
 * El caso que más tiempo cuesta es el timeout: no es la contraseña ni el
 * puerto, es que `db.<proyecto>.supabase.co` solo resuelve por IPv6 salvo que
 * se contrate el añadido de IPv4. Hay que usar el host del pooler.
 *
 * El segundo es un servidor de desarrollo arrancado ANTES de tocar
 * `.env.local`: Next lee las variables al arrancar, así que hay que reiniciarlo.
 */
function pistaSegunError(error: string): string {
  if (/timeout|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH/i.test(error)) {
    return (
      "Parece un problema de RED, no de credenciales. 1) Usa el host del pooler " +
      "(aws-0-<región>.pooler.supabase.com) con usuario postgres.<proyecto>: la conexión " +
      "directa db.<proyecto>.supabase.co es solo IPv6. 2) Si acabas de editar .env.local, " +
      "REINICIA el servidor de desarrollo: Next lee las variables al arrancar."
    );
  }
  if (/password authentication|SASL|SCRAM/i.test(error)) {
    return (
      "La contraseña no la acepta. Codifica en porcentaje los caracteres especiales " +
      "(@ -> %40, # -> %23); si empieza por '@' sin codificar, la URL se parte y el error " +
      "es justo este. Comprueba también que el usuario sea postgres.<proyecto> por el pooler."
    );
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(error)) {
    return "El host no resuelve. Revisa el nombre del servidor en DATABASE_URL.";
  }
  if (/self.signed|certificate/i.test(error)) {
    return "Usa sslmode=no-verify, no `require`: el certificado del pooler es autofirmado.";
  }
  return (
    "Revisa DATABASE_URL en .env.local: host del pooler, puerto 5432 (modo sesión, no el " +
    "6543 de transacción), sslmode=no-verify y la contraseña codificada."
  );
}

export async function GET() {
  const conexion = await comprobarConexion();

  if (!conexion.ok) {
    return NextResponse.json(
      {
        ok: false,
        etapa: "conexion",
        error: conexion.error,
        // La pista se adapta al fallo: un timeout y un rechazo de contraseña
        // mandan a mirar sitios distintos, y darlos juntos hace perder el rato.
        pista: pistaSegunError(conexion.error),
      },
      { status: 503 }
    );
  }

  try {
    const esquema = await withBootstrap(async (q) => {
      const conteos = await q.row<{ tablas: number; funciones: number; politicas: number }>(
        `select
           (select count(*)::int from information_schema.tables
             where table_schema = 'asistia')                          as tablas,
           (select count(*)::int from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'asistia')                              as funciones,
           (select count(*)::int from pg_policies
             where schemaname = 'asistia')                            as politicas`
      );
      const empresas = await q.row<{ total: number }>(
        `select count(*)::int as total from empresas`
      );
      return { ...conteos!, empresas: empresas?.total ?? 0 };
    });

    const completo = esquema.tablas >= 16 && esquema.funciones >= 6;

    return NextResponse.json({
      ok: completo,
      postgres: conexion.version.split(" ").slice(0, 2).join(" "),
      esquema,
      ...(completo
        ? {}
        : {
            pista:
              "Conecta, pero el esquema `asistia` no está completo. Aplica sql/01-esquema-asistia.sql.",
          }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        etapa: "esquema",
        error: error instanceof Error ? error.message : String(error),
        pista:
          "La conexión funciona pero no se pudo leer el esquema `asistia`. ¿Está aplicado el DDL? ¿El rol tiene USAGE sobre el esquema?",
      },
      { status: 503 }
    );
  }
}
