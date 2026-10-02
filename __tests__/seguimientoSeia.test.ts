import { describe, it, expect } from 'vitest'
import {
  filaDeOrganismo, estadoEn, prepararOficios, armarMatriz, agruparPorProyecto, medirRegion,
  regionesSinSesionar, fechasDeCorte, evaluacionDelCorte, selloDeActualizacion, fechaSinPendientes, claveCelda,
  type OficioFila,
} from '@/lib/seguimientoSeia'

const HOY = '2026-10-01'
const dia = (iso: string) => iso.slice(0, 10)

function fila(p: Partial<OficioFila>): OficioFila {
  return {
    id: 1, id_expediente: 100, nombre_proyecto: 'Proyecto', ministerio: 'MOP',
    oaeca_sea: 'DOH, Región de Atacama', oaeca_nombre: null, tipo_oficio: 'Solicitud de Adenda',
    fecha_limite: '2026-09-25', fecha_oficio: '2026-09-01', url_oficio: null, url_proyecto: null,
    region_cod: 'III', proyecto_privado_id: null, estado: 'pendiente', estado_updated_at: null,
    importado_at: '2026-09-30T12:00:00Z', ...p,
  }
}

describe('filaDeOrganismo', () => {
  it('el municipio va a la región del proyecto, aunque su nombre nombre otra', () => {
    expect(filaDeOrganismo('Ilustre Municipalidad de Arica', 'XV')).toBe('XV')
    expect(filaDeOrganismo('Ilustre Municipalidad de Antofagasta', 'III')).toBe('III')
  })
  it('los zonales son Interregional', () => {
    expect(filaDeOrganismo('SERNAGEOMIN, Zona Sur', 'IX')).toBe('INTER')
    expect(filaDeOrganismo('CONADI, Subdirección Nacional Norte', 'II')).toBe('INTER')
  })
  it('lee la región del nombre, con y sin tildes ni la palabra «Región»', () => {
    expect(filaDeOrganismo('SEREMI de Salud, Región del Biobío', 'VIII')).toBe('VIII')
    expect(filaDeOrganismo('Servicio de Biodiversidad y Áreas Protegidas OHiggins', 'VI')).toBe('VI')
    expect(filaDeOrganismo('Servicio de Vivienda y Urbanización SERVIU, RM', 'RM')).toBe('RM')
    expect(filaDeOrganismo('Gobernación Marítima de Valparaíso', 'V')).toBe('V')
  })
  it('un regional sin región en el nombre va a la del proyecto; el resto es Nacional', () => {
    expect(filaDeOrganismo('Secretaría Regional Ministerial de Minería', 'II')).toBe('II')
    expect(filaDeOrganismo('Consejo de Monumentos Nacionales', 'III')).toBe('NAC')
    expect(filaDeOrganismo('Superintendencia de Servicios Sanitarios', 'VI')).toBe('NAC')
  })
})

describe('estadoEn', () => {
  it('vencido, pendiente (≤ 15 días) o fuera del tablero', () => {
    expect(estadoEn('2026-09-25', null, HOY)).toMatchObject({ estado: 'v', dias: 6 })
    expect(estadoEn('2026-10-01', null, HOY)).toMatchObject({ estado: 'p', dias: 0 })
    expect(estadoEn('2026-10-16', null, HOY)).toMatchObject({ estado: 'p' })
    expect(estadoEn('2026-10-17', null, HOY)).toMatchObject({ estado: null, excluido: false })
  })
  it('más de un año de atraso queda fuera y marcado como excluido', () => {
    expect(estadoEn('2025-10-01', null, HOY)).toMatchObject({ estado: 'v', dias: 365 })
    expect(estadoEn('2025-09-30', null, HOY)).toMatchObject({ estado: null, excluido: true })
  })
  it('resuelto antes o en la fecha no cuenta; resuelto después sí', () => {
    expect(estadoEn('2026-09-25', '2026-09-30', HOY).estado).toBeNull()
    expect(estadoEn('2026-09-25', '2026-10-05', HOY).estado).toBe('v')
  })
})

describe('matriz y detalle', () => {
  const oficios = prepararOficios([
    fila({ id: 1 }),
    fila({ id: 2, oaeca_sea: 'Consejo de Monumentos Nacionales', ministerio: 'Culturas', fecha_limite: '2026-10-05' }),
    fila({ id: 3, id_expediente: 200, oaeca_sea: 'Ilustre Municipalidad de Copiapó', ministerio: 'Independientes', fecha_limite: '2026-10-03' }),
    fila({ id: 4, estado: 'resuelto', estado_updated_at: '2026-09-29T15:00:00Z' }),
    fila({ id: 5, fecha_limite: '2022-09-15' }),
  ], HOY, dia)

  it('cuenta vencidos y pendientes por cruce; deja fuera resueltos y los de más de un año', () => {
    const m = armarMatriz(oficios)
    expect(m.total).toEqual({ v: 1, p: 2 })
    expect(m.celdas.get(claveCelda('III', 'MOP'))).toEqual({ v: 1, p: 0 })
    expect(m.celdas.get(claveCelda('NAC', 'Culturas'))).toEqual({ v: 0, p: 1 })
    expect(m.celdas.get(claveCelda('III', 'Independientes'))).toEqual({ v: 0, p: 1 })
  })

  it('agrupa por proyecto, con lo vencido arriba', () => {
    const g = agruparPorProyecto(oficios.filter(o => o.estado))
    expect(g.map(x => x.expediente)).toEqual(['100', '200'])
    expect(g[0]).toMatchObject({ vencidos: 1, pendientes: 1 })
    expect(g[0].organismos[0].nombre).toBe('DOH, Región de Atacama')
  })
})

