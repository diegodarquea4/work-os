'use client'

import { useState } from 'react'
import { useCan, useIsSeremi } from '@/lib/context/UserContext'
import { EmptyState } from '@/components/ui'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { RegionEje } from '@/lib/types'
import ComitePolicialTab from './ComitePolicialTab'
import ComitePoliticoPanel from './ComitePoliticoPanel'
import ComiteInversionPanel from './ComiteInversionPanel'
import GabineteRegionalTab from './GabineteRegionalTab'
import ComiteInfraestructuraTab from './ComiteInfraestructuraTab'

/**
 * Sección «Comités y Gabinete Regional» de Mi Región, justo debajo de
 * «Ejes estratégicos». Agrupa las instancias de coordinación regional en
 * cinco pestañas — Comité Policial, Comité Político, Comité de
 * Infraestructura, Comité Económico y Gabinete Regional están todas
 * desarrolladas.
 *
 * El Comité Policial se ancla al eje de la región con `sesiones_habilitadas`
 * (mig 044; cada región tiene exactamente uno, sesiones_nombre 'Comité
 * Policial'). Gabinete Regional, Comité Económico y Comité de Infraestructura
 * no tienen eje: los flags de Gabinete e Infraestructura viven en
 * region_config (mig 046 / 057) y sus tabs montan el módulo de sesiones en
 * modo instancia='gabinete' / 'infraestructura'; Económico no tiene flag de
 * habilitación y su tab monta el módulo en modo instancia='inversion'.
 */

type TabKey = 'policial' | 'politico' | 'infraestructura' | 'inversion' | 'gabinete'

const TABS: { key: TabKey; label: string; ready: boolean }[] = [
  { key: 'policial',       label: 'Comité Policial',                    ready: true  },
  { key: 'politico',       label: 'Comité Político',                    ready: true  },
  { key: 'infraestructura', label: 'Comité de Nudos Críticos',          ready: true  },
  { key: 'inversion',      label: 'Comité Económico',                   ready: true  },
  { key: 'gabinete',       label: 'Gabinete Regional',                   ready: true  },
]

// El Comité Económico ya NO se gatea por región: está en las 16.
//
// La marcha blanca empezó en Tarapacá y fue sumando regiones de a una, con una
// regla: solo entraba la que tuviera a alguien capaz de CONDUCIR el comité con
// cuenta creada, para que no apareciera una instancia que nadie abre. Llegó a
// 10 de 16.
//
// Esa regla dejó de aplicar (Manuel, 2026-09-29). Lo que la sostenía era que
// sin conductor el comité no mostraba nada; desde los oficios del SEIA eso ya
// no es cierto: los oficios pendientes de la región llegan solos, tres veces
// por semana, y se leen sin abrir una sesión. Una región sin conductor ve su
// situación aunque todavía no sesione — que es mejor punto de partida que un
// cartel de "Pronto".
//
// Medido el día del cambio, en las 6 regiones que entran: O'Higgins abre con
// 85 oficios pendientes, Antofagasta con 55 y Coquimbo con 39; Magallanes con
// 2, Los Ríos con 1 y Aysén con 0. Las tres primeras tienen material para una
// sesión desde el primer día. Aysén va a ver una pantalla vacía, y eso es
// correcto: no tiene oficios pendientes.
//
// El permiso sigue siendo por región (`comite.economico.operar`): que la
// pestaña exista no habilita a nadie a operar donde no le corresponde.

// Comité de Infraestructura en marcha blanca: visible solo en estas regiones;
// en el resto se muestra "Pronto" (mismo trato que Económico). El desarrollo
// completo sigue vivo — solo se gatea su visibilidad por región.
const INFRAESTRUCTURA_ACTIVO: readonly string[] = ['X'] // Los Lagos

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
  // Propagar un cambio de iniciativa al estado global (WorkOSApp). Hoy lo usa
  // el Comité de Infraestructura al sumar o sacar de su cartera.
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
  // Ir al Tablero → Preparación (armar la pauta del gabinete) — la resuelve WorkOSApp.
  onIrAPreparacion: (regionNombre: string) => void
}

