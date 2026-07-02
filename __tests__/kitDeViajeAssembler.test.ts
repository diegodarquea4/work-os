import { describe, it, expect } from 'vitest'
import { buildKitDeViajeData, type AssemblerInputs } from '@/lib/kitDeViaje/assembler'
import type { RegionMetrics } from '@/lib/types'
import type { Region } from '@/lib/regions'
import {
  COPY_AUTORIDADES_PENDIENTE,
  MINISTERIO,
  DIVISION,
} from '@/lib/kitDeViaje/constants'

// ── Factories ───────────────────────────────────────────────────────────────

const REGION: Region = {
  cod: 'VIII', nombre: 'Biobío', capital: 'Concepción', zona: 'centro-sur',
}

function inputs(over: Partial<AssemblerInputs> = {}): AssemblerInputs {
  return {
    region: REGION,
    fecha: 'Julio 2026',
    metrics: null,
    aiContent: null,
    fichaExtra: null,
    trendSummaries: null,
    provincias: [],
    logoDataUrl: 'data:image/png;base64,ZZZ',
    aiFresh: true,
    hasAutoridadesFicha: false,
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

// ── Sección IV: Autoridades skeleton ───────────────────────────────────────

describe('Sección IV — Autoridades', () => {
  it('sin ficha oficial → disponible=false + disclaimer + grupos vacío (fallback preview)', () => {
    const d = buildKitDeViajeData(inputs({ hasAutoridadesFicha: false }))
    expect(d.autoridades.disponible).toBe(false)
    expect(d.autoridades.disclaimer).toBe(COPY_AUTORIDADES_PENDIENTE)
    expect(d.autoridades.grupos).toEqual([])
  })

  it('con ficha oficial en bucket → disponible=true SIN disclaimer (renderer omite sección; route anexa PDF)', () => {
    const d = buildKitDeViajeData(inputs({ hasAutoridadesFicha: true }))
    expect(d.autoridades.disponible).toBe(true)
    expect(d.autoridades.disclaimer).toBeUndefined()
    expect(d.autoridades.grupos).toEqual([])
  })
})
