'use client'

import { useMemo, useState } from 'react'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import { agruparPorMegaproyecto } from '@/lib/sesiones/helpers'
import { useCan, useCurrentUserEmail } from '@/lib/context/UserContext'
import { useRegionConfig } from '@/lib/hooks/useRegionConfig'
import { useSesionesResumen } from '@/lib/hooks/useSesionesEje'
import SesionModal from './SesionModal'
import HistorialSesionesModal from './HistorialSesionesModal'
import NominaModal from './NominaModal'
import MegaproyectosModal from './MegaproyectosModal'
import MegaproyectoGroup from './MegaproyectoGroup'
import AgregarACarteraModal from './AgregarACarteraModal'
import CarteraInfraestructuraPanel from './CarteraInfraestructuraPanel'
import FilaCarteraInfra from './FilaCarteraInfra'
import { EmptyState } from '@/components/ui'
import { moverEnCartera } from '@/lib/comiteInfraestructuraClient'

/**
 * Tab "Comité de Infraestructura" de la sección Comités y Gabinete Regional
 * (Mi Región) — el módulo de sesiones del comité (mig 060), estructura y
 * funcionamiento calcados de GabineteRegionalTab con tres diferencias:
 *   · Dos tipos de sesión (CRI / Mesa Técnica), elegidos dentro del propio
 *     SesionModal junto a fecha/lugar.
 *   · La zona 3 de la sesión no usa "en foco" — usa las iniciativas con el
 *     tag de region_config.infraestructura_tag (arranca en 'CRI').
 *   · Sin zona de apuntes por institución.
 *
 * Gate: region_config.infraestructura_habilitado (mig 060 — habilitada para
 * las 16 regiones desde el día uno, a diferencia del piloto acotado del
 * gabinete) + comite.infraestructura.operar en la región. Viewer no ve nada del módulo ni dispara
 * queries a sesion_* (RLS se lo negaría).
 *
 * Preview de la cartera con el tag configurado, SIEMPRE visible al abrir el
 * tab (no solo dentro de la sesión) — mismo lenguaje visual de card que usa
 * el resto del panel para iniciativas individuales (semáforo + nombre +
 * comuna/ministerio + barra de avance), pedido explícito del comité.
 */

type Props = {
  region: Region
  // Cartera de la región (regionIniciativas de VistaRegional) — alimenta el
  // preview + la zona 3 del SesionModal + los typeaheads, sin queries nuevas.
  iniciativas: Iniciativa[]
  // Abrir la ficha completa de una iniciativa (VistaRegional la monta con su
  // ProjectTrackerModal, por encima de la sesión) — desde el preview o la
  // zona 3 de la sesión.
  onAbrirIniciativa: (p: Iniciativa) => void
  // Propagar al estado global el cambio de etiquetas al sumar/sacar de la
  // cartera, para que el preview y el resto de las vistas se enteren sin
  // recargar (mismo canal que usa la ficha).
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
}

