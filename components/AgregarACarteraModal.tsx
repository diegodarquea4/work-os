'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from '@/components/ui'
import { SEMAFORO_CONFIG } from '@/lib/config'
import { useDialogA11y } from '@/lib/hooks/useDialogA11y'
import { moverEnCartera } from '@/lib/comiteInfraestructuraClient'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'

/**
 * "Sumar a la cartera" del Comité de Infraestructura: busca una iniciativa de
 * la región y le pone la etiqueta del comité.
 *
 * La escritura va por /api/comite-infraestructura/cartera, no por el navegador:
 * `tags` es columna definicional y solo admin/editor la mueven desde acá (ver
 * lib/comiteInfraestructura.ts). Hasta esta pantalla, la delegación que lleva
 * el comité dependía de un admin para armar su propia cartera.
 *
 * El modal NO se cierra al sumar una: armar la cartera es agregar varias
 * seguidas, y la fila desaparece sola de la lista cuando el estado de arriba
 * vuelve con la etiqueta puesta.
 *
 * Los candidatos son `iniciativas` tal como llega — la región COMPLETA, sin el
 * corte del selector de capas (regla de CLAUDE.md: Comités y Gabinete nunca se
 * acotan por capa). Para un SEREMI la lista ya viene recortada por la RLS a su
 * propio ministerio, que es exactamente lo que puede etiquetar.
 */

type Props = {
  region: Region
  iniciativas: Iniciativa[]
  tag: string
  onClose: () => void
  /** Propaga la etiqueta nueva al estado global (WorkOSApp) para que el preview
   *  y el resto de las vistas se enteren sin recargar la página. */
  onAgregada: (p: Iniciativa, tags: string[]) => void
}

const MAX_VISIBLES = 60

export default function AgregarACarteraModal({ region, iniciativas, tag, onClose, onAgregada }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [guardandoId, setGuardandoId] = useState<number | null>(null)
  const [sumadas, setSumadas] = useState<number>(0)

  const { panelRef, onKeyDown } = useDialogA11y<HTMLDivElement>()

  const [entered, setEntered] = useState(false)
  const closingRef = useRef(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  function requestClose() {
    if (closingRef.current) return
    closingRef.current = true
    setEntered(false)
    window.setTimeout(onClose, 150)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      const t = e.target as HTMLElement
      const enCampo = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
      if (!enCampo) { e.preventDefault(); requestClose() }
      return
    }
    onKeyDown(e)
  }

  // Candidatas = las que todavía no están en la cartera. La comparación es
  // exacta porque así la hace el resto del módulo (`tags.includes(tag)`); la
  // ruta se encarga de que lo que escribe quede en esa misma forma.
  const candidatas = useMemo(
    () => iniciativas.filter(p => !(p.tags ?? []).includes(tag)),
    [iniciativas, tag],
  )

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es')
    if (!q) return candidatas
    return candidatas.filter(p =>
      p.nombre.toLocaleLowerCase('es').includes(q) ||
      (p.ministerio ?? '').toLocaleLowerCase('es').includes(q) ||
      (p.comuna ?? '').toLocaleLowerCase('es').includes(q) ||
      String(p.n).includes(q),
    )
  }, [candidatas, busqueda])

  const visibles = filtradas.slice(0, MAX_VISIBLES)

  async function handleSumar(p: Iniciativa) {
    setGuardandoId(p.id)
    try {
      const tags = await moverEnCartera({ prioridadId: p.id, accion: 'sumar', tag })
      onAgregada(p, tags)
      setSumadas(n => n + 1)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setGuardandoId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={requestClose}>
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-150 ${entered ? 'opacity-100' : 'opacity-0'}`} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Sumar a la cartera · ${region.nombre}`}
        onKeyDown={handleKeyDown}
        className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'}`}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">Sumar a la cartera</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {region.nombre} · le pone la etiqueta &quot;{tag}&quot; a la iniciativa; su ficha y sus datos no cambian
            </p>
          </div>
          <button onClick={requestClose} className="text-gray-400 hover:text-gray-600 mt-0.5" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </header>

        <div className="flex-shrink-0 px-5 pt-3 pb-2">
          <input
            id="cartera-infra-busqueda"
            type="search"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, ministerio, comuna o N°…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {candidatas.length === 0 ? (
            <EmptyState
              title="Toda la región ya está en la cartera"
              description={`Las iniciativas de ${region.nombre} que puedes ver ya tienen la etiqueta "${tag}".`}
            />
          ) : visibles.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              Ninguna iniciativa coincide con &quot;{busqueda}&quot;.
            </p>
          ) : (
            <div className="space-y-1">
              {visibles.map(p => {
                const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
                const guardando = guardandoId === p.id
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2.5 px-3 py-2 border border-slate-200 rounded-lg hover:border-violet-300 bg-white transition-colors"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sem.dot}`} title={sem.label} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 font-medium truncate">{p.nombre}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        #{p.n}
                        {p.ministerio ? ` · ${p.ministerio}` : ''}
                        {p.comuna ? ` · ${p.comuna}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleSumar(p)}
                      disabled={guardando}
                      className="flex-shrink-0 text-xs px-3 py-1.5 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50"
                    >
                      {guardando ? 'Sumando…' : 'Sumar'}
                    </button>
                  </div>
                )
              })}
              {filtradas.length > MAX_VISIBLES && (
                <p className="text-[11px] text-gray-400 text-center pt-2">
                  Se muestran {MAX_VISIBLES} de {filtradas.length}. Afina la búsqueda para ver el resto.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400">
            {sumadas > 0
              ? `${sumadas} sumada${sumadas === 1 ? '' : 's'} en esta sesión`
              : `${candidatas.length} iniciativa${candidatas.length === 1 ? '' : 's'} fuera de la cartera`}
          </p>
          <button
            onClick={requestClose}
            className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white"
          >
            Listo
          </button>
        </footer>
      </div>
    </div>
  )
}
