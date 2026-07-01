import { describe, it, expect } from 'vitest'
import { buildKitDeViajeData, type AssemblerInputs } from '@/lib/kitDeViaje/assembler'
import type { Iniciativa } from '@/lib/projects'
import type { RegionMetrics, RegionEje } from '@/lib/types'
import type { Region } from '@/lib/regions'
import {
  COPY_PREGO_INVALID,
  COPY_PREGO_MISSING,
  COPY_PREGO_SIN_INICIATIVAS,
  COPY_AUTORIDADES_PENDIENTE,
  MINISTERIO,
  DIVISION,
} from '@/lib/kitDeViaje/constants'

// ── Factories ───────────────────────────────────────────────────────────────

const REGION: Region = {
  cod: 'VIII', nombre: 'Biobío', capital: 'Concepción', zona: 'centro-sur',
}

function mkIni(overrides: Partial<Iniciativa> = {}): Iniciativa {
  return {
    id: 1, n: 1, region: 'Biobío', cod: 'VIII', capital: 'Concepción', zona: 'centro-sur',
    eje: 'Eje 1: Seguridad', eje_id: 100, eje_gobierno: 'Seguridad',
    nombre: 'Iniciativa X', descripcion: null, ministerio: 'Ministerio del Interior',
    prioridad: 'Alta', etapa_actual: null, estado_termino_gobierno: null,
    proximo_hito: null, fecha_proximo_hito: null, fuente_financiamiento: null,
    codigo_bip: null, inversion_mm: null, comuna: null, rat: null,
    estado_semaforo: 'verde', pct_avance: 50, responsable: null,
    codigo_iniciativa: null, origen: null, en_foco: false, tags: [],
    es_desalojo: false, capa: 'lll',
    ...overrides,
  }
}

function mkEje(id: number, numero: number, nombre: string): RegionEje {
  return {
    id, region_cod: 'VIII', numero, nombre,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    created_by_email: null,
  }
}

function inputs(over: Partial<AssemblerInputs> = {}): AssemblerInputs {
  return {
    region: REGION,
    fecha: 'Julio 2026',
    metrics: null,
    projects: [],
    regionEjes: [],
    planPdfState: 'ok',
    aiContent: null,
    fichaExtra: null,
    trendSummaries: null,
    provincias: [],
    logoDataUrl: 'data:image/png;base64,ZZZ',
    aiFresh: true,
    ...over,
  }
}

// ── Meta y branding ─────────────────────────────────────────────────────────

describe('buildKitDeViajeData — meta y branding', () => {
  it('emite MINISTERIO y DIVISION canónicos (no "y Seguridad Pública", no "Interregional")', () => {
    const d = buildKitDeViajeData(inputs())
    expect(d.branding.ministerio).toBe(MINISTERIO)
    expect(d.branding.division).toBe(DIVISION)
    expect(d.branding.ministerio).not.toMatch(/Seguridad Pública/i)
    expect(d.branding.division).not.toMatch(/Interregional/i)
  })

  it('marca ai_fresh según input', () => {
    expect(buildKitDeViajeData(inputs({ aiFresh: true })).meta.ai_fresh).toBe(true)
    expect(buildKitDeViajeData(inputs({ aiFresh: false })).meta.ai_fresh).toBe(false)
  })

  it('schema_version = 1', () => {
    expect(buildKitDeViajeData(inputs()).meta.schema_version).toBe(1)
  })
})

// ── Sección I: caracterización dinámica ────────────────────────────────────

