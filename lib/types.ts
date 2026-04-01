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
