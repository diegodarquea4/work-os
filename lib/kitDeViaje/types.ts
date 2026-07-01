/**
 * KitDeViajeData — contrato compartido entre el assembler, el AI redactor,
 * y (en Fase B/C) los renderers PDF y Word.
 *
 * Reemplaza a `FichaRegionalContent` de lib/minutaAI.ts. La forma es más
 * rica: agrega estado explícito del PDF PREGO (ok/missing/invalid), resumen
 * cuantitativo por eje derivado de prioridades_territoriales, y sección
 * Autoridades. Todo snake_case para que serializar/cachear a
 * minuta_cache.ai_content sea idempotente y para que la salida del AI matchee
 * el shape sin translación intermedia.
 *
 * Escalable por diseño: cuando una métrica no está en region_metrics para
 * una región, el bullet correspondiente se omite en lugar de mostrar "N/A".
 * Cuando un PDF PREGO se corrija en Storage, la sección III pasa de
 * "problemas" a "ok" sin cambios de código.
 */

// ── Estado del PDF PREGO ────────────────────────────────────────────────────

/**
 * Estado del PDF plan-regional para la región solicitada.
 *
 * - `ok`      → PDF válido, se pasó al AI como document input.
 * - `missing` → no hay objeto en el bucket `plan-regional` para esta región.
 * - `invalid` → hay objeto pero < 20 KB o sin magic bytes `%PDF-` (Ñuble).
 */
export type PlanPdfState = 'ok' | 'missing' | 'invalid'

// ── Región ──────────────────────────────────────────────────────────────────

export interface RegionMeta {
  cod: string           // 'VIII', 'RM', 'XV'
  nombre: string        // 'Biobío', 'Metropolitana', ...
  capital?: string
  provincias?: string[]
}

export interface FechaMeta {
  display: string       // "Julio 2026" — lo que pinta el header
  iso?: string          // opcional, para logs/telemetría
}

// ── Sección I. Caracterización general ─────────────────────────────────────

export interface Bullet {
  label: string
  value: string
  nota?: string
}

export interface ProvinciaFila {
  provincia: string
  comunas: string       // "Concepción, Coronel, ..." (ya joined)
  poblacion?: string
}

export interface SeccionCaracterizacion {
  /** Narrativa AI-redactada. Uno o más párrafos. */
  parrafos: string[]
  /**
   * Bullets dinámicos desde region_metrics.
   * Si la métrica no existe en la fila de la región, el bullet no se emite.
   */
  bullets: Bullet[]
  provincias_tabla?: ProvinciaFila[]
}

// ── Sección II. Indicadores socioeconómicos ────────────────────────────────

export interface IndicadorFila {
  indicador: string
  valor: string
  nota?: string
}

export interface SeccionIndicadores {
  bullets: Bullet[]
  mercado_laboral_tabla?: IndicadorFila[]
  pib_comentario?: string       // narrativa AI
  matriz_productiva?: string    // narrativa AI
  ingresos_pobreza?: string     // narrativa AI (CASEN)
  educacion_nota?: string       // narrativa AI (Censo)
  salud_nota?: string
  vivienda_nota?: string
  seguridad_nota?: string
  tendencia_general?: string    // 1 línea, opcional
}

// ── Sección III. Plan Regional de Gobierno (PREGO) ─────────────────────────

export interface EjeSemaforoResumen {
  verde: number
  ambar: number
  rojo: number
  gris: number
}

export interface IniciativaDestacada {
  nombre: string
  ministerio?: string
  estado_semaforo?: 'verde' | 'ambar' | 'rojo' | 'gris'
  pct_avance?: number | null
}

export interface EjeResumen {
  total_iniciativas: number
  semaforo: EjeSemaforoResumen
  /** null cuando >95% de las iniciativas están en gris/pct_avance=0 (ej: Biobío en prod). */
  pct_avance_promedio: number | null
  /** Subset marcado con tag 'Prioritaria PREGO' (o top-5 por importancia si no hay tag). */
  iniciativas_destacadas: IniciativaDestacada[]
  /** Nota humana cuando la data cuantitativa no representa el estado real. */
  nota_sin_datos?: string
}

export interface EjePrego {
  numero: number                // desde region_ejes.numero
  nombre: string                // desde region_ejes.nombre (sin prefijo "Eje N: ")
  /** Narrativa extraída por AI del PDF PREGO. */
  narrativa: string
  /** Progreso cualitativo AI-redactado referenciando iniciativas. */
  progreso_cualitativo: string
  resumen: EjeResumen
}