describe('Sección I — Caracterización', () => {
  it('omite bullets cuya métrica es null (escalable — no muestra "N/A")', () => {
    const metrics = {
      region_cod: 'VIII', region_nombre: 'Biobío',
      superficie_km2: 37068,
      poblacion_total: 1516000,
      pct_pobreza_ingresos: null, // debería omitirse
      updated_at: '2026-01-01',
    } as RegionMetrics
    const d = buildKitDeViajeData(inputs({ metrics }))
    const labels = d.caracterizacion.bullets.map(b => b.label)
    expect(labels).toContain('Superficie')
    expect(labels).toContain('Población total')
    expect(labels).not.toContain('Pobreza por ingresos')
  })

  it('sin metrics → bullets vacío pero no crashea', () => {
    const d = buildKitDeViajeData(inputs({ metrics: null }))
    expect(d.caracterizacion.bullets).toEqual([])
    expect(d.caracterizacion.parrafos).toEqual([])
  })

  it('formatea superficie con "km²"', () => {
    const metrics = { superficie_km2: 37068 } as RegionMetrics
    const d = buildKitDeViajeData(inputs({ metrics }))
    const sup = d.caracterizacion.bullets.find(b => b.label === 'Superficie')
    expect(sup?.value).toMatch(/km²/)
  })
})

// ── Sección III: PREGO ─────────────────────────────────────────────────────

