import { describe, it, expect } from 'vitest'
import {
  mfaRequirement,
  mfaRazon,
  esCuentaNueva,
  fechaLimiteLegible,
  MFA_OBLIGATORIO_DESDE,
  MFA_OBLIGATORIO_PARA_CUENTAS_DESDE,
  DIAS_DE_AVISO,
  type MfaContexto,
} from '@/lib/mfaPolicy'
import type { UserRole } from '@/lib/apiAuth'

/**
 * Esta política es lo que decide si a alguien se le BLOQUEA el panel. Un error
 * acá deja a 56 personas afuera de un sistema de gobierno, que es exactamente
 * lo que se quiso evitar tras el intento de agosto. De ahí el detalle de los
 * casos de borde.
 *
 * Los tests del MECANISMO no dependen de las fechas del rollout vigente: se
 * escriben relativas a las constantes o cambiándolas dentro del test. Solo el
 * bloque «piloto vigente» fija la decisión de hoy, y ahí romperse es correcto —
 * es lo que obliga a actualizar el test cuando se abra el rollout general.
 */

const UN_DIA = 24 * 60 * 60 * 1000

/** Medianoche local del día YYYY-MM-DD (igual que la política). */
const dia = (d: string) => new Date(`${d}T00:00:00`)

/** Contexto por defecto: cuenta vieja, sin factor. Se sobreescribe lo que importe. */
function req(p: Partial<MfaContexto> & { role: UserRole }) {
  return mfaRequirement({
    tieneFactor:    false,
    cuentaCreadaEl: null,
    hoy:            new Date('2026-12-31T10:00:00'),
    ...p,
  })
}

describe('mfaRequirement — tener el factor gana siempre', () => {
  it('quien ya lo configuró no ve nada, aunque le tocara por rol o por ser cuenta nueva', () => {
    const corte = MFA_OBLIGATORIO_PARA_CUENTAS_DESDE!
    expect(req({ role: 'admin', tieneFactor: true })).toBe('none')
    expect(req({ role: 'viewer', tieneFactor: true, cuentaCreadaEl: dia(corte).toISOString() })).toBe('none')
  })
})

describe('mfaRequirement — cuentas nuevas', () => {
  const corte = dia(MFA_OBLIGATORIO_PARA_CUENTAS_DESDE!)

  it('una cuenta creada desde el corte se bloquea de entrada, sea cual sea su rol', () => {
    const reciencita = new Date(corte.getTime() + UN_DIA).toISOString()
    for (const role of ['admin', 'editor', 'regional', 'seremi', 'viewer'] as UserRole[]) {
      expect(req({ role, cuentaCreadaEl: reciencita })).toBe('block')
    }
  })

  it('el mismo día del corte ya cuenta como nueva', () => {
    expect(esCuentaNueva(corte.toISOString())).toBe(true)
  })

  it('no es retroactiva: una cuenta anterior al corte sigue la regla de su rol', () => {
    const vieja = new Date(corte.getTime() - UN_DIA).toISOString()
    expect(esCuentaNueva(vieja)).toBe(false)
    // 'viewer' hoy no tiene fecha → queda voluntario pese al bloqueo de nuevos.
    expect(req({ role: 'viewer', cuentaCreadaEl: vieja })).toBe('none')
  })

  it('sin `created_at` o con basura no atrapa a nadie', () => {
    expect(esCuentaNueva(null)).toBe(false)
    expect(esCuentaNueva('no-es-una-fecha')).toBe(false)
    expect(req({ role: 'viewer', cuentaCreadaEl: 'no-es-una-fecha' })).toBe('none')
  })

  it('no hay ventana de aviso: al usuario nuevo se le exige de una', () => {
    // Un plazo con 7 días de gracia no tiene sentido para quien recién recibe
    // el acceso: no hay nada que "venga cambiando" para él.
    const reciencita = new Date(corte.getTime() + UN_DIA).toISOString()
    expect(req({ role: 'viewer', cuentaCreadaEl: reciencita, hoy: corte })).toBe('block')
  })
})

