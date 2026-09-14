import "server-only";

/**
 * Extracción de texto de PDF y DOCX.
 * =============================================================================
 *
 * POR QUÉ VIVE EN EL BACKOFFICE Y NO EN EL FLUJO DE INGESTA
 *
 * Es el supuesto `S4` de la documentación, y el contrato de `F3` lo da por
 * hecho: el flujo `ASI_10_INGESTA` **no descarga archivos de Storage**. Su
 * función `fn_ingesta_tomar` devuelve `texto_extraido` y no menciona
 * `storage_path` por ningún lado — comprobado leyendo el cuerpo de la función
 * en la base.
 *
 * Traducción práctica: si el panel no deja el texto en esa columna, el
 * documento entra en cola y no produce ni un fragmento. Antes de esto, todo PDF
 * subido desde el panel era un callejón sin salida.
 *
 * Si `S4` se revierte y la extracción pasa al flujo, este archivo se borra y
 * `A1` necesita credenciales de Storage. Es la bisagra entre las dos opciones.
 */

/** Debajo de esto, un PDF es casi con seguridad un escaneo sin OCR. */
const MINIMO_CARACTERES = 40;

export interface TextoExtraido {
  texto: string;
  /** Solo para PDF. Útil para el mensaje de error. */
  paginas?: number;
}

export class ErrorExtraccion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorExtraccion";
  }
}

/**
 * Devuelve el texto plano del archivo, o lanza `ErrorExtraccion` con un mensaje
 * que se le puede enseñar a quien subió el documento.
 */
export async function extraerTexto(
  bytes: Buffer,
  tipo: "PDF" | "DOCX"
): Promise<TextoExtraido> {
  const resultado = tipo === "PDF" ? await dePdf(bytes) : await deDocx(bytes);

  const texto = limpiarTexto(resultado.texto);

  if (texto.length < MINIMO_CARACTERES) {
    throw new ErrorExtraccion(
      tipo === "PDF"
        ? "No se pudo sacar texto del PDF. Suele pasar con escaneos o fotos: el archivo tiene " +
          "imágenes, no texto. Pásalo por un OCR, o pega el contenido en la pestaña de texto."
        : "El documento no tiene texto suficiente. Comprueba que no esté vacío."
    );
  }

  return { ...resultado, texto };
}

async function dePdf(bytes: Buffer): Promise<TextoExtraido> {
  // Import dinámico: `unpdf` arrastra pdf.js, que son varios megas. Cargarlo
  // solo cuando alguien sube un PDF mantiene el arranque del servidor ligero.
  const { extractText, getDocumentProxy } = await import("unpdf");

  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { texto: String(text), paginas: totalPages };
  } catch (error) {
    throw new ErrorExtraccion(
      `No se pudo leer el PDF (${mensajeCorto(error)}). ¿Está protegido con contraseña o dañado?`
    );
  }
}

async function deDocx(bytes: Buffer): Promise<TextoExtraido> {
  const mammoth = await import("mammoth");

  try {
    // `extractRawText` y no `convertToHtml`: al RAG le sirve el texto, y el
    // marcado solo añadiría ruido a los fragmentos y a los embeddings.
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return { texto: value };
  } catch (error) {
    throw new ErrorExtraccion(
      `No se pudo leer el documento de Word (${mensajeCorto(error)}). ` +
        "Si es un .doc antiguo, guárdalo como .docx."
    );
  }
}

/**
 * Limpieza antes de guardar.
 *
 * DOS COSAS DISTINTAS, Y LA PRIMERA NO ES COSMÉTICA
 *
 * 1. QUITAR EL BYTE NULO. Postgres no admite `0x00` dentro de una columna
 *    `text`: es el único carácter UTF-8 válido que rechaza, y protesta con
 *
 *        22021  invalid byte sequence for encoding "UTF8": 0x00
 *
 *    Hay PDF que lo traen —fuentes incrustadas, campos de formulario, texto
 *    escrito por herramientas que usan cadenas terminadas en nulo— y el
 *    extractor lo pasa tal cual. Reventaba el `insert` ENTERO, así que el
 *    documento no se guardaba y el usuario solo veía "no se pudo registrar el
 *    documento", sin ninguna pista de por qué. Ocurrió en producción el
 *    14-sep-2026.
 *
 *    Se quita, no se sustituye: un nulo no representa nada que nadie quisiera
 *    leer.
 *
 * 2. El resto sí es ahorro: los saltos de página y las rachas de espacios que
 *    dejan los extractores se convierten en tokens que se pagan en cada
 *    embedding y en cada prompt, sin aportar nada.
 *
 * EL ORDEN IMPORTA. `\r` y `\f` se traducen a saltos de línea ANTES de barrer
 * los caracteres de control. Si se barrieran primero, un salto de página se
 * perdería en vez de convertirse en la separación que sí significa algo.
 */
export function limpiarTexto(texto: string): string {
  return (
    texto
      .replace(/\r\n?/g, "\n")
      .replace(/\f/g, "\n")
      // Controles C0 y DEL, salvo salto de línea y tabulador. El `\x00` es el
      // que rompe Postgres; los demás son ruido que el modelo pagaría igual.
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0E-\x1F\x7F]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function mensajeCorto(error: unknown): string {
  const m = error instanceof Error ? error.message : String(error);
  return m.length > 80 ? `${m.slice(0, 80)}…` : m;
}
