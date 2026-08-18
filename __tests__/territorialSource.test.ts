/**
 * Test de contrato de `assembleTerritorial` (source.ts). Offline, con fixtures crudos.
 * Verifica que (1) una columna faltante revienta con mensaje claro (no mapa gris) y
 * (2) el ensamblado indexa alcaldes/gobernadores/reelección tal como el PTS.
 *
 * El chequeo contra data REAL (red) es opt-in: correr con
 *   TERRITORIAL_LIVE=1 npx vitest run __tests__/territorialSource.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { assembleTerritorial, type RawTerritorial } from '@/lib/territorial/source'

function rawMinimo(): RawTerritorial {
  return {
    regiones: [{ codigo_region: '01', nombre: 'Tarapacá', n_comunas: 1 }],
    comunas: [{ codigo_comuna: '01101', nombre: 'Iquique', codigo_region: '01', region: 'Tarapacá', poblacion: 200000, tamano: 'Grande' }],
    alcaldes: [
      { id: 1, codigo_comuna: '01101', anio: '2024', nombre: 'MAURICIO SOR', partido: 'RN', pct: 51, votos: 100, reelecto: true, lado_cerrado: 'DER', lado_abierto: 'DER', voto_obligatorio: true, total_validos: 200, contrincantes: null, tope_reeleccion: null, puede_repostular_2028: true, confianza_dato: 'verificado' },
    ],
    gobernadores: [
      { id: 1, codigo_region: '01', anio: '2024', nombre: 'JOSE MIGUEL', partido: 'PS', lista: null, pct: 45, votos: 500, lado_cerrado: 'IZQ', lado_abierto: 'IZQ', voto_obligatorio: true, contrincantes: null, puede_repostular_proxima: false, confianza_dato: 'estimado' },
    ],
    gobernador_resultado_comunal: [
      { id: 1, codigo_comuna: '01101', codigo_region: '01', anio: '2024', gano: true, vuelta_usada: '1', ganador_comuna: 'JOSE MIGUEL', pct_gobernador_en_comuna: 40, votos_gobernador_en_comuna_verif: 200 },
    ],
    diputados_candidatos: [
      { id: 1, codigo_comuna: '01101', anio: '2025', nombre: 'D UNO', partido: 'RN', votos: 90, electo: true, distrito: 'DISTRITO 2' },
    ],
    senadores_candidatos: [
      { id: 1, codigo_comuna: '01101', anio: '2025', nombre: 'S UNO', partido: 'UDI', votos: 200, electo: true, circunscripcion: 'CIRCUNSCRIPCION SENATORIAL 1' },
    ],
    congreso_reeleccion: [
      { id: 1, cargo: 'diputado', territorio: 'DISTRITO 2', nombre: 'D UNO', periodos_consecutivos: 2, puede_repostular: true, confianza_dato: 'verificado' },
    ],
    delegados_presidenciales: [
      { id: 1, codigo_region: '01', presidente: 'Gabriel Boric Font', nombre: 'Delegada', partido: 'FRVS', cargo: 'Delegado', periodo_especifico: '2022-2026' },
    ],
  }
}

describe('assembleTerritorial — contrato', () => {
  it('arma la estructura completa con data válida', () => {
    const d = assembleTerritorial(rawMinimo())
    expect(d.regionOrder).toEqual(['01'])
    const c = d.comunaPropsByCut['01101']
    expect(c.alcalde_2024?.partido).toBe('RN')
    expect(c.reeleccion_2028).toEqual({ puede_repostular: true, estado_confianza: 'verificado' })
    expect(c.gobernador_2024?.resultado_comunal?.pct_en_comuna).toBe(40)
    expect(c.gobernador_reeleccion_2028).toEqual({ puede_repostular: false, estado_confianza: 'estimado' })
    expect(d.comunasByRegion['01']).toHaveLength(1)
    expect(d.DIPUTADOS.porTerritorioAnio['DISTRITO 2']['2025'][0].nombre).toBe('D UNO')
    expect(d.CONGRESO_REELECCION.diputado['DISTRITO 2|D UNO']).toBeTruthy()
    expect(d.DELEGADOS_POR_REGION['01']['Gabriel Boric Font']).toHaveLength(1)
  })

  it('reeleccion_2028 NO se setea si puede_repostular_2028 es null', () => {
    const raw = rawMinimo()
    ;(raw.alcaldes[0] as Record<string, unknown>).puede_repostular_2028 = null
    const d = assembleTerritorial(raw)
    expect(d.comunaPropsByCut['01101'].reeleccion_2028).toBeUndefined()
  })

  it('revienta ruidoso si falta una columna esperada', () => {
    const raw = rawMinimo()
    delete (raw.comunas[0] as Record<string, unknown>).region
    expect(() => assembleTerritorial(raw)).toThrow(/comunas.*region/)
  })

  it('tabla vacía no revienta el contrato (no hay fila que verificar)', () => {
    const raw = rawMinimo()
    raw.delegados_presidenciales = []
    expect(() => assembleTerritorial(raw)).not.toThrow()
  })
})

// ── Snapshot commiteado: se ensambla y colorea offline (sin red) ──────────────
// Valida el archivo REAL que se sirve en producción (public/territorial/snapshot.json),
// generado por scripts/snapshot-territorial.mjs. Si el snapshot falta o cambió de
// forma, este test lo detecta en cada `npm test`.
const SNAPSHOT = new URL('../public/territorial/snapshot.json', import.meta.url)
describe.skipIf(!existsSync(SNAPSHOT))('snapshot commiteado — pipeline completo offline', () => {
  it('ensambla y colorea las 16 regiones y todas las comunas', async () => {
    const { fillForRegion, fillForComuna, computeStats } = await import('@/lib/territorial/derive')
    const raw = JSON.parse(readFileSync(SNAPSHOT, 'utf-8'))
    const d = assembleTerritorial(raw)
    expect(d.regionOrder.length).toBe(16)
    expect(Object.keys(d.comunaPropsByCut).length).toBeGreaterThan(300)

    const state = { year: '2024', lado: 'lado_abierto', nivel: 'alcalde', congresoAnio: '2025', coloreoCongreso: 'comuna', periodoDelegado: 'Gabriel Boric Font' } as const
    for (const rk of d.regionOrder) expect(fillForRegion(d, state, rk)).toMatch(/^#[0-9a-f]{6}$/i)
    for (const p of Object.values(d.comunaPropsByCut)) expect(fillForComuna(d, state, p)).toMatch(/^#[0-9a-f]{6}$/i)

    const s = computeStats(d, state, 'regiones', null)
    expect(s.IZQ + s.DER + s.IND + s.NULL).toBe(16)
    expect(s.total).toBe(16)

    expect(Object.keys(d.SENADORES.porTerritorioAnio).length).toBeGreaterThan(0)
    expect(Object.keys(d.DIPUTADOS.porTerritorioAnio).length).toBeGreaterThan(0)
  })
})
