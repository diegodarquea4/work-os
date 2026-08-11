'use client'

import { useState } from 'react'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { RegionEje } from '@/lib/types'
import ComitePolicialTab from './ComitePolicialTab'
import ComitePoliticoPanel from './ComitePoliticoPanel'
import ComiteInversionPanel from './ComiteInversionPanel'
import GabineteRegionalTab from './GabineteRegionalTab'

/**
 * Sección «Comités y Gabinete Regional» de Mi Región, justo debajo de
 * «Ejes estratégicos». Agrupa las instancias de coordinación regional en
 * cuatro pestañas. Comité Policial, Gabinete Regional y Comité Seguimiento
 * de la Inversión están desarrollados; Infraestructura es placeholder
 * anunciado.
 *
 * El Comité Policial se ancla al eje de la región con `sesiones_habilitadas`
 * (mig 044; cada región tiene exactamente uno, sesiones_nombre 'Comité
 * Policial'). Gabinete Regional y Comité Económico no
 * tienen eje: el flag de Gabinete vive en region_config (mig 046) y su tab
 * monta el módulo de sesiones en modo instancia='gabinete'; Inversión no
 * tiene flag de habilitación y su tab monta el módulo en modo
 * instancia='inversion'.
 */

type TabKey = 'policial' | 'politico' | 'infraestructura' | 'inversion' | 'gabinete'

const TABS: { key: TabKey; label: string; ready: boolean }[] = [
  { key: 'policial',       label: 'Comité Policial',                    ready: true  },
  { key: 'politico',       label: 'Comité Político',                    ready: true  },
  { key: 'infraestructura', label: 'Comité de Infraestructura',          ready: false },
  { key: 'inversion',      label: 'Comité Económico',                   ready: true  },
  { key: 'gabinete',       label: 'Gabinete Regional',                   ready: true  },
]

// Comité Económico en marcha blanca: activo solo en estas regiones (Manuel
// prueba sus cambios en Tarapacá); en el resto se muestra "Pronto". El
// desarrollo completo sigue vivo — solo se gatea su visibilidad por región.
const ECONOMICO_ACTIVO: readonly string[] = ['I'] // Tarapacá

type Props = {
  region:     Region
  regionEjes: RegionEje[]
  // Catálogo de ejes aún cargando — evita el parpadeo "no habilitado" antes
  // de que llegue el eje del comité.
  ejesLoading: boolean
  // Cartera de la región — la consume el tab Gabinete Regional (zona
  // "iniciativas en foco" de la sesión + typeaheads), sin queries nuevas.
  iniciativas: Iniciativa[]
  // Abrir la ficha de una iniciativa desde la sesión del gabinete — la maneja
  // VistaRegional con su ProjectTrackerModal.
  onAbrirIniciativa: (p: Iniciativa) => void
}

export default function ComitesRegionalesSection({ region, regionEjes, ejesLoading, iniciativas, onAbrirIniciativa }: Props) {
  const [active, setActive] = useState<TabKey>('policial')

  // El Comité Policial se ancla al eje con sesiones habilitadas.
  const comitePolicialEje = regionEjes.find(e => e.sesiones_habilitadas) ?? null

  // Económico en marcha blanca: solo Tarapacá lo tiene activo; en el resto
  // muestra "Pronto" (mismo trato que Infraestructura).
  const economicoActivo = ECONOMICO_ACTIVO.includes(region.cod)

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Comités y Gabinete Regional</h3>
        <span className="text-xs text-gray-400 normal-case">— instancias de coordinación de la región</span>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-3">
        {TABS.map(t => {
          const isActive = active === t.key
          // Económico hereda su estado "listo" de la región; el resto es fijo.
          const ready = t.key === 'inversion' ? economicoActivo : t.ready
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`relative flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-t-lg -mb-px border-b-2 transition-colors ${
                isActive
                  ? 'border-slate-800 text-slate-900 bg-white'
                  : 'border-transparent text-gray-500 hover:text-slate-700 hover:bg-gray-50'
              }`}
            >
              {t.label}
              {!ready && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-px">
                  Pronto
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Panel activo */}
      {active === 'policial' ? (
        comitePolicialEje ? (
          <ComitePolicialTab region={region} eje={comitePolicialEje} />
        ) : ejesLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Cargando comité…</div>
        ) : (
          <Placeholder
            titulo="Comité Policial no habilitado"
            texto="Esta región aún no tiene un eje de seguridad con el Comité Policial habilitado. Habilítalo desde el catálogo de ejes."
          />
        )
      ) : active === 'politico' ? (
        <ComitePoliticoPanel region={region} regionEjes={regionEjes} iniciativas={iniciativas} onAbrirIniciativa={onAbrirIniciativa} />
      ) : active === 'inversion' ? (
        economicoActivo ? (
          <ComiteInversionPanel region={region} />
        ) : (
          <Placeholder
            titulo="Comité Económico — en marcha blanca"
            texto="El Comité Económico está en pruebas en la Región de Tarapacá. Pronto disponible en el resto de las regiones."
          />
        )
      ) : active === 'gabinete' ? (
        <GabineteRegionalTab region={region} regionEjes={regionEjes} iniciativas={iniciativas} onAbrirIniciativa={onAbrirIniciativa} />
      ) : (
        <Placeholder
          titulo={`${TABS.find(t => t.key === active)?.label} — en desarrollo`}
          texto="Esta instancia estará disponible próximamente."
        />
      )}
    </div>
  )
}

function Placeholder({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="text-center py-10 px-6 bg-white rounded-xl border border-dashed border-gray-200">
      <svg className="mx-auto mb-3 text-gray-300" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <p className="text-sm text-gray-600 mb-1 font-medium">{titulo}</p>
      <p className="text-xs text-gray-400 max-w-md mx-auto">{texto}</p>
    </div>
  )
}