export default function ComiteInfraestructuraTab({ region, iniciativas, onAbrirIniciativa, onUpdatePrioridad }: Props) {
  // Gate = capacidad propia del comité por región (no iniciativa.editar_operativo).
  const puedeOperar = useCan('comite.infraestructura.operar', region.cod)
  const userEmail          = useCurrentUserEmail()
  const { config, loading: configLoading, refresh: refreshConfig } = useRegionConfig(region.cod)

  const habilitado = !!config?.infraestructura_habilitado
  const nombreComite = config?.infraestructura_nombre ?? 'Comité de Infraestructura'
  const tag = config?.infraestructura_tag ?? 'CRI'
  // Gate único del módulo (patrón sesionesOn del drawer): sin él, ni queries.
  const infraOn = habilitado && puedeOperar

  const [sesionOpen, setSesionOpen]             = useState(false)
  const [historialOpen, setHistorialOpen]       = useState(false)
  const [nominaOpen, setNominaOpen]             = useState(false)
  const [megaproyectosOpen, setMegaproyectosOpen] = useState(false)
  const [agregarOpen, setAgregarOpen]           = useState(false)
  const [carteraOpen, setCarteraOpen]           = useState(false)
  // id de la iniciativa que se está sacando de la cartera — deshabilita su
  // botón para no mandar el mismo POST dos veces.
  const [quitandoId, setQuitandoId]             = useState<number | null>(null)
  const { resumen, refresh: refreshResumen } = useSesionesResumen(
    region.cod, { instancia: 'infraestructura' }, infraOn,
  )

  // Cartera con el tag configurado — el mismo universo que precarga la zona
  // 3 de la sesión, mostrado acá como preview permanente del tab.
  const iniciativasTag = useMemo(
    () => iniciativas.filter(p => (p.tags ?? []).includes(tag)),
    [iniciativas, tag],
  )

  // Megaproyectos (mig 061): sub-conjunto curado de tags — NO todos los que
  // existen — que agrupan el preview. Sin curaduría, queda como lista plana
  // (comportamiento de siempre). Una iniciativa con varios tags-megaproyecto
  // aparece en cada grupo que le corresponde (mismo criterio que el modo
  // "agrupar por tag" del Kanban).
  const megaproyectos = useMemo(() => config?.infraestructura_megaproyectos ?? [], [config?.infraestructura_megaproyectos])
  const { grupos: gruposMegaproyecto, sinMegaproyecto } = useMemo(
    () => agruparPorMegaproyecto(iniciativasTag, p => p.tags, megaproyectos),
    [iniciativasTag, megaproyectos],
  )

  // Sacar de la cartera = quitar la etiqueta. La iniciativa sigue existiendo
  // con toda su ficha; solo deja de mirarla este comité.
  //
  // A diferencia del resto del panel acá NO se hace update optimista: la
  // escritura la hace el servidor y se propaga recién con la respuesta. Sin
  // optimismo no hay revert que pueda quedar a medias, y el POST es corto.
  async function handleQuitar(p: Iniciativa) {
    const ok = window.confirm(
      `¿Sacar "${p.nombre}" de la cartera del comité?\n\n` +
      `Se le quita la etiqueta "${tag}". La iniciativa y su ficha no se tocan, y se puede volver a sumar cuando quieras.`,
    )
    if (!ok) return

    setQuitandoId(p.id)
    try {
      const tags = await moverEnCartera({ prioridadId: p.id, accion: 'quitar', tag })
      onUpdatePrioridad(p.n, { tags })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setQuitandoId(null)
    }
  }

  if (configLoading) {
    return <div className="py-10 text-center text-sm text-gray-400">Cargando comité…</div>
  }

  if (!habilitado) {
    return (
      <EmptyState
        title="Comité de Infraestructura no habilitado"
        description="El módulo de sesiones de este comité aún no está activo para esta región."
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

  // Habilitado pero sin rol operativo (viewer): la región tiene el módulo,
  // este usuario solo no participa — mensaje sobrio, sin datos de sesión.
  if (!infraOn) {
    return (
      <EmptyState
        title={`${nombreComite} — ${region.nombre}`}
        description="Las sesiones de este comité las gestiona el equipo DPR y la división. Tu perfil no tiene acceso a este módulo."
      />
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Acciones */}
      <div className="px-4 pt-4 pb-2">
        <button
          onClick={() => setSesionOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 transition-colors"
          title={resumen.borradorId ? 'Continuar el borrador de sesión' : `Nueva sesión de ${nombreComite}`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="10" height="9" rx="1.5"/>
            <path d="M2 6h10M5 1.5V4M9 1.5V4"/>
          </svg>
          {resumen.borradorId ? 'Continuar sesión' : 'Nueva sesión'}
        </button>
      </div>

      {/* Strip resumen (patrón del drawer del comité) */}
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

      {/* Preview de la cartera con el tag configurado — siempre visible al
          abrir el tab, mismo lenguaje visual (semáforo + comuna/ministerio +
          barra de avance) que las cards de iniciativa del resto del panel. */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
            Iniciativas contempladas
          </p>
          <span className="text-[10px] text-gray-400">— etiqueta &quot;{tag}&quot;</span>
          <span className="text-[10px] text-gray-400 ml-auto">{iniciativasTag.length}</span>
          <button
            onClick={() => setAgregarOpen(true)}
            className="text-[11px] font-semibold text-violet-700 hover:text-violet-900 hover:underline"
            title="Buscar una iniciativa de la región y sumarla a la cartera del comité"
          >
            + Sumar
          </button>
          {iniciativasTag.length > 0 && (
            <>
              <span className="text-violet-200">|</span>
              <button
                onClick={() => setCarteraOpen(true)}
                className="text-[11px] font-semibold text-violet-700 hover:text-violet-900 hover:underline"
                title="Abrir la cartera completa, con filtros, orden y Excel"
              >
                Ver cartera →
              </button>
            </>
          )}
        </div>
        {iniciativasTag.length === 0 ? (
          <button
            onClick={() => setAgregarOpen(true)}
            className="w-full text-xs text-gray-500 hover:text-violet-700 text-center py-3 border border-dashed border-gray-200 hover:border-violet-300 rounded-lg transition-colors"
          >
            Ninguna iniciativa tiene la etiqueta &quot;{tag}&quot; todavía — súmale la primera.
          </button>
        ) : gruposMegaproyecto.length === 0 ? (
          <div className="space-y-1">
            {iniciativasTag.map(p => (
              <FilaCarteraInfra
                key={p.id}
                p={p}
                onAbrir={() => onAbrirIniciativa(p)}
                onQuitar={() => handleQuitar(p)}
                quitando={quitandoId === p.id}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {gruposMegaproyecto.map(g => (
              <MegaproyectoGroup key={g.tag} nombre={g.tag} count={g.items.length}>
                {g.items.map(p => (
                  <FilaCarteraInfra
                    key={p.id}
                    p={p}
                    onAbrir={() => onAbrirIniciativa(p)}
                    onQuitar={() => handleQuitar(p)}
                    quitando={quitandoId === p.id}
                  />
                ))}
              </MegaproyectoGroup>
            ))}
            {sinMegaproyecto.length > 0 && (
              <MegaproyectoGroup nombre="Sin megaproyecto" count={sinMegaproyecto.length} muted>
                {sinMegaproyecto.map(p => (
                  <FilaCarteraInfra
                    key={p.id}
                    p={p}
                    onAbrir={() => onAbrirIniciativa(p)}
                    onQuitar={() => handleQuitar(p)}
                    quitando={quitandoId === p.id}
                  />
                ))}
              </MegaproyectoGroup>
            )}
          </div>
        )}
      </div>

      {/* Footer: historial + nómina */}
      <div className="border-t border-violet-100 bg-violet-50/50 px-4 py-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
          Sesiones de {nombreComite}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNominaOpen(true)}
            className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
            title="Nómina del comité"
          >
            Nómina
          </button>
          <span className="text-violet-200">|</span>
          <button
            onClick={() => setMegaproyectosOpen(true)}
            className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
            title="Elegir qué etiquetas agrupan las iniciativas contempladas como megaproyecto"
          >
            Megaproyectos
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

      {/* Modales (solo montan con el gate activo) */}
      {sesionOpen && (
        <SesionModal
          region={region}
          instancia="infraestructura"
          infraestructuraNombre={nombreComite}
          tag={tag}
          iniciativas={iniciativas}
          onAbrirIniciativa={onAbrirIniciativa}
          borradorId={resumen.borradorId}
          currentUserEmail={userEmail}
          onClose={() => {
            setSesionOpen(false)
            refreshResumen()
          }}
        />
      )}
      {historialOpen && (
        <HistorialSesionesModal
          region={region}
          instancia="infraestructura"
          eje={null}
          nombreInstancia={nombreComite}
          onClose={() => setHistorialOpen(false)}
        />
      )}
      {nominaOpen && (
        <NominaModal
          region={region}
          instancia="infraestructura"
          eje={null}
          nombreInstancia={nombreComite}
          onClose={() => setNominaOpen(false)}
        />
      )}
      {megaproyectosOpen && (
        <MegaproyectosModal
          region={region}
          iniciativas={iniciativas}
          megaproyectosActuales={megaproyectos}
          onClose={() => setMegaproyectosOpen(false)}
          onSaved={refreshConfig}
        />
      )}
      {agregarOpen && (
        <AgregarACarteraModal
          region={region}
          iniciativas={iniciativas}
          tag={tag}
          onClose={() => setAgregarOpen(false)}
          onAgregada={(p, tags) => onUpdatePrioridad(p.n, { tags })}
        />
      )}
      {/* La cartera completa: pantalla hermana del preview, igual que en el
          Comité Económico. Acá se viene a filtrar, ordenar y exportar; el
          preview de arriba sigue siendo el vistazo agrupado por megaproyecto. */}
      {carteraOpen && (
        <CarteraInfraestructuraPanel
          region={region}
          cartera={iniciativasTag}
          iniciativasRegion={iniciativas}
          tag={tag}
          megaproyectosCurados={megaproyectos}
          onAbrirIniciativa={onAbrirIniciativa}
          onUpdatePrioridad={onUpdatePrioridad}
          onClose={() => setCarteraOpen(false)}
        />
      )}
    </div>
  )
}

function fmtFechaCorta(fecha: string): string {
  // date puro YYYY-MM-DD — anclar a mediodía evita el corrimiento de día
  // por timezone (mismo patrón que MetricasEjeDrawer).
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

