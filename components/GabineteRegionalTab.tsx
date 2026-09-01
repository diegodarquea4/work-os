'use client'

import { useEffect, useState } from 'react'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { RegionEje } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'
import { useCan } from '@/lib/context/UserContext'
import { useRegionConfig } from '@/lib/hooks/useRegionConfig'
import { useSesionesResumen } from '@/lib/hooks/useSesionesEje'
import HistorialSesionesModal from './HistorialSesionesModal'
import NominaModal from './NominaModal'
import ConsolaSesionGabinete from './gabinete/ConsolaSesionGabinete'

/**
 * Tab "Gabinete Regional" de la sección Comités y Gabinete Regional
 * (Mi Región) — el módulo de sesiones del gabinete (spec gabinete §7,
 * ubicación decidida por producto 2026-07-29: acá, patrón Comité Policial).
 *
 * Gate: region_config.gabinete_habilitado (mig 046 — habilitar el piloto es
 * un INSERT, no deploy) + comite.gabinete.operar en la región. Viewer no ve nada del módulo
 * ni dispara queries a sesion_* (RLS se lo negaría). Sin flag → placeholder
 * "no habilitado".
 *
 * El gabinete NO digita métricas: este tab no tiene lista de métricas — solo
 * strip de estado + Abrir sesión (Consola v2) / Nómina / Historial. La sesión
 * se ARMA en Gabinete → Preparación (stepper) y se CORRE acá en la Consola; el
 * SesionModal v1 quedó retirado del gabinete (cutover v2).
 */

type Props = {
  region: Region
  // Aún lo pasa ComitesRegionalesSection; el gabinete v2 ya no lo usa (era para
  // los ejes destino de mandatos del SesionModal, ya retirado). Se conserva en
  // el contrato para no tocar el call-site.
  regionEjes: RegionEje[]
  // Cartera de la región (regionIniciativas de VistaRegional) — alimenta la
  // Consola (iniciativas en foco, typeaheads) sin queries nuevas.
  iniciativas: Iniciativa[]
  // Abrir la ficha completa de una iniciativa (VistaRegional la monta con su
  // ProjectTrackerModal, por encima de la Consola).
  onAbrirIniciativa: (p: Iniciativa) => void
}

