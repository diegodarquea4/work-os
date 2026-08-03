'use client'

import { useState } from 'react'
import type { Region } from '@/lib/regions'
import type { ComiteInstitucion, RegionEje } from '@/lib/types'
import { useCanEditOperational, useCurrentUserEmail } from '@/lib/context/UserContext'
import { useSesionesResumen } from '@/lib/hooks/useSesionesEje'
import { useCatalogoComite, useSeriesComite } from '@/lib/hooks/useComiteMetricas'
import { COMITE_INSTITUCIONES, deltaPulso } from '@/lib/sesiones/helpers'
import SesionModal from './SesionModal'
import HistorialSesionesModal from './HistorialSesionesModal'
import NominaModal from './NominaModal'

/**
 * Tab "Comité Policial" de la sección Comités y Gabinete Regional (Mi Región).
 * Reemplaza el montaje de MetricasEjeDrawer: la sesión ahora captura métricas
 * POR INSTITUCIÓN (mig 048), así que el "general del comité" muestra el
 * seguimiento WoW por institución (Δ vs sesión anterior + sparkline) en vez de
 * las cards suma/pulso. Mantiene el mismo control de sesiones (Nueva sesión /
 * Nómina / Historial). Todo cuelga de `sesionesOn` (viewer sin acceso).
 */

type Props = {
  region: Region
  eje: RegionEje   // el eje con sesiones_habilitadas (Comité Policial)
}

