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
