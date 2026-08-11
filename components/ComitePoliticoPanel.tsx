'use client'

import { useMemo, useState } from 'react'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { RegionEje } from '@/lib/types'
import { useCanEditOperational, useCurrentUserEmail } from '@/lib/context/UserContext'
import { useRegionConfig } from '@/lib/hooks/useRegionConfig'
import { useSesionesResumen } from '@/lib/hooks/useSesionesEje'
import SesionModalPolitico, { type DestinoCompromiso } from './SesionModalPolitico'
import HistorialSesionesPoliticoModal from './HistorialSesionesPoliticoModal'

/**
 * Panel del tab "Comité Político" en ComitesRegionalesSection. Es la instancia
 * más liviana (mig 059): reuniones con parlamentarios / entes políticos, con
 * asistencia ad-hoc, temas conversados y compromisos. Sin eje, sin métricas y
 * SIN flag de habilitación — disponible en las 16 regiones (como el Comité
 * Económico). Único gate: canEditOperational (viewer excluido).
 */

type Props = {
  region: Region
  regionEjes: RegionEje[]
  iniciativas: Iniciativa[]
  onAbrirIniciativa: (p: Iniciativa) => void
}

const NOMBRE_COMITE = 'Comité Político'

export default function ComitePoliticoPanel({ region, regionEjes, iniciativas, onAbrirIniciativa }: Props) {
  const canEditOperational = useCanEditOperational()
  const userEmail          = useCurrentUserEmail()
  const { config } = useRegionConfig(region.cod)

  const [sesionOpen, setSesionOpen]       = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)

  const { resumen, refresh: refreshResumen } = useSesionesResumen(
    region.cod, { instancia: 'politico' }, canEditOperational,
  )

  // Destinos de delegación de un compromiso (misma lógica que el mandato del
  // gabinete): a otra instancia que exista de verdad en la región. Se gestiona
  // en Político por defecto; se puede delegar a Gabinete (si está habilitado),
  // al Comité Policial (si su eje tiene sesiones) o al Comité Económico.
  const destinos = useMemo<DestinoCompromiso[]>(() => {
    const out: DestinoCompromiso[] = []
    if (config?.gabinete_habilitado) {
      out.push({ value: 'gabinete', label: config.gabinete_nombre ?? 'Gabinete Regional', instancia: 'gabinete', ejeId: null })
    }
    const policial = regionEjes.find(e => e.sesiones_habilitadas)
    if (policial) {
      out.push({ value: `eje:${policial.id}`, label: policial.sesiones_nombre ?? 'Comité Policial', instancia: 'eje', ejeId: policial.id })
    }
    out.push({ value: 'inversion', label: 'Comité Económico', instancia: 'inversion', ejeId: null })
    return out
  }, [config, regionEjes])

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {!canEditOperational ? (
        <div className="py-10 text-center text-sm text-gray-400 px-4">
          No tienes permiso para operar el módulo de sesiones de este comité.
        </div>
      ) : (
        <>
          {/* Acción principal */}
          <div className="px-4 pt-4 pb-2">
            <button
              onClick={() => setSesionOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 transition-colors"
              title={resumen.borradorId ? 'Continuar el borrador de sesión' : `Nueva sesión de ${NOMBRE_COMITE}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="10" height="9" rx="1.5"/>
                <path d="M2 6h10M5 1.5V4M9 1.5V4"/>
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
                {resumen.ultimaSesionFecha
                  ? `última sesión ${fmtFechaCorta(resumen.ultimaSesionFecha)}`
                  : 'sin sesiones cerradas aún'}
              </span>
            </div>
          </div>

          {/* Recordatorio del alcance */}
          <div className="px-4 pb-3">
            <p className="text-xs text-gray-400 leading-relaxed">
              Reuniones con parlamentarios y entes políticos. La asistencia se
              registra por sesión (se precargan los asistentes de la anterior).
              Los compromisos pueden enlazarse a una iniciativa o delegarse a otro
              comité o al gabinete.
            </p>
          </div>

          {/* Footer: historial */}
          <div className="border-t border-violet-100 bg-violet-50/50 px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
              Sesiones de {NOMBRE_COMITE}
            </span>
            <button
              onClick={() => setHistorialOpen(true)}
              className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
            >
              Ver historial →
            </button>
          </div>
        </>
      )}

      {sesionOpen && (
        <SesionModalPolitico
          region={region}
          borradorId={resumen.borradorId}
          currentUserEmail={userEmail}
          iniciativas={iniciativas}
          destinos={destinos}
          onAbrirIniciativa={onAbrirIniciativa}
          onClose={() => {
            setSesionOpen(false)
            refreshResumen()
          }}
        />
      )}
      {historialOpen && (
        <HistorialSesionesPoliticoModal region={region} onClose={() => setHistorialOpen(false)} />
      )}
    </div>
  )
}

function fmtFechaCorta(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
