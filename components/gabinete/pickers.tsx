'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CARTERAS_GABINETE, ACTORES_GABINETE_NO_SEREMI, TODAS_CARTERAS } from '@/lib/cartera'
import { SEMAFORO_CONFIG } from '@/lib/config'
import type { Iniciativa } from '@/lib/projects'

/**
 * Buscadores flotantes compartidos del Gabinete v2 (Preparación + Consola en
 * sala). El desplegable se monta en un PORTAL a document.body con position:fixed
 * sobre el trigger (flip arriba/abajo + clamp horizontal), así NO estira ni
 * deforma la tarjeta contenedora ni se recorta dentro de un scroll. Cierre por
 * click-afuera / scroll / Escape. Un solo lenguaje visual en las dos superficies.
 */

export const shortCartera = (c: string) => c.replace(/^Ministerio (de las |de la |de los |del |de )/, '')

// Mecánica común: refs del trigger/panel, posición y ciclo de vida de listeners.
export function useAnchoredDropdown() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const recompute = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.max(r.width, 300)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const alto = 320
    const abajo = window.innerHeight - r.bottom - 8
    const top = abajo >= alto || abajo >= r.top ? r.bottom + 4 : Math.max(8, r.top - alto - 4)
    setPos({ top, left, width })
  }
  const abrir = () => { recompute(); setOpen(true) }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (panelRef.current?.contains(n) || triggerRef.current?.contains(n)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', recompute, true)
      window.removeEventListener('resize', recompute)
    }
  }, [open])

  return { open, setOpen, pos, triggerRef, panelRef, abrir }
}

export function DropdownPanel({ pos, panelRef, children }: {
  pos: { top: number; left: number; width: number }
  panelRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}) {
  return createPortal(
    <div ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 90 }}
      className="rounded-lg border border-violet-200 bg-white shadow-xl overflow-hidden">
      {children}
    </div>,
    document.body,
  )
}

export function BuscadorHeader({ value, onChange, onClose, placeholder }: {
  value: string; onChange: (v: string) => void; onClose: () => void; placeholder: string
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-100">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="flex-none"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
      <input autoFocus value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        placeholder={placeholder}
        className="flex-1 min-w-0 text-[13px] text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-400" />
      <button onClick={onClose} title="Cerrar" className="flex-none text-slate-300 hover:text-slate-600">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
      </button>
    </div>
  )
}

// Buscar iniciativas del PREGO — cientos: lista SOLO al tipear.
export function IniBuscador({ disponibles, onPick, label = '🔗 vincular iniciativa' }: {
  disponibles: Iniciativa[]; onPick: (p: Iniciativa) => void; label?: string
}) {
  const { open, setOpen, pos, triggerRef, panelRef, abrir } = useAnchoredDropdown()
  const [q, setQ] = useState('')
  const t = q.trim().toLowerCase()
  const resultados = useMemo(
    () => t ? disponibles.filter(p => p.nombre.toLowerCase().includes(t)).slice(0, 12) : [],
    [t, disponibles],
  )

  return (
    <>
      <button ref={triggerRef} onClick={() => { if (open) setOpen(false); else { setQ(''); abrir() } }}
        className={`text-[12px] font-medium px-2 py-1 rounded-lg border border-dashed transition-colors ${
          open ? 'border-violet-300 text-violet-600 bg-violet-50' : 'border-slate-300 text-slate-400 hover:border-violet-300 hover:text-violet-600'}`}>
        {label}
      </button>
      {open && pos && (
        <DropdownPanel pos={pos} panelRef={panelRef}>
          <BuscadorHeader value={q} onChange={setQ} onClose={() => setOpen(false)} placeholder="Buscar iniciativa del PREGO…" />
          <div className="max-h-64 overflow-y-auto">
            {t === '' ? (
              <p className="text-[12.5px] text-slate-400 italic px-3 py-3">Escribe el nombre de la iniciativa para buscarla.</p>
            ) : resultados.length === 0 ? (
              <p className="text-[12.5px] text-slate-400 italic px-3 py-3">Sin coincidencias.</p>
            ) : resultados.map(p => {
              const sem = SEMAFORO_CONFIG[(p.estado_semaforo ?? 'gris') as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
              return (
                <button key={p.id} onClick={() => { onPick(p); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-violet-50 border-b border-slate-50 last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-none ${sem.dot}`} />
                  <span className="flex-1 min-w-0 text-[13px] text-slate-700 truncate">{p.nombre}</span>
                  {!p.es_desalojo && p.pct_avance != null && (
                    <span className="flex-none text-[12px] font-bold text-violet-700 tabular-nums">{Math.round(p.pct_avance)}%</span>
                  )}
                </button>
              )
            })}
          </div>
        </DropdownPanel>
      )}
    </>
  )
}

// Buscar carteras — ~30: se muestran todas por defecto, "Todas las carteras" arriba.
export function CarteraBuscador({ yaElegidas, onPick, label = '+ cartera' }: {
  yaElegidas: string[]; onPick: (institucion: string) => void; label?: string
}) {
  const { open, setOpen, pos, triggerRef, panelRef, abrir } = useAnchoredDropdown()
  const [q, setQ] = useState('')
  const t = q.trim().toLowerCase()

  const opciones = useMemo(() => {
    const base: { value: string; label: string; grupo: string }[] = []
    if (!yaElegidas.includes(TODAS_CARTERAS)) base.push({ value: TODAS_CARTERAS, label: TODAS_CARTERAS, grupo: 'Colectivo' })
    for (const c of CARTERAS_GABINETE) {
      if (yaElegidas.includes(c)) continue
      base.push({ value: c, label: shortCartera(c), grupo: ACTORES_GABINETE_NO_SEREMI.includes(c) ? 'Otros actores' : 'SEREMIs' })
    }
    if (!t) return base
    return base.filter(o => o.label.toLowerCase().includes(t) || o.value.toLowerCase().includes(t))
  }, [yaElegidas, t])

  return (
    <>
      <button ref={triggerRef} onClick={() => { if (open) setOpen(false); else { setQ(''); abrir() } }}
        className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full border border-dashed transition-colors ${
          open ? 'border-violet-300 text-violet-600 bg-violet-50' : 'border-slate-300 text-slate-400 hover:border-violet-300 hover:text-violet-600'}`}>
        {label}
      </button>
      {open && pos && (
        <DropdownPanel pos={pos} panelRef={panelRef}>
          <BuscadorHeader value={q} onChange={setQ} onClose={() => setOpen(false)} placeholder="Buscar cartera…" />
          <div className="max-h-64 overflow-y-auto py-1">
            {opciones.length === 0 ? (
              <p className="text-[12.5px] text-slate-400 italic px-3 py-3">Sin coincidencias.</p>
            ) : opciones.map(o => (
              <button key={o.value} onClick={() => { onPick(o.value); setOpen(false) }}
                className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-violet-50 border-b border-slate-50 last:border-0">
                <span className={`text-[13px] ${o.grupo === 'Colectivo' ? 'font-semibold text-violet-700' : 'text-slate-700'}`}>{o.label}</span>
                {o.grupo !== 'SEREMIs' && <span className="flex-none text-[10px] uppercase tracking-wide text-slate-400">{o.grupo}</span>}
              </button>
            ))}
          </div>
        </DropdownPanel>
      )}
    </>
  )
}
