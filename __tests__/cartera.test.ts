import { describe, it, expect } from 'vitest'
import {
  CARTERAS_GABINETE, ACTORES_GABINETE_NO_SEREMI,
  normalizeCarteraGabinete, isCarteraGabinete,
} from '@/lib/cartera'
import { LISTA_CANONICA } from '@/lib/ministerios'

/**
 * Catálogo de carteras del Gabinete (mig 074). El punto frágil: el acta real NO
 * reporta solo por SEREMIs — hay actores no-SEREMI (Delegada, Jefatura de
 * Gabinete, DPP, SUBDERE-unidad) que las 3 listas de ministerios no cubren, y el
 * gabinete usa formas cortas ("Salud", "Economía") que normalizeMinisterio no
 * mapea. Estos casos blindan que el catálogo y el normalizador los reconozcan.
 */

describe('CARTERAS_GABINETE — membresía', () => {
  it('incluye a los 4 actores no-SEREMI', () => {
    for (const actor of ACTORES_GABINETE_NO_SEREMI) {
      expect(CARTERAS_GABINETE).toContain(actor)
    }
  })

  it('incluye las SEREMIs de LISTA_CANONICA (sin los buckets)', () => {
    expect(CARTERAS_GABINETE).toContain('Ministerio de Salud')
    expect(CARTERAS_GABINETE).toContain('Ministerio del Trabajo y Previsión Social')
    // Buckets que NO son carteras del gabinete
    expect(CARTERAS_GABINETE).not.toContain('Municipalidades')
    expect(CARTERAS_GABINETE).not.toContain('Sin asignar')
  })

  it('SUBDERE aparece exactamente una vez (bucket excluido, actor incluido)', () => {
    expect(CARTERAS_GABINETE.filter(c => c === 'SUBDERE')).toHaveLength(1)
  })

  it('toda SEREMI del catálogo está en LISTA_CANONICA', () => {
    const seremis = CARTERAS_GABINETE.filter(c => c.startsWith('Ministerio'))
    for (const s of seremis) expect(LISTA_CANONICA).toContain(s)
  })
})

describe('normalizeCarteraGabinete — formas del acta real de Los Ríos', () => {
  // Las 12 instituciones tal como aparecieron en el acta cargada.
  const casos: Array<[string, string]> = [
    ['Salud', 'Ministerio de Salud'],
    ['Energía', 'Ministerio de Energía'],
    ['Economía', 'Ministerio de Economía, Fomento y Turismo'],
    ['Seguridad Pública', 'Ministerio de Seguridad Pública'],
    ['Trabajo y Previsión Social', 'Ministerio del Trabajo y Previsión Social'],
    ['Medio Ambiente', 'Ministerio del Medio Ambiente'],
    ['Agricultura', 'Ministerio de Agricultura'],
    ['Deporte', 'Ministerio del Deporte'],
    ['Delegada Presidencial Regional', 'Delegada Presidencial Regional'],
    ['Jefatura de Gabinete DPR', 'Jefatura de Gabinete'],
    ['DPP del Ranco', 'Delegación Presidencial Provincial'],
    ['SUBDERE', 'SUBDERE'],
  ]
  for (const [raw, canon] of casos) {
    it(`"${raw}" → "${canon}"`, () => {
      expect(normalizeCarteraGabinete(raw)).toBe(canon)
    })
  }

  it('forma completa "Ministerio de X" también normaliza', () => {
    expect(normalizeCarteraGabinete('Ministerio de Salud')).toBe('Ministerio de Salud')
    expect(normalizeCarteraGabinete('Min. Obras Públicas')).toBe('Ministerio de Obras Públicas')
  })

  it('variantes de DPP con provincia mapean al actor genérico', () => {
    expect(normalizeCarteraGabinete('Delegación Presidencial Provincial de Valdivia'))
      .toBe('Delegación Presidencial Provincial')
  })

  it('pass-through: input desconocido vuelve tal cual (no se pierde data)', () => {
    expect(normalizeCarteraGabinete('Cartera inventada X')).toBe('Cartera inventada X')
  })

  it('null / vacío → cadena vacía', () => {
    expect(normalizeCarteraGabinete(null)).toBe('')
    expect(normalizeCarteraGabinete('   ')).toBe('')
  })
})

describe('isCarteraGabinete', () => {
  it('true para formas reconocidas (cortas y de actor)', () => {
    expect(isCarteraGabinete('Salud')).toBe(true)
    expect(isCarteraGabinete('DPP del Ranco')).toBe(true)
    expect(isCarteraGabinete('SUBDERE')).toBe(true)
  })
  it('false para desconocidas', () => {
    expect(isCarteraGabinete('Cartera inventada X')).toBe(false)
    expect(isCarteraGabinete('Municipalidades')).toBe(false)
  })
})
