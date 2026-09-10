import { describe, it, expect } from 'vitest'
import { construirPines, distanciaM, offsetGirasol, radioDesparrame } from '@/lib/pinesIniciativas'
import type { Iniciativa } from '@/lib/projects'

/**
 * lib/pinesIniciativas.ts — pines del drill comunal (mig 104). Dolor: que el
 * desparrame sea determinístico (si dependiera del orden de entrada, los pines
 * saltarían de lugar en cada re-render), que las de alcance regional no
 * aparezcan como pin, y que sin `ubicacion_lat/lng` la iniciativa NO aparezca
 * (Diego, 2026-09-11, descartó la aproximación por centroide de comuna).
 */

function ini(over: Partial<Iniciativa> & { id: number }): Iniciativa {
  return {
    n: over.id, region: 'Los Ríos', cod: 'XIV', capital: 'Valdivia', zona: 'Sur',
    eje: 'Eje 1', eje_gobierno: null, nombre: `Iniciativa ${over.id}`, descripcion: null,
    ministerio: null, etapa_actual: null, estado_termino_gobierno: null, proximo_hito: null,
    fecha_proximo_hito: null, fuente_financiamiento: null, codigo_bip: null, inversion_mm: null,
    comuna: 'Valdivia', rat: null, estado_semaforo: 'verde', pct_avance: 0, responsable: null,
    codigo_iniciativa: null, origen: null, en_foco: false, tags: [], es_desalojo: false,
    capa: 'lll', comuna_cods: [14101], alcance_regional: false,
    ubicacion_lat: null, ubicacion_lng: null,
    ...over,
  }
}

const TODAS = new Set<Iniciativa['capa']>(['l', 'll', 'lll'])

describe('construirPines', () => {
  it('sin coordenada → no aparece como pin (se cuenta en sinUbicacion); con coordenada → pin exacto', () => {
    const r = construirPines([
      ini({ id: 1 }),
      ini({ id: 2, ubicacion_lat: -39.83, ubicacion_lng: -73.25 }),
    ], TODAS)
    expect(r.pines.map(p => p.id)).toEqual([2])
    expect(r.pines[0].lat).toBe(-39.83)
    expect(r.pines[0].lng).toBe(-73.25)
    expect(r.sinUbicacion).toBe(1)
  })

  it('varias con la misma coordenada exacta se desparraman: puntos distintos, todos a menos de 300 m', () => {
    const PUNTO = { ubicacion_lat: -39.8142, ubicacion_lng: -73.2459 }
    const r = construirPines([
      ini({ id: 1, ...PUNTO }), ini({ id: 2, ...PUNTO }), ini({ id: 3, ...PUNTO }),
    ], TODAS)
    const puntos = r.pines.map(p => `${p.lat},${p.lng}`)
    expect(new Set(puntos).size).toBe(3)
    for (const p of r.pines) expect(distanciaM([PUNTO.ubicacion_lat, PUNTO.ubicacion_lng], [p.lat, p.lng])).toBeLessThan(300)
  })

  it('es determinístico: el orden de entrada no mueve los pines', () => {
    const PUNTO = { ubicacion_lat: -39.8142, ubicacion_lng: -73.2459 }
    const a = construirPines([ini({ id: 3, ...PUNTO }), ini({ id: 1, ...PUNTO }), ini({ id: 2, ...PUNTO })], TODAS)
    const b = construirPines([ini({ id: 1, ...PUNTO }), ini({ id: 2, ...PUNTO }), ini({ id: 3, ...PUNTO })], TODAS)
    expect(a.pines).toEqual(b.pines)
  })

  it('alcance regional no va como pin pero sí en `regionales`, tenga o no coordenada', () => {
    const r = construirPines([
      ini({ id: 1, alcance_regional: true, comuna_cods: [], comuna: 'Regional' }),
      ini({ id: 2, ubicacion_lat: -39.83, ubicacion_lng: -73.25 }),
    ], TODAS)
    expect(r.pines.map(p => p.id)).toEqual([2])
    expect(r.regionales.map(p => p.id)).toEqual([1])
  })

  it('filtra por capa (y sin capas activas no hay pines ni regionales)', () => {
    const lista = [
      ini({ id: 1, capa: 'l', ubicacion_lat: -39.83, ubicacion_lng: -73.25 }),
      ini({ id: 2, capa: 'll', ubicacion_lat: -39.83, ubicacion_lng: -73.25 }),
      ini({ id: 3, capa: 'lll', alcance_regional: true, comuna_cods: [] }),
    ]
    expect(construirPines(lista, new Set(['l'])).pines.map(p => p.id)).toEqual([1])
    const vacio = construirPines(lista, new Set())
    expect(vacio.pines).toEqual([])
    expect(vacio.regionales).toEqual([])
  })
})

describe('offsetGirasol / radioDesparrame', () => {
  it('k=0 queda en el centro; el radio crece con √k y se acota entre 60 y 250 m', () => {
    expect(offsetGirasol(0, 100, -39.8)).toEqual([0, 0])
    const d1 = distanciaM([-39.8, -73.2], [-39.8 + offsetGirasol(1, 100, -39.8)[0], -73.2 + offsetGirasol(1, 100, -39.8)[1]])
    const d4 = distanciaM([-39.8, -73.2], [-39.8 + offsetGirasol(4, 100, -39.8)[0], -73.2 + offsetGirasol(4, 100, -39.8)[1]])
    expect(d1).toBeCloseTo(100, 0)
    expect(d4).toBeCloseTo(200, 0)
    expect(radioDesparrame(1)).toBe(60)
    expect(radioDesparrame(20)).toBe(60)
    expect(radioDesparrame(80)).toBe(120)
    expect(radioDesparrame(10_000)).toBe(250)
  })
})
