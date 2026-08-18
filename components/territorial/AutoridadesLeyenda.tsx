'use client'

/**
 * Simbología del modo «Autoridades», apilada bajo la barra de controles
 * (arriba-izquierda). Comparte chrome con el box (`panelChrome`) para que ambos
 * «conversen»: mismo pill colapsado, misma fuente, mismo chevron. Se coordina con
 * el box por `panelAbierto` (abrir uno colapsa el otro). Colapsada queda como un
 * pill «Simbología» bajo el box. Espejo de la simbología del PTS.
 */

import { COLOR_HEX, lightenColor } from '@/lib/territorial/politica'
import { useTerritorialCtx } from './TerritorialProvider'
import { Chevron, PILL_CLS, PANEL_CLS, PANEL_TITLE_CLS, MINIMIZE_BTN_CLS } from './panelChrome'

const BLOQUES: [string, string][] = [
  ['Izquierda', COLOR_HEX.IZQ],
  ['Derecha', COLOR_HEX.DER],
  ['Independiente', COLOR_HEX.IND],
  ['Sin dato', COLOR_HEX.NULL],
]

const TAMANOS = [
  'Muy chica: hasta 9 mil hab.',
  'Chica: 10 a 29 mil hab.',
  'Mediana: 30 a 77 mil hab.',
  'Grande: 81 a 297 mil hab.',
  'Gigante: 300 mil hab. o más',
]

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: color }} />
}

export default function AutoridadesLeyenda() {
  const { state, panelAbierto, setPanelAbierto } = useTerritorialCtx()
  const open = panelAbierto === 'simbologia'
  const esGobernador = state.nivel === 'gobernador'

  if (!open) {
    return (
      <button type="button" onClick={() => setPanelAbierto('simbologia')} aria-expanded={false} className={PILL_CLS}>
        <span>Simbología</span>
        <Chevron />
      </button>
    )
  }

  return (
    <div className={`w-64 max-w-full ${PANEL_CLS}`}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className={PANEL_TITLE_CLS}>Simbología</span>
        <button type="button" onClick={() => setPanelAbierto(null)} aria-label="Minimizar simbología" className={MINIMIZE_BTN_CLS}>
          <Chevron up />
        </button>
      </div>

      <div className="max-h-[45vh] overflow-y-auto">
        <div className="mb-1 text-[11px] font-semibold text-slate-400">Bloque político</div>
        <div className="flex flex-col gap-1">
          {BLOQUES.map(([label, color]) => (
            <div key={label} className="flex items-center gap-2 text-[12px] text-slate-600"><Swatch color={color} />{label}</div>
          ))}
        </div>

        {esGobernador && (
          <>
            <div className="mb-1 mt-2.5 text-[11px] font-semibold text-slate-400">Fuerza del gobernador por comuna</div>
            <div className="flex items-center gap-2 text-[12px] text-slate-600">
              <Swatch color={lightenColor(COLOR_HEX.IZQ, 0.85)} />
              <Swatch color={COLOR_HEX.IZQ} />
              Pálido = pocos votos (≤10%) · Pleno = muchos (≥70%)
            </div>
            <div className="mt-1 text-[11px] leading-snug text-slate-400">
              Mide el % obtenido, no si ganó. Clic en la comuna para el detalle.
            </div>
          </>
        )}

        <div className="mb-1 mt-2.5 text-[11px] font-semibold text-slate-400">Tamaño de comuna (población 2017)</div>
        <div className="flex flex-col gap-0.5">
          {TAMANOS.map((t) => <div key={t} className="text-[11px] text-slate-500">{t}</div>)}
        </div>
      </div>
    </div>
  )
}
