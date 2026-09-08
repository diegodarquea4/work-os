import { describe, it, expect } from 'vitest'
import * as consola from '@/lib/sesiones/consola'
import {
  railParaSesion,
  resumenAsistencia,
  ordenRecorrido,
  vecinos,
  mismaZona,
  etiquetaZona,
  resumenCierreComite,
  avisosCierreComite,
  type EntradaConsola,
} from '@/lib/sesiones/consola'
import type { SesionComiteValor } from '@/lib/types'

/**
 * El riel es el mapa de la reunión y el cierre es lo último que ve quien
 * genera el acta. Un número mal contado acá no rompe nada: hace que alguien
 * cierre creyendo que Armada reportó cuando no lo hizo. De ahí que los casos
 * sean sobre conteos, orden y numeración, no sobre pintura.
 */

// ── Fixtures mínimos (las entradas son Picks) ────────────────────────────────

const INST = [
  { key: 'carabineros', label: 'Carabineros' },
  { key: 'pdi',         label: 'PDI' },
  { key: 'armada',      label: 'Armada' },
  { key: 'gendarmeria', label: 'Gendarmería' },
  { key: 'sag',         label: 'SAG' },                 // propia de la región
]

const metrica = (id: number, institucion: string, activo = true) => ({ id, institucion, activo })

function valor(metrica_id: number, over: Partial<SesionComiteValor> = {}): SesionComiteValor {
  return { id: metrica_id * 10, sesion_id: 1, metrica_id, valor_num: null, valor_texto: null, observaciones: null, desglose: [], ...over }
}

// Catálogo: Carabineros 3 métricas (una inactiva), PDI 2, Armada 2, Gendarmería 0, SAG 1.
const CATALOGO = [
  metrica(1, 'carabineros'), metrica(2, 'carabineros'), metrica(3, 'carabineros', false),
  metrica(4, 'pdi'), metrica(5, 'pdi'),
  metrica(6, 'armada'), metrica(7, 'armada'),
  metrica(8, 'sag'),
]

function entradaEje(over: Partial<EntradaConsola> = {}): EntradaConsola {
  return {
    instancia: 'eje',
    compAnteriores: [],
    asistencia: { presentes: 0, total: 0 },
    compNuevos: [],
    instituciones: INST,
    catalogo: CATALOGO,
    valores: [],
    comentarios: null,
    ...over,
  }
}

function entradaInfra(over: Partial<EntradaConsola> = {}): EntradaConsola {
  return { instancia: 'infraestructura', compAnteriores: [], asistencia: { presentes: 0, total: 0 }, compNuevos: [], iniciativas: 0, ...over }
}

// ── railParaSesion ───────────────────────────────────────────────────────────

