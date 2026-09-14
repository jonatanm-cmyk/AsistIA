import { NextResponse } from "next/server";
import { comprobarConexion, withBootstrap } from "@/lib/db";
import { tokenAsi } from "@/lib/asi";

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

/**
 * Estado de los dos webhooks de n8n, SIN revelar nada.
 *
 * POR QUÉ ESTÁ AQUÍ
 *
 * Si falta la URL o el token, `avisarIngesta` no manda nada y devuelve
 * "sin-configurar". Eso es correcto —el documento queda en `PENDIENTE`, que es
 * recuperable— pero desde fuera es INDISTINGUIBLE de que todo vaya bien: el
 * usuario lee "queda en cola" y se queda tranquilo mientras nada se procesa.
 * Pasó en producción el 14-sep-2026 y costó encontrarlo precisamente por eso.
 *
 * Con esto, comprobar un despliegue es una petición a /api/health en vez de
 * subir un documento y esperar a ver si pasa algo.
 *
 * Solo dice SI están puestas. Nunca el token, y tampoco la URL: no es secreta,
 * pero este endpoint no pide sesión y no hay motivo para publicarla.
 */
function estadoIntegraciones() {
  const token = tokenAsi() !== null;
  const estado = (url: string | undefined) =>
    !url && !token
      ? "sin configurar (faltan la URL y el token)"
      : !url
        ? "sin configurar (falta la URL)"
        : !token
          ? "sin configurar (falta el token)"
          : "configurada";

  return {
    ingesta: estado(process.env.ASI_INGESTA_WEBHOOK_URL),
    prueba_agente: estado(process.env.ASI_PROBAR_WEBHOOK_URL),
  };
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

    const integraciones = estadoIntegraciones();
    const avisos: string[] = [];

    // No tumban el `ok`: la aplicación funciona sin ellas, solo que sin avisar
    // a n8n. Pero tienen que verse, que es todo el problema que resuelven.
    if (integraciones.ingesta !== "configurada") {
      avisos.push(
        "Los documentos que se suban quedarán en PENDIENTE sin procesar: falta configurar " +
          "ASI_INGESTA_WEBHOOK_URL y ASI_WEBHOOK_TOKEN en ESTE entorno. Ojo: .env.local no " +
          "se despliega, hay que ponerlas en el hosting y volver a desplegar."
      );
    }
    if (integraciones.prueba_agente !== "configurada") {
      avisos.push("El botón Probar del agente no funcionará: falta ASI_PROBAR_WEBHOOK_URL.");
    }

    return NextResponse.json({
      ok: completo,
      postgres: conexion.version.split(" ").slice(0, 2).join(" "),
      esquema,
      integraciones,
      ...(avisos.length ? { avisos } : {}),
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
