'use client'

import { useMemo } from 'react'
import { sumaHora } from '@/lib/sesiones/helpers'
import { SEMAFORO_CONFIG } from '@/lib/config'
import { IniBuscador, CarteraBuscador, shortCartera } from './pickers'
import type { Iniciativa } from '@/lib/projects'
import type { PautaApi, PautaPunto, PautaIniciativa } from '@/lib/hooks/usePautaGabinete'

/**
 * Paso 2 del stepper de Preparación (Gabinete v2) — la PAUTA, columna vertebral
 * de la sesión. Cada punto: título, carteras responsables, el Contexto opcional,
 * minutos e iniciativas del PREGO vinculadas. La hora
 * objetivo por punto se recalcula sola (acumulado sobre la hora de inicio).
 * Escrituras vía el data-layer usePautaGabinete (safeWrite defensivo). Los
 * buscadores flotantes (cartera / iniciativa) viven en ./pickers (compartidos
 * con la Consola en sala).
 */

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function iniDesdeProyecto(p: Iniciativa): PautaIniciativa {
  return {
    prioridad_id: p.id,
    nombre: p.nombre,
    pctAvance: p.es_desalojo ? null : p.pct_avance,
    semaforo: p.estado_semaforo,
    es_desalojo: p.es_desalojo,
  }
}

type Props = {
  api: PautaApi
  projects: Iniciativa[]
  horaInicio: string
  canOperar: boolean
  onOpenIniciativa: (prioridadId: number) => void
}

export default function PasoPauta({ api, projects, horaInicio, canOperar, onOpenIniciativa }: Props) {
  const { pauta } = api

  // Hora objetivo por punto (acumulado de minutos).
  const conHora = useMemo(() => {
    let acum = 0
    return pauta.map(p => {
      const hora = sumaHora(horaInicio, acum)
      acum += p.minutos ?? 5
      return { punto: p, hora }
    })
  }, [pauta, horaInicio])

  const totalMin = pauta.reduce((s, p) => s + (p.minutos ?? 5), 0)
  const horaTermino = sumaHora(horaInicio, totalMin)

  async function agregarPuntoVacio() {
    await api.addPunto({ titulo: '', minutos: 5, origen: 'manual' })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_.9fr] gap-5 items-start">
      {/* ── Columna: puntos (scrollea igual que Pendientes) ───────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[calc(100vh-400px)] min-h-[240px]">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100 flex-none">
          <h3 className="text-[15px] font-bold text-slate-900">Puntos de la pauta</h3>
          <span className="text-xs text-slate-400">la hora se recalcula sola</span>
        </div>

        <div className="p-3 space-y-3 overflow-y-auto">
          {pauta.length === 0 && (
            <p className="text-sm text-slate-400 italic px-2 py-6 text-center">
              Sin puntos todavía. Suma desde <b className="font-semibold text-slate-500">Pendientes</b> o agrega uno aquí abajo.
            </p>
          )}

          {conHora.map(({ punto, hora }, i) => (
            <PuntoCard
              key={punto.id}
              punto={punto} hora={hora} indice={i} total={pauta.length}
              api={api} projects={projects} canOperar={canOperar} onOpenIniciativa={onOpenIniciativa}
            />
          ))}
        </div>

        {canOperar && (
          <div className="p-3 border-t border-slate-100 flex-none">
            <button
              onClick={agregarPuntoVacio}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 border border-dashed border-slate-300 rounded-xl text-slate-400 text-sm font-semibold hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50/60 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              Agregar punto a la pauta
            </button>
          </div>
        )}
      </div>

      {/* ── Aside: resumen del tiempo ─────────────────────────────────────── */}
      <div className="space-y-4 lg:sticky lg:top-0">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-5 pt-4 pb-3 border-b border-slate-100">
            <h3 className="text-[15px] font-bold text-slate-900">Resumen del tiempo</h3>
          </div>
          <div className="px-5 py-3 text-sm">
            <Linea k="Hora de inicio" v={horaInicio} />
            <Linea k="Puntos" v={String(pauta.length)} />
            <Linea k="Tiempo estimado" v={`${totalMin} min`} />
            <Linea k="Término aprox." v={horaTermino} last />
          </div>
        </div>

        <div className="flex gap-2.5 items-start px-3.5 py-3 rounded-xl bg-violet-50 text-violet-800 text-[13px] leading-snug">
          <svg className="flex-none mt-0.5" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M5 10l7-7 7 7"/></svg>
          <span>Cada punto es la <b className="font-semibold">columna vertebral</b>: en la sesión, el relato y los compromisos cuelgan de él, y el acta se arma sola al cierre.</span>
        </div>
      </div>
    </div>
  )
}