describe('railParaSesion — Policial', () => {
  it('conserva la numeración del modal: 1 · 2 · 3 · (sin número) · 4', () => {
    const rail = railParaSesion(entradaEje())
    expect(rail.map(i => i.key)).toEqual(['anteriores', 'asistencia', 'reporte', 'comentarios', 'nuevos'])
    expect(rail.map(i => i.numero)).toEqual([1, 2, 3, null, 4])
    expect(rail[3].icono).toBe('comentarios')
  })

  it('los sub-ítems del reporte siguen el orden y la cantidad de las instituciones de la región', () => {
    // 5 instituciones, incluida una propia (SAG): no las 4 base hardcodeadas.
    const reporte = railParaSesion(entradaEje()).find(i => i.key === 'reporte')!
    expect(reporte.subitems?.map(s => s.key)).toEqual(['carabineros', 'pdi', 'armada', 'gendarmeria', 'sag'])
  })

  it('cuenta métricas con dato por institución y en el total', () => {
    const rail = railParaSesion(entradaEje({
      valores: [
        valor(1, { valor_num: 12 }),
        valor(4, { valor_texto: 'sin novedades' }),
        valor(3, { valor_num: 99 }),          // métrica INACTIVA: no cuenta
      ],
    }))
    const reporte = rail.find(i => i.key === 'reporte')!
    // 7 activas (la 3 está inactiva): 2 Carabineros + 2 PDI + 2 Armada + 1 SAG.
    expect(reporte.badge).toBe('2/7')
    const porKey = Object.fromEntries(reporte.subitems!.map(s => [s.key, s.badge]))
    expect(porKey).toEqual({ carabineros: '1/2', pdi: '1/2', armada: '0/2', gendarmeria: '0/0', sag: '0/1' })
  })

  it('un valor que solo tiene desglose cuenta como dato', () => {
    const rail = railParaSesion(entradaEje({ valores: [valor(6, { desglose: [{ etiqueta: 'Valparaíso', valor: '3' }] })] }))
    expect(rail.find(i => i.key === 'reporte')!.subitems!.find(s => s.key === 'armada')!.badge).toBe('1/2')
  })

  it('institución sin métricas queda 0/0 y vacía, sin romper el total', () => {
    const gend = railParaSesion(entradaEje()).find(i => i.key === 'reporte')!.subitems!.find(s => s.key === 'gendarmeria')!
    expect(gend.badge).toBe('0/0')
    expect(gend.estado).toBe('vacio')
  })

  it('un sub-ítem está listo solo cuando TODAS sus métricas activas tienen dato', () => {
    const rail = railParaSesion(entradaEje({ valores: [valor(1, { valor_num: 1 }), valor(2, { valor_num: 2 })] }))
    const subs = Object.fromEntries(rail.find(i => i.key === 'reporte')!.subitems!.map(s => [s.key, s.estado]))
    expect(subs.carabineros).toBe('listo')
    expect(subs.pdi).toBe('vacio')
    expect(rail.find(i => i.key === 'reporte')!.estado).toBe('con-actividad')
  })

  it('el reporte completo está listo solo cuando todas las instituciones con métricas lo están', () => {
    const todas = [1, 2, 4, 5, 6, 7, 8].map(id => valor(id, { valor_num: 1 }))
    const rail = railParaSesion(entradaEje({ valores: todas }))
    // Gendarmería no tiene métricas: no puede impedir el ✓.
    expect(rail.find(i => i.key === 'reporte')!.estado).toBe('listo')
  })

  it('compromisos anteriores: vacío, con actividad y listo cuando ninguno sigue pendiente', () => {
    expect(railParaSesion(entradaEje())[0].estado).toBe('vacio')
    expect(railParaSesion(entradaEje({ compAnteriores: [{ estado: 'pendiente' }, { estado: 'cumplido' }] }))[0].estado).toBe('con-actividad')
    expect(railParaSesion(entradaEje({ compAnteriores: [{ estado: 'en_curso' }, { estado: 'cumplido' }] }))[0].estado).toBe('listo')
    expect(railParaSesion(entradaEje({ compAnteriores: [{ estado: 'pendiente' }] }))[0].badge).toBe('1')
  })

  it('asistencia y comentarios reflejan lo registrado', () => {
    const rail = railParaSesion(entradaEje({ asistencia: { presentes: 3, total: 9 }, comentarios: '  hubo quórum ' }))
    expect(rail[1].badge).toBe('3/9')
    expect(rail[1].estado).toBe('con-actividad')
    expect(rail[3].estado).toBe('con-actividad')
    expect(railParaSesion(entradaEje({ comentarios: '   ' }))[3].estado).toBe('vacio')
  })
})

describe('railParaSesion — Infraestructura', () => {
  it('numera 1 · 2 · 3 · 4, sin comentarios ni sub-ítems', () => {
    const rail = railParaSesion(entradaInfra({ iniciativas: 6 }))
    expect(rail.map(i => i.key)).toEqual(['anteriores', 'asistencia', 'iniciativas', 'nuevos'])
    expect(rail.map(i => i.numero)).toEqual([1, 2, 3, 4])
    expect(rail[2].badge).toBe('6')
    expect(rail.every(i => !i.subitems)).toBe(true)
  })
})

// ── resumenAsistencia ────────────────────────────────────────────────────────

