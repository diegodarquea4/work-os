/**
 * Política de adopción de la verificación en dos pasos.
 *
 * Por qué existe: en agosto se lanzó el 2FA OBLIGATORIO PARA TODOS de un día
 * para otro (commit 4d164e3) y se revirtió el mismo día. La lógica estaba bien;
 * lo que falló fue el aterrizaje. Acá la obligatoriedad se declara en dos
 * constantes, de modo que apretar o soltar el rollout sea editar un archivo.
 *
 * ── Piloto vigente (decisión de Diego, 2026-09-04) ──────────────────────────
 * Obligatorio HOY para dos grupos, y para nadie más:
 *   1. Los administradores. Son seis y escriben en las 16 regiones: si le roban
 *      la cuenta a uno, se lleva el panel entero.
 *   2. Toda cuenta creada desde el corte. Un usuario nuevo no tiene nada que
 *      desaprender — configurar el segundo factor es parte de recibir el acceso,
 *      no un cambio de reglas a mitad de camino.
 * El resto queda VOLUNTARIO (`null`): pueden activarlo desde la tuerca, pero no
 * se les avisa ni se les bloquea. Si el piloto anda bien, el rollout general es
 * poner fechas acá abajo; los DIAS_DE_AVISO previos verán el banner con el plazo
 * antes de que nada los bloquee.
 */

import type { UserRole } from '@/lib/apiAuth'

/** Días de aviso antes de que una fecha empiece a bloquear. */
export const DIAS_DE_AVISO = 7

/**
 * Las cuentas creadas DESDE este día (fecha local, YYYY-MM-DD) nacen con el
 * segundo factor obligatorio, sea cual sea su rol. `null` desactiva la regla.
 *
 * No es retroactivo por accidente: al fijarlo se verificó que la cuenta más
 * reciente era del 1 de septiembre, así que no atrapa a nadie hacia atrás.
 */
export const MFA_OBLIGATORIO_PARA_CUENTAS_DESDE: string | null = '2026-09-04'

/**
 * Desde cuándo es obligatorio por rol (fecha local, YYYY-MM-DD).
 *   - `null`  → voluntario: no se avisa ni se bloquea.
 *   - fecha   → desde ese día se bloquea; los DIAS_DE_AVISO previos solo se
 *               muestra un aviso no bloqueante con el plazo.
 */
export const MFA_OBLIGATORIO_DESDE: Record<UserRole, string | null> = {
  admin:    '2026-09-04',  // piloto
  editor:   null,
  regional: null,
  seremi:   null,
  viewer:   null,
}

export type MfaRequirement =
  | 'none'   // voluntario: no se muestra nada
  | 'warn'   // se acerca el plazo: aviso no bloqueante con la fecha
  | 'block'  // le toca: overlay bloqueante hasta configurarlo

/** Por qué se está bloqueando — cambia el texto de la pantalla, no la lógica. */
export type MfaRazon = 'cuenta-nueva' | 'plazo'

export type MfaContexto = {
  role: UserRole
  /** La cuenta ya tiene un factor verificado. */
  tieneFactor: boolean
  /** `user_profiles.created_at` en ISO. null en cuentas viejas sin el dato. */
  cuentaCreadaEl: string | null
  hoy: Date
}

/** Medianoche local del día YYYY-MM-DD, o null si la constante está mal escrita. */
function medianocheLocal(dia: string | null): Date | null {
  if (!dia) return null
  const d = new Date(`${dia}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * ¿Es una cuenta creada después del corte? Se exporta porque la pantalla de
 * configuración cambia el texto según esto (a un usuario nuevo hay que darle la
 * bienvenida, no notificarle que se le venció un plazo que nunca vio).
 */
export function esCuentaNueva(cuentaCreadaEl: string | null): boolean {
  const corte = medianocheLocal(MFA_OBLIGATORIO_PARA_CUENTAS_DESDE)
  if (!corte || !cuentaCreadaEl) return false
  const creada = new Date(cuentaCreadaEl)
  if (Number.isNaN(creada.getTime())) return false
  return creada >= corte
}

/**
 * Qué le toca a este usuario hoy. Puro y testeable: sin fechas implícitas ni
 * lecturas de entorno — `hoy` se inyecta.
 *
 * Quien ya tiene un factor configurado nunca ve nada ('none'), aunque su fecha
 * haya pasado.
 *
 * Ante un dato malo (constante mal escrita, `created_at` ilegible) se responde
 * 'none' A PROPÓSITO. Fallar cerrado acá dejaría al ministerio entero fuera del
 * panel por un error de tipeo; el control DURO del segundo factor no es esta
 * función sino el gate de `proxy.ts`, que exige aal2 a quien ya tiene factor.
 */
export function mfaRequirement({ role, tieneFactor, cuentaCreadaEl, hoy }: MfaContexto): MfaRequirement {
  if (tieneFactor) return 'none'

  // Cuenta nueva: obligatorio de entrada, sin ventana de aviso. No hay plazo que
  // anunciarle a quien recién recibe el acceso.
  if (esCuentaNueva(cuentaCreadaEl)) return 'block'

  const limite = medianocheLocal(MFA_OBLIGATORIO_DESDE[role])
  if (!limite) return 'none'

  if (hoy >= limite) return 'block'

  const avisoDesde = new Date(limite)
  avisoDesde.setDate(avisoDesde.getDate() - DIAS_DE_AVISO)
  return hoy >= avisoDesde ? 'warn' : 'none'
}

/** Por qué se le está exigiendo — solo tiene sentido cuando el estado es 'block'. */
export function mfaRazon(cuentaCreadaEl: string | null): MfaRazon {
  return esCuentaNueva(cuentaCreadaEl) ? 'cuenta-nueva' : 'plazo'
}

/** Fecha límite en formato legible para el aviso ("22 de septiembre"). */
export function fechaLimiteLegible(role: UserRole): string | null {
  const limite = medianocheLocal(MFA_OBLIGATORIO_DESDE[role])
  if (!limite) return null
  return limite.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
}
