import { describe, it, expect } from 'vitest'
import {
  clasificarCompromisosGabinete,
  filasZona3Faltantes,
  panoramaPorEje,
  actaStoragePath,
  puedeCerrar,
  puedeRegenerarActa,
  bloqueosCierreGabineteV2,
  cierreV2Habilitado,
} from '@/lib/sesiones/helpers'
import type { SesionCompromiso } from '@/lib/types'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function comp(over: Partial<SesionCompromiso> & { id: number }): SesionCompromiso {
  return {
    region_cod: '05',
    instancia: 'gabinete',
    eje_id: null,
    sesion_origen_id: 1,
    descripcion: `Compromiso ${over.id}`,
    responsable_institucion: 'DPR',
    responsable_nombre: null,
    plazo: null,
    estado: 'pendiente',
    estado_updated_at: null,
    estado_updated_by_email: null,
    cerrado_en_sesion_id: null,
    prioridad_id: null,
    escalado_a_gabinete: false,
    escalado_at: null,
    escalado_en_sesion_id: null,
    seccion: null,
    proyecto_id: null,
    megaproyecto: null,
    created_at: `2026-07-0${(over.id % 9) + 1}T10:00:00Z`,
    ...over,
  }
}

// ── clasificarCompromisosGabinete (zona 1 del gabinete) ──────────────────────

describe('clasificarCompromisosGabinete', () => {
  it('etiqueta cada lista con su origen', () => {
    const out = clasificarCompromisosGabinete(
      [comp({ id: 1 })],
      [comp({ id: 2, instancia: 'eje', eje_id: 9, escalado_a_gabinete: true })],
      [comp({ id: 3, instancia: 'eje', eje_id: 9 })],
    )
    expect(out.map(c => [c.id, c.origenTipo])).toEqual([
      [1, 'gabinete'], [2, 'escalado'], [3, 'mandato'],
    ])
  })

  it('un mandato luego escalado aparece UNA vez y gana escalado', () => {
    const mandato = comp({ id: 7, instancia: 'eje', eje_id: 9, escalado_a_gabinete: true })
    const out = clasificarCompromisosGabinete([], [mandato], [mandato])
    expect(out).toHaveLength(1)
    expect(out[0].origenTipo).toBe('escalado')
  })

  it('ordena por created_at con id como desempate', () => {
    const out = clasificarCompromisosGabinete(
      [comp({ id: 5, created_at: '2026-07-20T10:00:00Z' })],
      [comp({ id: 2, instancia: 'eje', eje_id: 9, escalado_a_gabinete: true, created_at: '2026-07-10T10:00:00Z' })],
      [comp({ id: 3, instancia: 'eje', eje_id: 9, created_at: '2026-07-10T10:00:00Z' })],
    )
    expect(out.map(c => c.id)).toEqual([2, 3, 5])
  })

  it('listas vacías → []', () => {
    expect(clasificarCompromisosGabinete([], [], [])).toEqual([])
  })
})

// ── filasZona3Faltantes (agenda de la sesión) ────────────────────────────────

describe('filasZona3Faltantes', () => {
  it('devuelve solo las en foco que no están guardadas (protege el UNIQUE)', () => {
    const faltantes = filasZona3Faltantes(
      [{ id: 10 }, { id: 20 }, { id: 30 }],
      [{ prioridad_id: 20 }],
    )
    expect(faltantes).toEqual([10, 30])
  })

  it('una guardada que dejó de estar en foco NO se propone quitar (la agenda manda)', () => {
    // guardada 99 no está en foco — el helper no la toca: sacarla es acción
    // explícita del usuario, no efecto colateral de la precarga.
    const faltantes = filasZona3Faltantes([{ id: 10 }], [{ prioridad_id: 99 }])
    expect(faltantes).toEqual([10])
  })

  it('sin duplicados aunque el pool en foco los traiga', () => {
    expect(filasZona3Faltantes([{ id: 10 }, { id: 10 }], [])).toEqual([10])
  })

  it('todo ya guardado → []', () => {
    expect(filasZona3Faltantes([{ id: 1 }], [{ prioridad_id: 1 }])).toEqual([])
  })
})

// ── panoramaPorEje (bloque 2 / sección III del acta) ─────────────────────────

