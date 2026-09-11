/**
 * Tipos del esquema `asistia`, escritos a mano contra
 * `sql/01-esquema-asistia.sql` v1.0 (11-sep-2026, historia D0).
 *
 * Los literales de unión replican los CHECK de la base. Si cambias un CHECK en
 * el SQL, cámbialo aquí: es el único punto donde el front sabe qué valores son
 * legales, y de él salen los selectores de la UI.
 */

// ---------------------------------------------------------------------------
// Enumeraciones (CHECK constraints del esquema)
// ---------------------------------------------------------------------------
export const ESTADOS_EMPRESA = ["PENDIENTE", "ACTIVA", "DESACTIVADA"] as const;
export type EstadoEmpresa = (typeof ESTADOS_EMPRESA)[number];

export const ROLES = ["ADMIN_EMPRESA", "INTERSIM"] as const;
export type Rol = (typeof ROLES)[number];

export const ESTADOS_USUARIO = ["ACTIVO", "BLOQUEADO"] as const;
export type EstadoUsuario = (typeof ESTADOS_USUARIO)[number];

export const ESTADOS_CANAL = ["PENDIENTE", "HABILITADO", "DESHABILITADO"] as const;
export type EstadoCanal = (typeof ESTADOS_CANAL)[number];

export const TIPOS_REGLA = ["INSTRUCCION", "PROHIBICION", "ESCALAR_SI"] as const;
export type TipoRegla = (typeof TIPOS_REGLA)[number];

export const TIPOS_DOCUMENTO = ["PDF", "DOCX", "TEXTO"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ESTADOS_DOCUMENTO = [
  "PENDIENTE",
  "INGESTANDO",
  "INGESTADO",
  "ERROR",
  "RETIRADO",
] as const;
export type EstadoDocumento = (typeof ESTADOS_DOCUMENTO)[number];

export const ESTADOS_CONVERSACION = ["ABIERTA", "CERRADA"] as const;
export type EstadoConversacion = (typeof ESTADOS_CONVERSACION)[number];

export const DIRECCIONES = ["ENTRANTE", "SALIENTE"] as const;
export type Direccion = (typeof DIRECCIONES)[number];

export const AUTORES = ["CLIENTE", "AGENTE", "HUMANO"] as const;
export type Autor = (typeof AUTORES)[number];

export const ESTADOS_ENTREGA = [
  "NO_APLICA",
  "PENDIENTE",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
] as const;
export type EstadoEntrega = (typeof ESTADOS_ENTREGA)[number];

export const MOTIVOS_ESCALADO = [
  "NO_SABE",
  "PEDIDO_CLIENTE",
  "REGLA",
  "GUARDARRAIL",
] as const;
export type MotivoEscalado = (typeof MOTIVOS_ESCALADO)[number];

// Etiquetas legibles. La UI nunca muestra el literal crudo de la base.
export const ETIQUETA_MOTIVO: Record<MotivoEscalado, string> = {
  NO_SABE: "El agente no supo",
  PEDIDO_CLIENTE: "Lo pidió el cliente",
  REGLA: "Una regla lo obliga",
  GUARDARRAIL: "Lo frenó el guardarraíl",
};

export const ETIQUETA_TIPO_REGLA: Record<TipoRegla, string> = {
  INSTRUCCION: "Instrucción",
  PROHIBICION: "Prohibición",
  ESCALAR_SI: "Escalar si",
};

/**
 * Tonos sugeridos para el agente. En la base el tono es texto libre: esto solo
 * alimenta el autocompletado del formulario.
 *
 * Vive aquí y no en `lib/queries/agente.ts` porque ese módulo es server-only y
 * quien consume esta lista es un componente de cliente.
 */
export const TONOS_SUGERIDOS = [
  "Cercano y claro",
  "Formal y preciso",
  "Comercial y resolutivo",
  "Técnico y directo",
  "Institucional",
] as const;

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------
export interface Plan {
  id: string;
  codigo: string;
  nombre: string;
  cuota_conversaciones_mes: number;
  cuota_documentos: number;
  precio_mensual: string;
  precio_habilitacion: string;
  precio_conversacion_extra: string;
  moneda: string;
  vigente_desde: string;
  vigente_hasta: string | null;
}

export interface Empresa {
  id: string;
  client_key: string;
  nombre: string;
  responsable_nombre: string;
  responsable_email: string;
  chatwoot_account_id: number | null;
  estado: EstadoEmpresa;
  creada_en: string;
  activada_en: string | null;
  desactivada_en: string | null;
  actualizada_en: string;
}

export interface Usuario {
  id: string;
  auth_user_id: string;
  empresa_id: string | null;
  email: string;
  nombre: string | null;
  rol: Rol;
  estado: EstadoUsuario;
  creado_en: string;
}

export interface Canal {
  id: string;
  empresa_id: string;
  tipo: "WHATSAPP";
  phone_number_id: string | null;
  display_phone_number: string | null;
  waba_id: string | null;
  chatwoot_inbox_id: number | null;
  estado: EstadoCanal;
  habilitado_en: string | null;
  creado_en: string;
}

export interface ConfiguracionAgente {
  id: string;
  empresa_id: string;
  version: number;
  nombre_agente: string;
  tono: string;
  idioma: string;
  max_tokens_respuesta: number;
  tope_tokens_conversacion_dia: number;
  vigente: boolean;
  creada_por: string | null;
  creada_en: string;
}

export interface ReglaNegocio {
  id: string;
  configuracion_id: string;
  empresa_id: string;
  orden: number;
  tipo: TipoRegla;
  texto: string;
  activa: boolean;
}

export interface Documento {
  id: string;
  empresa_id: string;
  nombre: string;
  tipo: TipoDocumento;
  storage_path: string | null;
  huella_sha256: string;
  bytes: number | null;
  estado: EstadoDocumento;
  error_detalle: string | null;
  subido_por: string | null;
  subido_en: string;
  ingestado_en: string | null;
  retirado_en: string | null;
}

export interface Conversacion {
  id: string;
  empresa_id: string;
  canal_id: string;
  cliente_final_id: string;
  chatwoot_conversation_id: number | null;
  estado: EstadoConversacion;
  abierta_en: string;
  ultimo_mensaje_en: string;
  ventana_24h_hasta: string | null;
  cerrada_en: string | null;
}

export interface UsoDiario {
  empresa_id: string;
  fecha: string;
  conversaciones_nuevas: number;
  mensajes_entrantes: number;
  mensajes_salientes: number;
  tokens_entrada: number;
  tokens_salida: number;
  escalados: number;
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------
/** Quién está mirando. Sale de Supabase Auth + la fila de `usuarios`. */
export interface Sesion {
  usuarioId: string;
  authUserId: string;
  email: string;
  nombre: string | null;
  rol: Rol;
  /** null si y solo si rol === 'INTERSIM' (lo garantiza un CHECK del esquema). */
  empresaId: string | null;
  empresaNombre: string | null;
  empresaEstado: EstadoEmpresa | null;
}

export const esIntersim = (s: Pick<Sesion, "rol">): boolean => s.rol === "INTERSIM";
