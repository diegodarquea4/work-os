import { describe, it, expect } from 'vitest'
import { COMUNAS, comunasDeRegion, comunaNombre, matchComunas, normalizeComunaText } from '@/lib/comunas'

/**
 * Tests del matcher comuna-texto → CUT (lib/comunas.ts).
 *
 * Los casos vienen del análisis real contra la base productiva
 * (docs/drilldown-comunal/comuna_matching_full.csv, 704 valores únicos):
 * alias, multi-comuna con ';' y con espacios, guiones (Llay-llay), encoding
 * roto (¿→ñ), tokens de alcance regional y no-matcheados. Dolor, no cobertura.
 */

describe('catálogo CUT', () => {
  it('tiene las 345 comunas del DPA (346 oficiales menos "Zona sin demarcar")', () => {
    expect(COMUNAS.length).toBe(345)
  })

  it('comunasDeRegion resuelve por cod romano vía INE_CODE', () => {
    const v = comunasDeRegion('V')
    expect(v.length).toBe(38)
    expect(v.every(c => c.regionIne === 5)).toBe(true)
    expect(comunasDeRegion('ZZZ')).toEqual([])
  })

  it('comunaNombre devuelve el nombre oficial por CUT', () => {
    expect(comunaNombre(5101)).toBe('Valparaíso')
    expect(comunaNombre(99999)).toBeNull()
  })
})

describe('normalizeComunaText', () => {
  it('baja a minúsculas, quita tildes y colapsa espacios', () => {
    expect(normalizeComunaText('  Viña   del MAR ')).toBe('vina del mar')
    expect(normalizeComunaText('Concón')).toBe('concon')
  })

  it("convierte ñ→n (NFD) y el encoding roto '¿'→n", () => {
    expect(normalizeComunaText('Ñuñoa')).toBe('nunoa')
    expect(normalizeComunaText('¿u¿oa')).toBe('nunoa')
  })

  it('quita puntos y apóstrofes (Pedro A. Cerda, O’Higgins)', () => {
    expect(normalizeComunaText('Pedro A. Cerda')).toBe('pedro a cerda')
    expect(normalizeComunaText("O'Higgins")).toBe('ohiggins')
  })
})

describe('matchComunas — casos simples', () => {
  it('match directo por nombre exacto (con y sin tildes/mayúsculas)', () => {
    expect(matchComunas('Valparaíso', 'V')).toEqual({ cods: [5101], alcanceRegional: false, noMatcheados: [] })
    expect(matchComunas('VALPARAISO', 'V').cods).toEqual([5101])
    expect(matchComunas('viña del mar', 'V').cods).toEqual([5109])
  })

  it('vacío o solo espacios → alcance regional sin cods', () => {
    expect(matchComunas('', 'V')).toEqual({ cods: [], alcanceRegional: true, noMatcheados: [] })
    expect(matchComunas('   ', 'V').alcanceRegional).toBe(true)
  })

  it('tokens de alcance regional (exactos del CSV y variantes por regex)', () => {
    for (const t of ['Regional', 'Varias', 'Todas', 'Toda la Región', 'Provincia de Arauco', 'Por definir con autoridad regional', 'Intercomunal']) {
      const r = matchComunas(t, 'VIII')
      expect(r.alcanceRegional, t).toBe(true)
      expect(r.cods, t).toEqual([])
    }
  })

  it('no confunde comunas reales con tokens regionales', () => {
    // "Chile Chico" contiene "chi..." pero nada del regex; sanity de que
    // comunas con nombres largos siguen matcheando.
    expect(matchComunas('Chile Chico', 'XI').cods).toEqual([11401])
    expect(matchComunas('La Reina', 'RM').alcanceRegional).toBe(false)
  })
})

