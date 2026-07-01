import { describe, it, expect } from 'vitest'
import {
  carteraPdfSchema,
  minutaPostSchema,
  adminUsersPostSchema,
  desalojoDetallePatchSchema,
} from '@/lib/schemas'

/**
 * Tests de lib/schemas/index.ts.
 *
 * Por cada schema: 1 caso happy (input válido pasa) + 1+ casos malos
 * (input inválido falla). Cubre el hallazgo 5.3 de la auditoría: el
 * 400 con detalle.issues debe surgir para body mal-formado.
 */

describe('carteraPdfSchema', () => {
  it('acepta body válido con region.cod + soloEnFoco + fecha', () => {
    const r = carteraPdfSchema.safeParse({
      region: { cod: 'XV', nombre: 'Arica y Parinacota' },
      soloEnFoco: true,
      fecha: '2026-06-11',
    })
    expect(r.success).toBe(true)
  })

  it('rechaza fecha sin formato YYYY-MM-DD', () => {
    const r = carteraPdfSchema.safeParse({
      region: { cod: 'XV' },
      soloEnFoco: false,
      fecha: '11-06-2026',  // DD-MM-YYYY → inválido
    })
    expect(r.success).toBe(false)
  })

  it('rechaza region.cod con minúsculas', () => {
    const r = carteraPdfSchema.safeParse({
      region: { cod: 'xv' },
      soloEnFoco: false,
      fecha: '2026-06-11',
    })
    expect(r.success).toBe(false)
  })

  it('rechaza body sin soloEnFoco', () => {
    const r = carteraPdfSchema.safeParse({
      region: { cod: 'II' },
      fecha: '2026-06-11',
    })
    expect(r.success).toBe(false)
  })
})

describe('minutaPostSchema', () => {
  it('acepta body válido con tipo y force defaulteados', () => {
    const r = minutaPostSchema.safeParse({
      region: { cod: 'RM', nombre: 'Metropolitana' },
      fecha: '2026-06-11',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.tipo).toBe('ejecutiva')
      expect(r.data.force).toBe(false)
    }
  })

  it('acepta tipo "ejecutiva"', () => {
    const r = minutaPostSchema.safeParse({
      region: { cod: 'RM', nombre: 'Metropolitana' },
      fecha: '2026-06-11',
      tipo: 'ejecutiva',
    })
    expect(r.success).toBe(true)
  })

  // Regresión — la fecha en minuta es un string de display para el header del
  // PDF ("Julio 2026"), NO una fecha ISO. Apretarla a YYYY-MM-DD rompe el
  // handler del cliente (bug reportado 2026-07-01, "Solicitud inválida" 400).
  it('acepta fecha en formato display "Julio 2026"', () => {
    const r = minutaPostSchema.safeParse({
      region: { cod: 'RM', nombre: 'Metropolitana' },
      fecha: 'Julio 2026',
    })
    expect(r.success).toBe(true)
  })

  it('rechaza fecha vacía', () => {
    const r = minutaPostSchema.safeParse({
      region: { cod: 'RM', nombre: 'Metropolitana' },
      fecha: '',
    })
    expect(r.success).toBe(false)
  })

  it('rechaza tipo desconocido', () => {
    const r = minutaPostSchema.safeParse({
      region: { cod: 'RM', nombre: 'Metropolitana' },
      fecha: '2026-06-11',
      tipo: 'kit-de-viaje',  // no está en el enum
    })
    expect(r.success).toBe(false)
  })

  it('rechaza si region.nombre está vacío', () => {
    const r = minutaPostSchema.safeParse({
      region: { cod: 'RM', nombre: '' },
      fecha: '2026-06-11',
    })
    expect(r.success).toBe(false)
  })
})

describe('adminUsersPostSchema', () => {
  it('acepta body válido con role regional y region_cods', () => {
    const r = adminUsersPostSchema.safeParse({
      email: 'juan@dci.cl',
      role: 'regional',
      region_cods: ['XV', 'II'],
    })
    expect(r.success).toBe(true)
  })

  it('rechaza role fuera del enum', () => {
    const r = adminUsersPostSchema.safeParse({
      email: 'juan@dci.cl',
      role: 'superadmin',
    })
    expect(r.success).toBe(false)
  })

  it('rechaza email sin @', () => {
    const r = adminUsersPostSchema.safeParse({
      email: 'juan.dci.cl',
      role: 'viewer',
    })
    expect(r.success).toBe(false)
  })

  it('acepta sin region_cods (opcional)', () => {
    const r = adminUsersPostSchema.safeParse({
      email: 'admin@dci.cl',
      role: 'admin',
    })
    expect(r.success).toBe(true)
  })
})

describe('desalojoDetallePatchSchema', () => {
  it('acepta resumen_narrativo string', () => {
    const r = desalojoDetallePatchSchema.safeParse({
      resumen_narrativo: 'El caso La Chimba avanza con coordinación SEREMI.',
    })
    expect(r.success).toBe(true)
  })

  it('acepta resumen_narrativo null (limpiar)', () => {
    const r = desalojoDetallePatchSchema.safeParse({ resumen_narrativo: null })
    expect(r.success).toBe(true)
  })

  it('rechaza resumen_narrativo número', () => {
    const r = desalojoDetallePatchSchema.safeParse({ resumen_narrativo: 123 })
    expect(r.success).toBe(false)
  })

  it('rechaza body sin resumen_narrativo', () => {
    const r = desalojoDetallePatchSchema.safeParse({ otro_campo: 'x' })
    expect(r.success).toBe(false)
  })
})
