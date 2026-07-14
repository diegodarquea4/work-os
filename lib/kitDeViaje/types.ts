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

/** Par label/value genérico — usado internamente como "líneas de datos crudos" que alimentan al AI. */
export interface Bullet {
  label: string
  value: string
  nota?: string
}

export interface ProvinciaFila {
  provincia: string
  comunas: string       // "Concepción, Coronel, ..." (ya joined, capital primero)
  poblacion?: string
}

/**
 * 5 bullets fijos, cada uno con su rótulo fijo y un texto en prosa (redactado
 * por el AI a partir de las líneas de datos crudos, o un fallback
 * determinístico cuando el AI no corrió). "Organización político-administrativa"
 * es 100% determinística (no depende del AI) — viene de provincias-comunas.json.
 */
export interface SeccionCaracterizacionBullets {
  localizacion_superficie: string
  organizacion_politico_administrativa: ProvinciaFila[]
  poblacion: string
  estructura_etaria: string
  composicion: string
}

export interface SeccionCaracterizacion {
  bullets: SeccionCaracterizacionBullets
}

// ── Sección II. Indicadores socioeconómicos ────────────────────────────────

export interface IndicadorFila {
  indicador: string
  valor: string
  nota?: string
  /** Columna "Contexto" de la tabla de Mercado laboral (ranking, variación, etc). Determinístico. */
  contexto?: string
}

export interface PibSectorFila {
  sector: string
  pct: number
}

/**
 * 7 bullets fijos. "PIB regional" trae un sub-listado determinístico de
 * sectores (`pib_sectores`); "Mercado laboral" es una tabla 100%
 * determinística (incluida la columna Contexto) — ninguno de los dos depende
 * del AI. El resto son textos en prosa redactados por el AI (o fallback).
 */
export interface SeccionIndicadoresBullets {
  pib_regional: string
  pib_sectores: PibSectorFila[]
  mercado_laboral_periodo: string
  mercado_laboral_tabla: IndicadorFila[]
  ingresos_pobreza: string
  educacion: string
  salud: string
  vivienda: string
  seguridad_publica: string
  /** "SEMANA 25" — última semana con registro LeyStop, para el rótulo del bullet. */
  seguridad_semana: string
}

export interface SeccionIndicadores {
  bullets: SeccionIndicadoresBullets
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

// ── Sección III. Plan Regional de Gobierno ─────────────────────────────────

export interface SeccionPlanRegional {
  /** false cuando no hay PDF válido en el bucket `plan-regional` para la región. */
  disponible: boolean
  disclaimer?: string
  /** Resumen redactado por `generatePregoResumen()` a partir del PDF. */
  parrafos: string[]
}

export interface SeccionConflictos {
  /**
   * true cuando hay un PDF cargado en el bucket `conflictos-regionales` para la
   * región. En ese caso el route lo anexa verbatim con pdf-lib (mismo patrón
   * que la ficha de autoridades) y el renderer solo pinta el título + una nota.
   * false → el renderer muestra el `disclaimer`.
   */
  disponible: boolean
  disclaimer?: string
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
  logo_data_url: string           // data URI del logo del Ministerio (encabezado)
  footer_banner_data_url: string  // data URI de la banda "Trabajando para Usted" (pie de página)
}

/**
 * Contrato principal. Instanciado por `buildKitDeViajeData()`, consumido por
 * `KitDeViajePdf` (Fase B) y `renderKitDeViajeDocx()` (Fase C).
 */
export interface KitDeViajeData {
  meta: KitDeViajeMeta
  region: RegionMeta
  fecha: FechaMeta
  /** "61" en "Minuta DCI N°61" — ingresado por quien genera el documento. */
  numeroMinuta?: string
  branding: KitDeViajeBranding
  caracterizacion: SeccionCaracterizacion
  indicadores: SeccionIndicadores
  planRegional: SeccionPlanRegional
  conflictos: SeccionConflictos
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
  caracterizacion: {
    localizacion_superficie?: string
    poblacion?: string
    estructura_etaria?: string
    composicion?: string
  }
  indicadores: {
    pib_regional?: string
    ingresos_pobreza?: string
    educacion?: string
    salud?: string
    vivienda?: string
    seguridad_publica?: string
  }
  /** Sección III — resumen del PREGO. Se agrega aparte de `generateKitViajeContext`,
   *  vía `generatePregoResumen()`, porque lee un PDF distinto (Plan Regional). */
  plan_regional_parrafos?: string[]
}
