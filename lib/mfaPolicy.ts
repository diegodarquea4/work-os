/**
 * Política de adopción de la verificación en dos pasos.
 *
 * Por qué existe: en agosto se lanzó el 2FA OBLIGATORIO PARA TODOS de un día
 * para otro (commit 4d164e3) y se revirtió el mismo día. La lógica estaba bien;
 * lo que falló fue el aterrizaje. Acá la obligatoriedad es una FECHA POR ROL,
 * de modo que se pueda partir voluntario, avisar con anticipación y recién
 * después exigir — y mover cualquiera de esas fechas es editar una constante.
 *
 * Cómo se opera:
 *   - `null`  → nunca obligatorio para ese rol (queda opcional).
 *   - fecha   → desde ese día se bloquea; los DIAS_DE_AVISO previos solo se
 *               muestra un aviso no bloqueante con el plazo.
 *
 * El orden lo eligió Diego: primero quienes más pueden hacer daño si les roban
 * la cuenta (admin y editor escriben en las 16 regiones), después el resto.
 */

import type { UserRole } from '@/lib/apiAuth'

/** Días de aviso antes de que la fecha empiece a bloquear. */
export const DIAS_DE_AVISO = 7

/**
 * Desde cuándo es obligatorio, por rol (fecha local, YYYY-MM-DD).
 * Fase A (voluntario) = todas las fechas en el futuro.
 */
export const MFA_OBLIGATORIO_DESDE: Record<UserRole, string | null> = {
  admin:    '2026-09-22',
  editor:   '2026-09-22',
  regional: '2026-10-06',
  seremi:   '2026-10-06',
  viewer:   '2026-10-06',
}

export type MfaRequirement =
  | 'none'   // opcional: no se muestra nada
  | 'warn'   // se acerca el plazo: aviso no bloqueante con la fecha
  | 'block'  // venció: overlay bloqueante hasta configurarlo

/**
 * Qué le toca a este usuario hoy. Puro y testeable: sin fechas implícitas ni
 * lecturas de entorno — `hoy` se inyecta.
 *
 * Quien ya tiene un factor configurado nunca ve nada ('none'), aunque su fecha
 * haya pasado.
 */
export function mfaRequirement(
  role: UserRole,
  tieneFactor: boolean,
  hoy: Date,
): MfaRequirement {
  if (tieneFactor) return 'none'

  const desde = MFA_OBLIGATORIO_DESDE[role]
  if (!desde) return 'none'

  const limite = new Date(`${desde}T00:00:00`)
  if (Number.isNaN(limite.getTime())) return 'none'  // fecha mal escrita: no bloquear a nadie

  if (hoy >= limite) return 'block'

  const avisoDesde = new Date(limite)
  avisoDesde.setDate(avisoDesde.getDate() - DIAS_DE_AVISO)
  return hoy >= avisoDesde ? 'warn' : 'none'
}

/** Fecha límite en formato legible para el aviso ("22 de septiembre"). */
export function fechaLimiteLegible(role: UserRole): string | null {
  const desde = MFA_OBLIGATORIO_DESDE[role]
  if (!desde) return null
  return new Date(`${desde}T00:00:00`).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'long',
  })
}