describe('panoramaPorEje', () => {
  it('agrega semáforos y promedia avance por eje', () => {
    const out = panoramaPorEje([
      { eje: 'Eje 1: Seguridad', estado_semaforo: 'rojo',  pct_avance: 20 },
      { eje: 'Eje 1: Seguridad', estado_semaforo: 'verde', pct_avance: 80 },
      { eje: 'Eje 2: Salud',     estado_semaforo: 'ambar', pct_avance: 55 },
    ])
    expect(out).toHaveLength(2)
    const eje1 = out.find(e => e.eje.startsWith('Eje 1'))!
    expect(eje1).toMatchObject({ rojo: 1, verde: 1, ambar: 0, gris: 0, avgPct: 50, total: 2 })
  })

  it('semáforo desconocido o null cae a gris; pct null cuenta como 0', () => {
    const out = panoramaPorEje([{ eje: 'Eje 1', estado_semaforo: null, pct_avance: null }])
    expect(out[0]).toMatchObject({ gris: 1, avgPct: 0 })
  })

  it('eje vacío cae al bucket "Sin eje"; región vacía → []', () => {
    expect(panoramaPorEje([])).toEqual([])
    const out = panoramaPorEje([{ eje: '  ', estado_semaforo: 'verde', pct_avance: 100 }])
    expect(out[0].eje).toBe('Sin eje')
  })
})

// ── actaStoragePath (invariante de la policy de storage) ─────────────────────

describe('actaStoragePath', () => {
  it('la región es SIEMPRE el primer segmento (policy foldername[1])', () => {
    const comite = actaStoragePath({ id: 12, region_cod: '05', instancia: 'eje', fecha: '2026-07-30' })
    const gabinete = actaStoragePath({ id: 34, region_cod: '05', instancia: 'gabinete', fecha: '2026-07-30' })
    expect(comite.split('/')[0]).toBe('05')
    expect(gabinete.split('/')[0]).toBe('05')
  })

  it('comité mantiene el path histórico; gabinete agrega el segmento /gabinete/', () => {
    expect(actaStoragePath({ id: 12, region_cod: '05', instancia: 'eje', fecha: '2026-07-30' }))
      .toBe('05/12/acta-2026-07-30.pdf')
    expect(actaStoragePath({ id: 34, region_cod: '13', instancia: 'gabinete', fecha: '2026-07-30' }))
      .toBe('13/gabinete/34/acta-2026-07-30.pdf')
  })
})

// ── Guards sobre sesiones de gabinete ────────────────────────────────────────

describe('guards de cierre en instancia gabinete', () => {
  it('puedeCerrar: borrador de gabinete se puede cerrar; cerrada da 409', () => {
    expect(puedeCerrar({ estado: 'borrador', metricas_aplicadas: false, acta_path: null }).ok).toBe(true)
    const r = puedeCerrar({ estado: 'cerrada', metricas_aplicadas: true, acta_path: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
  })

  it('puedeRegenerarActa: el cierre gabinete setea metricas_aplicadas=true aunque no haya métricas — el reintento de acta funciona', () => {
    expect(puedeRegenerarActa({ estado: 'cerrada', metricas_aplicadas: true, acta_path: null }).ok).toBe(true)
    // Si el cierre NO seteara el flag, el reintento quedaría bloqueado en 409:
    const bloqueado = puedeRegenerarActa({ estado: 'cerrada', metricas_aplicadas: false, acta_path: null })
    expect(bloqueado.ok).toBe(false)
  })
})

// ── Regla 2 del cierre v2: puntos con estado + compromisos confirmados ────────

describe('bloqueosCierreGabineteV2 — regla 2 del cierre en 4 movimientos', () => {
  it('sin bloqueos cuando todo punto tiene estado y todo compromiso está confirmado', () => {
    const b = bloqueosCierreGabineteV2(
      [{ titulo: 'PSG', texto: '', estado_cierre: 'tratado' }, { titulo: 'Máfil', texto: '', estado_cierre: 'sin_novedades' }],
      [{ descripcion: 'Informe', confirmado: true }],
    )
    expect(b.puntosSinEstado).toEqual([])
    expect(b.comprSinConfirmar).toEqual([])
    expect(cierreV2Habilitado(b)).toBe(true)
  })

  it('lista los puntos sin estado (usa titulo, cae a texto, luego a "(sin título)")', () => {
    const b = bloqueosCierreGabineteV2(
      [
        { titulo: 'Con estado', texto: '', estado_cierre: 'tratado' },
        { titulo: null, texto: 'Legado sin título nuevo', estado_cierre: null },
        { titulo: '  ', texto: '', estado_cierre: null },
      ],
      [],
    )
    expect(b.puntosSinEstado).toEqual(['Legado sin título nuevo', '(sin título)'])
    expect(cierreV2Habilitado(b)).toBe(false)
  })

  it('lista los compromisos de hoy sin confirmar y bloquea el cierre', () => {
    const b = bloqueosCierreGabineteV2(
      [{ titulo: 'PSG', texto: '', estado_cierre: 'tratado' }],
      [{ descripcion: 'Confirmado', confirmado: true }, { descripcion: 'Sin confirmar', confirmado: false }],
    )
    expect(b.comprSinConfirmar).toEqual(['Sin confirmar'])
    expect(cierreV2Habilitado(b)).toBe(false)
  })
})
