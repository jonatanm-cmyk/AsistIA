import "server-only";
import { withTenant, withTenantWrite, type Tenant } from "@/lib/db";
import type { Canal, EstadoCanal } from "@/types/asistia";

/**
 * Canal de WhatsApp (la cuarta cosa configurable, D16).
 *
 * Lo que AsistIA NO hace: el onboarding del número y el token es del Meta Tech
 * Provider, que es de otro equipo. Aquí solo se guardan los identificadores que
 * ese onboarding devuelve y el inbox de Chatwoot al que quedan enlazados.
 * Por eso el formulario pide ids y no credenciales.
 */

export function listarCanales(t: Tenant, empresaId: string) {
  return withTenant(t, (q) =>
    q.rows<Canal>(
      `select * from canales where empresa_id = $1 order by creado_en desc`,
      [empresaId]
    )
  );
}

export interface DatosCanal {
  phone_number_id: string | null;
  display_phone_number: string | null;
  waba_id: string | null;
  chatwoot_inbox_id: number | null;
  estado: EstadoCanal;
}

export function crearCanal(t: Tenant, empresaId: string, datos: DatosCanal) {
  return withTenantWrite(t, (q) =>
    q.row<Canal>(
      `insert into canales
         (empresa_id, tipo, phone_number_id, display_phone_number, waba_id, chatwoot_inbox_id, estado, habilitado_en)
       values ($1, 'WHATSAPP', $2, $3, $4, $5, $6, case when $6 = 'HABILITADO' then now() end)
       returning *`,
      [
        empresaId,
        datos.phone_number_id,
        datos.display_phone_number,
        datos.waba_id,
        datos.chatwoot_inbox_id,
        datos.estado,
      ]
    )
  );
}

export function actualizarCanal(
  t: Tenant,
  empresaId: string,
  canalId: string,
  datos: DatosCanal
) {
  return withTenantWrite(t, async (q) => {
    const canal = await q.row<Canal>(
      `update canales
          set phone_number_id      = $3,
              display_phone_number = $4,
              waba_id              = $5,
              chatwoot_inbox_id    = $6,
              estado               = $7,
              habilitado_en        = case
                                       when $7 = 'HABILITADO' then coalesce(habilitado_en, now())
                                       else habilitado_en
                                     end
        where id = $1 and empresa_id = $2
        returning *`,
      [
        canalId,
        empresaId,
        datos.phone_number_id,
        datos.display_phone_number,
        datos.waba_id,
        datos.chatwoot_inbox_id,
        datos.estado,
      ]
    );
    if (!canal) throw new Error("Canal no encontrado");
    return canal;
  });
}

/**
 * Solo declara el número; nunca cambia los ids ni el estado de un canal existente.
 * El marcador inicial permite preparar el alta sin inventar un id de Meta.
 */
export function guardarNumeroDeclarado(
  t: Tenant,
  empresaId: string,
  clientKey: string,
  numero: string
) {
  return withTenantWrite(t, async (q) => {
    // Bloquear la empresa serializa también el primer guardado, cuando todavía
    // no hay una fila de canal que bloquear y dos envíos podrían duplicarla.
    const empresa = await q.row<{ id: string }>(
      `select id from empresas where id = $1 for update`,
      [empresaId]
    );
    if (!empresa) throw new Error("Empresa no encontrada");

    const canal = await q.row<Canal>(
      `select * from canales where empresa_id = $1
        order by (estado = 'HABILITADO') desc, creado_en desc limit 1 for update`,
      [empresaId]
    );
    // El formulario puede haberse abierto antes de terminar el alta. Comprobarlo
    // aquí evita ofrecer una reconexión que deje la bandeja con el token viejo.
    if (canal?.estado === "HABILITADO") return null;

    if (canal) {
      return q.row<Canal>(
        `update canales set display_phone_number = $3
          where id = $1 and empresa_id = $2 and estado <> 'HABILITADO'
          returning *`,
        [canal.id, empresaId, numero]
      );
    }
    return q.row<Canal>(
      `insert into canales (empresa_id, tipo, phone_number_id, display_phone_number, estado)
       values ($1, 'WHATSAPP', $2, $3, 'PENDIENTE')
       returning *`,
      [empresaId, `PENDIENTE-${clientKey}`, numero]
    );
  });
}
