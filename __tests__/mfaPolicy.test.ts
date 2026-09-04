import { describe, it, expect } from 'vitest'
import {
  mfaRequirement,
  fechaLimiteLegible,
  MFA_OBLIGATORIO_DESDE,
  DIAS_DE_AVISO,
} from '@/lib/mfaPolicy'

/**
 * Esta política es lo que decide si a alguien se le BLOQUEA el panel. Un error
 * acá deja a 56 personas afuera de un sistema de gobierno, que es exactamente
 * lo que se quiso evitar tras el intento de agosto. De ahí el detalle de los
 * casos de borde.
 */

const ANTES   = new Date('2026-09-01T10:00:00')
const EN_AVISO = new Date('2026-09-18T10:00:00')  // dentro de los 7 días de admin
const DESPUES = new Date('2026-09-23T10:00:00')   // pasado el plazo de admin

describe('mfaRequirement', () => {
  it('quien ya lo configuró no ve nada, aunque su plazo haya vencido', () => {
    expect(mfaRequirement('admin', true, DESPUES)).toBe('none')
    expect(mfaRequirement('regional', true, DESPUES)).toBe('none')
  })

  it('antes de la ventana de aviso no molesta a nadie', () => {
    expect(mfaRequirement('admin', false, ANTES)).toBe('none')
  })

  it('avisa los días previos y bloquea al vencer', () => {
    expect(mfaRequirement('admin', false, EN_AVISO)).toBe('warn')
    expect(mfaRequirement('admin', false, DESPUES)).toBe('block')
  })

  it('el mismo día del plazo ya bloquea', () => {
    const limite = new Date(`${MFA_OBLIGATORIO_DESDE.admin}T00:00:00`)
    expect(mfaRequirement('admin', false, limite)).toBe('block')
  })

  it('cada rol corre por su propia fecha', () => {
    // admin vence antes que regional: el 23 de septiembre uno bloquea y el otro no.
    expect(mfaRequirement('admin', false, DESPUES)).toBe('block')
    expect(mfaRequirement('regional', false, DESPUES)).toBe('none')
  })

  it('la ventana de aviso dura exactamente DIAS_DE_AVISO', () => {
    const limite = new Date(`${MFA_OBLIGATORIO_DESDE.regional}T00:00:00`)
    const inicioAviso = new Date(limite); inicioAviso.setDate(inicioAviso.getDate() - DIAS_DE_AVISO)
    const justoAntes  = new Date(inicioAviso.getTime() - 1000)

    expect(mfaRequirement('regional', false, inicioAviso)).toBe('warn')
    expect(mfaRequirement('regional', false, justoAntes)).toBe('none')
  })

  it('un rol sin fecha nunca se vuelve obligatorio', () => {
    // Se simula editando la constante: es la palanca real de operación.
    const original = MFA_OBLIGATORIO_DESDE.viewer
    try {
      MFA_OBLIGATORIO_DESDE.viewer = null
      expect(mfaRequirement('viewer', false, DESPUES)).toBe('none')
    } finally {
      MFA_OBLIGATORIO_DESDE.viewer = original
    }
  })

  it('una fecha mal escrita NO bloquea a nadie (fail-open a propósito)', () => {
    // Acá fallar cerrado significaría dejar a todo el ministerio afuera por un
    // error de tipeo en una constante. Preferimos no bloquear.
    const original = MFA_OBLIGATORIO_DESDE.editor
    try {
      MFA_OBLIGATORIO_DESDE.editor = 'no-es-una-fecha'
      expect(mfaRequirement('editor', false, DESPUES)).toBe('none')
    } finally {
      MFA_OBLIGATORIO_DESDE.editor = original
    }
  })
})

describe('fechaLimiteLegible', () => {
  it('devuelve la fecha en castellano para el aviso', () => {
    const txt = fechaLimiteLegible('admin')
    expect(txt).toBeTruthy()
    expect(txt).toMatch(/septiembre/)
  })

  it('los admin/editor vencen antes que el resto', () => {
    expect(MFA_OBLIGATORIO_DESDE.admin! < MFA_OBLIGATORIO_DESDE.regional!).toBe(true)
    expect(MFA_OBLIGATORIO_DESDE.editor!).toBe(MFA_OBLIGATORIO_DESDE.admin!)
  })
})