describe('Sección III — PREGO', () => {
  it('planPdfState = "missing" → estado missing + disclaimer + ejes vacío', () => {
    const d = buildKitDeViajeData(inputs({ planPdfState: 'missing' }))
    expect(d.prego.estado).toBe('missing')
    expect(d.prego.disclaimer).toBe(COPY_PREGO_MISSING)
    expect(d.prego.ejes).toEqual([])
  })

  it('planPdfState = "invalid" → disclaimer específico (caso Ñuble)', () => {
    const d = buildKitDeViajeData(inputs({ planPdfState: 'invalid' }))
    expect(d.prego.estado).toBe('invalid')
    expect(d.prego.disclaimer).toBe(COPY_PREGO_INVALID)
    expect(d.prego.ejes).toEqual([])
  })

  it('planPdfState = "ok" pero 0 iniciativas → sin_iniciativas_nota + ejes vacío', () => {
    const d = buildKitDeViajeData(inputs({ planPdfState: 'ok', projects: [], regionEjes: [mkEje(1, 1, 'Seguridad')] }))
    expect(d.prego.estado).toBe('ok')
    expect(d.prego.sin_iniciativas_nota).toBe(COPY_PREGO_SIN_INICIATIVAS)
    expect(d.prego.ejes).toEqual([])
  })

  it('agrupa iniciativas por eje_id y respeta el orden por region_ejes.numero', () => {
    const ejes = [mkEje(200, 2, 'Salud'), mkEje(100, 1, 'Seguridad')]  // desorden intencional
    const projects = [
      mkIni({ id: 1, eje_id: 100, estado_semaforo: 'verde', pct_avance: 50 }),
      mkIni({ id: 2, eje_id: 100, estado_semaforo: 'ambar', pct_avance: 30 }),
      mkIni({ id: 3, eje_id: 200, estado_semaforo: 'rojo',  pct_avance: 10 }),
    ]
    const d = buildKitDeViajeData(inputs({ regionEjes: ejes, projects }))
    expect(d.prego.ejes.map(e => e.numero)).toEqual([1, 2])
    expect(d.prego.ejes[0].nombre).toBe('Seguridad')
    expect(d.prego.ejes[0].resumen.total_iniciativas).toBe(2)
    expect(d.prego.ejes[1].nombre).toBe('Salud')
    expect(d.prego.ejes[1].resumen.total_iniciativas).toBe(1)
  })

  it('cuenta iniciativas con eje_id NULL en sin_eje_asignado_count (no las oculta)', () => {
    const ejes = [mkEje(100, 1, 'Seguridad')]
    const projects = [
      mkIni({ id: 1, eje_id: 100 }),
      mkIni({ id: 2, eje_id: null }),
      mkIni({ id: 3, eje_id: null }),
    ]
    const d = buildKitDeViajeData(inputs({ regionEjes: ejes, projects }))
    expect(d.prego.sin_eje_asignado_count).toBe(2)
  })

  it('caso Biobío-en-prod: >95% gris → pct_avance_promedio = null + nota_sin_datos', () => {
    const ejes = [mkEje(100, 1, 'Reconstrucción')]
    // 20 iniciativas, todas gris con pct=0
    const projects = Array.from({ length: 20 }, (_, i) => mkIni({ id: i + 1, eje_id: 100, estado_semaforo: 'gris', pct_avance: 0 }))
    const d = buildKitDeViajeData(inputs({ regionEjes: ejes, projects }))
    const eje = d.prego.ejes[0]
    expect(eje.resumen.pct_avance_promedio).toBeNull()
    expect(eje.resumen.nota_sin_datos).toBeDefined()
    expect(eje.resumen.semaforo.gris).toBe(20)
  })

  it('cuando hay data real (mix de estados) → pct_avance_promedio numérico y SIN nota_sin_datos', () => {
    const ejes = [mkEje(100, 1, 'Seguridad')]
    const projects = [
      mkIni({ id: 1, eje_id: 100, estado_semaforo: 'verde', pct_avance: 80 }),
      mkIni({ id: 2, eje_id: 100, estado_semaforo: 'ambar', pct_avance: 40 }),
      mkIni({ id: 3, eje_id: 100, estado_semaforo: 'rojo',  pct_avance: 20 }),
      mkIni({ id: 4, eje_id: 100, estado_semaforo: 'verde', pct_avance: 60 }),
    ]
    const d = buildKitDeViajeData(inputs({ regionEjes: ejes, projects }))
    const r = d.prego.ejes[0].resumen
    expect(r.pct_avance_promedio).toBe(50)
    expect(r.nota_sin_datos).toBeUndefined()
    expect(r.semaforo).toEqual({ verde: 2, ambar: 1, rojo: 1, gris: 0 })
  })

  it('iniciativas destacadas: prioriza tag "Prioritaria PREGO", luego rojas > ámbar > verdes por pct_avance', () => {
    const ejes = [mkEje(100, 1, 'X')]
    const projects = [
      mkIni({ id: 1, eje_id: 100, estado_semaforo: 'verde', pct_avance: 90, nombre: 'V90' }),
      mkIni({ id: 2, eje_id: 100, estado_semaforo: 'rojo',  pct_avance: 10, nombre: 'R10' }),
      mkIni({ id: 3, eje_id: 100, estado_semaforo: 'verde', pct_avance: 20, nombre: 'PregoTag', tags: ['Prioritaria PREGO'] }),
      mkIni({ id: 4, eje_id: 100, estado_semaforo: 'ambar', pct_avance: 50, nombre: 'A50' }),
    ]
    const d = buildKitDeViajeData(inputs({ regionEjes: ejes, projects }))
    const dest = d.prego.ejes[0].resumen.iniciativas_destacadas
    expect(dest[0].nombre).toBe('PregoTag')     // tag priority
    expect(dest[1].nombre).toBe('R10')          // luego rojas
    expect(dest[2].nombre).toBe('A50')          // luego ámbar
    expect(dest[3].nombre).toBe('V90')          // luego verdes por pct desc
  })

  it('destacadas: ministerio se muestra sin prefijo "Ministerio del/de"', () => {
    const ejes = [mkEje(100, 1, 'X')]
    const projects = [
      mkIni({ id: 1, eje_id: 100, ministerio: 'Ministerio del Interior' }),
      mkIni({ id: 2, eje_id: 100, ministerio: 'Ministerio de Obras Públicas' }),
    ]
    const d = buildKitDeViajeData(inputs({ regionEjes: ejes, projects }))
    const dest = d.prego.ejes[0].resumen.iniciativas_destacadas
    expect(dest[0].ministerio).toBe('Interior')
    expect(dest[1].ministerio).toBe('Obras Públicas')
  })
})

// ── Sección IV: Autoridades skeleton ───────────────────────────────────────

describe('Sección IV — Autoridades (skeleton Fase A/B)', () => {
  it('disponible=false + disclaimer + grupos vacío', () => {
    const d = buildKitDeViajeData(inputs())
    expect(d.autoridades.disponible).toBe(false)
    expect(d.autoridades.disclaimer).toBe(COPY_AUTORIDADES_PENDIENTE)
    expect(d.autoridades.grupos).toEqual([])
  })
})