export interface SeccionPrego {
  estado: PlanPdfState
  /**
   * Copy visible en el renderer cuando `estado !== 'ok'`. Escalable:
   * cuando el PDF se corrige, este campo desaparece y ejes[] se puebla,
   * sin cambio de código.
   */
  disclaimer?: string
  /** Párrafo introductorio AI-redactado. Vacío si estado !== 'ok'. */
  intro?: string
  ejes: EjePrego[]
  /**
   * Nota cuando la región no tiene iniciativas cargadas todavía (aunque
   * el PDF esté ok). Ejemplo: nueva región en el sistema.
   */
  sin_iniciativas_nota?: string
  /**
   * Iniciativas con eje_id NULL que se agrupan en un bucket separado
   * para no under-reportar el total. `null` cuando no hay ninguna.
   */
  sin_eje_asignado_count?: number | null
}

// ── Sección IV. Autoridades regionales ─────────────────────────────────────

export type AutoridadTipo =
  | 'gobernador_regional'
  | 'dpr'
  | 'dpp'
  | 'seremi'
  | 'senador'
  | 'diputado'
  | 'alcalde'

export interface Autoridad {
  tipo: AutoridadTipo
  nombre: string
  cargo: string
  telefono?: string
  correo?: string
  partido?: string
  /** Opcional. En V1 (Fase B) no se usa — Biobío-ref no tiene fotos. */
  foto_url?: string
  /** Metadata específica según tipo. */
  provincia?: string   // dpp, alcalde
  comuna?: string      // alcalde
  distrito?: number    // diputado
  circunscripcion?: number // senador
}

export interface AutoridadGrupo {
  titulo: string       // "GOBERNADOR REGIONAL", "SEREMIS", "ALCALDES", ...
  autoridades: Autoridad[]
  /** Layout hint para el renderer — 'single' = 1 tarjeta ancha, 'grid' = 3-4/fila. */
  layout: 'single' | 'grid'
}

export interface SeccionAutoridades {
  /**
   * false hasta que Fase D backfileé la región. Cuando `disponible=false`,
   * el renderer muestra `disclaimer` y omite las tarjetas.
   */
  disponible: boolean
  disclaimer?: string
  grupos: AutoridadGrupo[]
  ultima_actualizacion?: string   // ISO
}

// ── Root ────────────────────────────────────────────────────────────────────

export interface KitDeViajeMeta {
  schema_version: 1
  generado_en: string             // ISO timestamp
  /** True si el AI produjo contenido nuevo en este request (false = cache hit). */
  ai_fresh: boolean
}

export interface KitDeViajeBranding {
  ministerio: string              // "Ministerio del Interior" (canónico, sin "y Seguridad Pública")
  division: string                // "División de Coordinación Interministerial"
  logo_data_url: string           // data URI del logo del Ministerio
}

/**
 * Contrato principal. Instanciado por `buildKitDeViajeData()` (Fase A.2),
 * consumido por `KitDeViajePdf` (Fase B) y `renderKitDeViajeDocx()` (Fase C).
 */
export interface KitDeViajeData {
  meta: KitDeViajeMeta
  region: RegionMeta
  fecha: FechaMeta
  branding: KitDeViajeBranding
  caracterizacion: SeccionCaracterizacion
  indicadores: SeccionIndicadores
  prego: SeccionPrego
  autoridades: SeccionAutoridades
}

// ── Subset que produce el AI ────────────────────────────────────────────────

/**
 * Lo que el AI devuelve para poblar campos narrativos. El assembler mezcla
 * esto con los datos cuantitativos (region_metrics, prioridades_territoriales)
 * para armar el KitDeViajeData final.
 *
 * NOTA: la sección Autoridades NUNCA se genera por AI — viene de la tabla
 * autoridades_regionales (Fase D). Se omite acá.
 */
export interface KitDeViajeAIContent {
  caracterizacion_parrafos: string[]
  indicadores_narrativa: {
    pib_comentario?: string
    matriz_productiva?: string
    ingresos_pobreza?: string
    educacion_nota?: string
    salud_nota?: string
    vivienda_nota?: string
    seguridad_nota?: string
    tendencia_general?: string
  }
  prego: {
    intro?: string
    ejes: Array<{
      numero: number
      nombre: string
      narrativa: string
      progreso_cualitativo: string
    }>
    /**
     * Copy exacto cuando el PDF no está disponible. Devuelto por el AI
     * SOLO cuando el prompt indicó plan_pdf_state !== 'ok'.
     */
    sin_pdf_texto?: string
  }
}
