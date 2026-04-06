// ── Prioridades Territoriales ────────────────────────────────────────────────
export type Prioridad = {
  id: number
  n: number
  region: string
  cod: string
  capital: string
  zona: string
  eje: string
  meta: string
  ministerios: string  // newline-separated; split('\n') where needed
  prioridad: 'Alta' | 'Media'
  plazo: string
  estado_semaforo: 'verde' | 'ambar' | 'rojo' | 'gris' | null
  pct_avance: number | null
  responsable: string | null
  fecha_limite: string | null  // ISO date YYYY-MM-DD
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

  // Seguridad
  pct_hogares_victimas_dmcs: number | null
  pct_percepcion_inseguridad: number | null
  tasa_denuncias_100k: number | null
  tasa_delitos_100k: number | null

  // Conectividad
  pct_hogares_internet: number | null
  localidades_aisladas_n: number | null

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