function Linea({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-2 ${last ? '' : 'border-b border-slate-100'}`}>
      <span className="text-slate-500">{k}</span>
      <span className="font-bold text-slate-900 tabular-nums">{v}</span>
    </div>
  )
}

// ── Tarjeta de un punto ───────────────────────────────────────────────────────

function PuntoCard({
  punto, hora, indice, total, api, projects, canOperar, onOpenIniciativa,
}: {
  punto: PautaPunto; hora: string; indice: number; total: number
  api: PautaApi; projects: Iniciativa[]; canOperar: boolean; onOpenIniciativa: (prioridadId: number) => void
}) {
  const iniDisponibles = useMemo(
    () => projects.filter(p => !punto.iniciativas.some(i => i.prioridad_id === p.id)),
    [projects, punto.iniciativas],
  )

  return (
    <div className="flex border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
      {/* Gutter: hora + minutos + reordenar */}
      <div className="w-[68px] flex-none bg-slate-50 border-r border-slate-100 flex flex-col items-center py-3 px-1.5 gap-0.5">
        <div className="text-[13.5px] font-bold text-slate-800 tabular-nums">{hora}</div>
        {canOperar ? (
          <label className="flex items-baseline gap-0.5 text-[10.5px] text-slate-400">
            <input
              type="number" min={1} max={120} defaultValue={punto.minutos ?? 5}
              onBlur={e => {
                const m = Math.max(1, Math.min(120, Number(e.target.value) || 5))
                if (m !== punto.minutos) api.updatePunto(punto.id, { minutos: m })
              }}
              className="w-8 text-center bg-transparent border-b border-slate-200 text-[11px] text-slate-600 focus:outline-none focus:border-violet-400"
            /> min
          </label>
        ) : (
          <div className="text-[10.5px] text-slate-400">{punto.minutos ?? 5} min</div>
        )}
        {canOperar && (
          <div className="mt-auto flex flex-col items-center gap-0.5 pt-2 text-slate-300">
            <button disabled={indice === 0} onClick={() => api.moverPunto(punto.id, 'up')}
              className="disabled:opacity-30 hover:text-violet-600" title="Subir">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 15l-6-6-6 6"/></svg>
            </button>
            <button disabled={indice === total - 1} onClick={() => api.moverPunto(punto.id, 'down')}
              className="disabled:opacity-30 hover:text-violet-600" title="Bajar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0 p-3.5 group">
        <div className="flex items-start gap-2">
          <span className="text-[15px] font-extrabold text-violet-700 leading-[22px] flex-none tabular-nums">{indice + 1}.</span>
          {canOperar ? (
            <textarea
              defaultValue={punto.titulo ?? punto.texto ?? ''} rows={1} placeholder="Título del punto…"
              ref={autoGrow} onInput={e => autoGrow(e.currentTarget)}
              onBlur={e => { const v = e.target.value.trim(); if (v !== (punto.titulo ?? '')) api.updatePunto(punto.id, { titulo: v }) }}
              className="flex-1 min-w-0 text-[15px] font-bold text-slate-900 leading-[22px] py-0 resize-none overflow-hidden bg-transparent border-b border-transparent focus:outline-none focus:border-violet-300 placeholder:text-slate-300 placeholder:font-normal"
            />
          ) : (
            <span className="flex-1 text-[15px] font-bold text-slate-900 leading-[22px]">{punto.titulo || punto.texto || '(sin título)'}</span>
          )}
          {canOperar && (
            <button onClick={() => { if (confirm('¿Quitar este punto de la pauta?')) api.removePunto(punto.id) }}
              className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex-none" title="Quitar punto">
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
            </button>
          )}
        </div>

        {/* Carteras */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          {punto.carteras.map(c => (
            <span key={c} className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-800">
              {shortCartera(c)}
              {canOperar && (
                <button onClick={() => api.quitarCartera(punto.id, c)} className="text-violet-400 hover:text-violet-700" title="Quitar cartera">
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
                </button>
              )}
            </span>
          ))}
          {canOperar && (
            <CarteraBuscador yaElegidas={punto.carteras} onPick={inst => api.agregarCartera(punto.id, inst)} />
          )}
        </div>

        {/* Contexto (opcional) — parte bajo el número, ocupa todo el ancho */}
        <div className="mt-2.5 rounded-lg px-3 py-2 bg-slate-50 border border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Contexto</div>
          {canOperar ? (
            <textarea
              defaultValue={punto.proposito ?? ''} rows={1} placeholder="Más info sobre el punto, si corresponde (opcional)"
              ref={autoGrow} onInput={e => autoGrow(e.currentTarget)}
              onBlur={e => { const v = e.target.value.trim(); if (v !== (punto.proposito ?? '')) api.updatePunto(punto.id, { proposito: v || null }) }}
              className="w-full mt-0.5 text-[13.5px] text-slate-800 leading-snug resize-none overflow-hidden bg-transparent focus:outline-none placeholder:text-slate-400"
            />
          ) : (
            <p className="mt-0.5 text-[13.5px] text-slate-800 leading-snug">{punto.proposito || '—'}</p>
          )}
        </div>

        {/* Iniciativas del PREGO */}
        <div className="mt-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {punto.iniciativas.map(ini => {
              const sem = SEMAFORO_CONFIG[(ini.semaforo ?? 'gris') as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
              return (
                <span key={ini.prioridad_id} className="inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <button onClick={() => onOpenIniciativa(ini.prioridad_id)} title="Abrir la ficha de la iniciativa"
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 text-slate-700 hover:bg-violet-50 hover:text-violet-800 transition-colors">
                    <span className={`w-1.5 h-1.5 rounded-full flex-none ${sem.dot}`} />
                    <span className="truncate max-w-[220px]">{ini.nombre}</span>
                    {ini.pctAvance != null && <span className="text-violet-700 font-bold tabular-nums">{Math.round(ini.pctAvance)}%</span>}
                  </button>
                  {canOperar && (
                    <button onClick={() => api.quitarIniciativa(punto.id, ini.prioridad_id)} title="Desvincular"
                      className="flex-none px-1.5 py-1 border-l border-slate-100 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
                    </button>
                  )}
                </span>
              )
            })}
            {canOperar && iniDisponibles.length > 0 && (
              <IniBuscador
                disponibles={iniDisponibles}
                onPick={p => api.agregarIniciativa(punto.id, iniDesdeProyecto(p))}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