export default function GabineteRegionalTab({ region, iniciativas, onAbrirIniciativa }: Props) {
  // Gate = capacidad propia del comité por región (no iniciativa.editar_operativo).
  const puedeOperar = useCan('comite.gabinete.operar', region.cod)
  const { config, loading: configLoading } = useRegionConfig(region.cod)

  const habilitado = !!config?.gabinete_habilitado
  const gabineteNombre = config?.gabinete_nombre ?? 'Gabinete Regional'
  // Gate único del módulo (patrón sesionesOn del drawer): sin él, ni queries.
  const gabineteOn = habilitado && puedeOperar

  const [consolaOpen, setConsolaOpen]     = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [nominaOpen, setNominaOpen]       = useState(false)
  const { resumen, refresh: refreshResumen } = useSesionesResumen(
    region.cod, { instancia: 'gabinete' }, gabineteOn,
  )

  // ¿Hay una sesión PREPARADA lista para abrir? Es un borrador v2 (formato_acta=2,
  // nace en Preparación). El SesionModal v1 se retiró del gabinete: las sesiones
  // se arman en Preparación (stepper) y se corren en la Consola. Un borrador v1
  // legado (si quedara alguno) NO abre nada acá — se limpia en la migración de
  // cutover; lo único que corre es la Consola.
  const [borrador, setBorrador] = useState<{ formato: number | null; fecha: string } | null>(null)
  useEffect(() => {
    if (!gabineteOn || !resumen.borradorId) { setBorrador(null); return }
    let cancel = false
    getSupabase().from('eje_sesiones').select('formato_acta, fecha').eq('id', resumen.borradorId).maybeSingle()
      .then(({ data }) => { if (!cancel) setBorrador(data ? { formato: (data.formato_acta as number | null) ?? null, fecha: data.fecha as string } : null) })
    return () => { cancel = true }
  }, [gabineteOn, resumen.borradorId])
  const sesionPreparada = !!resumen.borradorId && borrador?.formato === 2

  if (configLoading) {
    return <div className="py-10 text-center text-sm text-gray-400">Cargando gabinete…</div>
  }

  if (!habilitado) {
    return (
      <div className="text-center py-10 px-6 bg-white rounded-xl border border-dashed border-gray-200">
        <svg className="mx-auto mb-3 text-gray-300" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <p className="text-sm text-gray-600 mb-1 font-medium">Gabinete Regional no habilitado</p>
        <p className="text-xs text-gray-400 max-w-md mx-auto">
          El módulo de sesiones del gabinete aún no está activo para esta región.
          La división lo habilita región por región durante el piloto.
        </p>
      </div>
    )
  }

  // Habilitado pero sin rol operativo (viewer): la región tiene el módulo,
  // este usuario solo no participa — mensaje sobrio, sin datos de sesión.
  if (!gabineteOn) {
    return (
      <div className="text-center py-10 px-6 bg-white rounded-xl border border-gray-100">
        <p className="text-sm text-gray-600 mb-1 font-medium">{gabineteNombre} — {region.nombre}</p>
        <p className="text-xs text-gray-400 max-w-md mx-auto">
          Las sesiones del gabinete las gestiona el equipo DPR y la división.
          Tu perfil no tiene acceso a este módulo.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Acciones */}
      <div className="px-4 pt-4 pb-2">
        {sesionPreparada ? (
          <button
            onClick={() => setConsolaOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 transition-colors"
            title="Conducir la sesión del gabinete"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="10" height="9" rx="1.5"/>
              <path d="M2 6h10M5 1.5V4M9 1.5V4"/>
            </svg>
            Abrir sesión
          </button>
        ) : (
          <div className="w-full flex items-start gap-2.5 py-2.5 px-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-slate-500 text-[13px] leading-snug">
            <svg className="flex-none mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <span>No hay sesión preparada. Arma la pauta en <b className="font-semibold text-slate-600">Gabinete → Preparación</b> y vuelve para abrirla.</span>
          </div>
        )}
      </div>

      {/* Strip resumen (patrón del drawer del comité) */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-1.5 text-[11px] text-violet-900 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5 flex-wrap">
          <span className="font-semibold">{resumen.compromisosAbiertos}</span>
          <span>compromiso{resumen.compromisosAbiertos === 1 ? '' : 's'} abierto{resumen.compromisosAbiertos === 1 ? '' : 's'}</span>
          <span className="text-violet-300">·</span>
          <span className="font-semibold">{resumen.trabasEscaladas}</span>
          <span>traba{resumen.trabasEscaladas === 1 ? '' : 's'} escalada{resumen.trabasEscaladas === 1 ? '' : 's'}</span>
          <span className="text-violet-300">·</span>
          <span>
            {resumen.ultimaSesionFecha
              ? `última sesión ${fmtFechaCorta(resumen.ultimaSesionFecha)}`
              : 'sin sesiones cerradas aún'}
          </span>
        </div>
      </div>

      {/* Recordatorio del ciclo (preparación vive en Gabinete → Preparación) */}
      <div className="px-4 pb-3">
        <p className="text-xs text-gray-400 leading-relaxed">
          El foco de la sesión se prepara en <span className="font-medium text-gray-500">Gabinete → Preparación</span> (banderas
          + compromisos levantados desde comités); desde ahí se descarga el <span className="font-medium text-gray-500">cronograma</span> de la sesión.
          Al abrir la sesión, las iniciativas en foco entran solas a la agenda.
        </p>
      </div>

      {/* Footer: historial + nómina */}
      <div className="border-t border-violet-100 bg-violet-50/50 px-4 py-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
          Sesiones de {gabineteNombre}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNominaOpen(true)}
            className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
            title="Nómina del gabinete (seremis + equipo DPR)"
          >
            Nómina
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

      {/* Consola en sala (v2): superficie a pantalla completa. El cierre en 4
          movimientos vive dentro de la consola ("Terminar gabinete →" → fase
          cierre); el SesionModal clásico ya no interviene en v2. */}
      {consolaOpen && resumen.borradorId && (
        <ConsolaSesionGabinete
          region={region}
          gabineteNombre={gabineteNombre}
          sesionId={resumen.borradorId}
          fecha={borrador?.fecha ?? ''}
          numeroLabel="Sesión en curso"
          projects={iniciativas}
          canEdit={puedeOperar}
          onOpenIniciativa={onAbrirIniciativa}
          onClose={() => { setConsolaOpen(false); refreshResumen() }}
        />
      )}

      {/* Modales (solo montan con el gate activo) */}
      {historialOpen && (
        <HistorialSesionesModal
          region={region}
          instancia="gabinete"
          eje={null}
          nombreInstancia={gabineteNombre}
          onClose={() => setHistorialOpen(false)}
        />
      )}
      {nominaOpen && (
        <NominaModal
          region={region}
          instancia="gabinete"
          eje={null}
          nombreInstancia={gabineteNombre}
          onClose={() => setNominaOpen(false)}
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
