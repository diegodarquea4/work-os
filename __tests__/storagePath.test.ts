import { describe, it, expect } from 'vitest'
import { esUrlAbsoluta, planPath } from '@/lib/storagePath'

/**
 * Al privatizar `plan-regional` y `project-docs` (mig 089) la BD pasó de
 * guardar la URL pública a guardar el path. Estos helpers son los que permiten
 * que el deploy del código y la migración vayan en cualquier orden: si alguno
 * dejara de tolerar el formato legacy, los 13 Planes Regionales se quedarían
 * sin botón "Ver" hasta que corriera la migración.
 */

describe('planPath — tolera path y URL legacy', () => {
  it('deja pasar un path tal cual', () => {
    expect(planPath('XIV.pdf')).toBe('XIV.pdf')
    expect(planPath('RM.pdf')).toBe('RM.pdf')
  })

  it('extrae el archivo de la URL pública que se guardaba antes', () => {
    expect(planPath('https://hufgtspktblxxkwocsof.supabase.co/storage/v1/object/public/plan-regional/XIV.pdf'))
      .toBe('XIV.pdf')
  })

  it('es idempotente (correrlo dos veces no rompe)', () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/plan-regional/I.pdf'
    expect(planPath(planPath(url))).toBe('I.pdf')
  })
})

describe('esUrlAbsoluta — distingue fila legacy de path', () => {
  it('reconoce http y https', () => {
    expect(esUrlAbsoluta('https://x.supabase.co/a/b.pdf')).toBe(true)
    expect(esUrlAbsoluta('http://x.supabase.co/a/b.pdf')).toBe(true)
  })

  it('un path del bucket no es URL', () => {
    expect(esUrlAbsoluta('12338/1756900000_acta.pdf')).toBe(false)
    expect(esUrlAbsoluta('XIV.pdf')).toBe(false)
  })
})
