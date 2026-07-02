/**
 * KitDeViajeData — contrato compartido entre el assembler, el AI redactor,
 * y (en Fase C) el renderer Word.
 *
 * Producto vigente: "Contexto Regional" (Secciones I + II + IV). La Sección
 * III (PREGO) migró a la minuta "Avance PREGO" (`MinutaEjecutiva.tsx`), donde
 * se convierte en un bloque "Del diagnóstico a la priorización". El tipo
 * canónico interno sigue siendo `kit_viaje` para no invalidar `minuta_cache`.
 *
 * Escalable por diseño: cuando una métrica no está en region_metrics para
 * una región, el bullet correspondiente se omite en lugar de mostrar "N/A".
 */

// ── Estado del PDF PREGO ────────────────────────────────────────────────────

/**
 * Estado del PDF plan-regional para una región. Se conserva en este módulo
 * porque `validatePlanPdfBuffer` sigue viviendo acá (lo consume Avance PREGO).
 *
 * - `ok`      → PDF válido.
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
 * Contrato principal. Instanciado por `buildKitDeViajeData()`, consumido por
 * `KitDeViajePdf` (Fase B) y `renderKitDeViajeDocx()` (Fase C).
 */
export interface KitDeViajeData {
  meta: KitDeViajeMeta
  region: RegionMeta
  fecha: FechaMeta
  branding: KitDeViajeBranding
  caracterizacion: SeccionCaracterizacion
  indicadores: SeccionIndicadores
  autoridades: SeccionAutoridades
}

// ── Subset que produce el AI ────────────────────────────────────────────────

/**
 * Lo que el AI devuelve para poblar campos narrativos. El assembler mezcla
 * esto con los datos cuantitativos (region_metrics) para armar el
 * KitDeViajeData final.
 *
 * NOTA: la sección Autoridades NUNCA se genera por AI — se anexa desde el
 * PDF oficial en el bucket `autoridades-fichas`.
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
}
