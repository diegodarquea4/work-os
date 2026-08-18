'use client'

/**
 * Barra de controles del modo «Autoridades». Acordeón que en reposo muestra SOLO
 * la selección actual (ej. «Alcaldes · 2024 · Abierta») y al tocarlo se expande a
 * un box con cada campo etiquetado y sus opciones dispuestas horizontalmente
 * (segmentado, no dropdown nativo). Cada franja de opciones mide lo que sus
 * opciones (`self-start`). Comparte chrome con la simbología (`panelChrome`) y se
 * coordina con ella por `panelAbierto`: abrir uno colapsa el otro. Se minimiza
 * con el chevron, con Escape o con click fuera del stack de controles.
 *
 * Reglas de visibilidad calcadas de `afterControlChange` del PTS: fecha municipal
 * y clasificación solo en alcalde/gobernador; año y coloreo de congreso solo en
 * diputado/senador; período solo en delegado; «Reelección 2028» en todos salvo
 * delegado; «Excel circunscripciones 2029» solo en senador.
 */

import { useEffect, useState } from 'react'
import { useTerritorialCtx } from './TerritorialProvider'
import { esNivelCongreso } from '@/lib/territorial/derive'
import { exportCircunscripciones2029 } from '@/lib/territorial/carrito'
import { Chevron, PILL_CLS, PANEL_CLS, PANEL_TITLE_CLS, MINIMIZE_BTN_CLS } from './panelChrome'
import ReeleccionModal from './ReeleccionModal'
import CarritoModal from './CarritoModal'
import BuscadorComunas from './BuscadorComunas'
import type { NivelAutoridad, AnioMunicipal, ClaveLado } from '@/lib/territorial/types'

const NIVEL_LABEL: Record<NivelAutoridad, string> = {
  alcalde: 'Alcaldes', gobernador: 'Gobernadores', diputado: 'Diputados', senador: 'Senadores', delegado: 'Delegados',
}
const LADO_LABEL: Record<ClaveLado, string> = { lado_abierto: 'Abierta', lado_cerrado: 'Cerrada' }
const COLOREO_LABEL: Record<'comuna' | 'distrito', string> = { comuna: 'Por comuna', distrito: 'Por distrito' }
const PERIODO_OPC = [
  { value: 'Gabriel Boric Font', short: 'Boric', full: 'Boric (2022-2026)' },
  { value: 'Sebastián Piñera Echenique', short: 'Piñera', full: 'Piñera (2018-2022)' },
  { value: 'Michelle Bachelet Jeria', short: 'Bachelet', full: 'Bachelet (2014-2018)' },
]

type Opcion = { value: string; label: string }

