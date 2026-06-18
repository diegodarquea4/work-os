// ── Iniciativas (Prioridades Territoriales) ───────────────────────────────────
export type Prioridad = {
  id: number
  n: number
  region: string
  cod: string
  capital: string
  zona: string
  eje: string
  // FK al catálogo formal `region_ejes`. Nullable durante la transición
  // (migración 015). El string `eje` se mantiene como dato denormalizado
  // hasta la limpieza final.
  eje_id?: number | null
  eje_gobierno: string | null
  nombre: string
  descripcion: string | null
  ministerio: string | null
  prioridad: 'Alta' | 'Media' | 'Baja'
  etapa_actual: string | null
  estado_termino_gobierno: string | null
  proximo_hito: string | null
  fecha_proximo_hito: string | null  // ISO date YYYY-MM-DD
  fuente_financiamiento: string | null
  codigo_bip: string | null
  inversion_mm: number | null
  comuna: string | null
  rat: string | null
  estado_semaforo: 'verde' | 'ambar' | 'rojo' | 'gris' | null
  pct_avance: number | null
  responsable: string | null
  codigo_iniciativa: string | null
  origen: string | null
  // Columna agregada en migración 007. Opcional para tolerar lecturas
  // anteriores al ALTER en prod (viene undefined hasta que se aplique).
  en_foco?: boolean
  // Etiquetas libres multi-valor (migración 016). Default '{}' en BD, viene
  // como string[] desde Supabase JS. Estructural: regional propone vía Excel,
  // admin/editor edita directo en la ficha.
  tags?: string[]
  // Marca de "caso de la Mesa Interministerial de Desalojos" (migración 017).
  // Diferenciador admin-only — la iniciativa sigue siendo la misma; sumarla a
  // la sección Desalojos solo requiere flipear este boolean. El seguimiento
  // estructurado vive en tablas aparte (desalojo_detalle / seguimientos / log).
  // Opcional para tolerar lecturas pre-ALTER, igual que en_foco.
  es_desalojo?: boolean
  // Nivel de importancia (migración 024). 'l' = las prioridades, 'll' = más
  // importante, 'lll' = menos importante (default). Solo admin/editor edita —
  // queda fuera de la whitelist regional del trigger 023.
  capa?: 'l' | 'll' | 'lll'
}

// ── Desalojos (migración 017) ────────────────────────────────────────────────
// Las 4 dimensiones transversales que sigue la Mesa Interministerial:
//   Jurídico       — instrumento habilitante
//   Seguridad      — plan operativo + contingente
//   Social         — catastro + albergues (protocolo 21.430)
//   Financiamiento — costo + fuente + validación DIPRES (regla operativa dura)
export type DesalojoDimension = 'juridico' | 'seguridad' | 'social' | 'financiamiento'

// Vocabulario de semáforo usado en cada dimensión del detalle. Espeja el
// general `estado_semaforo` de Prioridad pero sin `null` (default es 'gris').
export type SemaforoDimension = 'verde' | 'ambar' | 'rojo' | 'gris'

// Vocabulario de tipo de seguimiento — mismo que `seguimientos` general para
// no inventar nuevo mental model.
export type DesalojoSeguimientoTipo = 'avance' | 'reunion' | 'hito' | 'alerta'

// Tipología del caso (matriz propiedad × estado procesal de la Mesa).
// Asignada manualmente desde la sección Desalojos — nunca en el toggle.
//   A — Fiscal SERVIU
//   B — Fiscal no-SERVIU
//   C — Privado con fallo firme
//   D — Privado sin instrumento
export type DesalojoTipologia = 'A' | 'B' | 'C' | 'D'

// Fase del caso. Vocabulario corto consistente con el tablero oficial de la
// Mesa (Sección VIII del 038): PR (prerrequisitos jurídicos + financiamiento),
// F1 (intervención policial), F2 (catastro social), F3 (desalojo),
// F4 (demolición simultánea), F5 (recuperación), cerrado.
//
// Bloqueo duro PR → F1: requiere semáforo PR en verde y todos los items
// obligatorios del checklist PR completos. Regla de la Mesa sin excepción.
export type DesalojoFase = 'pr' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'cerrado'

