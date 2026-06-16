import { describe, it, expect } from 'vitest'
import { mapRow } from '@/lib/db'
import type { Prioridad } from '@/lib/types'

/**
 * Tests de lib/db.ts::mapRow.
 *
 * mapRow toma una fila cruda de prioridades_territoriales (tipo Prioridad)
 * y la convierte en Iniciativa con defaults para los campos opcionales
 * que pueden faltar en migraciones intermedias.
 *
 * Foco: cubre defaults, nulls, campos pre-migración (en_foco, es_desalojo,
 * tags) — los puntos donde un commit incompleto rompe el cliente.
 */

function makeRow(overrides: Partial<Prioridad> = {}): Prioridad {
  return {
    id:    1,
    n:     1,
    region: 'Antofagasta',
    cod:    'II',
    capital: 'Antofagasta',
    zona:   'Norte',
    eje:    'Eje 1: Vivienda',
    nombre: 'Test',
    ministerio: null,
    prioridad: 'Alta',
    estado_semaforo: 'verde',
    pct_avance: 50,
    responsable: null,
    codigo_iniciativa: null,
    descripcion: null,
    etapa_actual: null,
    estado_termino_gobierno: null,
    proximo_hito: null,
    fecha_proximo_hito: null,
    fuente_financiamiento: null,
    codigo_bip: null,
    inversion_mm: null,
    comuna: null,
    rat: null,
    eje_gobierno: null,
    origen: null,
    en_foco: false,
    eje_id: null,
    tags: [],
    es_desalojo: false,
    capa: 'lll',
    ...overrides,
  }
}

describe('mapRow', () => {
  it('propaga id, n, region, cod (etapa 5: id es la PK estable)', () => {
    const out = mapRow(makeRow({ id: 42, n: 7, region: 'Aysén', cod: 'XI' }))
    expect(out.id).toBe(42)
    expect(out.n).toBe(7)
    expect(out.region).toBe('Aysén')
    expect(out.cod).toBe('XI')
  })

  it('defaultea estado_semaforo a "gris" si row.estado_semaforo es null', () => {
    const out = mapRow(makeRow({ estado_semaforo: null }))
    expect(out.estado_semaforo).toBe('gris')
  })

  it('defaultea pct_avance a 0 si row.pct_avance es null', () => {
    const out = mapRow(makeRow({ pct_avance: null }))
    expect(out.pct_avance).toBe(0)
  })

  it('defaultea tags a array vacío si falta (pre-migración 016)', () => {
    const out = mapRow(makeRow({ tags: undefined as unknown as string[] }))
    expect(out.tags).toEqual([])
  })

  it('preserva tags multi-valor', () => {
    const out = mapRow(makeRow({ tags: ['urgente', 'piloto', 'desalojo'] }))
    expect(out.tags).toEqual(['urgente', 'piloto', 'desalojo'])
  })

  it('defaultea en_foco a false si falta (pre-migración 007)', () => {
    const out = mapRow(makeRow({ en_foco: undefined }))
    expect(out.en_foco).toBe(false)
  })

  it('defaultea es_desalojo a false si falta (pre-migración 017)', () => {
    const out = mapRow(makeRow({ es_desalojo: undefined }))
    expect(out.es_desalojo).toBe(false)
  })

  it('preserva es_desalojo = true', () => {
    const out = mapRow(makeRow({ es_desalojo: true }))
    expect(out.es_desalojo).toBe(true)
  })

  it('preserva eje_id null y eje string denormalizado', () => {
    const out = mapRow(makeRow({ eje_id: 5, eje: 'Eje 5: Salud' }))
    expect(out.eje_id).toBe(5)
    expect(out.eje).toBe('Eje 5: Salud')
  })

  it('defaultea capa a "lll" si falta (pre-migración 024)', () => {
    const out = mapRow(makeRow({ capa: undefined }))
    expect(out.capa).toBe('lll')
  })

  it('preserva capa = "l" y capa = "ll" cuando vienen seteadas', () => {
    expect(mapRow(makeRow({ capa: 'l' })).capa).toBe('l')
    expect(mapRow(makeRow({ capa: 'll' })).capa).toBe('ll')
  })
})