describe('resumenAsistencia', () => {
  const nomina = [{ id: 1 }, { id: 2 }, { id: 3 }]

  it('un invitado presente suma en presentes Y en el total', () => {
    const r = resumenAsistencia(nomina, [
      { nomina_id: 1, presente: true },
      { nomina_id: null, presente: true },
    ])
    expect(r).toEqual({ presentes: 2, total: 4 })
  })

  it('miembro de nómina sin fila no está presente; fila con presente=false tampoco', () => {
    const r = resumenAsistencia(nomina, [{ nomina_id: 2, presente: false }])
    expect(r).toEqual({ presentes: 0, total: 3 })
  })
})

// ── Recorrido ────────────────────────────────────────────────────────────────

describe('ordenRecorrido / vecinos / etiquetaZona', () => {
  const railEje = railParaSesion(entradaEje())
  const railInfra = railParaSesion(entradaInfra())

  it('en el Policial se entra institución por institución, no al padre', () => {
    expect(ordenRecorrido(railEje)).toEqual([
      { zona: 'anteriores' }, { zona: 'asistencia' },
      { zona: 'reporte', inst: 'carabineros' }, { zona: 'reporte', inst: 'pdi' }, { zona: 'reporte', inst: 'armada' },
      { zona: 'reporte', inst: 'gendarmeria' }, { zona: 'reporte', inst: 'sag' },
      { zona: 'comentarios' }, { zona: 'nuevos' },
    ])
  })

  it('desde Asistencia el siguiente es la primera institución; desde la última, Comentarios', () => {
    expect(vecinos(railEje, { zona: 'asistencia' }).siguiente).toEqual({ zona: 'reporte', inst: 'carabineros' })
    expect(vecinos(railEje, { zona: 'reporte', inst: 'sag' }).siguiente).toEqual({ zona: 'comentarios' })
    expect(vecinos(railEje, { zona: 'reporte', inst: 'pdi' })).toEqual({
      anterior: { zona: 'reporte', inst: 'carabineros' }, siguiente: { zona: 'reporte', inst: 'armada' },
    })
  })

  it('los extremos no tienen vecino', () => {
    expect(vecinos(railEje, { zona: 'anteriores' }).anterior).toBeNull()
    expect(vecinos(railEje, { zona: 'nuevos' }).siguiente).toBeNull()
  })

  it('pararse en el padre del reporte equivale a su primera institución', () => {
    expect(vecinos(railEje, { zona: 'reporte' }).anterior).toEqual({ zona: 'asistencia' })
  })

  it('en Infraestructura el recorrido es plano', () => {
    expect(vecinos(railInfra, { zona: 'asistencia' }).siguiente).toEqual({ zona: 'iniciativas' })
  })

  it('reporte sin instituciones entra como zona plana (defensivo)', () => {
    const rail = railParaSesion(entradaEje({ instituciones: [] }))
    expect(ordenRecorrido(rail).filter(r => r.zona === 'reporte')).toEqual([{ zona: 'reporte' }])
  })

  it('mismaZona distingue institución y trata undefined como "sin institución"', () => {
    expect(mismaZona({ zona: 'reporte', inst: 'pdi' }, { zona: 'reporte', inst: 'pdi' })).toBe(true)
    expect(mismaZona({ zona: 'reporte', inst: 'pdi' }, { zona: 'reporte' })).toBe(false)
    expect(mismaZona({ zona: 'nuevos' }, { zona: 'nuevos', inst: undefined })).toBe(true)
  })

  it('las etiquetas de navegación son cortas y legibles', () => {
    expect(etiquetaZona(railEje, { zona: 'asistencia' })).toBe('Asistencia')
    expect(etiquetaZona(railEje, { zona: 'reporte', inst: 'pdi' })).toBe('Reporte · PDI')
  })
})

// ── Cierre ───────────────────────────────────────────────────────────────────