// Las 6 fases con semáforo (cerrado no tiene fila propia — es estado de capa).
export type DesalojoFaseConSemaforo = Exclude<DesalojoFase, 'cerrado'>

// Estado del checklist específico de una capa × fase. Persistido como JSONB
// en desalojo_fase_estado.checklist_estado. Items definidos en lib/desalojos.ts
// por tipología × fase; el server hace shallow merge. Huérfanos se conservan.
//
// v3.2: cada item puede tener `extras` (valores de campos estructurados
// definidos por el config — número/texto/fecha) además del done/fecha. Los
// documentos asociados al item viven en desalojo_documentos con fase + item_key
// y se relacionan por query, no por puntero en el JSONB.
export type DesalojoChecklistItemEstado = {
  done:    boolean
  fecha:   string | null
  /** Valores de los extras definidos por TIPOLOGIA_CFG[t].checklists[f][i].extras. */
  extras?: Record<string, string | number | null>
}
export type DesalojoChecklistEstado = Record<string, DesalojoChecklistItemEstado>

// Responsable de un rol específico de una capa. Roles definidos por tipología
// en lib/desalojos.ts (TIPOLOGIA_CFG[t].roles); el JSONB se llena por key.
// Server hace shallow merge — huérfanos por cambio de tipología se conservan.
export type DesalojoResponsable = {
  nombre:      string
  institucion: string | null
  email:       string | null
  telefono:    string | null
  notas:       string | null
}

export type DesalojoResponsables = Record<string, DesalojoResponsable>

// Fila de desalojo_fase_estado: una por capa × fase (6 por capa).
export type DesalojoFaseEstado = {
  id:               number
  prioridad_id:     number
  capa_id:          number
  fase:             DesalojoFaseConSemaforo
  semaforo:         SemaforoDimension
  checklist_estado: DesalojoChecklistEstado
  notas:            string | null
  completed_at:     string | null
  completed_by:     string | null
  updated_at:       string
}

// Detalle 1:1 con la iniciativa marcada `es_desalojo` — v2 lo reduce a CONTEXTO
// del caso (resumen narrativo + agregados). Toda la operación por dimensión vive
// en desalojo_capas (1:N). Se crea eager cuando admin toggle a TRUE.
export type DesalojoDetalle = {
  prioridad_id:      number
  resumen_narrativo: string | null
  updated_at:        string
}

