import { describe, it, expect } from 'vitest'
import { capsMatchMirror } from '@/lib/capabilities'
import { capabilitiesForProfile } from '@/lib/permissions'

/**
 * `capsMatchMirror` decide si es seguro re-sembrar capacidades en un cambio de
 * rol: true solo cuando las caps actuales son EXACTAMENTE el espejo del rol.
 * Vacío, error o cualquier divergencia → false (no pisar lo personalizado).
 */

type Row = { capability_key: string; region_cod: string }

// Stub del cliente service-role: solo implementa el chain
// db.from(...).select(...).eq(...) que usa capsMatchMirror.
function stubDb(data: Row[] | null, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: async () => ({ data, error }),
      }),
    }),
  } as unknown as Parameters<typeof capsMatchMirror>[0]
}

const viewerI = { role: 'viewer' as const, region_cods: ['I'] }
const mirrorRows: Row[] = capabilitiesForProfile(viewerI).map(c => ({
  capability_key: c.key,
  region_cod: c.region,
}))

describe('capsMatchMirror', () => {
  it('true cuando las caps son exactamente el espejo del rol', async () => {
    expect(await capsMatchMirror(stubDb(mirrorRows), 'u1', viewerI)).toBe(true)
  })

  it('false si falta una capacidad del espejo (personalizado: revocado)', async () => {
    expect(await capsMatchMirror(stubDb(mirrorRows.slice(1)), 'u1', viewerI)).toBe(false)
  })

  it('false si hay una capacidad de más (personalizado: concedido)', async () => {
    const extra = [...mirrorRows, { capability_key: 'prego.editar', region_cod: '*' }]
    expect(await capsMatchMirror(stubDb(extra), 'u1', viewerI)).toBe(false)
  })

  it('false si el usuario no tiene caps (vacío ⇒ no re-sembrar a ciegas)', async () => {
    expect(await capsMatchMirror(stubDb([]), 'u1', viewerI)).toBe(false)
  })

  it('false ante error de lectura (incertidumbre ⇒ no pisar)', async () => {
    expect(await capsMatchMirror(stubDb(null, { message: 'boom' }), 'u1', viewerI)).toBe(false)
  })

  it('false si las regiones no coinciden (misma clave, otra región)', async () => {
    const otraRegion = mirrorRows.map(r =>
      r.region_cod === 'I' ? { ...r, region_cod: 'II' } : r,
    )
    expect(await capsMatchMirror(stubDb(otraRegion), 'u1', viewerI)).toBe(false)
  })
})
