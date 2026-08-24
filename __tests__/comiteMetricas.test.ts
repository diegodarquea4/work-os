import { describe, it, expect } from 'vitest'
import {
  agruparPorInstitucion,
  formatoValorComite,
  tieneValorComite,
  deltaPulso,
  slugifyInstitucion,
  reconciliarAdopcion,
  COMITE_INSTITUCIONES,
} from '@/lib/sesiones/helpers'
import type { ComiteMetrica, SesionComiteValor } from '@/lib/types'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function metrica(over: Partial<ComiteMetrica> & { id: number }): ComiteMetrica {
  return {
    region_cod: 'V',
    institucion: 'carabineros',
    nombre: `Métrica ${over.id}`,
    tipo: 'numerico',
    unidad: null,
    orden: 0,
    activo: true,
    estandar_id: null,
    origen: 'propia',
    ...over,
  }
}

function valor(over: Partial<SesionComiteValor> & { id: number; metrica_id: number }): SesionComiteValor {
  return {
    sesion_id: 1,
    valor_num: null,
    valor_texto: null,
    observaciones: null,
    desglose: [],
    ...over,
  }
}

// ── agruparPorInstitucion ────────────────────────────────────────────────────

describe('agruparPorInstitucion', () => {
  it('devuelve las 4 instituciones fijas en orden', () => {
    const grupos = agruparPorInstitucion([], [])
    expect(grupos.map(g => g.institucion)).toEqual(['carabineros', 'pdi', 'armada', 'gendarmeria'])
  })

  it('respeta el orden del catálogo y adjunta el valor (o null)', () => {
    const cat = [
      metrica({ id: 2, orden: 2 }),
      metrica({ id: 1, orden: 1 }),
      metrica({ id: 3, institucion: 'pdi', orden: 1 }),
    ]
    const vals = [valor({ id: 10, metrica_id: 1, valor_num: 42 })]
    const grupos = agruparPorInstitucion(cat, vals)
    const carab = grupos.find(g => g.institucion === 'carabineros')!
    expect(carab.filas.map(f => f.metrica.id)).toEqual([1, 2]) // orden 1 antes que 2
    expect(carab.filas[0].valor?.valor_num).toBe(42)
    expect(carab.filas[1].valor).toBeNull() // sin valor → fila presente para digitar
    expect(grupos.find(g => g.institucion === 'pdi')!.filas).toHaveLength(1)
    expect(grupos.find(g => g.institucion === 'armada')!.filas).toEqual([])
  })

  it('excluye métricas inactivas', () => {
    const cat = [metrica({ id: 1 }), metrica({ id: 2, activo: false })]
    const carab = agruparPorInstitucion(cat, [])[0]
    expect(carab.filas.map(f => f.metrica.id)).toEqual([1])
  })

  it('soloConValor=true filtra las filas sin dato (para el acta)', () => {
    const cat = [metrica({ id: 1, orden: 1 }), metrica({ id: 2, orden: 2 })]
    const vals = [valor({ id: 10, metrica_id: 1, valor_num: 5 })]
    const carab = agruparPorInstitucion(cat, vals, true)[0]
    expect(carab.filas.map(f => f.metrica.id)).toEqual([1])
  })

  it('acepta una lista de instituciones dinámica (mig 078) e incluye las custom', () => {
    const cat = [
      metrica({ id: 1, institucion: 'carabineros' }),
      metrica({ id: 2, institucion: 'fiscalia' }),
    ]
    const insts = [
      { key: 'carabineros', label: 'Carabineros' },
      { key: 'fiscalia', label: 'Fiscalía' },
    ]
    const grupos = agruparPorInstitucion(cat, [], false, insts)
    expect(grupos.map(g => g.label)).toEqual(['Carabineros', 'Fiscalía'])
    expect(grupos.find(g => g.institucion === 'fiscalia')!.filas.map(f => f.metrica.id)).toEqual([2])
  })

  it('con lista dinámica, una métrica de institución fuera de la lista no aparece', () => {
    const cat = [metrica({ id: 9, institucion: 'pdi' })]
    const grupos = agruparPorInstitucion(cat, [], false, [{ key: 'carabineros', label: 'Carabineros' }])
    expect(grupos.flatMap(g => g.filas)).toHaveLength(0)
  })
})

// ── slugifyInstitucion (mig 078) ─────────────────────────────────────────────