// Capa = polígono dentro del caso. Un caso simple tiene 1 capa (creada eager
// al etiquetar). Casos como La Chimba tienen 2+ con tipología, semáforos y
// ritmo propios. Caso simple = selector oculto en la UI.
export type DesalojoCapa = {
  id:                    number
  prioridad_id:          number
  nombre:                string
  orden:                 number
  activa:                boolean

  // Tipología — NULL hasta asignar. tipologia_asignada_at se usa para el
  // banner Tipo D >30 días sin vía definida.
  tipologia:             DesalojoTipologia | null
  tipologia_nota:        string | null
  tipologia_asignada_at: string | null

  fase_actual:           DesalojoFase

  // Físicos del polígono.
  superficie_ha:         number | null
  propietario:           string | null
  sitios_total:          number | null    // Tipo C — total a desocupar
  sitios_desocupados:    number | null    // Tipo C — desocupación gradual

  // Caracterización social detallada (Sección II del 038 — catastro mínimo).
  viviendas:             number | null
  hogares:               number | null
  personas:              number | null
  nna:                   number | null
  adultos_mayores:       number | null
  embarazadas:           number | null
  personas_discapacidad: number | null
  migrantes_regular:     number | null
  migrantes_irregular:   number | null

  // Campos estructurados que llenan los checklists por fase, pero que viven
  // a nivel de capa (datos persistentes del polígono, no del estado de avance).
  // PR — instrumento jurídico habilitante.
  instrumento:               string | null
  fecha_instrumento:         string | null   // ISO YYYY-MM-DD
  via_juridica:              string | null
  notas_juridico:            string | null
  // F1 — plan operativo y contingente.
  plan_operativo_listo:      boolean
  contingente:               string | null
  fecha_tentativa_operativo: string | null
  notas_seguridad:           string | null
  // F2 — catastro social, albergue.
  albergue_validado:         boolean
  notas_social:              string | null
  // F4 — financiamiento, demolición. La regla dura: sin `financiamiento_asegurado`
  // (validación DIPRES) no se autoriza el operativo. Dispara banner persistente.
  costo_demolicion_mm:       number | null
  fuente:                    string | null
  financiamiento_asegurado:  boolean
  notas_financiamiento:      string | null

  // Responsables por rol — JSONB { [rol_key]: { nombre, institucion, email, telefono, notas } }.
  // Roles vigentes definidos por tipología en lib/desalojos.ts. Huérfanos se conservan.
  responsables:          DesalojoResponsables

  // Vínculo opcional al catastro nacional MINVU (CNC 2026). Si está set, el
  // mapa hereda lat/lng del bundled JSON cuando capa.lat/lng son NULL.
  folio_minvu:           string | null
  lat:                   number | null
  lng:                   number | null

  updated_at:            string
}

// ── Catastro MINVU (CNC 2026) ────────────────────────────────────────────────
// Una entrada del catastro nacional de campamentos publicado por MINVU. Vive
// en public/data/catastro-minvu-2026.json (bundled estático generado por
// scripts/build-catastro-minvu.mjs). Se vincula a una `DesalojoCapa` vía
// `folio_minvu`; el mapa hereda lat/lng de aquí si la capa no tiene override.
export type CatastroEntry = {
  folio:            string                       // "510103"
  nombre:           string
  region:           string
  provincia:        string
  comuna:           string
  estado:           string                       // "VIGENTE" | "VIGENTE SIN PRESENCIA…"
  estrategia:       string
  hogares_catastro: number | null
  hogares_censo:    number | null
  superficie_ha:    number | null
  tipo_propiedad:   string | null                // "PRIVADO" | "FISCAL" | "MIXTO" | "MUNICIPAL" | null
  propietario:      string | null
  catastro_ingreso: string                       // "CATASTRO_2011" | "CATASTRO 2024" | …
  lat:              number
  lng:              number
}

// Documento de un caso (capa_id NULL) o de una capa (capa_id NOT NULL).
// Opcionalmente categorizado por dimensión y/o vinculado a un item del
// checklist de una fase (fase + item_key — migración 021).
// Archivos viven en bucket privado `desalojos-docs`; `url` es path relativo,
// se firma con TTL al servir.
export type DesalojoDocumento = {
  id:           number
  prioridad_id: number
  capa_id:      number | null              // NULL = documento del caso
  dimension:    DesalojoDimension | null   // NULL = general de capa o caso
  fase:         DesalojoFaseConSemaforo | null  // doc vinculado a una fase
  item_key:     string | null              // doc vinculado a un item del checklist
  nombre:       string
  url:          string                      // path en bucket (no signed URL)
  tipo_archivo: string | null
  tamano_bytes: number | null
  subido_por:   string | null
  created_at:   string
}

export type DesalojoSeguimiento = {
  id:           number
  prioridad_id: number
  capa_id:      number | null              // FK lógico a desalojo_capas.id
  dimension:    DesalojoDimension
  tipo:         DesalojoSeguimientoTipo
  descripcion:  string
  created_at:   string
  created_by:   string | null
}

