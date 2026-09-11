import "server-only";
import { withTenant, withTenantWrite, type Tenant } from "@/lib/db";
import type { Empresa, EstadoEmpresa, Plan } from "@/types/asistia";

/** Alta y mantenimiento de empresas suscriptoras. Solo INTERSIM (D19). */

export interface FilaEmpresa extends Empresa {
  plan_nombre: string | null;
  canal_estado: string | null;
  usuarios: number;
  documentos: number;
}

export function listarEmpresas(t: Tenant) {
  return withTenant(t, (q) =>
    q.rows<FilaEmpresa>(
      `select e.*,
              p.nombre as plan_nombre,
              (select c.estado from canales c
                where c.empresa_id = e.id
                order by (c.estado = 'HABILITADO') desc, c.creado_en desc
                limit 1) as canal_estado,
              (select count(*)::int from usuarios u where u.empresa_id = e.id) as usuarios,
              (select count(*)::int from documentos d
                where d.empresa_id = e.id and d.estado <> 'RETIRADO') as documentos
         from empresas e
         left join suscripciones s on s.empresa_id = e.id and s.fin is null
         left join planes p        on p.id = s.plan_id
        order by e.creada_en desc`
    )
  );
}

export function obtenerEmpresa(t: Tenant, id: string) {
  return withTenant(t, (q) =>
    q.row<FilaEmpresa>(
      `select e.*,
              p.nombre as plan_nombre,
              (select c.estado from canales c where c.empresa_id = e.id
                order by (c.estado = 'HABILITADO') desc, c.creado_en desc limit 1) as canal_estado,
              (select count(*)::int from usuarios u where u.empresa_id = e.id) as usuarios,
              (select count(*)::int from documentos d
                where d.empresa_id = e.id and d.estado <> 'RETIRADO') as documentos
         from empresas e
         left join suscripciones s on s.empresa_id = e.id and s.fin is null
         left join planes p        on p.id = s.plan_id
        where e.id = $1`,
      [id]
    )
  );
}

/** Id del plan con suscripción abierta, o null. Lo necesita el selector de plan. */
export async function planVigenteDe(t: Tenant, empresaId: string): Promise<string | null> {
  const fila = await withTenant(t, (q) =>
    q.row<{ plan_id: string }>(
      `select plan_id from suscripciones where empresa_id = $1 and fin is null`,
      [empresaId]
    )
  );
  return fila?.plan_id ?? null;
}

export function listarPlanes(t: Tenant) {
  return withTenant(t, (q) =>
    q.rows<Plan>(
      `select * from planes
        where vigente_hasta is null or vigente_hasta >= current_date
        order by precio_mensual asc`
    )
  );
}

export interface NuevaEmpresa {
  nombre: string;
  client_key: string;
  responsable_nombre: string;
  responsable_email: string;
  chatwoot_account_id: number | null;
  /** Ojo: el CÓDIGO del plan (`crecimiento`), no su uuid. Es lo que pide la función. */
  plan_codigo: string;
  estado?: EstadoEmpresa;
  /** El usuario de Supabase Auth se crea antes; aquí entra su uuid. */
  admin?: { auth_user_id: string; email: string; nombre: string | null };
  /** Los ids que devuelve el onboarding del Tech Provider. */
  canal?: {
    phone_number_id: string;
    display_phone_number: string | null;
    waba_id: string | null;
    chatwoot_inbox_id: number | null;
    estado: "PENDIENTE" | "HABILITADO" | "DESHABILITADO";
  };
}

export interface ResultadoAlta {
  empresa_id: string;
  canal_id: string | null;
  usuario_id: string | null;
  configuracion_id: string;
  era_nueva: boolean;
}

/**
 * Alta de empresa por `fn_alta_empresa` (historia `D2`).
 *
 * POR QUÉ UNA FUNCIÓN Y NO CINCO `INSERT`
 *
 * La función hace en UNA llamada atómica lo que antes hacíamos a mano y a
 * medias: empresa, suscripción, canal, usuario administrador y una
 * configuración inicial vigente. Esa última pieza importa más de lo que parece:
 * garantiza que ninguna empresa exista sin configuración, así que el panel no
 * tiene que tratar el caso "empresa sin agente" en cada pantalla.
 *
 * Además es **idempotente por `client_key`**: repetir el alta actualiza en vez
 * de chocar. Y valida que quien llama sea Intersim (`es_intersim()`), que se
 * cumple porque `withTenantWrite` fija `app.rol` desde la sesión.
 *
 * El bloque `canal` es el que la documentación llama contrato 3: con `F1`
 * aplazada, `chatwoot_inbox_id` entra por aquí y por ningún otro sitio. Sin él,
 * `fn_resolver_empresa` no sabe de quién es una conversación entrante.
 */
