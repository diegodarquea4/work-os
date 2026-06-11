import { describe, it, expect, vi } from 'vitest'
import { safeWrite, safeDelete, safeAuditWrite, DbWriteError } from '@/lib/dbWrite'

/**
 * Tests de lib/dbWrite.ts.
 *
 * Cierra el ciclo de etapa 1 con tests: el helper que detectó el bug
 * del 29-may (RLS bloquea silenciosamente con HTTP 200 + data: []) debe
 * lanzar DbWriteError cuando data.length === 0.
 *
 * No mockeamos @supabase/supabase-js entero — solo el shape mínimo que
 * el helper consume vía PostMutationBuilder (.select(columns) que
 * devuelve { data, error }). Esto refleja exactamente el contrato real.
 */

type FakeBuilder = {
  select: (cols?: string) => Promise<{
    data: unknown[] | null
    error: { message: string; code?: string } | null
  }>
}

function mockBuilder(result: {
  data?: unknown[] | null
  error?: { message: string; code?: string } | null
}): FakeBuilder {
  return {
    select: vi.fn(async () => ({
      data: result.data ?? null,
      error: result.error ?? null,
    })),
  }
}

describe('safeWrite (strict)', () => {
  it('devuelve data cuando data.length >= 1 (caso feliz)', async () => {
    const b = mockBuilder({ data: [{ id: 1 }] })
    const out = await safeWrite(b, 'test feliz')
    expect(out).toEqual([{ id: 1 }])
  })

  it('lanza DbWriteError cuando data está vacío (bug 29-may)', async () => {
    const b = mockBuilder({ data: [] })
    await expect(safeWrite(b, 'test RLS')).rejects.toThrowError(DbWriteError)
    await expect(safeWrite(b, 'test RLS')).rejects.toThrow(/no afectó filas/i)
  })

  it('lanza DbWriteError cuando hay error explícito', async () => {
    const b = mockBuilder({ error: { message: 'PostgrestError: constraint violation' } })
    await expect(safeWrite(b, 'test err')).rejects.toThrowError(DbWriteError)
    await expect(safeWrite(b, 'test err')).rejects.toThrow(/constraint violation/)
  })

  it('lanza DbWriteError cuando data es null', async () => {
    const b = mockBuilder({ data: null })
    await expect(safeWrite(b, 'test null')).rejects.toThrowError(DbWriteError)
  })

  it('expone el error original como cause para extraer codes (23505, 23503, etc)', async () => {
    const b = mockBuilder({ error: { message: 'duplicate', code: '23505' } })
    try {
      await safeWrite(b, 'test code')
      expect.fail('debió lanzar')
    } catch (err) {
      expect(err).toBeInstanceOf(DbWriteError)
      const cause = (err as DbWriteError).cause as { code?: string }
      expect(cause?.code).toBe('23505')
    }
  })
})

describe('safeDelete (idempotent)', () => {
  it('no lanza cuando data es vacío (el row ya no existe es OK)', async () => {
    const b = mockBuilder({ data: [] })
    await expect(safeDelete(b, 'test del idempotent')).resolves.toBeUndefined()
  })

  it('no lanza cuando data tiene filas', async () => {
    const b = mockBuilder({ data: [{ id: 1 }] })
    await expect(safeDelete(b, 'test del feliz')).resolves.toBeUndefined()
  })

  it('lanza cuando hay error explícito', async () => {
    const b = mockBuilder({ error: { message: 'fk violation', code: '23503' } })
    await expect(safeDelete(b, 'test del err')).rejects.toThrowError(DbWriteError)
  })
})

describe('safeAuditWrite (no bloquea)', () => {
  it('no lanza cuando data está vacío (RLS bloqueó el log)', async () => {
    const b = mockBuilder({ data: [] })
    await expect(safeAuditWrite(b, 'test audit vacío')).resolves.toBeUndefined()
  })

  it('no lanza cuando hay error', async () => {
    const b = mockBuilder({ error: { message: 'cualquier cosa' } })
    await expect(safeAuditWrite(b, 'test audit err')).resolves.toBeUndefined()
  })

  it('no lanza cuando el builder rechaza (excepción inesperada)', async () => {
    const b: FakeBuilder = {
      select: vi.fn(async () => { throw new Error('network') }),
    }
    await expect(safeAuditWrite(b, 'test audit throws')).resolves.toBeUndefined()
  })
})