// Audit log de cambios. v2 suma capa_id para diferenciar cambios de la capa vs
// del toggle del caso (capa_id NULL para el toggle de es_desalojo). v3 suma
// fase para trazar cambios por fase (NULL para cambios a nivel capa o caso).
export type DesalojoLog = {
  id:             number
  prioridad_id:   number
  capa_id:        number | null
  fase:           DesalojoFaseConSemaforo | null
  campo:          string
  valor_anterior: string | null
  valor_nuevo:    string
  cambiado_por:   string | null
  created_at:     string
}

// ── Semáforo Log ─────────────────────────────────────────────────────────────
export type SemaforoLog = {
  id: number
  prioridad_id: number
  campo: 'semaforo' | 'pct_avance'
  valor_anterior: string | null
  valor_nuevo: string
  cambiado_por: string | null
  created_at: string
}

// ── Region Metrics ───────────────────────────────────────────────────────────
export type RegionMetrics = {
  region_cod: string
  region_nombre: string

  // Geografía
  superficie_km2: number | null
  pct_territorio_nacional: number | null
  provincias_n: number | null
  comunas_n: number | null

  // Demografía
  poblacion_total: number | null
  pct_hombres: number | null
  pct_mujeres: number | null
  pct_inmigrantes: number | null
  pct_indigena: number | null
  pct_urbana: number | null
  pct_rural: number | null
  densidad_poblacional: number | null
  promedio_edad: number | null

  // Población vulnerable
  pct_pobreza_ingresos: number | null
  pct_pobreza_extrema: number | null
  pct_pobreza_multidimensional: number | null
  pct_pobreza_severa: number | null
  hogares_rsh_tramo40: number | null
  pct_rsh_tramo40: number | null

  // Empleo
  tasa_desocupacion: number | null
  tasa_ocupacion: number | null
  tasa_participacion_laboral: number | null
  tasa_ocupacion_informal: number | null

  // Economía
  pib_regional: number | null
  pct_pib_nacional: number | null
  variacion_interanual: number | null
  inversion_publica_ejecutada: number | null
  inversion_fndr: number | null

  // Salud
  pct_fonasa: number | null
  hospitales_n: number | null
  camas_por_1000_hab: number | null
  lista_espera_n: number | null

  // Educación
  matricula_escolar_total: number | null
  anios_escolaridad_promedio: number | null
  tasa_alfabetismo: number | null
  cobertura_parvularia_pct: number | null

  // Vivienda
  deficit_habitacional: number | null
  pct_hacinamiento: number | null
  pct_acceso_agua_publica: number | null
  // Censo 2024
  n_deficit_cuantitativo: number | null
  pct_viv_irrecuperables: number | null
  pct_tenencia_arrendada: number | null

  // Seguridad
  pct_hogares_victimas_dmcs: number | null
  pct_percepcion_inseguridad: number | null
  tasa_denuncias_100k: number | null
  tasa_delitos_100k: number | null

  // Conectividad
  pct_hogares_internet: number | null
  localidades_aisladas_n: number | null
  // Censo 2024
  pct_internet_movil: number | null
  pct_internet_fijo: number | null

  // Demografía Censo 2024
  n_inmigrantes:   number | null
  n_pueblos_orig:  number | null
  prom_edad:       number | null
  pct_edad_60_mas: number | null
  n_ocupado:       number | null
  n_desocupado:    number | null
  pct_viv_hacinadas: number | null
  censo_updated_at: string | null
  n_discapacidad: number | null
  pct_jefatura_mujer: number | null

  // Educación Censo 2024
  pct_educacion_superior: number | null

  // Medio ambiente
  pct_superficie_protegida: number | null
  residuos_domiciliarios_percapita: number | null

  // Sectores productivos
  sectores_productivos_principales: string | null
  vocacion_regional: string | null

  updated_at: string
}

// ── Project Tracker ───────────────────────────────────────────────────────────
export type Seguimiento = {
  id: number
  prioridad_id: number
  fecha: string
  tipo: 'avance' | 'reunion' | 'hito' | 'alerta'
  descripcion: string
  autor: string | null
  estado: 'en_curso' | 'completado' | 'bloqueado' | 'pendiente' | null
  created_at: string
}

