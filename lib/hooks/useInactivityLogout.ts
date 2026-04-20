'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'

const IDLE_MS   = 30 * 60 * 1000  // 30 minutes → logout
const WARN_MS   = 25 * 60 * 1000  // 25 minutes → show warning

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

/**
 * Logs out the user after IDLE_MS of inactivity.
 * Shows a warning at WARN_MS so the user can extend the session.
 *
 * Returns:
 *   warning     — true when the warning banner should be visible
 *   secondsLeft — countdown seconds shown in the warning (0–300)
 *   extend      — call to reset the timer and dismiss the warning
 */
export function useInactivityLogout() {
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
  }, [])

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
