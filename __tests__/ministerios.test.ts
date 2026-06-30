import { describe, it, expect } from 'vitest'
import {
  LISTA_CANONICA,
  normalizeMinisterio,
  splitMinisterio,
} from '@/lib/ministerios'

/**
 * Tests de lib/ministerios.ts.
 *
 * Foco: las 4 categorías de variantes detectadas en BD prod (6833 filas,
 * 141 valores distintos):
 *  1) Tildes / casing inconsistente.
 *  2) Plurales / artículos / abreviaturas (MINVU, MOP, Min. X).
 *  3) Variantes de Interior + Seguridad Pública colapsadas (guideline).
 *  4) Buckets: Municipalidades, SUBDERE, Sin asignar.
 *
 * Más composición con splitMinisterio para multi-ministerio con `;` y la
 * variante legacy `, Ministerio` (~2 filas en prod).
 */

describe('LISTA_CANONICA', () => {
  it('incluye los 24 ministerios oficiales + 3 buckets', () => {
    expect(LISTA_CANONICA.length).toBe(27)
    expect(LISTA_CANONICA).toContain('SUBDERE')
    expect(LISTA_CANONICA).toContain('Municipalidades')
    expect(LISTA_CANONICA).toContain('Sin asignar')
  })

  it('no menciona "Seguridad Pública" en ninguna entrada (guideline producto)', () => {
    for (const entry of LISTA_CANONICA) {
      expect(entry.toLowerCase()).not.toContain('seguridad pública')
      expect(entry.toLowerCase()).not.toContain('seguridad publica')
    }
  })
})

describe('normalizeMinisterio — tildes y casing', () => {
  it('canoniza tildes ausentes', () => {
    expect(normalizeMinisterio('Ministerio de Educacion')).toBe('Ministerio de Educación')
    expect(normalizeMinisterio('Ministerio de Obras Publicas')).toBe('Ministerio de Obras Públicas')
    expect(normalizeMinisterio('Ministerio de Mineria')).toBe('Ministerio de Minería')
    expect(normalizeMinisterio('Ministerio de Energia')).toBe('Ministerio de Energía')
  })

  it('preserva el canónico oficial sin cambios', () => {
    expect(normalizeMinisterio('Ministerio de Educación')).toBe('Ministerio de Educación')
  })

  it('tolera casing y espacios extra', () => {
    expect(normalizeMinisterio('  MINISTERIO DE EDUCACION  ')).toBe('Ministerio de Educación')
    expect(normalizeMinisterio('ministerio de salud')).toBe('Ministerio de Salud')
  })
})

describe('normalizeMinisterio — plurales y artículos', () => {
  it('Transporte singular → Transportes plural', () => {
    expect(normalizeMinisterio('Ministerio de Transporte y Telecomunicaciones'))
      .toBe('Ministerio de Transportes y Telecomunicaciones')
  })

  it('Mujer y Equidad (sin "la") → con "la la"', () => {
    expect(normalizeMinisterio('Ministerio de la Mujer y Equidad de Género'))
      .toBe('Ministerio de la Mujer y la Equidad de Género')
  })

  it('"de Medio Ambiente" → "del Medio Ambiente"', () => {
    expect(normalizeMinisterio('Ministerio de Medio Ambiente'))
      .toBe('Ministerio del Medio Ambiente')
  })

  it('Ciencias (plural en BD) → Ciencia (singular oficial)', () => {
    expect(normalizeMinisterio('Ministerio de Ciencias, Tecnología, Conocimiento e Innovación'))
      .toBe('Ministerio de Ciencia, Tecnología, Conocimiento e Innovación')
  })
})

describe('normalizeMinisterio — abreviaturas oficiales', () => {
  it('MINVU → Vivienda y Urbanismo', () => {
    expect(normalizeMinisterio('MINVU')).toBe('Ministerio de Vivienda y Urbanismo')
  })

  it('MOP → Obras Públicas', () => {
    expect(normalizeMinisterio('MOP')).toBe('Ministerio de Obras Públicas')
  })

  it('MINSAL → Salud', () => {
    expect(normalizeMinisterio('MINSAL')).toBe('Ministerio de Salud')
  })

  it('SEGEGOB y SEGPRES separados', () => {
    expect(normalizeMinisterio('SEGEGOB')).toBe('Ministerio Secretaría General de Gobierno')
    expect(normalizeMinisterio('SEGPRES')).toBe('Ministerio Secretaría General de la Presidencia')
  })
})

describe('normalizeMinisterio — "Min. X" abbrev', () => {
  it('Min. Salud → Ministerio de Salud', () => {
    expect(normalizeMinisterio('Min. Salud')).toBe('Ministerio de Salud')
  })

  it('Min. Educación / Min. Educacion mapean igual', () => {
    expect(normalizeMinisterio('Min. Educación')).toBe('Ministerio de Educación')
    expect(normalizeMinisterio('Min. Educacion')).toBe('Ministerio de Educación')
  })

  it('Min. Obras Publicas → Obras Públicas con tilde', () => {
    expect(normalizeMinisterio('Min. Obras Publicas')).toBe('Ministerio de Obras Públicas')
  })

  it('Min. Vivienda → Vivienda y Urbanismo (canon largo)', () => {
    expect(normalizeMinisterio('Min. Vivienda')).toBe('Ministerio de Vivienda y Urbanismo')
  })
})

