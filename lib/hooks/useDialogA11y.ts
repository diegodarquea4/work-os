import { useEffect, useRef, type KeyboardEvent } from 'react'

/** Elementos enfocables dentro de un panel de diálogo (orden de DOM = orden de Tab). */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A11y para un diálogo modal montado inline (sin portal): al abrir mueve el foco
 * al primer botón del panel, al cerrar lo restaura al elemento que lo tenía, y
 * expone `onKeyDown` con un focus-trap por Tab —equivalente por teclado a poner
 * `inert` en el fondo—. El Escape se maneja aparte en cada modal porque suelen
 * tener guardas propias (p. ej. no cerrar mientras `cerrando`/guardando).
 *
 * Preferimos el primer <button> (típicamente "Cerrar" o la acción primaria) por
 * sobre el primer focusable para no aterrizar el foco dentro de un campo de texto
 * al abrir. Sólo cuenta lo realmente renderizado: paneles/tabs no montados no
 * aparecen en la consulta.
 *
 *   const { panelRef, onKeyDown } = useDialogA11y<HTMLDivElement>()
 *   <div ref={panelRef} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-label="…">
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>() {
  const panelRef = useRef<T | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const target =
      panel?.querySelector<HTMLElement>('button:not([disabled])') ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel
    target?.focus?.()
    return () => { previouslyFocused?.focus?.() }
  }, [])

  function onKeyDown(e: KeyboardEvent<T>) {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const nodes = panel.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (nodes.length === 0) return
    const first = nodes[0]
    const last  = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return { panelRef, onKeyDown }
}