describe('matchComunas — alias y typos (alias_aplicados.csv)', () => {
  it('alias de nombre común → oficial: La Calera→Calera, San Vicente de Tagua Tagua→San Vicente', () => {
    expect(matchComunas('La Calera', 'V').cods).toEqual([matchComunas('Calera', 'V').cods[0]])
    expect(matchComunas('San Vicente De Tagua Tagua', 'VI').cods).toEqual([6117])
  })

  it('localidades → su comuna: Dichato→Tomé, Liquiñe→Panguipulli, Lican Ray→Villarrica', () => {
    expect(matchComunas('Dichato', 'VIII').cods).toEqual([8111])
    expect(matchComunas('Liquiñe', 'XIV').cods).toEqual([14108])
    expect(matchComunas('Lican Ray', 'IX').cods).toEqual([9120])
  })

  it('typos del CSV: Antofgagasta, Chilán, Montepatria, BARNECHEA', () => {
    expect(matchComunas('Antofgagasta', 'II').cods).toEqual([2101])
    expect(matchComunas('Chilán', 'XVI').cods).toEqual([16101])
    expect(matchComunas('Montepatria', 'IV').cods).toEqual([4303])
    expect(matchComunas('BARNECHEA', 'RM').cods).toEqual([13115])
  })

  it('fuzzy acotado: typo de 1-2 letras resuelve, basura no', () => {
    expect(matchComunas('Quilpe', 'V').cods).toEqual([5801])          // Quilpué -1
    expect(matchComunas('Xyzzy', 'V').noMatcheados).toEqual(['xyzzy'])
  })
})

describe('matchComunas — multi-comuna', () => {
  it("lista con ';' → un CUT por parte, en orden", () => {
    expect(matchComunas('Iquique;Alto Hospicio', 'I').cods).toEqual([1101, 1107])
  })

  it("lista con ',' y con ' y '", () => {
    expect(matchComunas('Antofagasta, Mejillones y Taltal', 'II').cods).toEqual([2101, 2102, 2104])
  })

  it('multi separada SOLO por espacios (greedy por ventana, nombres compuestos)', () => {
    const r = matchComunas('San Felipe Catemu Panquehue Putaendo Santa María los Andes Calle Larga Rinconada San Esteban', 'V')
    expect(r.cods).toEqual([5701, 5702, 5704, 5705, 5706, 5301, 5302, 5303, 5304])
    expect(r.noMatcheados).toEqual([])
  })

  it('"Llay-llay" NO se parte por el guión (fix sobre el análisis original)', () => {
    expect(matchComunas('Llay-llay', 'V').cods).toEqual([5703])
    // Y dentro de una lista por espacios también:
    const r = matchComunas('San Felipe Llay-llay Catemu', 'V')
    expect(r.cods).toEqual([5701, 5703, 5702])
    expect(r.noMatcheados).toEqual([])
  })

  it('multi parcial: lo resoluble entra, la basura queda en noMatcheados', () => {
    const r = matchComunas('Valparaíso Viña del Mar Quilpué Villa Alemana Concón Otras en Evaluación.', 'V')
    expect(r.cods).toEqual([5101, 5109, 5801, 5804, 5103])
    expect(r.noMatcheados.length).toBeGreaterThan(0)
  })

  it('dedup: comuna repetida en la lista entra una sola vez', () => {
    expect(matchComunas('Iquique; Iquique', 'I').cods).toEqual([1101])
  })
})

describe('matchComunas — cross-región (filas OTRA REGIÓN del CSV)', () => {
  it('comuna de otra región resuelve por catálogo nacional (proyectos mineros)', () => {
    // Fila real de Antofagasta que lista comunas de Atacama:
    const r = matchComunas('Antofagasta, Copiapó, Caldera, Chañaral,Taltal', 'II')
    expect(r.cods).toEqual([2101, 3101, 3102, 3201, 2104])
    expect(r.noMatcheados).toEqual([])
  })

  it('"Pozo Almonte, Sierra Gorda, María Elena" (Tarapacá + Antofagasta)', () => {
    expect(matchComunas('Pozo Almonte, Sierra Gorda, María Elena', 'II').cods).toEqual([1401, 2103, 2302])
  })
})
