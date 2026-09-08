'use client'

import { memo } from 'react'
import { mismaZona, type EstadoRail, type RailItem, type ZonaRef } from '@/lib/sesiones/consola'

/**
 * Riel izquierdo de la consola de sesión: las zonas de la reunión, con sus
 * sub-ítems (instituciones del reporte), badges y señal de avance. Mismo
 * lenguaje visual que el rail de la pauta del gabinete.
 *
 * IMPORTANTE: los botones NO hacen `preventDefault` en `mousedown`. Ese
 * mousedown es lo que saca el foco del campo que se estaba editando y dispara
 * su `onBlur` (= guardar) ANTES del `click` que cambia de zona. Si alguien
 * agrega `onMouseDown={e => e.preventDefault()}` para "no perder el foco",
 * se pierde el guardado.
 */

type Props = {
  items: RailItem[]
  activo: ZonaRef
  onSelect: (ref: ZonaRef) => void
  orientacion?: 'vertical' | 'horizontal'
}

function Senal({ estado, activo }: { estado: EstadoRail; activo: boolean }) {
  if (estado === 'listo') return <span className={`flex-none font-extrabold ${activo ? 'text-white' : 'text-green-600'}`}>✓</span>
  if (estado === 'con-actividad') return <span className={`w-1.5 h-1.5 rounded-full flex-none ${activo ? 'bg-white' : 'bg-violet-500'}`} />
  return null
}

function IconoComentarios() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

/** A dónde lleva el botón del ítem: a su primer sub-ítem si los tiene. */
function destinoDe(it: RailItem): ZonaRef {
  return it.subitems && it.subitems.length > 0 ? { zona: it.key, inst: it.subitems[0].key } : { zona: it.key }
}

function ConsolaRail({ items, activo, onSelect, orientacion = 'vertical' }: Props) {
  if (orientacion === 'horizontal') {
    // Chips en una línea para pantallas angostas: zonas y, para el reporte,
    // una por institución. Sin adornos: lo mínimo para poder saltar.
    const chips = items.flatMap(it =>
      it.subitems && it.subitems.length > 0
        ? it.subitems.map(s => ({ ref: { zona: it.key, inst: s.key } as ZonaRef, label: s.label, estado: s.estado }))
        : [{ ref: { zona: it.key } as ZonaRef, label: it.numero != null ? `${it.numero} · ${it.label}` : it.label, estado: it.estado }],
    )
    return (
      <div className="flex gap-1.5 min-w-max">
        {chips.map(c => {
          const on = mismaZona(c.ref, activo)
          return (
            <button key={`${c.ref.zona}-${c.ref.inst ?? ''}`} onClick={() => onSelect(c.ref)}
              className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
                on ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
              {c.label}
              <Senal estado={c.estado} activo={on} />
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <nav aria-label="Zonas de la sesión">
      {items.map(it => {
        const zonaActiva = activo.zona === it.key
        const enPadre = zonaActiva && (!it.subitems || it.subitems.length === 0 || !activo.inst)
        return (
          <div key={it.key} className="mb-0.5">
            <button
              onClick={() => onSelect(destinoDe(it))}
              aria-current={enPadre ? 'true' : undefined}
              className={`w-full flex items-center gap-2.5 text-left rounded-lg px-2.5 py-2 transition-colors ${
                enPadre ? 'bg-violet-600 text-white' : zonaActiva ? 'bg-violet-50 text-violet-900' : 'hover:bg-slate-50 text-slate-700'}`}
            >
              <span className={`w-[22px] h-[22px] flex-none rounded-full grid place-items-center text-[12px] font-bold tabular-nums ${
                enPadre ? 'bg-white/25 text-white' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>
                {it.numero != null ? it.numero : <IconoComentarios />}
              </span>
              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="flex-1 min-w-0 font-semibold truncate">{it.label}</span>
                {it.badge !== undefined && (
                  <span className={`text-[11px] tabular-nums flex-none ${enPadre ? 'text-white/80' : 'text-slate-400'}`}>{it.badge}</span>
                )}
                <Senal estado={it.estado} activo={enPadre} />
              </span>
            </button>

            {it.subitems && it.subitems.length > 0 && (
              <div className="mt-0.5 space-y-0.5">
                {it.subitems.map(s => {
                  const ref: ZonaRef = { zona: it.key, inst: s.key }
                  const on = mismaZona(ref, activo)
                  return (
                    <button key={s.key} onClick={() => onSelect(ref)} aria-current={on ? 'true' : undefined}
                      className={`w-full flex items-center gap-1.5 text-left rounded-lg pl-9 pr-2.5 py-1.5 text-[13px] transition-colors ${
                        on ? 'bg-violet-600 text-white' : 'hover:bg-slate-50 text-slate-600'}`}>
                      <span className="flex-1 min-w-0 font-medium truncate">{s.label}</span>
                      {s.badge !== undefined && (
                        <span className={`text-[11px] tabular-nums flex-none ${on ? 'text-white/80' : 'text-slate-400'}`}>{s.badge}</span>
                      )}
                      <Senal estado={s.estado} activo={on} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

export default memo(ConsolaRail)