describe('medirRegion', () => {
  const oficios = prepararOficios([
    fila({ id: 1, fecha_limite: '2026-09-21' }),                                              // 10 días
    fila({ id: 2, fecha_limite: '2026-09-29' }),                                              // 2 días
    fila({ id: 3, fecha_limite: '2026-10-10' }),                                              // pendiente
    fila({ id: 4, fecha_limite: '2026-09-20', estado: 'resuelto', estado_updated_at: '2026-09-28T12:00:00Z' }),
    fila({ id: 5, fecha_limite: '2022-09-15', fecha_oficio: '2022-08-25' }),                  // fuera
  ], HOY, dia)
  const datos = {
    oficios,
    sesiones: [{ region: 'III', fecha: '2026-09-24' }, { region: 'III', fecha: '2026-08-10' }],
    cartera: [{ region: 'III', creado: '2026-09-15' }],
    conDatos: new Set(['III']),
  }

  it('hoy: gestionados sin el excluido, % y atraso promedio', () => {
    expect(medirRegion('III', HOY, datos)).toEqual({
      sesiones: 2, ultimoComite: '2026-09-24', cartera: 1,
      gestionados: 4, vencidos: 2, pendientes: 1, pctVencidos: 0.5, atrasoPromedio: 6,
    })
  })

  it('en una fecha pasada reconstruye: lo resuelto después todavía estaba vencido', () => {
    const m = medirRegion('III', '2026-09-25', datos)
    expect(m).toMatchObject({ sesiones: 2, cartera: 1, vencidos: 2, pendientes: 2 })
  })

  it('una región sin oficios que medir da null, no cero', () => {
    expect(medirRegion('XI', HOY, datos)).toMatchObject({ gestionados: null, vencidos: null, sesiones: 0 })
  })

  it('cuenta las regiones sin sesionar en 15 días o nunca', () => {
    const ms = ['III', 'XI'].map(r => medirRegion(r, HOY, datos))
    expect(regionesSinSesionar(ms, HOY)).toBe(1)
    expect(regionesSinSesionar(ms, '2026-10-20')).toBe(2)
  })
})

describe('evolutivo', () => {
  it('reparte las fechas parejo, ambas puntas incluidas', () => {
    expect(fechasDeCorte('2026-06-23', '2026-10-01', 6))
      .toEqual(['2026-06-23', '2026-07-13', '2026-08-02', '2026-08-22', '2026-09-11', '2026-10-01'])
    expect(fechasDeCorte('2026-09-29', '2026-10-01', 10)).toHaveLength(3)
    expect(fechasDeCorte('2026-10-01', '2026-10-01', 4)).toEqual(['2026-10-01'])
  })

  it('cada corte vale por la última sesión del tramo, o por el corte mismo', () => {
    const cortes = ['2026-09-01', '2026-09-21', '2026-10-11']
    const ses = [{ region: 'X', fecha: '2026-09-14' }, { region: 'X', fecha: '2026-09-16' }]
    expect(evaluacionDelCorte(ses, cortes, 1)).toEqual({ en: '2026-09-16', esSesion: true })
    expect(evaluacionDelCorte(ses, cortes, 2)).toEqual({ en: '2026-10-11', esSesion: false })
    expect(evaluacionDelCorte(ses, cortes, 0)).toEqual({ en: '2026-09-01', esSesion: false })
  })
})

describe('selloDeActualizacion', () => {
  it('muestra la más antigua, separa las que no tienen proyectos y lista las atrasadas', () => {
    const s = selloDeActualizacion(['X', 'XVI', 'XI'], { X: '2026-10-01', XVI: '2026-09-29' }, HOY)
    expect(s).toEqual({ fecha: '2026-09-29', sinProyectos: ['XI'], atrasadas: ['XVI'] })
  })
  it('el botón actualiza lo que diga `refrescable`, no lo que tenga fecha vieja', () => {
    const s = selloDeActualizacion(['X', 'XVI'], { X: '2026-09-28', XVI: '2026-09-29' }, HOY, new Set(), r => r === 'XVI')
    expect(s.atrasadas).toEqual(['XVI'])
    expect(s.fecha).toBe('2026-09-28')
  })
  it('una región vinculada al SEIA sin oficios está en cero, no «sin proyectos»', () => {
    const s = selloDeActualizacion(['X', 'XVI'], { X: '2026-10-01' }, HOY, new Set(['XVI']))
    expect(s).toEqual({ fecha: '2026-10-01', sinProyectos: [], atrasadas: [] })
  })
})

describe('fecha de una región sin oficios pendientes', () => {
  it('vale la corrida completa más reciente, la suya o la nacional', () => {
    expect(fechaSinPendientes({ '*': '2026-10-01', XVI: '2026-10-02' }, 'XVI')).toBe('2026-10-02')
    expect(fechaSinPendientes({ '*': '2026-10-02', XVI: '2026-09-30' }, 'XVI')).toBe('2026-10-02')
    expect(fechaSinPendientes({ '*': '2026-10-01' }, 'XI')).toBe('2026-10-01')
  })
  it('sin ninguna corrida completa no hay fecha', () => {
    expect(fechaSinPendientes({}, 'XI')).toBeNull()
    expect(fechaSinPendientes(undefined, 'XI')).toBeNull()
  })
})
