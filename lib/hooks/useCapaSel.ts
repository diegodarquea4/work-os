'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Capa } from '@/lib/projects'
import {
  CAPA_SEL_DEFAULT, parseCapaSel, serializeCapaSel, toggleCapa,
  type CapaSel, type VistaConCapas,
} from '@/lib/capas'

/**
 * Capas marcadas en UNA vista, recordadas por usuario en
 * `workos:capas:<vista>` como "l,ll". Cada vista tiene la suya (Diego,
 * 2026-09-15: un selector por vista, sin control global), así que Mapa e
 * Iniciativas pueden estar en capas distintas a la vez.
 *
 * Mismo patrón de persistencia que `workos:dashboardCols`: default duro en el
 * useState (SSR-safe: localStorage solo se toca en efectos), un efecto que
 * hidrata validando con `parseCapaSel` (basura → default) y otro que escribe
 * recién después de hidratar, para no pisar lo guardado con el default.
 *
 * Devuelve `toggle(capa)` en vez de un setter: la regla "nunca vacío" vive en
 * `toggleCapa` y ningún llamador puede saltársela.
 */
export function useCapaSel(vista: VistaConCapas): [CapaSel, (capa: Capa) => void] {
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
    try { localStorage.setItem(clave, serializeCapaSel(sel)) } catch { /* noop */ }
  }, [clave, sel, hydrated])

  const toggle = useCallback((capa: Capa) => setSel(prev => toggleCapa(prev, capa)), [])

  return [sel, toggle]
}