export default function ComitePolicialTab({ region, eje }: Props) {
  const canEditOperational = useCanEditOperational()
  const userEmail          = useCurrentUserEmail()
  const sesionesOn = eje.sesiones_habilitadas && canEditOperational
  const nombreInstancia = eje.sesiones_nombre ?? 'Comité Policial'

  const [sesionOpen, setSesionOpen]       = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [nominaOpen, setNominaOpen]       = useState(false)
  const [inst, setInst]                   = useState<ComiteInstitucion>('carabineros')
  const [seriesKey, setSeriesKey]         = useState(0)   // bump tras cerrar sesión

  const { resumen, refresh: refreshResumen } = useSesionesResumen(region.cod, { instancia: 'eje', ejeId: eje.id }, sesionesOn)
  const { catalogo, refresh: refreshCatalogo } = useCatalogoComite(region.cod, sesionesOn)
  const series = useSeriesComite(region.cod, eje.id, sesionesOn, seriesKey)

  if (!sesionesOn) {
    return (
      <div className="text-center py-10 px-6 bg-white rounded-xl border border-gray-100">
        <p className="text-sm text-gray-600 mb-1 font-medium">{nombreInstancia} — {region.nombre}</p>
        <p className="text-xs text-gray-400 max-w-md mx-auto">
          Las sesiones del comité las gestiona el equipo regional y la división. Tu perfil no tiene acceso a este módulo.
        </p>
      </div>
    )
  }

  const numericas = catalogo.filter(m => m.institucion === inst && m.activo && m.tipo === 'numerico')
  const textos    = catalogo.filter(m => m.institucion === inst && m.activo && m.tipo === 'texto')

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Acción */}
      <div className="px-4 pt-4 pb-2">
        <button
          onClick={() => setSesionOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 transition-colors"
          title={resumen.borradorId ? 'Continuar el borrador de sesión' : `Nueva sesión de ${nombreInstancia}`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="10" height="9" rx="1.5"/><path d="M2 6h10M5 1.5V4M9 1.5V4"/>
          </svg>
          {resumen.borradorId ? 'Continuar sesión' : 'Nueva sesión'}
        </button>
      </div>

      {/* Strip resumen */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-1.5 text-[11px] text-violet-900 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5 flex-wrap">
          <span className="font-semibold">{resumen.compromisosAbiertos}</span>
          <span>compromiso{resumen.compromisosAbiertos === 1 ? '' : 's'} abierto{resumen.compromisosAbiertos === 1 ? '' : 's'}</span>
          <span className="text-violet-300">·</span>
          <span>
            {resumen.ultimaSesionFecha ? `última sesión ${fmtFechaCorta(resumen.ultimaSesionFecha)}` : 'sin sesiones cerradas aún'}
          </span>
        </div>
      </div>

      {/* General del comité: seguimiento WoW por institución */}
      <div className="px-4 pb-3">
        <div className="flex flex-wrap gap-1 mb-3">
          {COMITE_INSTITUCIONES.map(i => (
            <button
              key={i.key}
              onClick={() => setInst(i.key)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                inst === i.key ? 'bg-violet-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>

        {catalogo.filter(m => m.institucion === inst && m.activo).length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">
            Aún no hay métricas para {COMITE_INSTITUCIONES.find(i => i.key === inst)?.label}. Se definen al tomar una sesión.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {numericas.map(m => {
              const serie = series.get(m.id) ?? []
              const last  = serie[serie.length - 1]
              const prev  = serie[serie.length - 2]
              const delta = last ? deltaPulso(prev?.valor ?? null, last.valor) : null
              return (
                <div key={m.id} className="border border-gray-100 rounded-lg px-3 py-2.5 bg-gray-50/60">
                  <p className="text-[11px] text-gray-500 leading-snug mb-1 truncate" title={m.nombre}>{m.nombre}</p>
                  {last ? (
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <p className="text-lg font-bold text-slate-800 leading-none">
                          {last.valor.toLocaleString('es-CL')}
                          {m.unidad && <span className="text-[11px] font-normal text-gray-400 ml-1">{m.unidad}</span>}
                        </p>
                        {delta && (
                          <p className="text-[11px] text-gray-500 mt-1">
                            {delta.abs > 0 ? '▲' : delta.abs < 0 ? '▼' : '='} {Math.abs(delta.abs).toLocaleString('es-CL')}
                            {delta.pct != null ? ` (${delta.pct > 0 ? '+' : ''}${delta.pct.toFixed(1)}%)` : ''}
                            <span className="text-gray-300"> vs anterior</span>
                          </p>
                        )}
                      </div>
                      {serie.length >= 2 && <Sparkline puntos={serie.map(p => p.valor)} />}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">sin registros en sesiones cerradas</p>
                  )}
                </div>
              )
            })}
            {textos.length > 0 && (
              <p className="text-[11px] text-gray-400 sm:col-span-2 pt-1">
                {textos.length} ítem{textos.length === 1 ? '' : 's'} de texto (reporte cualitativo) — se ven en el acta y el historial.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer: historial + nómina */}
      <div className="border-t border-violet-100 bg-violet-50/50 px-4 py-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Sesiones de {nombreInstancia}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setNominaOpen(true)} className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline" title="Nómina del comité">Nómina</button>
          <span className="text-violet-200">|</span>
          <button onClick={() => setHistorialOpen(true)} className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline">Ver historial →</button>
        </div>
      </div>

      {sesionOpen && (
        <SesionModal
          region={region}
          instancia="eje"
          eje={eje}
          borradorId={resumen.borradorId}
          currentUserEmail={userEmail}
          onClose={() => {
            setSesionOpen(false)
            refreshResumen()
            refreshCatalogo()
            setSeriesKey(k => k + 1)
          }}
        />
      )}
      {historialOpen && (
        <HistorialSesionesModal
          region={region}
          instancia="eje"
          eje={eje}
          nombreInstancia={nombreInstancia}
          onClose={() => setHistorialOpen(false)}
        />
      )}
      {nominaOpen && (
        <NominaModal
          region={region}
          instancia="eje"
          eje={eje}
          nombreInstancia={nombreInstancia}
          onClose={() => setNominaOpen(false)}
        />
      )}
    </div>
  )
}

/** Sparkline mínimo (SVG) — clon del de MetricasEjeDrawer. */
function Sparkline({ puntos }: { puntos: number[] }) {
  const W = 64, H = 26, PAD = 2
  const min = Math.min(...puntos)
  const max = Math.max(...puntos)
  const range = max - min || 1
  const coords = puntos.map((v, i) => {
    const x = PAD + (i / (puntos.length - 1)) * (W - PAD * 2)
    const y = PAD + (1 - (v - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = coords[coords.length - 1].split(',').map(Number)
  return (
    <svg width={W} height={H} className="flex-shrink-0 text-violet-500" aria-hidden>
      <polyline points={coords.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill="currentColor" />
    </svg>
  )
}

function fmtFechaCorta(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