describe('mfaRequirement — piloto vigente (2026-09-04)', () => {
  // Si este bloque se cae, es porque se movió el rollout. Actualizarlo a mano
  // es parte de moverlo: es el registro de a quién se le está exigiendo.
  const hoy = new Date('2026-09-10T10:00:00')

  it('los administradores lo tienen obligatorio', () => {
    expect(req({ role: 'admin', hoy })).toBe('block')
  })

  it('el resto sigue voluntario mientras dura el piloto', () => {
    for (const role of ['editor', 'regional', 'seremi', 'viewer'] as UserRole[]) {
      expect(req({ role, hoy })).toBe('none')
    }
  })
})

describe('mfaRequirement — mecanismo de fechas por rol', () => {
  // Se opera sobre 'viewer', que hoy está en null: así el test describe el
  // mecanismo sin depender de a quién le toque esta semana.
  function conFechaDeViewer<T>(fecha: string | null, fn: () => T): T {
    const original = MFA_OBLIGATORIO_DESDE.viewer
    try {
      MFA_OBLIGATORIO_DESDE.viewer = fecha
      return fn()
    } finally {
      MFA_OBLIGATORIO_DESDE.viewer = original
    }
  }

  const LIMITE = '2026-11-10'

  it('antes de la ventana de aviso no molesta', () => {
    conFechaDeViewer(LIMITE, () => {
      expect(req({ role: 'viewer', hoy: new Date('2026-10-01T10:00:00') })).toBe('none')
    })
  })

  it('avisa los días previos y bloquea al vencer', () => {
    conFechaDeViewer(LIMITE, () => {
      expect(req({ role: 'viewer', hoy: new Date('2026-11-06T10:00:00') })).toBe('warn')
      expect(req({ role: 'viewer', hoy: new Date('2026-11-11T10:00:00') })).toBe('block')
    })
  })

  it('el mismo día del plazo ya bloquea', () => {
    conFechaDeViewer(LIMITE, () => {
      expect(req({ role: 'viewer', hoy: dia(LIMITE) })).toBe('block')
    })
  })

  it('la ventana de aviso dura exactamente DIAS_DE_AVISO', () => {
    conFechaDeViewer(LIMITE, () => {
      const inicioAviso = new Date(dia(LIMITE))
      inicioAviso.setDate(inicioAviso.getDate() - DIAS_DE_AVISO)
      const justoAntes = new Date(inicioAviso.getTime() - 1000)

      expect(req({ role: 'viewer', hoy: inicioAviso })).toBe('warn')
      expect(req({ role: 'viewer', hoy: justoAntes })).toBe('none')
    })
  })

  it('un rol sin fecha nunca se vuelve obligatorio', () => {
    conFechaDeViewer(null, () => {
      expect(req({ role: 'viewer', hoy: new Date('2030-01-01T10:00:00') })).toBe('none')
    })
  })

  it('una fecha mal escrita NO bloquea a nadie (fail-open a propósito)', () => {
    // Acá fallar cerrado significaría dejar a todo el ministerio afuera por un
    // error de tipeo en una constante. Preferimos no bloquear: el control duro
    // del segundo factor vive en proxy.ts, no acá.
    conFechaDeViewer('no-es-una-fecha', () => {
      expect(req({ role: 'viewer', hoy: new Date('2030-01-01T10:00:00') })).toBe('none')
    })
  })
})

describe('mfaRazon', () => {
  it('distingue a la cuenta nueva del plazo vencido', () => {
    const corte = dia(MFA_OBLIGATORIO_PARA_CUENTAS_DESDE!)
    expect(mfaRazon(new Date(corte.getTime() + UN_DIA).toISOString())).toBe('cuenta-nueva')
    expect(mfaRazon(new Date(corte.getTime() - UN_DIA).toISOString())).toBe('plazo')
    expect(mfaRazon(null)).toBe('plazo')
  })
})

describe('fechaLimiteLegible', () => {
  it('devuelve la fecha en castellano para el aviso', () => {
    const txt = fechaLimiteLegible('admin')
    expect(txt).toBeTruthy()
    expect(txt).toMatch(/septiembre/)
  })

  it('devuelve null para un rol sin fecha (no hay plazo que anunciar)', () => {
    expect(fechaLimiteLegible('viewer')).toBeNull()
  })
})
