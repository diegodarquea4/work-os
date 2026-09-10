'use client'

import { useState } from 'react'
import { useCan, useCurrentUserEmail } from '@/lib/context/UserContext'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import { MESA_EMPLEO_HABILITADA } from '@/lib/sesiones/helpers'
import { useSesionesResumen } from '@/lib/hooks/useSesionesEje'
import SesionModalInversion from './SesionModalInversion'
import HistorialSesionesInversionModal from './HistorialSesionesInversionModal'
import NominaInversionModal from './NominaInversionModal'
import MetaEmpleoModal from './MetaEmpleoModal'
import OaecaModal from './OaecaModal'
import ComiteEconomicoProyectosPanel from './ComiteEconomicoProyectosPanel'

/**
 * Panel del tab "Comité Económico" en ComitesRegionalesSection.
 * A diferencia de MetricasEjeDrawer (Comité Policial), este comité no tiene
 * eje ni métricas — es solo el módulo Sesiones, siempre disponible (sin flag
 * de activación) porque el tab ya existe fijo para las 16 regiones.
 */

type Props = {
  region: Region
  // Cartera de la región — alimenta la cartera de proyectos (mig 094,
  // vista "Público" filtrada por tag CER) y la ficha completa que abre
  // VistaRegional con su ProjectTrackerModal, sin queries nuevas.
  iniciativas: Iniciativa[]
  onAbrirIniciativa: (p: Iniciativa) => void
}

const NOMBRE_COMITE = 'Comité Económico'

export default function ComiteInversionPanel({ region, iniciativas, onAbrirIniciativa }: Props) {
  // Gate = capacidad propia del comité por región (no iniciativa.editar_operativo).
  const puedeOperar = useCan('comite.economico.operar', region.cod)
  const userEmail          = useCurrentUserEmail()

  const [sesionOpen, setSesionOpen]       = useState(false)
  const [proyectosOpen, setProyectosOpen] = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [nominaOpen, setNominaOpen]       = useState(false)
  const [metaEmpleoOpen, setMetaEmpleoOpen] = useState(false)
  const [oaecaOpen, setOaecaOpen]         = useState(false)
  // La preview vive montada abajo; al volver de la cartera completa (donde se
  // pueden crear o editar proyectos) se remonta para releer.
  const [carteraVersion, setCarteraVersion] = useState(0)


  const { resumen, refresh: refreshResumen } = useSesionesResumen(region.cod, { instancia: 'inversion' }, puedeOperar)


  function fmtFechaCorta(fecha: string): string {
    return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  }

  // El botón "Actualizar proyectos en SEIA" y su "última actualización" se
  // sacaron de este panel: la cartera del comité es la propia (privados +
  // iniciativas CER), no el catálogo SEIA. El sync sigue existiendo y se
  // dispara server-to-server con CRON_SECRET (/api/seia-sync-v2).

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-stretch gap-2">
          {puedeOperar && (
            <>
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
              <button
                onClick={() => setProyectosOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-violet-200 text-violet-700 text-sm font-semibold rounded-lg hover:bg-violet-50 transition-colors"
                title="Abrir la cartera completa: filtros, Excel y alta de proyectos"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3.5h10M2 7h10M2 10.5h6"/>
                </svg>
                Ver todos los proyectos
              </button>
            </>
          )}
        </div>

        {!puedeOperar && (
          <div className="py-10 text-center text-sm text-gray-500 px-4">
            No tienes permiso para operar el módulo de sesiones de este comité.
          </div>
        )}

        {puedeOperar && (
          <div className="border-t border-violet-100 bg-violet-50/50 px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 inline-flex items-center gap-1.5 flex-wrap">
              Sesiones de {NOMBRE_COMITE}
              <span className="text-violet-200 font-normal">|</span>
              <span className="text-[11px] font-medium normal-case tracking-normal text-violet-900">
                <span className="font-bold">{resumen.compromisosAbiertos}</span>
                {' '}compromiso{resumen.compromisosAbiertos === 1 ? '' : 's'} abierto{resumen.compromisosAbiertos === 1 ? '' : 's'}
                <span className="text-violet-300"> · </span>
                {resumen.ultimaSesionFecha
                  ? `última sesión ${fmtFechaCorta(resumen.ultimaSesionFecha)}`
                  : 'sin sesiones cerradas aún'}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNominaOpen(true)}
                className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
                title="Nómina fija del comité (titulares y suplentes)"
              >
                Nómina
              </button>
              {MESA_EMPLEO_HABILITADA && (
                <>
                  <span className="text-violet-200">|</span>
                  <button
                    onClick={() => setMetaEmpleoOpen(true)}
                    className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
                    title="Objetivo de empleos, foco productivo y cupos de subsidios de la región"
                  >
                    Meta Empleo
                  </button>
                </>
              )}
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

      {puedeOperar && (
        <ComiteEconomicoProyectosPanel
          key={`preview-${carteraVersion}`}
          region={region}
          iniciativas={iniciativas}
          onAbrirIniciativa={onAbrirIniciativa}
          modo="preview"
          onVerTodos={() => setProyectosOpen(true)}
        />
      )}

      {/* Cartera completa a pantalla completa. Con la sesión son dos pantallas
          hermanas: cada una tiene el botón para saltar a la otra, y saltar
          cierra la de origen (el borrador de la sesión se guarda solo). */}
      {proyectosOpen && puedeOperar && (
        <ComiteEconomicoProyectosPanel
          region={region}
          iniciativas={iniciativas}
          onAbrirIniciativa={onAbrirIniciativa}
          modo="completo"
          onClose={() => { setProyectosOpen(false); setCarteraVersion(v => v + 1) }}
          onIrASesion={() => {
            setProyectosOpen(false)
            setCarteraVersion(v => v + 1)
            setSesionOpen(true)
          }}
        />
      )}

      {sesionOpen && (
        <SesionModalInversion
          region={region}
          borradorId={resumen.borradorId}
          currentUserEmail={userEmail}
          iniciativas={iniciativas}
          onAbrirIniciativa={onAbrirIniciativa}
          onVerProyectos={() => {
            setSesionOpen(false)
            refreshResumen()
            setProyectosOpen(true)
          }}
          onClose={() => {
            setSesionOpen(false)
            refreshResumen()
            setCarteraVersion(v => v + 1)
          }}
        />
      )}
      {historialOpen && (
        <HistorialSesionesInversionModal region={region} onClose={() => setHistorialOpen(false)} />
      )}
      {nominaOpen && (
        <NominaInversionModal region={region} onClose={() => setNominaOpen(false)} />
      )}
      {metaEmpleoOpen && (
        <MetaEmpleoModal
          region={region}
          puedeEditar={puedeOperar}
          onClose={() => setMetaEmpleoOpen(false)}
        />
      )}
      {oaecaOpen && (
        <OaecaModal currentUserEmail={userEmail} onClose={() => setOaecaOpen(false)} />
      )}
    </>
  )
}
