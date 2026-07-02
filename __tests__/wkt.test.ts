import { describe, it, expect } from 'vitest'
import { parseWktPolygon, toWktPolygon } from '@/lib/wkt'

describe('parseWktPolygon', () => {
  it('parsea polígono simple cerrado', () => {
    const r = parseWktPolygon('POLYGON((-73.05 -36.83, -73.04 -36.83, -73.04 -36.82, -73.05 -36.82, -73.05 -36.83))')
    expect(r.ok).toBe(true)
    if (r.ok) {
      // Se quitó el vértice de cierre duplicado.
      expect(r.value).toHaveLength(4)
      expect(r.value[0]).toEqual([-73.05, -36.83])
      expect(r.value[3]).toEqual([-73.05, -36.82])
    }
  })

  it('parsea polígono no cerrado (autocompleta implícitamente)', () => {
    const r = parseWktPolygon('POLYGON((-73.05 -36.83, -73.04 -36.83, -73.04 -36.82))')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toHaveLength(3)
    }
  })

  it('tolera whitespace y keyword lowercase', () => {
    const r = parseWktPolygon('  polygon  ( ( -73.05 -36.83 , -73.04  -36.83 , -73.04 -36.82 ) )  ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(3)
  })

  it('rechaza MULTIPOLYGON con mensaje específico', () => {
    const r = parseWktPolygon('MULTIPOLYGON(((-73 -36, -73 -35, -72 -35, -72 -36, -73 -36)))')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/MULTIPOLYGON/i)
  })

  it('rechaza formato desconocido', () => {
    const r = parseWktPolygon('POINT(-73 -36)')
    expect(r.ok).toBe(false)
  })

  it('rechaza vacío', () => {
    const r = parseWktPolygon('   ')
    expect(r.ok).toBe(false)
  })

  it('rechaza coordenadas fuera de rango', () => {
    const r = parseWktPolygon('POLYGON((-200 -36, -73 -36, -73 -35))')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/longitud .* fuera de rango/i)
  })

  it('rechaza menos de 3 vértices', () => {
    const r = parseWktPolygon('POLYGON((-73 -36, -73 -35))')
    expect(r.ok).toBe(false)
  })

  it('round-trip: parse → toWkt → parse igual', () => {
    const wkt = 'POLYGON((-73.05 -36.83, -73.04 -36.83, -73.04 -36.82, -73.05 -36.82))'
    const parsed = parseWktPolygon(wkt)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      const back = toWktPolygon(parsed.value)
      const reParsed = parseWktPolygon(back)
      expect(reParsed.ok).toBe(true)
      if (reParsed.ok) expect(reParsed.value).toEqual(parsed.value)
    }
  })
})

describe('toWktPolygon', () => {
  it('cierra el ring al serializar', () => {
    const wkt = toWktPolygon([[-73.05, -36.83], [-73.04, -36.83], [-73.04, -36.82]])
    // Formato: POLYGON((lng lat, lng lat, ..., lng lat))
    expect(wkt).toMatch(/^POLYGON\(\(/)
    expect(wkt).toMatch(/-73\.05 -36\.83\)\)$/) // repite el primero al final
  })

  it('throw si menos de 3 vértices', () => {
    expect(() => toWktPolygon([[-73, -36], [-72, -36]])).toThrow(/al menos 3/)
  })
})