export function crearEmpresa(t: Tenant, datos: NuevaEmpresa) {
  return withTenantWrite(t, async (q) => {
    const fila = await q.row<ResultadoAlta>(
      `select * from fn_alta_empresa($1::jsonb)`,
      [
        JSON.stringify({
          client_key: datos.client_key,
          nombre: datos.nombre,
          responsable_nombre: datos.responsable_nombre,
          responsable_email: datos.responsable_email,
          chatwoot_account_id: datos.chatwoot_account_id,
          estado: datos.estado ?? "PENDIENTE",
          plan_codigo: datos.plan_codigo,
          ...(datos.admin ? { admin: datos.admin } : {}),
          ...(datos.canal ? { canal: datos.canal } : {}),
        }),
      ]
    );
    return fila!;
  });
}

export interface CambioEmpresa {
  nombre?: string;
  responsable_nombre?: string;
  responsable_email?: string;
  chatwoot_account_id?: number | null;
  estado?: EstadoEmpresa;
  plan_id?: string | null;
}

/**
 * Edición. El estado no es un campo más: pasar a ACTIVA sella `activada_en` y
 * pasar a DESACTIVADA sella `desactivada_en`, que es lo que la baja necesita
 * para no borrar nada (límite de alcance: "la baja no borra").
 */
export function actualizarEmpresa(t: Tenant, id: string, cambios: CambioEmpresa) {
  return withTenantWrite(t, async (q) => {
    const campos: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, valor: unknown) => {
      params.push(valor);
      campos.push(`${col} = $${params.length}`);
    };

    if (cambios.nombre !== undefined) set("nombre", cambios.nombre);
    if (cambios.responsable_nombre !== undefined)
      set("responsable_nombre", cambios.responsable_nombre);
    if (cambios.responsable_email !== undefined)
      set("responsable_email", cambios.responsable_email);
    if (cambios.chatwoot_account_id !== undefined)
      set("chatwoot_account_id", cambios.chatwoot_account_id);

    if (cambios.estado !== undefined) {
      set("estado", cambios.estado);
      if (cambios.estado === "ACTIVA") campos.push("activada_en = coalesce(activada_en, now())");
      if (cambios.estado === "DESACTIVADA") campos.push("desactivada_en = now()");
    }
    campos.push("actualizada_en = now()");

    params.push(id);
    const empresa = await q.row<Empresa>(
      `update empresas set ${campos.join(", ")} where id = $${params.length} returning *`,
      params
    );
    if (!empresa) throw new Error("Empresa no encontrada");

    // Cambio de plan: se cierra la suscripción vigente y se abre otra. No se
    // edita la fila anterior, para que el histórico de facturación se conserve.
    if (cambios.plan_id) {
      const vigente = await q.row<{ plan_id: string }>(
        `select plan_id from suscripciones where empresa_id = $1 and fin is null`,
        [id]
      );
      if (vigente?.plan_id !== cambios.plan_id) {
        await q.rows(
          `update suscripciones set fin = current_date where empresa_id = $1 and fin is null`,
          [id]
        );
        await q.rows(`insert into suscripciones (empresa_id, plan_id) values ($1, $2)`, [
          id,
          cambios.plan_id,
        ]);
      }
    }
    return empresa;
  });
}

export interface UsuarioEmpresa {
  id: string;
  email: string;
  nombre: string | null;
  rol: string;
  estado: string;
  creado_en: string;
}

export function usuariosDeEmpresa(t: Tenant, empresaId: string) {
  return withTenant(t, (q) =>
    q.rows<UsuarioEmpresa>(
      `select id, email, nombre, rol, estado, creado_en
         from usuarios where empresa_id = $1 order by creado_en asc`,
      [empresaId]
    )
  );
}

/**
 * Enlaza un usuario de Supabase Auth con una empresa. El `auth_user_id` viene
 * de haber creado antes el usuario en Auth con la service role key; aquí solo
 * se registra la fila de `usuarios`.
 *
 * El índice `usuarios_un_admin_por_empresa_uidx` impone un único
 * ADMIN_EMPRESA por empresa (D43): el segundo intento falla en la base.
 */
export function crearUsuarioEmpresa(
  t: Tenant,
  datos: { authUserId: string; empresaId: string; email: string; nombre: string | null }
) {
  return withTenantWrite(t, (q) =>
    q.row<UsuarioEmpresa>(
      `insert into usuarios (auth_user_id, empresa_id, email, nombre, rol)
       values ($1, $2, $3, $4, 'ADMIN_EMPRESA')
       returning id, email, nombre, rol, estado, creado_en`,
      [datos.authUserId, datos.empresaId, datos.email, datos.nombre]
    )
  );
}