describe('resumenCierreComite', () => {
  it('cuenta compromisos anteriores por estado y los nuevos escalados', () => {
    const r = resumenCierreComite(entradaEje({
      compAnteriores: [{ estado: 'pendiente' }, { estado: 'en_curso' }, { estado: 'cumplido' }, { estado: 'cumplido' }],
      compNuevos: [{ escalado_a_gabinete: true }, { escalado_a_gabinete: false }],
    }))
    expect(r.anteriores).toEqual({ total: 4, cumplidos: 2, enCurso: 1, pendientes: 1 })
    expect(r.nuevos).toEqual({ total: 2, escalados: 1 })
  })

  it('resume el reporte por institución con los mismos conteos del riel', () => {
    const r = resumenCierreComite(entradaEje({ valores: [valor(1, { valor_num: 5 })] }))
    expect(r.instituciones.find(i => i.key === 'carabineros')).toEqual({ key: 'carabineros', label: 'Carabineros', conDato: 1, total: 2 })
    expect(r.iniciativas).toBe(0)
  })

  it('en Infraestructura no hay instituciones y sí iniciativas', () => {
    const r = resumenCierreComite(entradaInfra({ iniciativas: 4 }))
    expect(r.instituciones).toEqual([])
    expect(r.iniciativas).toBe(4)
  })
})

describe('avisosCierreComite — solo texto, nunca bloquea', () => {
  it('todas las instituciones vacías → UN aviso global, no uno por institución', () => {
    const r = resumenCierreComite(entradaEje())
    expect(avisosCierreComite(r, 'eje')).toContain('No se registró ningún dato en el reporte por institución')
    expect(avisosCierreComite(r, 'eje').filter(a => a.includes('sin datos'))).toHaveLength(0)
  })

  it('una institución vacía → aviso con su nombre; las que no tienen catálogo no avisan', () => {
    const r = resumenCierreComite(entradaEje({ valores: [1, 2, 4, 5, 8].map(id => valor(id, { valor_num: 1 })) }))
    const avisos = avisosCierreComite(r, 'eje')
    expect(avisos).toContain('Armada sin datos esta semana')
    expect(avisos.some(a => a.startsWith('Gendarmería'))).toBe(false)
  })

  it('singular y plural de los compromisos anteriores abiertos', () => {
    const uno = resumenCierreComite(entradaEje({ compAnteriores: [{ estado: 'en_curso' }] }))
    const tres = resumenCierreComite(entradaEje({ compAnteriores: [{ estado: 'pendiente' }, { estado: 'pendiente' }, { estado: 'en_curso' }, { estado: 'cumplido' }] }))
    expect(avisosCierreComite(uno, 'eje')).toContain('1 compromiso anterior sigue pendiente')
    expect(avisosCierreComite(tres, 'eje')).toContain('3 compromisos anteriores siguen pendientes')
  })

  it('asistencia en cero avisa; con presentes no', () => {
    expect(avisosCierreComite(resumenCierreComite(entradaEje()), 'eje')).toContain('Sin asistencia registrada')
    expect(avisosCierreComite(resumenCierreComite(entradaEje({ asistencia: { presentes: 2, total: 5 } })), 'eje'))
      .not.toContain('Sin asistencia registrada')
  })

  it('Infraestructura avisa por agenda vacía', () => {
    expect(avisosCierreComite(resumenCierreComite(entradaInfra()), 'infraestructura')).toContain('Sin iniciativas en la agenda')
    expect(avisosCierreComite(resumenCierreComite(entradaInfra({ iniciativas: 2 })), 'infraestructura'))
      .not.toContain('Sin iniciativas en la agenda')
  })

  it('el módulo no exporta ningún bloqueo y no lanza con entradas vacías', () => {
    // Guardia de diseño: el cierre del comité NO agrega requisitos (decisión
    // explícita). Si alguien exporta un `puedeGenerar` acá, este test lo delata.
    expect(Object.keys(consola).some(k => /puede|bloqueo/i.test(k))).toBe(false)
    expect(() => avisosCierreComite(resumenCierreComite(entradaEje({ instituciones: [], catalogo: [], valores: [] })), 'eje')).not.toThrow()
  })
})
