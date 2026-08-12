import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Iniciativa } from '@/lib/projects'
import { getSupabase } from '@/lib/supabase'

// Mock del cliente browser: getSupabase() devuelve un fake configurable por test.
vi.mock('@/lib/supabase', () => ({ getSupabase: vi.fn() }))

import { applyBulkUpdate } from '@/lib/bulkUpdate'

// Estado capturado por el fake para inspeccionar en las aserciones.
const captured = {
  updateChunks: [] as number[][],
  patches: [] as unknown[],
  inserts: [] as unknown[][],
}
// Controla qué devuelve cada `.update().in().select()`.
let updateReturn: (ids: number[]) => { data: { id: number }[] | null; error: { message: string } | null }

function makeFakeSb() {
  return {
    from(_table: string) {
      return {
        update(patch: unknown) {
          captured.patches.push(patch)
          return {
            in(_col: string, ids: number[]) {
              captured.updateChunks.push(ids)
              return { select: (_c?: string) => Promise.resolve(updateReturn(ids)) }
            },
          }
        },
        insert(rows: unknown[]) {
          captured.inserts.push(rows)
          return { select: (_c?: string) => Promise.resolve({ data: rows, error: null }) }
        },
      }
    },
  }
}

function mkTargets(count: number, sem: Iniciativa['estado_semaforo'] = 'verde'): Iniciativa[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    n: 1000 + i,
    estado_semaforo: sem,
  } as Iniciativa))
}

beforeEach(() => {
  captured.updateChunks = []
  captured.patches = []
  captured.inserts = []
  updateReturn = ids => ({ data: ids.map(id => ({ id })), error: null })
  vi.mocked(getSupabase).mockReturnValue(makeFakeSb() as unknown as ReturnType<typeof getSupabase>)
})

describe('applyBulkUpdate', () => {
  it('trocea por 200 y suma todas las filas afectadas', async () => {
    const res = await applyBulkUpdate(mkTargets(450), { en_foco: true }, 'a@b.cl')
    expect(captured.updateChunks.map(c => c.length)).toEqual([200, 200, 50])
    expect(res).toEqual({ ok: 450, sinCambio: 0 })
  })

  it('cuenta como "sin cambio" las filas que RLS no afectó (menos de las pedidas)', async () => {
    // Solo las primeras 3 ids "vuelven" del update → 2 quedaron sin tocar.
    updateReturn = ids => ({ data: ids.slice(0, 3).map(id => ({ id })), error: null })
    const res = await applyBulkUpdate(mkTargets(5), { responsable: 'X' }, null)
    expect(res).toEqual({ ok: 3, sinCambio: 2 })
  })

  it('propaga (throw) si un lote devuelve error (p. ej. trigger 42501)', async () => {
    updateReturn = () => ({ data: null, error: { message: 'permission denied (42501)' } })
    await expect(applyBulkUpdate(mkTargets(3), { capa: 'l' }, null)).rejects.toThrow(/42501/)
  })

  it('audita en semaforo_log solo las filas cuyo estado cambió', async () => {
    // 3 en verde + 1 ya en ambar; patch → ambar. Solo las 3 verdes se auditan.
    const targets = [...mkTargets(3, 'verde'), ...mkTargets(1, 'ambar').map(t => ({ ...t, id: 99, n: 2099 }))]
    await applyBulkUpdate(targets, { estado_semaforo: 'ambar' }, 'a@b.cl')
    const auditRows = captured.inserts.flat() as { campo: string; valor_nuevo: string; valor_anterior: string }[]
    expect(auditRows).toHaveLength(3)
    expect(auditRows.every(r => r.campo === 'semaforo' && r.valor_nuevo === 'ambar' && r.valor_anterior === 'verde')).toBe(true)
  })

  it('no audita cuando el patch no toca el semáforo', async () => {
    await applyBulkUpdate(mkTargets(4), { etapa_actual: 'Ejecución' }, 'a@b.cl')
    expect(captured.inserts).toHaveLength(0)
  })
})