describe('slugifyInstitucion', () => {
  it('sin acentos, minúscula, espacios/signos → _', () => {
    expect(slugifyInstitucion('Fiscalía Regional', [])).toBe('fiscalia_regional')
    expect(slugifyInstitucion('SENDA', [])).toBe('senda')
    expect(slugifyInstitucion('  Municipalidad  ', [])).toBe('municipalidad')
  })
  it('colapsa separadores y recorta bordes', () => {
    expect(slugifyInstitucion('P.D.I. — Zona', [])).toBe('p_d_i_zona')
  })
  it('uniquifica frente a claves existentes', () => {
    expect(slugifyInstitucion('Fiscalía', ['fiscalia'])).toBe('fiscalia_2')
    expect(slugifyInstitucion('Fiscalía', ['fiscalia', 'fiscalia_2'])).toBe('fiscalia_3')
  })
  it('nombre sin alfanuméricos → institucion', () => {
    expect(slugifyInstitucion('—', [])).toBe('institucion')
  })
})

// ── reconciliarAdopcion (mig 079) ────────────────────────────────────────────

describe('reconciliarAdopcion', () => {
  it('estándar sin fila → no adoptado, sin ids (se insertaría)', () => {
    const [r] = reconciliarAdopcion([1], [])
    expect(r).toEqual({ estandarId: 1, adoptado: false, reactivarId: null, filaActivaId: null })
  })
  it('fila activa → adoptado, con filaActivaId (desmarcar)', () => {
    const [r] = reconciliarAdopcion([1], [{ id: 50, estandar_id: 1, activo: true }])
    expect(r.adoptado).toBe(true)
    expect(r.filaActivaId).toBe(50)
    expect(r.reactivarId).toBeNull()
  })
  it('fila inactiva → no adoptado, con reactivarId (reactivar en vez de insertar)', () => {
    const [r] = reconciliarAdopcion([1], [{ id: 50, estandar_id: 1, activo: false }])
    expect(r.adoptado).toBe(false)
    expect(r.reactivarId).toBe(50)
    expect(r.filaActivaId).toBeNull()
  })
  it('ignora filas sin estandar_id (métricas propias)', () => {
    const [r] = reconciliarAdopcion([1], [{ id: 7, estandar_id: null, activo: true }])
    expect(r.adoptado).toBe(false)
  })
})

// ── tieneValorComite ─────────────────────────────────────────────────────────

describe('tieneValorComite', () => {
  it('null / fila vacía → false', () => {
    expect(tieneValorComite(null)).toBe(false)
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1 }))).toBe(false)
  })
  it('detecta número, texto, observación o desglose', () => {
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1, valor_num: 0 }))).toBe(true) // 0 es un dato
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1, valor_texto: 'algo' }))).toBe(true)
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1, valor_texto: '   ' }))).toBe(false)
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1, observaciones: 'año a la fecha' }))).toBe(true)
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1, desglose: [{ etiqueta: 'V', valor: '20%' }] }))).toBe(true)
  })
})

// ── formatoValorComite ───────────────────────────────────────────────────────

describe('formatoValorComite', () => {
  it('numérico con y sin unidad', () => {
    const m = metrica({ id: 1, tipo: 'numerico', unidad: 'detenidos' })
    expect(formatoValorComite(valor({ id: 1, metrica_id: 1, valor_num: 833 }), m)).toBe('833 detenidos')
    const mSin = metrica({ id: 1, tipo: 'numerico', unidad: null })
    expect(formatoValorComite(valor({ id: 1, metrica_id: 1, valor_num: 2236 }), mSin)).toBe('2.236')
  })
  it('texto usa valor_texto; vacío → —', () => {
    const m = metrica({ id: 1, tipo: 'texto' })
    expect(formatoValorComite(valor({ id: 1, metrica_id: 1, valor_texto: 'Allanamiento OS7' }), m)).toBe('Allanamiento OS7')
    expect(formatoValorComite(null, m)).toBe('—')
    const mNum = metrica({ id: 1, tipo: 'numerico' })
    expect(formatoValorComite(null, mNum)).toBe('—')
    expect(formatoValorComite(valor({ id: 1, metrica_id: 1 }), mNum)).toBe('—')
  })
})

// ── deltaPulso reutilizado sobre la serie WoW por institución ────────────────

describe('deltaPulso (WoW del reporte por institución)', () => {
  it('delta absoluto y % entre las dos últimas semanas', () => {
    expect(deltaPulso(40, 44)).toEqual({ abs: 4, pct: 10 })
  })
  it('sin semana anterior → null (primera medición)', () => {
    expect(deltaPulso(null, 44)).toBeNull()
  })
  it('semana anterior 0 → pct null, delta absoluto igual', () => {
    expect(deltaPulso(0, 3)).toEqual({ abs: 3, pct: null })
  })
})

describe('COMITE_INSTITUCIONES', () => {
  it('son 4 con label legible', () => {
    expect(COMITE_INSTITUCIONES).toHaveLength(4)
    expect(COMITE_INSTITUCIONES.find(i => i.key === 'pdi')?.label).toBe('PDI')
  })
})