export type Documento = {
  id: number
  prioridad_id: number
  nombre: string
  url: string
  tipo_archivo: string | null
  tamano_bytes: number | null
  subido_por: string | null
  created_at: string
}

// ── Métricas por eje (planificación cuantitativa por región) ─────────────────
// Admin/editor crea la métrica con su objetivo. Cualquier autenticado puede
// actualizar valor_actual (modelo "compromiso": DCI fija, regional reporta).
export type Metrica = {
  id: number
  region_cod: string
  eje: string
  // FK al catálogo formal (migración 015). Nullable mientras se completa
  // la transición — las filas migradas tienen eje_id, las pre-migración
  // pueden no tenerlo.
  eje_id?: number | null
  titulo: string
  descripcion: string | null
  objetivo: number
  valor_actual: number | null
  unidad: string | null
  created_at: string
  updated_at: string
  created_by_email: string | null
  valor_updated_by_email: string | null
  valor_updated_at: string | null
}

// ── Region Ejes (catálogo formal por región) ─────────────────────────────────
// Migración 015 — cada región del DCI define sus propios ejes con número y
// nombre. Las iniciativas y métricas referencian al catálogo por FK.
// El nombre se guarda puro (sin prefijo "Eje N:"); el display se compone con
// composeEjeLabel() de lib/ejes.ts.
export type RegionEje = {
  id: number
  region_cod: string
  numero: number
  nombre: string
  created_at: string
  updated_at: string
  created_by_email: string | null
}

// ── Regional Metrics (time-series) ────────────────────────────────────────────
export type RegionalMetric = {
  id: string
  region_id: number
  metric_name: string
  value: number
  period: string          // ISO date "2025-01-01" — first day of reference period
  source_url: string | null
  updated_at: string
}

export type MetricSeries = {
  metric_name: string
  data: { period: string; value: number }[]
}

// ── MOP Projects ──────────────────────────────────────────────────────────────
export type MopProject = {
  cod_p:           string
  bip:             string | null
  region_id:       number
  nombre:          string
  servicio:        string | null
  programa:        string | null
  etapa:           string | null
  financiamiento:  string | null
  inversion_miles: number | null
  provincias:      string | null
  comunas:         string | null
  planes:          string | null
  descripcion:     string | null
  synced_at:       string
}

// ── SEIA Projects ─────────────────────────────────────────────────────────────
export type SeiaProject = {
  id: string
  region_id: number
  nombre: string
  tipo: string | null
  estado: string | null
  titular: string | null
  inversion_mm: number | null
  fecha_presentacion: string | null
  fecha_plazo: string | null
  actividad_actual: string | null
  url_ficha: string | null
  synced_at: string
}

// ── PREGO ────────────────────────────────────────────────────────────────────
export type PregoEstado = 'pendiente' | 'en_curso' | 'completado' | 'bloqueado'

export type PregoRow = {
  region_cod:       string
  f0_contacto:      PregoEstado
  f1_borrador:      PregoEstado
  f2_revision:      PregoEstado
  e3_dipres:        PregoEstado
  e3_desi:          PregoEstado
  e3_subdere:       PregoEstado
  e3_gore:          PregoEstado
  f6_consolidacion: PregoEstado
  f7_firma:         PregoEstado
  updated_at:       string
  updated_by:       string | null
}

export type PregoFaseKey = keyof Omit<PregoRow, 'region_cod' | 'updated_at' | 'updated_by'>

export const PREGO_FASES: { key: PregoFaseKey; label: string; sublabel: string }[] = [
  { key: 'f0_contacto',      label: 'F0', sublabel: 'Contacto' },
  { key: 'f1_borrador',      label: 'F1', sublabel: 'Borrador' },
  { key: 'f2_revision',      label: 'F2', sublabel: 'Revisión' },
  { key: 'e3_dipres',        label: 'F3', sublabel: 'DIPRES' },
  { key: 'e3_desi',          label: 'F3', sublabel: 'DESI' },
  { key: 'e3_subdere',       label: 'F3', sublabel: 'SUBDERE' },
  { key: 'e3_gore',          label: 'F3', sublabel: 'GORE' },
  { key: 'f6_consolidacion', label: 'F4', sublabel: 'Consolidación' },
  { key: 'f7_firma',         label: 'F5', sublabel: 'Firma' },
]