/** Un campo del box: etiqueta + opciones segmentadas en fila (miden lo que sus opciones). */
function SegField({ label, value, options, onChange }: {
  label: string
  value: string
  options: Opcion[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-0.5 self-start rounded-lg border border-slate-200 bg-slate-100 p-0.5">
        {options.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
                on ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function btnCls(): string {
  return 'rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-40'
}

type Props = {
  onNavigateComuna: (regionCod: string, cut: number, comuna: string) => void
}

export default function AutoridadesToolbar({ onNavigateComuna }: Props) {
  const { data, state, setState, carrito, loading, error, panelAbierto, setPanelAbierto } = useTerritorialCtx()
  const [modal, setModal] = useState<'reeleccion' | 'carrito' | null>(null)

  const expanded = panelAbierto === 'controles'
  const esCongreso = esNivelCongreso(state.nivel)
  const esDelegado = state.nivel === 'delegado'
  const listo = !loading && !error

  // Cierra el panel abierto (cualquiera) al hacer click fuera del stack de
  // controles o con Escape. Los clicks dentro del stack (toggle, box, simbología,
  // breadcrumb) no cuentan. Con un modal abierto no se escucha (el click va al
  // modal, no debe colapsar el box detrás).
  useEffect(() => {
    if (!panelAbierto || modal) return
    function onDown(e: MouseEvent) {
      const el = e.target as Element | null
      if (el?.closest?.('[data-autoridades-controls]')) return
      setPanelAbierto(null)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setPanelAbierto(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [panelAbierto, modal, setPanelAbierto])

  // Resumen de la selección actual (lo que se ve minimizado y en el encabezado).
  const resumen: string[] = [NIVEL_LABEL[state.nivel]]
  if (esCongreso) resumen.push(state.congresoAnio, COLOREO_LABEL[state.coloreoCongreso])
  else if (esDelegado) resumen.push(PERIODO_OPC.find((p) => p.value === state.periodoDelegado)?.short ?? '')
  else resumen.push(state.year, LADO_LABEL[state.lado])
  const resumenTxt = resumen.filter(Boolean).join('  ·  ')

  return (
    <>
      {!expanded ? (
        <button type="button" onClick={() => setPanelAbierto('controles')} aria-expanded={false} className={PILL_CLS}>
          <span className="truncate">{resumenTxt}</span>
          <Chevron />
        </button>
      ) : (
        <div className={`w-max max-w-[calc(100vw-1.5rem)] ${PANEL_CLS}`}>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className={PANEL_TITLE_CLS}>{resumenTxt}</span>
            <button type="button" onClick={() => setPanelAbierto(null)} aria-label="Minimizar controles" className={MINIMIZE_BTN_CLS}>
              <Chevron up />
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <SegField
              label="Autoridad"
              value={state.nivel}
              onChange={(v) => setState({ nivel: v as NivelAutoridad })}
              options={[
                { value: 'alcalde', label: 'Alcaldes' },
                { value: 'gobernador', label: 'Gobernadores' },
                { value: 'diputado', label: 'Diputados' },
                { value: 'senador', label: 'Senadores' },
                { value: 'delegado', label: 'Delegados' },
              ]}
            />

            {!esCongreso && !esDelegado && (
              <SegField
                label="Fecha"
                value={state.year}
                onChange={(v) => setState({ year: v as AnioMunicipal })}
                options={[{ value: '2021', label: '2021' }, { value: '2024', label: '2024' }]}
              />
            )}
            {esCongreso && (
              <SegField
                label="Fecha"
                value={state.congresoAnio}
                onChange={(v) => setState({ congresoAnio: v })}
                options={[
                  { value: '2013', label: '2013' }, { value: '2017', label: '2017' },
                  { value: '2021', label: '2021' }, { value: '2025', label: '2025' },
                ]}
              />
            )}
            {esDelegado && (
              <SegField
                label="Período"
                value={state.periodoDelegado}
                onChange={(v) => setState({ periodoDelegado: v })}
                options={PERIODO_OPC.map((p) => ({ value: p.value, label: p.full }))}
              />
            )}

            {!esCongreso && !esDelegado && (
              <SegField
                label="Clasificación"
                value={state.lado}
                onChange={(v) => setState({ lado: v as ClaveLado })}
                options={[{ value: 'lado_abierto', label: 'Abierta' }, { value: 'lado_cerrado', label: 'Cerrada' }]}
              />
            )}
            {esCongreso && (
              <SegField
                label="Coloreo"
                value={state.coloreoCongreso}
                onChange={(v) => setState({ coloreoCongreso: v as 'comuna' | 'distrito' })}
                options={[{ value: 'comuna', label: 'Por comuna' }, { value: 'distrito', label: 'Por distrito' }]}
              />
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
            {!esDelegado && (
              <button className={btnCls()} onClick={() => setModal('reeleccion')} disabled={!listo}>Reelección 2028</button>
            )}
            <button className={btnCls()} onClick={() => setModal('carrito')} disabled={!listo}>Descarga ({carrito.length})</button>
            {state.nivel === 'senador' && (
              <button className={btnCls()} onClick={() => { if (data) void exportCircunscripciones2029(data) }} disabled={!listo}>Excel 2029</button>
            )}
          </div>

          <div className="mt-2.5">
            <BuscadorComunas onNavigateComuna={onNavigateComuna} />
          </div>
        </div>
      )}

      {modal === 'reeleccion' && <ReeleccionModal onClose={() => setModal(null)} onNavigateComuna={onNavigateComuna} />}
      {modal === 'carrito' && <CarritoModal onClose={() => setModal(null)} />}
    </>
  )
}
