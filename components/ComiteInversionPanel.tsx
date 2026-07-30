'use client'

import { useState } from 'react'
import {
  useCanEditAny,
  useCanEditOperational,
  useCurrentUserEmail,
} from '@/lib/context/UserContext'
import type { Region } from '@/lib/regions'
import { useSesionesResumenComite } from '@/lib/hooks/useSesionesEje'
import SesionModalInversion from './SesionModalInversion'
import HistorialSesionesInversionModal from './HistorialSesionesInversionModal'
import NominaInversionModal from './NominaInversionModal'
import OaecaModal from './OaecaModal'

/**
 * Panel del tab "Comité Seguimiento de la Inversión" en ComitesRegionalesSection.
 * A diferencia de MetricasEjeDrawer (Comité Policial), este comité no tiene
 * eje ni métricas — es solo el módulo Sesiones, siempre disponible (sin flag
 * de activación) porque el tab ya existe fijo para las 16 regiones.
 */

type Props = {
  region: Region
}

const NOMBRE_COMITE = 'Comité Seguimiento de la Inversión'

export default function ComiteInversionPanel({ region }: Props) {
  const canEditAny         = useCanEditAny()
  const canEditOperational = useCanEditOperational()
  const userEmail          = useCurrentUserEmail()

  const [sesionOpen, setSesionOpen]       = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [nominaOpen, setNominaOpen]       = useState(false)
  const [oaecaOpen, setOaecaOpen]         = useState(false)

  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const { resumen, refresh: refreshResumen } = useSesionesResumenComite(region.cod, 'inversion', canEditOperational)

  function fmtFechaCorta(fecha: string): string {
    return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  }

  async function handleActualizarSeia() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/seia-sync/trigger', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      setSyncMsg(res.ok
        ? `Listo — ${body.upserted ?? 0} proyectos actualizados`
        : (body.error ?? `Error HTTP ${res.status}`))
    } catch {
      setSyncMsg('Error de red actualizando SEIA')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-start gap-2">
          {canEditOperational && (
            <button
              onClick={() => setSesionOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 transition-colors"
              title={resumen.borradorId ? 'Continuar el borrador de sesión' : `Nueva sesión de ${NOMBRE_COMITE}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="10" height="9" rx="1.5"/>
                <path d="M2 6h10M5 1.5V4M9 1.5V4"/>
              </svg>
              {resumen.borradorId ? 'Continuar sesión' : 'Nueva sesión'}
            </button>
          )}
          {canEditAny && (
            <button
              onClick={handleActualizarSeia}
              disabled={syncing}
              className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 font-medium rounded-lg hover:border-gray-300 hover:text-gray-700 transition-colors disabled:opacity-50"
              title="Sincroniza el catálogo de proyectos desde SEIA (puede tardar unos minutos)"
            >
              {syncing ? 'Actualizando…' : 'Actualizar proyectos en SEIA'}
            </button>
          )}
        </div>

        {syncMsg && (
          <p className="px-4 pb-2 text-[11px] text-gray-500">{syncMsg}</p>
        )}

        {canEditOperational && (
          <div className="px-4 pb-2">
            <div className="flex items-center gap-1.5 text-[11px] text-violet-900 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
              <span className="font-semibold">{resumen.compromisosAbiertos}</span>
              <span>compromiso{resumen.compromisosAbiertos === 1 ? '' : 's'} abierto{resumen.compromisosAbiertos === 1 ? '' : 's'}</span>
              <span className="text-violet-300">·</span>
              <span>
                {resumen.ultimaSesionFecha
                  ? `última sesión ${fmtFechaCorta(resumen.ultimaSesionFecha)}`
                  : 'sin sesiones cerradas aún'}
              </span>
            </div>
          </div>
        )}

        {!canEditOperational && (
          <div className="py-10 text-center text-sm text-gray-400 px-4">
            No tienes permiso para operar el módulo de sesiones de este comité.
          </div>
        )}

        {canEditOperational && (
          <div className="border-t border-violet-100 bg-violet-50/50 px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
              Sesiones de {NOMBRE_COMITE}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNominaOpen(true)}
                className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
                title="Nómina fija del comité (titulares y suplentes)"
              >
                Nómina
              </button>
              <span className="text-violet-200">|</span>
              <button
                onClick={() => setOaecaOpen(true)}
                className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
                title="Catálogo de OAECA (organismos que emiten oficios)"
              >
                OAECA
              </button>
              <span className="text-violet-200">|</span>
              <button
                onClick={() => setHistorialOpen(true)}
                className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
              >
                Ver historial →
              </button>
            </div>
          </div>
        )}
      </div>

      {sesionOpen && (
        <SesionModalInversion
          region={region}
          borradorId={resumen.borradorId}
          currentUserEmail={userEmail}
          onClose={() => {
            setSesionOpen(false)
            refreshResumen()
          }}
        />
      )}
      {historialOpen && (
        <HistorialSesionesInversionModal region={region} onClose={() => setHistorialOpen(false)} />
      )}
      {nominaOpen && (
        <NominaInversionModal region={region} onClose={() => setNominaOpen(false)} />
      )}
      {oaecaOpen && (
        <OaecaModal currentUserEmail={userEmail} onClose={() => setOaecaOpen(false)} />
      )}
    </>
  )
}