export const PREGO_ESTADO_CONFIG: Record<PregoEstado, { label: string; pill: string; dot: string }> = {
  pendiente:  { label: 'Pendiente',  pill: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',   dot: '○' },
  en_curso:   { label: 'En curso',   pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', dot: '◐' },
  completado: { label: 'Completado', pill: 'bg-green-50 text-green-700 ring-1 ring-green-200', dot: '✓' },
  bloqueado:  { label: 'Bloqueado',  pill: 'bg-red-50 text-red-700 ring-1 ring-red-200',       dot: '✗' },
}

// ── v2 Types ────────────────────────────────────────────────────────────────
// New data model for the indicators/minutas reset.
// v1 types above remain unchanged until cutover.

export type V2Region = {
  id: number           // 0=NAC, 1-16 (matches INE_CODE)
  cod: string
  nombre: string
  capital: string | null
  zona: string | null
}

export type V2Fuente = {
  id: number
  codigo: string
  nombre: string
  institucion: string | null
  url_base: string | null
  notas_metodologicas: string | null
  ultima_publicacion: string | null
  proxima_publicacion: string | null
}

export type V2Indicador = {
  codigo: string
  nombre: string
  descripcion: string | null
  categoria: string
  subcategoria: string | null
  unidad: string
  fuente_id: number | null
  frecuencia_esperada: string
  lower_is_better: boolean
  comparable_temporalmente: boolean
  nivel_territorial_min: string
  nivel_criticidad: 'esencial' | 'complementario' | 'archivo'
  aparece_en_ejecutiva: boolean
  aparece_en_kit_viaje: boolean
  aparece_en_ficha: boolean
  orden_presentacion: number | null
  vigente_desde: string | null
  vigente_hasta: string | null
  notas: string | null
  // joined from v2_fuentes
  fuente?: V2Fuente
}

export type V2CalidadDato = 'verificado' | 'preliminar' | 'calculado' | 'manual'

export type V2IndicadorValor = {
  id: number
  codigo_indicador: string
  region_id: number
  valor: number | null
  periodo: string            // ISO date YYYY-MM-DD
  calidad: V2CalidadDato
  fecha_publicacion_fuente: string | null
  fecha_carga_sistema: string
  cargado_por: string | null
  notas: string | null
}

export type V2IndicadorUltimo = {
  codigo_indicador: string
  region_id: number
  valor: number | null
  periodo: string
  calidad: string
  fecha_carga_sistema: string
}

export type V2MinutaLog = {
  id: number
  region_id: number
  tipo: 'ejecutiva' | 'kit_viaje' | 'ficha'
  generado_por: string | null
  generado_at: string
  hash_pdf: string | null
  parametros: Record<string, unknown> | null
  duracion_ms: number | null
}

export type V2PipelineConfig = {
  id: number
  codigo_indicador: string
  metodo: 'api_rest' | 'sdmx' | 'descarga' | 'scraping' | 'manual'
  fuente_endpoint: string | null
  cron_schedule: string | null
  formato_origen: string | null
  parser_module: string | null
  ultima_ejecucion: string | null
  ultima_ejecucion_estado: 'ok' | 'parcial' | 'error' | 'pendiente' | null
  ultima_ejecucion_mensaje: string | null
  tolerancia_atraso_dias: number
  activo: boolean
}

export type V2PipelineLog = {
  id: number
  codigo_indicador: string
  ejecutado_at: string
  duracion_ms: number | null
  estado: 'ok' | 'error' | 'sin_datos' | 'parcial' | 'schema_changed'
  filas_persistidas: number
  errores: Record<string, unknown> | null
}
