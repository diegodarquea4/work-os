'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'

/** Cierre por inactividad, por defecto. */
export const IDLE_DEFECTO_MS = 30 * 60 * 1000  // 30 min

/**
 * Cierre por inactividad para una sesión con verificación en dos pasos.
 *
 * Más largo a propósito: quien completó un segundo factor demostró mucho más
 * que quien solo tecleó una clave, y volver a pedir clave + código varias veces
 * al día es la fricción que hizo abandonar el intento de agosto. Se activa
 * cuando exista el 2FA (Tanda 3); hasta entonces todas las sesiones usan el
 * valor por defecto.
 */
export const IDLE_CON_2FA_MS = 4 * 60 * 60 * 1000  // 4 h

/** Aviso previo: siempre 5 minutos antes del cierre. */
const AVISO_ANTES_MS = 5 * 60 * 1000

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

/**
 * Cierra la sesión tras `idleMs` sin actividad, avisando 5 minutos antes para
 * que el usuario pueda extenderla.
 *
 * OJO: es solo del lado del navegador y por pestaña. El freno de verdad contra
 * una cookie robada es el vencimiento de sesión del proyecto Supabase
 * (Authentication → Sessions), que no depende de que la pestaña esté abierta.
 *
 * Returns:
 *   warning     — true cuando debe verse el aviso
 *   secondsLeft — cuenta regresiva del aviso
 *   extend      — reinicia el contador y oculta el aviso
 */
export function useInactivityLogout(idleMs: number = IDLE_DEFECTO_MS) {
  const IDLE_MS = idleMs
  const WARN_MS = Math.max(0, idleMs - AVISO_ANTES_MS)
  const [warning, setWarning]         = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const warnTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  function clearAll() {
    if (warnTimer.current)        clearTimeout(warnTimer.current)
    if (logoutTimer.current)      clearTimeout(logoutTimer.current)
    if (countdownInterval.current) clearInterval(countdownInterval.current)
  }

  const resetTimers = useCallback(() => {
    clearAll()
    setWarning(false)

    warnTimer.current = setTimeout(() => {
      const remaining = Math.round((IDLE_MS - WARN_MS) / 1000)
      setSecondsLeft(remaining)
      setWarning(true)

      // Tick the countdown every second
      countdownInterval.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) {
            clearInterval(countdownInterval.current!)
            return 0
          }
          return s - 1
        })
      }, 1000)
    }, WARN_MS)

    logoutTimer.current = setTimeout(async () => {
      clearAll()
      await getSupabase().auth.signOut()
      window.location.href = '/login'
    }, IDLE_MS)
    // Depende de los umbrales: si cambian (p.ej. al subir a 4 h con 2FA), los
    // temporizadores se rearman con el valor nuevo en vez de quedar pegados.
  }, [IDLE_MS, WARN_MS])

  // Extend session: reset timers and dismiss warning
  const extend = useCallback(() => {
    resetTimers()
  }, [resetTimers])

  useEffect(() => {
    resetTimers()

    const handler = () => resetTimers()
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, handler, { passive: true }))

    return () => {
      clearAll()
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, handler))
    }
  }, [resetTimers])

  return { warning, secondsLeft, extend }
}
