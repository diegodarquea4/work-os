/**
 * Migrate v1 data into v2 tables.
 *
 * Usage: npx tsx scripts/migrate-v1-data.ts
 *
 * What it does:
 *   A. region_metrics (wide) → v2_indicadores_valores (long)
 *   B. regional_metrics (already long) → v2_indicadores_valores (remap metric names)
 *   C. prioridades_territoriales → v2_iniciativas (with FK lookups)
 *   D. seia_projects + mop_projects → v2_proyectos_inversion
 *
 * Prerequisites:
 *   - v2 schema created (001_v2_schema.sql)
 *   - v2_indicadores_catalogo seeded (seed-v2-catalogo.ts)
 *   - v2_regiones, v2_ejes_estrategicos, v2_fuentes populated (by migration SQL)
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)

// ── INE_CODE mapping (same as lib/regions.ts) ────────────────────────────

const INE_CODE: Record<string, number> = {
  XV: 15, I: 1, II: 2, III: 3, IV: 4, V: 5, RM: 13, VI: 6,
  VII: 7, XVI: 16, VIII: 8, IX: 9, XIV: 14, X: 10, XI: 11, XII: 12,
  NAC: 0,
}

// ── Mapping: v1 region_metrics column → v2 indicator code ────────────────

type FieldMapping = {
  v1Field: string
  v2Code: string
  periodo: string      // ISO date for the static snapshot
  calidad: string
}

const WIDE_MAPPINGS: FieldMapping[] = [
  // Geografía
  { v1Field: 'superficie_km2',                 v2Code: 'GEO_SUP_KM2',        periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_territorio_nacional',        v2Code: 'GEO_PCT_TERR',       periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'provincias_n',                   v2Code: 'GEO_PROV_N',         periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'comunas_n',                      v2Code: 'GEO_COM_N',          periodo: '2024-01-01', calidad: 'verificado' },
  // Demografía
  { v1Field: 'poblacion_total',                v2Code: 'DEM_POB_TOTAL',      periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_hombres',                    v2Code: 'DEM_PCT_HOMBRES',    periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_mujeres',                    v2Code: 'DEM_PCT_MUJERES',    periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_inmigrantes',                v2Code: 'DEM_PCT_INMIGRANTES',periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_indigena',                   v2Code: 'DEM_PCT_INDIGENA',   periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_urbana',                     v2Code: 'DEM_PCT_URBANA',     periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_rural',                      v2Code: 'DEM_PCT_RURAL',      periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'densidad_poblacional',           v2Code: 'DEM_DENSIDAD',       periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'prom_edad',                       v2Code: 'DEM_PROM_EDAD',      periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'n_inmigrantes',                  v2Code: 'DEM_N_INMIGRANTES',  periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'n_pueblos_orig',                 v2Code: 'DEM_N_PUEBLOS_ORIG', periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_edad_60_mas',                v2Code: 'DEM_PCT_60MAS',      periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'n_discapacidad',                 v2Code: 'DEM_N_DISCAPACIDAD', periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_jefatura_mujer',             v2Code: 'DEM_PCT_JEF_MUJER', periodo: '2024-01-01', calidad: 'verificado' },
  // Pobreza / Social
  { v1Field: 'pct_pobreza_ingresos',           v2Code: 'SOC_POB_ING',        periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_pobreza_extrema',            v2Code: 'SOC_POB_EXT',        periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_pobreza_multidimensional',   v2Code: 'SOC_POB_MULTI',      periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_pobreza_severa',             v2Code: 'SOC_POB_SEV',        periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'hogares_rsh_tramo40',            v2Code: 'SOC_RSH_HOG',        periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_rsh_tramo40',                v2Code: 'SOC_RSH_PCT',        periodo: '2024-01-01', calidad: 'verificado' },
  // Empleo (estáticos — Censo)
  { v1Field: 'tasa_desocupacion',              v2Code: 'EMP_DESOC_CENSAL',   periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'tasa_ocupacion',                 v2Code: 'EMP_OCUP_CENSAL',    periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'tasa_participacion_laboral',     v2Code: 'EMP_PART_LAB',       periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'tasa_ocupacion_informal',        v2Code: 'EMP_INFORMAL',       periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'n_ocupado',                      v2Code: 'EMP_N_OCUP',         periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'n_desocupado',                   v2Code: 'EMP_N_DESOC',        periodo: '2024-01-01', calidad: 'verificado' },
  // Economía (estáticos)
  { v1Field: 'pib_regional',                   v2Code: 'ECO_PIB_SNAP',       periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_pib_nacional',               v2Code: 'ECO_PCT_PIB',        periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'variacion_interanual',           v2Code: 'ECO_VAR_IA',         periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'inversion_publica_ejecutada',    v2Code: 'ECO_INV_PUB',        periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'inversion_fndr',                 v2Code: 'ECO_INV_FNDR',       periodo: '2024-01-01', calidad: 'verificado' },
  // Salud
  { v1Field: 'pct_fonasa',                     v2Code: 'SAL_FONASA',         periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'hospitales_n',                   v2Code: 'SAL_HOSP_N',         periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'camas_por_1000_hab',             v2Code: 'SAL_CAMAS_1K',       periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'lista_espera_n',                 v2Code: 'SAL_LISTA_ESP',      periodo: '2024-01-01', calidad: 'verificado' },
  // Educación
  { v1Field: 'matricula_escolar_total',        v2Code: 'EDU_MATRICULA',      periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'anios_escolaridad_promedio',     v2Code: 'EDU_ESCOLARIDAD',    periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'tasa_alfabetismo',               v2Code: 'EDU_ALFABETISMO',    periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'cobertura_parvularia_pct',       v2Code: 'EDU_PARVULARIA',     periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_educacion_superior',         v2Code: 'EDU_SUPERIOR',       periodo: '2024-01-01', calidad: 'verificado' },
  // Vivienda
  { v1Field: 'deficit_habitacional',           v2Code: 'VIV_DEFICIT',        periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_hacinamiento',               v2Code: 'VIV_HACINAMIENTO',   periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_acceso_agua_publica',        v2Code: 'VIV_AGUA',           periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'n_deficit_cuantitativo',         v2Code: 'VIV_DEF_CUANT',      periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_viv_irrecuperables',         v2Code: 'VIV_IRRECUP',        periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_tenencia_arrendada',         v2Code: 'VIV_ARRIENDO',       periodo: '2024-01-01', calidad: 'verificado' },
  // Seguridad
  { v1Field: 'pct_hogares_victimas_dmcs',      v2Code: 'SEG_VICTIMAS',       periodo: '2022-01-01', calidad: 'verificado' },
  { v1Field: 'pct_percepcion_inseguridad',     v2Code: 'SEG_INSEG',          periodo: '2022-01-01', calidad: 'verificado' },
  { v1Field: 'tasa_denuncias_100k',            v2Code: 'SEG_DEN_100K',       periodo: '2022-01-01', calidad: 'verificado' },
  { v1Field: 'tasa_delitos_100k',              v2Code: 'SEG_DEL_100K',       periodo: '2022-01-01', calidad: 'verificado' },
  // Conectividad
  { v1Field: 'pct_hogares_internet',           v2Code: 'CON_INTERNET',       periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'localidades_aisladas_n',         v2Code: 'CON_AISLADAS',       periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_internet_movil',             v2Code: 'CON_INT_MOVIL',      periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'pct_internet_fijo',              v2Code: 'CON_INT_FIJO',       periodo: '2024-01-01', calidad: 'verificado' },
  // Medio ambiente
  { v1Field: 'pct_superficie_protegida',       v2Code: 'AMB_PROTEGIDA',      periodo: '2024-01-01', calidad: 'verificado' },
  { v1Field: 'residuos_domiciliarios_percapita', v2Code: 'AMB_RESIDUOS',     periodo: '2024-01-01', calidad: 'verificado' },
]

// ── Mapping: v1 regional_metrics.metric_name → v2 indicator code ─────────

const SERIES_MAPPINGS: Record<string, string> = {
  tasa_desocupacion:     'EMP_DESOC_TASA',
  ocupados_miles:        'EMP_OCUP_MILES',
  fuerza_trabajo_miles:  'EMP_FT_MILES',
  ventas_regionales:     'ECO_VENTAS_REG',
  pib_regional:          'ECO_PIB_REG',
  pib_nacional:          'ECO_PIB_NAC',
  imacec:                'ECO_IMACEC',
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function upsertBatch(table: string, rows: Record<string, unknown>[], conflict: string) {
  const BATCH = 500
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await sb.from(table).upsert(batch, { onConflict: conflict })
    if (error) {
      console.error(`Error upserting ${table} at ${i}:`, error.message)
      throw error
    }
    total += batch.length
  }
  return total
}

// ── A. Wide → Long (region_metrics → v2_indicadores_valores) ─────────────

async function migrateWideToLong() {
  console.log('\n── A. Migrating region_metrics (wide → long) ──')

  const { data: regions, error } = await sb.from('region_metrics').select('*')
  if (error || !regions) {
    console.error('Failed to read region_metrics:', error?.message)
    return
  }

  console.log(`  Found ${regions.length} regions in region_metrics`)

  const rows: Record<string, unknown>[] = []

  for (const region of regions) {
    const regionId = INE_CODE[region.region_cod]
    if (regionId === undefined) {
      console.warn(`  Skipping unknown region_cod: ${region.region_cod}`)
      continue
    }

    for (const mapping of WIDE_MAPPINGS) {
      const value = region[mapping.v1Field]
      if (value === null || value === undefined) continue

      rows.push({
        codigo_indicador: mapping.v2Code,
        region_id: regionId,
        valor: value,
        periodo: mapping.periodo,
        calidad: mapping.calidad,
        cargado_por: 'v1_migration',
      })
    }
  }

  const count = await upsertBatch(
    'v2_indicadores_valores',
    rows,
    'codigo_indicador,region_id,periodo',
  )
  console.log(`  Migrated ${count} values (wide → long)`)
}

// ── B. Time-series remap (regional_metrics → v2_indicadores_valores) ─────

async function migrateTimeSeries() {
  console.log('\n── B. Migrating regional_metrics (time-series remap) ──')

  // Paginate to get all rows
  const PAGE = 1000
  const allRows: Record<string, unknown>[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('regional_metrics')
      .select('metric_name, region_id, value, period')
      .range(from, from + PAGE - 1)

    if (error) {
      console.error('Failed to read regional_metrics:', error.message)
      return
    }
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  console.log(`  Found ${allRows.length} rows in regional_metrics`)

  const mapped: Record<string, unknown>[] = []

  for (const row of allRows) {
    const metricName = row.metric_name as string
    const v2Code = SERIES_MAPPINGS[metricName]
    if (!v2Code) continue  // skip unmapped metrics (e.g. pib_sector_*)

    mapped.push({
      codigo_indicador: v2Code,
      region_id: row.region_id,
      valor: row.value,
      periodo: row.period,
      calidad: 'verificado',
      cargado_por: 'v1_migration',
    })
  }

  const count = await upsertBatch(
    'v2_indicadores_valores',
    mapped,
    'codigo_indicador,region_id,periodo',
  )
  console.log(`  Migrated ${count} time-series values`)
}

// ── C. Iniciativas (prioridades_territoriales → v2_iniciativas) ──────────

async function migrateIniciativas() {
  console.log('\n── C. Migrating prioridades_territoriales → v2_iniciativas ──')

  // Load lookups
  const { data: ejes } = await sb.from('v2_ejes_estrategicos').select('id, nombre')
  const ejeMap = new Map<string, number>()
  for (const e of ejes ?? []) ejeMap.set(e.nombre, e.id)

  // Seed ministerios from distinct values
  const { data: prioridades } = await sb
    .from('prioridades_territoriales')
    .select('ministerio')
  const distinctMinisterios = [...new Set((prioridades ?? []).map((p: { ministerio: string }) => p.ministerio).filter(Boolean))]

  for (const m of distinctMinisterios) {
    await sb.from('v2_ministerios').upsert({ nombre: m }, { onConflict: 'nombre' })
  }

  const { data: ministerios } = await sb.from('v2_ministerios').select('id, nombre')
  const minMap = new Map<string, number>()
  for (const m of ministerios ?? []) minMap.set(m.nombre, m.id)

  // Load all prioridades
  const PAGE = 1000
  const all: Record<string, unknown>[] = []
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from('prioridades_territoriales')
      .select('*')
      .range(from, from + PAGE - 1)

    if (error) { console.error(error.message); return }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  console.log(`  Found ${all.length} prioridades_territoriales`)

  const rows = all.map((p: Record<string, unknown>) => {
    const cod = p.cod as string
    const regionId = INE_CODE[cod]
    const ejeName = ((p.eje as string) ?? '').replace(/^Eje \d+: /, '')
    const ejeId = ejeMap.get(ejeName) ?? null

    // Map v1 'gris' to v2 'sin_evaluar'
    let semaforo = p.estado_semaforo as string | null
    if (semaforo === 'gris' || !semaforo) semaforo = 'sin_evaluar'

    return {
      codigo_iniciativa: p.codigo_iniciativa ?? null,
      region_id: regionId,
      eje_id: ejeId,
      ministerio_id: minMap.get(p.ministerio as string) ?? null,
      nombre: p.nombre,
      descripcion: p.descripcion ?? null,
      prioridad: p.prioridad ?? null,
      etapa_actual: p.etapa_actual ?? null,
      estado_planificacion: 'en_marcha',
      estado_semaforo: semaforo,
      pct_avance: (p.pct_avance as number) ?? 0,
      proximo_hito: p.proximo_hito ?? null,
      fecha_proximo_hito: p.fecha_proximo_hito ?? null,
      fuente_financiamiento: p.fuente_financiamiento ?? null,
      codigo_bip: p.codigo_bip ?? null,
      inversion_mm_clp: p.inversion_mm ?? null,
      comuna: p.comuna ?? null,
      responsable: p.responsable ?? null,
      fecha_apertura_monitoreo: null,
      cargado_por: 'DCI',
      fuente_origen: 'v1_migration',
    }
  })

  // Insert (not upsert — new IDs)
  const BATCH = 500
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await sb.from('v2_iniciativas').insert(batch)
    if (error) {
      console.error(`Error inserting v2_iniciativas at ${i}:`, error.message)
      throw error
    }
    total += batch.length
  }

  console.log(`  Migrated ${total} iniciativas`)
}

// ── D. Proyectos inversión (SEIA + MOP → v2_proyectos_inversion) ─────────

async function migrateProyectos() {
  console.log('\n── D. Migrating seia_projects + mop_projects → v2_proyectos_inversion ──')

  // SEIA
  const { data: seia } = await sb.from('seia_projects').select('*')
  const seiaRows = (seia ?? []).map((p: Record<string, unknown>) => ({
    id: `seia_${p.id}`,
    region_id: p.region_id,
    sistema_origen: 'seia',
    nombre: p.nombre,
    tipo: p.tipo ?? null,
    estado: p.estado ?? null,
    titular: p.titular ?? null,
    etapa: null,
    inversion: p.inversion_mm ?? null,
    moneda: 'USD_MM',
    fecha_presentacion: p.fecha_presentacion ?? null,
    url_ficha: p.url_ficha ?? null,
    synced_at: p.synced_at ?? new Date().toISOString(),
  }))

  // MOP
  const { data: mop } = await sb.from('mop_projects').select('*')
  const mopRows = (mop ?? []).map((p: Record<string, unknown>) => ({
    id: `mop_${p.cod_p}`,
    region_id: p.region_id,
    sistema_origen: 'mop',
    nombre: p.nombre,
    tipo: null,
    estado: null,
    titular: null,
    servicio: p.servicio ?? null,
    programa: p.programa ?? null,
    etapa: p.etapa ?? null,
    inversion: p.inversion_miles ?? null,
    moneda: 'CLP_MILES',
    descripcion: p.descripcion ?? null,
    synced_at: p.synced_at ?? new Date().toISOString(),
  }))

  const allProjects = [...seiaRows, ...mopRows]

  const count = await upsertBatch('v2_proyectos_inversion', allProjects, 'id')
  console.log(`  Migrated ${count} proyectos (${seiaRows.length} SEIA + ${mopRows.length} MOP)`)
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== v1 → v2 Data Migration ===')
  console.log(`Supabase: ${url}`)

  // Verify v2 tables exist
  const { error: checkErr } = await sb.from('v2_regiones').select('id').limit(1)
  if (checkErr) {
    console.error('v2_regiones not found. Run 001_v2_schema.sql first.')
    process.exit(1)
  }

  await migrateWideToLong()
  await migrateTimeSeries()
  await migrateIniciativas()
  await migrateProyectos()

  // Refresh materialized view
  console.log('\n── Refreshing v2_indicadores_ultimo ──')
  const { error: refreshErr } = await sb.rpc('refresh_v2_indicadores_ultimo')
  if (refreshErr) {
    console.warn('  Could not refresh via RPC (expected if function not created yet)')
    console.log('  Run manually: REFRESH MATERIALIZED VIEW v2_indicadores_ultimo;')
  } else {
    console.log('  Done.')
  }

  console.log('\n=== Migration complete ===')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