export default function ComitesRegionalesSection({ region, regionEjes, ejesLoading, iniciativas, onAbrirIniciativa, onUpdatePrioridad, onIrAPreparacion }: Props) {
  // Un SEREMI llega acá porque le asignaron la capacidad de ALGÚN comité
  // (mig 112), no porque le toquen todos: ve solo las pestañas que puede
  // operar. Para la delegación no cambia nada — sigue viendo las cinco, con
  // su aviso de permiso adentro si le falta alguna.
  const esSeremi = useIsSeremi()
  const puede: Record<TabKey, boolean> = {
    policial:        useCan('comite.policial.operar', region.cod),
    politico:        useCan('comite.politico.operar', region.cod),
    inversion:       useCan('comite.economico.operar', region.cod),
    infraestructura: useCan('comite.infraestructura.operar', region.cod),
    gabinete:        useCan('comite.gabinete.operar', region.cod),
  }
  const tabsVisibles = esSeremi ? TABS.filter(t => puede[t.key]) : TABS

  const [active, setActive] = useState<TabKey>('policial')

  // La pestaña abierta se DERIVA, no se corrige con un effect: el perfil y las
  // capacidades llegan juntos de /api/me DESPUÉS del primer render, así que en
  // ese primer paso `esSeremi` todavía es false y este componente ya se montó
  // (VistaRegional lo abre porque `profile` aún es null). Cuando la respuesta
  // llega, `tabsVisibles` se achica a lo que el SEREMI puede operar pero el
  // estado ya quedó en 'policial' — una pestaña que no está en la lista. Sin
  // esto, el SEREMI de Economía veía su única pestaña sin marcar y debajo el
  // panel del Comité Policial, que no le corresponde.
  const activa = tabsVisibles.some(t => t.key === active)
    ? active
    : (tabsVisibles[0]?.key ?? 'policial')

  // El Comité Policial se ancla al eje con sesiones habilitadas.
  const comitePolicialEje = regionEjes.find(e => e.sesiones_habilitadas) ?? null

  // Infraestructura en marcha blanca: solo Los Lagos lo tiene activo; en el
  // resto muestra "Pronto".
  const infraestructuraActivo = INFRAESTRUCTURA_ACTIVO.includes(region.cod)

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Comités y Gabinete Regional</h3>
        <span className="text-xs text-gray-400 normal-case">— instancias de coordinación de la región</span>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-3">
        {tabsVisibles.map(t => {
          const isActive = activa === t.key
          // Solo Infraestructura hereda su estado "listo" de la región
          // (sigue en marcha blanca); el resto es fijo.
          const ready =
            t.key === 'infraestructura' ? infraestructuraActivo :
            t.ready
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
      {activa === 'policial' ? (
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
      ) : activa === 'politico' ? (
        <ComitePoliticoPanel region={region} regionEjes={regionEjes} iniciativas={iniciativas} onAbrirIniciativa={onAbrirIniciativa} />
      ) : activa === 'inversion' ? (
        <ComiteInversionPanel region={region} iniciativas={iniciativas} onAbrirIniciativa={onAbrirIniciativa} onUpdatePrioridad={onUpdatePrioridad} />
      ) : activa === 'gabinete' ? (
        <GabineteRegionalTab region={region} regionEjes={regionEjes} iniciativas={iniciativas} onAbrirIniciativa={onAbrirIniciativa} onIrAPreparacion={onIrAPreparacion} />
      ) : (
        infraestructuraActivo ? (
          <ComiteInfraestructuraTab region={region} iniciativas={iniciativas} onAbrirIniciativa={onAbrirIniciativa} onUpdatePrioridad={onUpdatePrioridad} />
        ) : (
          <Placeholder
            titulo="Comité de Nudos Críticos — en desarrollo"
            texto="Esta instancia estará disponible próximamente."
          />
        )
      )}
    </div>
  )
}

function Placeholder({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <EmptyState
      title={titulo}
      description={texto}
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      }
    />
  )
}
