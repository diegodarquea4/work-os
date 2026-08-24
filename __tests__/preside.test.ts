import { describe, it, expect } from 'vitest'
import { presideLabel, presideResuelto } from '@/lib/sesiones/preside'

// ── presideLabel (mig 077) ───────────────────────────────────────────────────

describe('presideLabel', () => {
  it('nombre + cargo → "Nombre · Cargo"', () => {
    expect(presideLabel('María Pérez', 'Delegada Presidencial')).toBe('María Pérez · Delegada Presidencial')
  })
  it('sin cargo → solo nombre', () => {
    expect(presideLabel('María Pérez', null)).toBe('María Pérez')
    expect(presideLabel('María Pérez', '   ')).toBe('María Pérez')
  })
  it('recorta espacios', () => {
    expect(presideLabel('  Ana  ', '  Jefa  ')).toBe('Ana · Jefa')
  })
})

// ── presideResuelto — precedencia nómina > fallback por email ─────────────────

describe('presideResuelto', () => {
  it('hay persona marcada preside → gana sobre el email', () => {
    expect(presideResuelto({ nombre: 'Ana Soto', cargo: 'DPR' }, 'quien@cierra.cl')).toBe('Ana Soto · DPR')
  })
  it('sin persona marcada → cae al fallback (email)', () => {
    expect(presideResuelto(null, 'quien@cierra.cl')).toBe('quien@cierra.cl')
  })
  it('persona con nombre en blanco → cae al fallback', () => {
    expect(presideResuelto({ nombre: '   ', cargo: 'DPR' }, 'quien@cierra.cl')).toBe('quien@cierra.cl')
  })
  it('sin persona y sin fallback → null', () => {
    expect(presideResuelto(null, null)).toBeNull()
  })
})
