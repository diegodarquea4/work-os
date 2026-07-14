/**
 * Constantes del Kit de Viaje. Compartidas entre AI prompt, assembler y
 * renderers PDF/Word. Toda cadena visible en el documento se centraliza acá
 * para que un rename institucional (ej: División cambia de nombre) sea un
 * solo diff.
 */

// ── Naming institucional (canónico — no editar sin confirmar) ───────────────

export const MINISTERIO = 'Ministerio del Interior'
export const DIVISION   = 'División de Coordinación Interministerial'

// ── Sección: títulos ───────────────────────────────────────────────────────
// Los títulos NO incluyen el número romano — el renderer lo agrega en la
// columna de índice y en el header de sección. Duplicarlo acá causaba
// "I. I. Caracterización general" en el índice.

export const TITULO_SECCIONES = {
  I:   'Caracterización general de la región',
  II:  'Indicadores socioeconómicos clave',
  /** Se completa en el renderer con " Región {nombre}". */
  III: 'Plan Regional de Gobierno',
  IV:  'Principales conflictos y alertas de la región',
  V:   'Autoridades regionales',
} as const

// ── Copy: PDF PREGO no disponible ──────────────────────────────────────────

/**
 * Copy compartido con la minuta "Avance PREGO" cuando el PDF del plan regional
 * está corrupto/incompleto (< 20 KB o sin magic bytes) o directamente ausente.
 * Se aplica al bloque "Del diagnóstico a la priorización" en `MinutaEjecutiva`.
 */
export const COPY_PREGO_INVALID =
  'El PDF del Plan Regional de Gobierno para esta región presenta problemas de carga en el panel. La justificación de los ejes se completará automáticamente cuando el documento se corrija.'

export const COPY_PREGO_MISSING =
  'Aún no se ha cargado el PDF del Plan Regional de Gobierno para esta región. La justificación de los ejes se completará automáticamente cuando el documento esté disponible.'

/** Se muestra por eje cuando el AI no logró extraer una justificación específica. */
export const COPY_EJE_SIN_JUSTIFICACION =
  'Justificación pendiente.'

// ── Copy: Sección III (Contexto Regional) — PDF plan-regional no disponible ─

/** Análogo a COPY_PREGO_INVALID pero para el resumen de Sección III (no la justificación por eje). */
export const COPY_PLAN_REGIONAL_INVALID =
  'El PDF del Plan Regional de Gobierno para esta región presenta problemas de carga en el panel. El resumen de esta sección se completará automáticamente cuando el documento se corrija.'

/** Análogo a COPY_PREGO_MISSING pero para el resumen de Sección III (no la justificación por eje). */
export const COPY_PLAN_REGIONAL_MISSING =
  'Aún no se ha cargado el PDF del Plan Regional de Gobierno para esta región. El resumen de esta sección se completará automáticamente cuando el documento esté disponible.'

// ── Copy: Sección IV Autoridades no disponibles ────────────────────────────

/** Fase B: se muestra siempre hasta que Fase D backfileé la región. */
export const COPY_AUTORIDADES_PENDIENTE =
  'La ficha de autoridades regionales está pendiente de carga. Se incorporará en la próxima actualización del Kit de Viaje.'

// ── Validación del PDF plan-regional ───────────────────────────────────────

/**
 * Umbral en bytes bajo el cual un objeto en el bucket plan-regional se
 * considera inválido. Empíricamente XVI.pdf (Ñuble) pesa 328 bytes en prod;
 * PDFs reales van de 240 KB a 4 MB. 20 KB es holgado para no falso-positivar
 * un PDF de una página real.
 */
export const PLAN_PDF_MIN_BYTES = 20_000

/** Los primeros bytes de un PDF válido son `%PDF-`. */
export const PDF_MAGIC_BYTES = '%PDF-'

// ── Orden institucional de grupos de autoridades ───────────────────────────

/**
 * Orden vertical en la Sección IV. Coincide con el layout del PDF Biobío-ref.
 * Renderers deben iterar `grupos` en el orden que llegue del assembler (que
 * ya usa este array).
 */
export const ORDEN_GRUPOS_AUTORIDADES = [
  'gobernador_regional',
  'dpr',
  'dpp',
  'seremi',
  'senador',
  'diputado',
  'alcalde',
] as const

/** Títulos display para cada grupo. */
export const TITULO_GRUPO_AUTORIDADES: Record<
  (typeof ORDEN_GRUPOS_AUTORIDADES)[number],
  string
> = {
  gobernador_regional: 'GOBERNADOR REGIONAL',
  dpr:                 'DELEGADO PRESIDENCIAL REGIONAL',
  dpp:                 'DELEGADOS PRESIDENCIALES PROVINCIALES',
  seremi:              'SEREMIS',
  senador:             'SENADORES',
  diputado:            'DIPUTADOS',
  alcalde:             'ALCALDES',
}

// ── Modelo AI ──────────────────────────────────────────────────────────────

/**
 * Modelo canónico para el redactor del Kit de Viaje. Fijado explícitamente
 * para blindar contra drift silencioso — un bump de modelo cambia el estilo
 * de redacción sin warning, y esta sección se lee en Gabinete.
 */
export const AI_MODEL_KIT_VIAJE = 'claude-sonnet-4-6'
export const AI_MAX_TOKENS_KIT_VIAJE = 8000
