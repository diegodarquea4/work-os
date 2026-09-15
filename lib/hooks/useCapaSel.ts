'use client'

import { useEffect, useState } from 'react'
import { CAPA_SEL_DEFAULT, parseCapaSel, type CapaSel, type VistaConCapas } from '@/lib/capas'

/**
 * Selección de capas de UNA vista, recordada por usuario en
 * `workos:capas:<vista>`. Cada vista tiene la suya (Diego, 2026-09-15: un
 * toggle por vista, sin control global), así que Mapa e Iniciativas pueden
 * estar en capas distintas a la vez.
 *
 * Mismo patrón de persistencia que `workos:dashboardCols`: default duro en el
 * useState (SSR-safe: localStorage solo se toca en efectos), un efecto que
 * hidrata validando con `parseCapaSel` (basura → default) y otro que escribe
 * recién después de hidratar, para no pisar lo guardado con el default.
 */
export function useCapaSel(vista: VistaConCapas): [CapaSel, (sel: CapaSel) => void] {
  const clave = `workos:capas:${vista}`
  const [sel, setSel] = useState<CapaSel>(CAPA_SEL_DEFAULT[vista])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const guardada = parseCapaSel(localStorage.getItem(clave))
      if (guardada) setSel(guardada)
    } catch {
      // localStorage bloqueado — arrancamos con el default.
    } finally {
      setHydrated(true)
    }
  }, [clave])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(clave, sel) } catch { /* noop */ }
  }, [clave, sel, hydrated])

  return [sel, setSel]
}
