'use client'

import { useEffect, type ReactNode } from 'react'
import { useDialogA11y } from '@/lib/hooks/useDialogA11y'

/**
 * Esqueleto de una SESIÓN A PANTALLA COMPLETA: cabecera + riel izquierdo +
 * panel principal, con un overlay opcional que la continúa (el cierre).
 *
 * Es el chrome de `ConsolaSesionGabinete`, extraído para que los comités lo
 * compartan (Policial e Infraestructura hoy; Político y Económico después).
 * Presentacional: no sabe de instancias ni de datos. Lo que agrega respecto al
 * gabinete es la accesibilidad que el modal de los comités ya tenía y no se
 * quería perder: `role="dialog"`, focus-trap por Tab (`useDialogA11y`) y Escape.
 *
 * ── Escala de z-index (no hay tokens en el proyecto; esta es la convención) ──
 *   z-10   header de la app (WorkOSApp)
 *   z-30   overlays de una vista (p. ej. métricas de Mi Región)
 *   z-40   CONSOLAS DE SESIÓN  ← esta
 *   z-50   modales
 *   z-60   modal sobre modal
 *   z-9999 sistema (toasts, aviso de inactividad, typeaheads con portal)
 * Con la consola en z-40, TODO lo que se abre desde adentro (ficha de una
 * iniciativa, catálogo de métricas, typeahead) queda encima sin tocar nada. El
 * gabinete la puso en z-[70] y por eso tuvo que subir a sus hijos a 71/80/85/90
 * — y aun así la ficha (z-50) le queda abajo.
 *
 * El `overlay` se renderiza DENTRO de la raíz como `absolute inset-0`: hereda
 * el focus-trap y no suma otro número a la escala.
 */

type Props = {
  ariaLabel: string
  header: ReactNode
  /** Contenido del riel (normalmente <ConsolaRail/>). `null` = sin riel. */
  rail?: ReactNode
  /** Versión compacta del riel para pantallas angostas (<md). Opcional. */
  railMovil?: ReactNode
  railTitulo?: string
  railFooter?: ReactNode
  children: ReactNode
  /** Ancho del panel principal. Default generoso: acá van tablas. */
  mainMaxWidth?: string
  /** Pantalla que continúa la consola sin desmontarla (cierre). */
  overlay?: ReactNode
  /** Qué hace Escape. Si hay overlay, normalmente «volver»; si no, «cerrar». */
  onEscape?: () => void
  escapeDeshabilitado?: boolean
  zIndexClass?: string
}

/**
 * Vacía un `onBlur` pendiente antes de cambiar de estado. Los campos del
 * reporte guardan al salir (onBlur): si el árbol se desmonta con uno enfocado
 * (Escape, ✕), el navegador no garantiza el blur. `blur()` lo dispara síncrono.
 */
export function soltarFoco() {
  const el = document.activeElement as HTMLElement | null
  el?.blur?.()
}

export default function ConsolaSesionShell({
  ariaLabel, header, rail = null, railMovil = null, railTitulo = 'Sesión — clic para saltar', railFooter = null,
  children, mainMaxWidth = 'max-w-5xl', overlay = null, onEscape, escapeDeshabilitado = false,
  zIndexClass = 'z-40',
}: Props) {
  const { panelRef, onKeyDown } = useDialogA11y<HTMLDivElement>()

  useEffect(() => {
    if (!onEscape) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || escapeDeshabilitado) return
      soltarFoco()
      onEscape!()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEscape, escapeDeshabilitado])

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`fixed inset-0 ${zIndexClass} bg-slate-50 flex flex-col`}
    >
      <header className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 flex-none flex-wrap">
        {header}
      </header>

      {railMovil && (
        <div className="md:hidden flex-none bg-white border-b border-slate-200 px-3 py-2 overflow-x-auto overscroll-x-contain">
          {railMovil}
        </div>
      )}

      <div className={`flex-1 min-h-0 grid grid-cols-1 ${rail ? 'md:grid-cols-[270px_1fr]' : ''}`}>
        {rail && (
          <aside className="hidden md:flex flex-col min-h-0 border-r border-slate-200 bg-white">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-4 pt-4 pb-2">{railTitulo}</div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-2">{rail}</div>
            {railFooter && <div className="p-2.5 border-t border-slate-100 flex-none">{railFooter}</div>}
          </aside>
        )}

        <section className="overflow-y-auto overscroll-contain p-5 md:p-6">
          <div className={`${mainMaxWidth} mx-auto`}>{children}</div>
        </section>
      </div>

      {overlay && (
        <div className="absolute inset-0 z-10 bg-slate-50 flex flex-col">{overlay}</div>
      )}
    </div>
  )
}
