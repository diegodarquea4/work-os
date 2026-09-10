import { describe, it, expect } from 'vitest'
import {
  estadoCarteraDesdeCatalogo,
  notasDesdeCatalogo,
  filaDesdeCandidato,
  catalogoAvanzo,
  type CandidatoCatalogo,
} from '@/lib/carteraOrigen'

function candidato(over: Partial<CandidatoCatalogo> = {}): CandidatoCatalogo {
  return {
    id: 'seia_2160500180',
    sistema_origen: 'seia',
    nombre: 'Parque Fotovoltaico Tamarugal',
    titular: 'Energía del Norte SpA',
    estado: 'Aprobado',
    tipo: 'Proyectos de desarrollo o explotación energética',
    comuna_nombre: 'Pozo Almonte',
    inversion: 120.5,
    moneda: 'USD_MM',
    fecha_presentacion: '2023-04-18',
    via_ingreso: 'DIA',
    url_ficha: 'https://seia.sea.gob.cl/expediente/ficha.php?id=2160500180',
    synced_at: '2026-09-10T14:00:00.000Z',
    ...over,
  }
}

describe('estadoCarteraDesdeCatalogo', () => {
  it('traduce los tres estados del universo con seguimiento', () => {
    expect(estadoCarteraDesdeCatalogo('Aprobado')).toBe('Aprobado ambientalmente')
    expect(estadoCarteraDesdeCatalogo('En Calificación')).toBe('En calificación (SEIA)')
    expect(estadoCarteraDesdeCatalogo('En Admisión')).toBe('Preliminar')
  })

  it('es indiferente a mayúsculas y espacios de la fuente', () => {
    expect(estadoCarteraDesdeCatalogo('  APROBADO  ')).toBe('Aprobado ambientalmente')
    expect(estadoCarteraDesdeCatalogo('en calificacion')).toBe('En calificación (SEIA)')
  })

  // "Aprobado" en el SEIA significa que tiene RCA, no que se esté
  // construyendo: el catálogo no sabe nada de ejecución y el mapeo no debe
  // fingir que sí.
  it('nunca deduce un estado de ejecución', () => {
    const traducciones = ['Aprobado', 'En Calificación', 'En Admisión']
      .map(estadoCarteraDesdeCatalogo)
    expect(traducciones).not.toContain('En construcción')
    expect(traducciones).not.toContain('Operación')
    expect(traducciones).not.toContain('En pruebas')
  })

  it('deja el campo vacío ante lo que no reconoce, en vez de inventar', () => {
    expect(estadoCarteraDesdeCatalogo('Desistido')).toBeNull()
    expect(estadoCarteraDesdeCatalogo('')).toBeNull()
    expect(estadoCarteraDesdeCatalogo(null)).toBeNull()
    expect(estadoCarteraDesdeCatalogo(undefined)).toBeNull()
  })
})

describe('notasDesdeCatalogo', () => {
  it('recoge lo que no tiene columna propia en la cartera', () => {
    const n = notasDesdeCatalogo(candidato())
    expect(n).toContain('Comuna: Pozo Almonte')
    expect(n).toContain('Vía de ingreso: DIA')
    expect(n).toContain('https://seia.sea.gob.cl/expediente/ficha.php?id=2160500180')
  })

  it('devuelve null si la fuente no aportó nada', () => {
    expect(notasDesdeCatalogo(candidato({
      comuna_nombre: null, tipo: null, via_ingreso: null,
      fecha_presentacion: null, url_ficha: null,
    }))).toBeNull()
  })
})

describe('filaDesdeCandidato', () => {
  it('prellena solo lo que el catálogo puede responder', () => {
    const f = filaDesdeCandidato(candidato(), 'I', 'ana@interior.gob.cl', '2026-09-10T15:00:00.000Z')
    expect(f.nombre).toBe('Parque Fotovoltaico Tamarugal')
    expect(f.region_cod).toBe('I')
    expect(f.inversion_monto).toBe(120.5)
    expect(f.inversion_moneda).toBe('USD_MM')
    expect(f.estado_actual).toBe('Aprobado ambientalmente')
    expect(f.created_by_email).toBe('ana@interior.gob.cl')
  })

  // En el SEIA el titular es quien presenta, financia y opera. Si después se
  // separan, se corrige a mano — pero prellenar ambos ahorra el 100% de los
  // casos normales.
  it('usa el titular para financiamiento y para operación', () => {
    const f = filaDesdeCandidato(candidato(), 'I', null)
    expect(f.fuente_financiamiento).toBe('Energía del Norte SpA')
    expect(f.responsable_operativo).toBe('Energía del Norte SpA')
  })

  it('deja vacío lo que es decisión del comité, no dato de la fuente', () => {
    const f = filaDesdeCandidato(candidato(), 'I', null) as unknown as Record<string, unknown>
    for (const campo of ['plazo', 'seremi_lider', 'mano_obra_directa', 'mano_obra_indirecta', 'kpi', 'meta_2026_2027', 'vida_util_anios']) {
      expect(f[campo]).toBeUndefined()
    }
    expect((f as { priorizado: boolean }).priorizado).toBe(false)
    expect((f as { riesgo: boolean }).riesgo).toBe(false)
  })

  it('guarda el enlace al origen para no duplicar y poder contrastar', () => {
    const f = filaDesdeCandidato(candidato(), 'I', null, '2026-09-10T15:00:00.000Z')
    expect(f.origen_sistema).toBe('seia')
    expect(f.origen_id).toBe('seia_2160500180')
    expect(f.origen_estado_al_importar).toBe('Aprobado')
    expect(f.origen_importado_at).toBe('2026-09-10T15:00:00.000Z')
  })

  it('no inventa moneda cuando no hay monto', () => {
    const f = filaDesdeCandidato(candidato({ inversion: null }), 'I', null)
    expect(f.inversion_monto).toBeNull()
    expect(f.inversion_moneda).toBeNull()
  })
})

describe('catalogoAvanzo', () => {
  it('detecta que el expediente cambió de estado en la fuente', () => {
    expect(catalogoAvanzo('En Calificación', 'Aprobado')).toBe(true)
  })

  it('no se altera por mayúsculas ni espacios', () => {
    expect(catalogoAvanzo('Aprobado', '  aprobado ')).toBe(false)
  })

  // Sin uno de los dos lados no hay comparación posible: avisar sería una
  // alarma falsa sobre proyectos cargados a mano.
  it('calla cuando falta cualquiera de los dos estados', () => {
    expect(catalogoAvanzo(null, 'Aprobado')).toBe(false)
    expect(catalogoAvanzo('Aprobado', null)).toBe(false)
    expect(catalogoAvanzo(null, null)).toBe(false)
  })
})
