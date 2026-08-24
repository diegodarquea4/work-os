'use client'

import { useState } from 'react'
import { sumaHora } from '@/lib/sesiones/helpers'
import type { PautaPunto } from '@/lib/hooks/usePautaGabinete'

/**
 * Paso 3 del stepper (Gabinete v2): checklist antes de enviar + descarga de la
 * hoja de conducción. El botón "Enviar pauta" vive en el footer del shell.
 * La descarga replica el patrón binario de AttentionTray (fetch → blob → <a>).
 */

type Props = {
  pauta: PautaPunto[]
  horaInicio: string
  region: { cod: string; nombre: string }
  sesionId: number
}

type Check = { ok: boolean; titulo: string; detalle?: string }

export default function PasoRevisar({ pauta, horaInicio, region, sesionId }: Props) {
  const [descargando, setDescargando] = useState(false)

  const totalMin = pauta.reduce((s, p) => s + (p.minutos ?? 5), 0)
  const termino = sumaHora(horaInicio, totalMin)
  const sinCartera = pauta.filter(p => p.carteras.length === 0)
  const sinContexto = pauta.filter(p => !(p.proposito ?? '').trim())
  const conIni = pauta.filter(p => p.iniciativas.length > 0).length
  // "Dentro de la hora": término ≤ inicio + 60 min (heurística de reunión).
  const dentroDeHora = totalMin <= 60

  const checks: Check[] = [
    sinCartera.length === 0
      ? { ok: true, titulo: 'Todos los puntos tienen cartera responsable' }
      : { ok: false, titulo: `${sinCartera.length} punto${sinCartera.length > 1 ? 's' : ''} sin cartera`, detalle: sinCartera.map(p => p.titulo || '(sin título)').join(' · ') },
    sinContexto.length === 0
      ? { ok: true, titulo: 'Todos los puntos tienen contexto' }
      : { ok: true, titulo: `${sinContexto.length} punto${sinContexto.length > 1 ? 's' : ''} sin contexto`, detalle: 'El contexto es opcional' },
    conIni > 0
      ? { ok: true, titulo: `${conIni} punto${conIni > 1 ? 's' : ''} con iniciativa del PREGO vinculada`, detalle: 'Salen con su % de avance en la hoja' }
      : { ok: true, titulo: 'Sin iniciativas del PREGO vinculadas', detalle: 'Opcional' },
    dentroDeHora
      ? { ok: true, titulo: `Cierra ${termino} — dentro de la hora de reunión` }
      : { ok: false, titulo: `Estimado ${totalMin} min (cierra ${termino})`, detalle: 'Se pasa de la hora; recortá minutos o puntos' },
  ]

  async function descargarHoja() {
    setDescargando(true)
    try {
      const res = await fetch(`/api/sesiones/${sesionId}/hoja-conduccion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horaInicio }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        window.alert(err.error ?? 'No se pudo generar la hoja de conducción.')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `hoja-conduccion-${region.cod}-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      window.alert((e as Error).message)
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_.95fr] gap-5 items-start">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
          <h3 className="text-[15px] font-bold text-slate-900">Antes de enviar</h3>
          <span className="text-xs text-slate-400">{pauta.length} puntos · {totalMin} min</span>
        </div>
        <div className="p-2">
          {checks.map((c, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
              <span className={`w-6 h-6 rounded-full grid place-items-center flex-none ${c.ok ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                {c.ok
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5 9-11"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 8v5M12 16h.01"/></svg>}
              </span>
              <span className="flex-1 text-[13.5px] text-slate-800">
                {c.titulo}
                {c.detalle && <small className="block text-slate-500 text-[12px]">{c.detalle}</small>}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
          <h3 className="text-[15px] font-bold text-slate-900">Hoja de conducción</h3>
          <span className="text-xs text-slate-400">el papel de la mesa</span>
        </div>
        <div className="px-5 py-4">
          <div className="flex gap-3 items-center">
            <div className="w-[52px] h-[66px] rounded-md border border-slate-200 bg-slate-50 grid place-items-center flex-none shadow-sm">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" strokeWidth="1.6"><path d="M14 3v5h5M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 12h8M8 16h5"/></svg>
            </div>
            <p className="text-[13px] text-slate-500 leading-snug">2 caras · pauta con preguntas y hora objetivo + compromisos a cobrar por cartera. Se despacha con la citación.</p>
          </div>
          <button onClick={descargarHoja} disabled={descargando || pauta.length === 0}
            className="w-full mt-4 flex items-center justify-center gap-2 text-[13.5px] font-semibold px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
            {descargando ? 'Generando…' : 'Descargar hoja de conducción'}
          </button>
        </div>
      </div>
    </div>
  )
}