describe('normalizeMinisterio — Interior colapsado', () => {
  it('todas las variantes de Interior + Seguridad Pública → Ministerio del Interior', () => {
    expect(normalizeMinisterio('Ministerio del Interior')).toBe('Ministerio del Interior')
    expect(normalizeMinisterio('Ministerio del Interior y Seguridad Pública')).toBe('Ministerio del Interior')
    expect(normalizeMinisterio('Ministerio de Seguridad Pública')).toBe('Ministerio del Interior')
    expect(normalizeMinisterio('Ministerio de Seguridad Publica')).toBe('Ministerio del Interior')
    expect(normalizeMinisterio('Ministerio de Seguridad y Orden Público')).toBe('Ministerio del Interior')
    expect(normalizeMinisterio('Ministerio de Seguridad y Órden Público')).toBe('Ministerio del Interior')
    expect(normalizeMinisterio('MININT')).toBe('Ministerio del Interior')
    expect(normalizeMinisterio('Min. Interior')).toBe('Ministerio del Interior')
  })
})

describe('normalizeMinisterio — buckets', () => {
  it('todas las Municipalidades caen en bucket único', () => {
    expect(normalizeMinisterio('Municipalidad de Copiapó')).toBe('Municipalidades')
    expect(normalizeMinisterio('Municipalidad de Vallenar')).toBe('Municipalidades')
    expect(normalizeMinisterio('Municipalidad de Alto del Carmen')).toBe('Municipalidades')
  })

  it('SUBDERE y su nombre largo van al mismo bucket', () => {
    expect(normalizeMinisterio('SUBDERE')).toBe('SUBDERE')
    expect(normalizeMinisterio('Subsecretaría de Desarrollo Regional')).toBe('SUBDERE')
    expect(normalizeMinisterio('Subsecretaria de Desarrollo Regional')).toBe('SUBDERE')
  })

  it('null, vacío y "Pendiente" → "Sin asignar"', () => {
    expect(normalizeMinisterio(null)).toBe('Sin asignar')
    expect(normalizeMinisterio(undefined)).toBe('Sin asignar')
    expect(normalizeMinisterio('')).toBe('Sin asignar')
    expect(normalizeMinisterio('   ')).toBe('Sin asignar')
    expect(normalizeMinisterio('Pendiente')).toBe('Sin asignar')
    expect(normalizeMinisterio('pendiente')).toBe('Sin asignar')
  })

  it('texto basura largo (descripción metida en el campo) → "Sin asignar"', () => {
    const basura = 'Ampliación de sala cuna y jardín infantil del Servicio de Salud Metropolitano Norte ubicado en la comuna XYZ'
    expect(normalizeMinisterio(basura)).toBe('Sin asignar')
  })
})

describe('normalizeMinisterio — pass-through para no-matches', () => {
  it('un ministerio desconocido pero plausible se devuelve tal cual (data preservation)', () => {
    expect(normalizeMinisterio('Servicio Nacional del Patrimonio Cultural'))
      .toBe('Servicio Nacional del Patrimonio Cultural')
    expect(normalizeMinisterio('Gobierno Regional')).toBe('Gobierno Regional')
  })
})

describe('splitMinisterio', () => {
  it('null y string vacío → array vacío', () => {
    expect(splitMinisterio(null)).toEqual([])
    expect(splitMinisterio(undefined)).toEqual([])
    expect(splitMinisterio('')).toEqual([])
    expect(splitMinisterio('   ')).toEqual([])
  })

  it('un ministerio → array de uno', () => {
    expect(splitMinisterio('Ministerio de Salud')).toEqual(['Ministerio de Salud'])
  })

  it('separador `;` canónico', () => {
    expect(splitMinisterio('Ministerio de Vivienda y Urbanismo;Ministerio de Obras Públicas'))
      .toEqual(['Ministerio de Vivienda y Urbanismo', 'Ministerio de Obras Públicas'])
  })

  it('tolera espacios alrededor del separador `;`', () => {
    expect(splitMinisterio('A ; B ;C'))
      .toEqual(['A', 'B', 'C'])
  })

  it('separador legacy `, Ministerio` (~2 filas en prod)', () => {
    expect(splitMinisterio('Ministerio de Educación, Ministerio de Obras Públicas'))
      .toEqual(['Ministerio de Educación', 'Ministerio de Obras Públicas'])
  })

  it('NO splitea coma que no precede a "Ministerio"', () => {
    expect(splitMinisterio('Ministerio de Economía, Fomento y Turismo'))
      .toEqual(['Ministerio de Economía, Fomento y Turismo'])
  })
})

describe('composición split + normalize (call-site pattern)', () => {
  it('multi-ministerio canónico normaliza ambos', () => {
    const raw = 'Min. Salud;MINVU'
    const result = splitMinisterio(raw).map(normalizeMinisterio)
    expect(result).toEqual([
      'Ministerio de Salud',
      'Ministerio de Vivienda y Urbanismo',
    ])
  })

  it('multi-ministerio con variantes mixtas converge en canonicos', () => {
    const raw = 'Ministerio de Educacion;Ministerio de Seguridad Pública;Municipalidad de Vallenar'
    const result = splitMinisterio(raw).map(normalizeMinisterio)
    expect(result).toEqual([
      'Ministerio de Educación',
      'Ministerio del Interior',
      'Municipalidades',
    ])
  })

  it('un valor que normaliza a "Sin asignar" se preserva en el array (no se filtra)', () => {
    const raw = 'Pendiente'
    const result = splitMinisterio(raw).map(normalizeMinisterio)
    expect(result).toEqual(['Sin asignar'])
  })
})
