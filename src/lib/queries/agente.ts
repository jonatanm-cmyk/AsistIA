import "server-only";
import { withTenant, withTenantWrite, type Tenant } from "@/lib/db";
import type { ConfiguracionAgente, ReglaNegocio, TipoRegla } from "@/types/asistia";

/**
 * Configuración del agente (F2). Dos de las cuatro cosas que una empresa puede
 * tocar: el tono y las reglas de negocio (D16).
 *
 * La configuración es VERSIONADA: guardar no edita la fila vigente, crea la
 * versión N+1 y desactiva la anterior. Eso lo hace `fn_guardar_configuracion`
 * en la base, bajo un advisory lock, para que dos guardados simultáneos no
 * generen dos versiones con el mismo número. No lo reimplementes en TypeScript.
 */

export interface ConfiguracionConReglas extends ConfiguracionAgente {
  reglas: ReglaNegocio[];
}

export async function configuracionVigente(
  t: Tenant,
  empresaId: string
): Promise<ConfiguracionConReglas | null> {
  return withTenant(t, async (q) => {
    const config = await q.row<ConfiguracionAgente>(
      `select * from configuraciones_agente
        where empresa_id = $1 and vigente`,
      [empresaId]
    );
    if (!config) return null;

    const reglas = await q.rows<ReglaNegocio>(
      `select * from reglas_negocio
        where configuracion_id = $1 and empresa_id = $2
        order by orden asc`,
      [config.id, empresaId]
    );
    return { ...config, reglas };
  });
}

/**
 * Una versión concreta con sus reglas, para restaurarla.
 *
 * Lleva `empresa_id` en el WHERE además del id de la configuración: sin eso,
 * conocer un uuid ajeno bastaría para leer la configuración de otra empresa.
 */
export async function obtenerVersion(
  t: Tenant,
  empresaId: string,
  configuracionId: string
): Promise<ConfiguracionConReglas | null> {
  return withTenant(t, async (q) => {
    const config = await q.row<ConfiguracionAgente>(
      `select * from configuraciones_agente where id = $1 and empresa_id = $2`,
      [configuracionId, empresaId]
    );
    if (!config) return null;

    const reglas = await q.rows<ReglaNegocio>(
      `select * from reglas_negocio
        where configuracion_id = $1 and empresa_id = $2
        order by orden asc`,
      [configuracionId, empresaId]
    );
    return { ...config, reglas };
  });
}

export interface VersionConfiguracion {
  id: string;
  version: number;
  tono: string;
  nombre_agente: string;
  vigente: boolean;
  creada_en: string;
  creada_por_email: string | null;
  reglas: number;
}

export function historialConfiguraciones(t: Tenant, empresaId: string, limite = 20) {
  return withTenant(t, (q) =>
    q.rows<VersionConfiguracion>(
      `select c.id, c.version, c.tono, c.nombre_agente, c.vigente, c.creada_en,
              u.email as creada_por_email,
              (select count(*)::int from reglas_negocio r
                where r.configuracion_id = c.id) as reglas
         from configuraciones_agente c
         left join usuarios u on u.id = c.creada_por
        where c.empresa_id = $1
        order by c.version desc
        limit $2`,
      [empresaId, limite]
    )
  );
}

export interface ReglaEntrada {
  tipo: TipoRegla;
  texto: string;
  activa: boolean;
}

export interface GuardarConfiguracion {
  empresaId: string;
  nombre_agente: string;
  tono: string;
  idioma: string;
  max_tokens_respuesta: number;
  tope_tokens_conversacion_dia: number;
  creadaPor: string;
  reglas: ReglaEntrada[];
}

/**
 * Crea la versión N+1. Devuelve el id y el número de versión nuevos.
 *
 * Ojo con el orden de las reglas: la función de la base usa `row_number()` si
 * no se manda `orden`, así que el índice del array ES el orden. Reordenar en la
 * UI equivale a reordenar el array antes de enviarlo.
 */
export function guardarConfiguracion(t: Tenant, datos: GuardarConfiguracion) {
  return withTenantWrite(t, async (q) => {
    const payload = {
      empresa_id: datos.empresaId,
      nombre_agente: datos.nombre_agente,
      tono: datos.tono,
      idioma: datos.idioma,
      max_tokens_respuesta: datos.max_tokens_respuesta,
      tope_tokens_conversacion_dia: datos.tope_tokens_conversacion_dia,
      creada_por: datos.creadaPor,
      reglas: datos.reglas
        .filter((r) => r.texto.trim() !== "")
        .map((r, i) => ({ orden: i + 1, tipo: r.tipo, texto: r.texto.trim(), activa: r.activa })),
    };

    const fila = await q.row<{ configuracion_id: string; version: number }>(
      `select * from fn_guardar_configuracion($1::jsonb)`,
      [JSON.stringify(payload)]
    );
    return fila!;
  });
}

// `TONOS_SUGERIDOS` vive en `@/types/asistia`, no aquí: este módulo es
// server-only y el selector que los muestra es un componente de cliente.
// Importar un valor desde aquí arrastraría todo el acceso a la base al bundle
// del navegador, y el build falla — correctamente.
