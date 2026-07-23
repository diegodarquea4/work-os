'use client'

/**
 * Preview compacto del Dashboard regional. Se muestra al hacer click sobre
 * una región del Mapa. Reemplaza al ProjectsPanel viejo (que era un Kanban
 * con polígonos arriba) — ahora es síntesis ejecutiva con perspectiva nacional.
 *
 * Estructura:
 *   1. Header: nombre + zona + capital + N iniciativas + botón de descarga
 *      de la Minuta de Contexto Regional (si ya fue generada en Mi Región).
 *   2. Avance por eje estratégico — misma grid que Mi Región. Al hacer click
 *      en un eje, la grid es reemplazada (mismo espacio) por la lista de
 *      iniciativas de prioridad alta de ese eje, con un botón de volver.
 *   3. Métricas clave — misma sección que Mi Región (Desocupación, PIB,
 *      Seguridad), en modo compacto para que todo entre sin scroll.
 *   4. Footer con CTA "Ver Mi Región".
 *
 * Sin botones de escritura — todo es lectura. El usuario que quiera actuar
 * usa el CTA "Ver Mi Región" para saltar al dashboard completo (VistaRegional).
 *
 * El ancho lo controla WorkOSApp (CSS var `--preview-pct`) para que el drag
 * right-to-left desde el borde izquierdo pueda expandirlo hasta disparar el
 * switch a `vista-regional`.
 */

import { useEffect, useState, useMemo } from 'react'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import { useRegionEjes } from '@/lib/hooks/useRegionEjes'
import { splitMinisterio } from '@/lib/ministerios'
import MetricasClaveSection from './MetricasClaveSection'
import {
  iniciativasDeRegion,
  ejeBreakdownFor,
} from '@/lib/regionSummary'

type Props = {
  region:                 Region
  projects:               Iniciativa[]
  onClose:                () => void
  onGoToDashboard:        () => void
  onVerMasIndicadores?:   (region: Region) => void
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function RegionPreviewPanel({
  region,
  projects,
  onClose,
  onGoToDashboard,
  onVerMasIndicadores,
}: Props) {
  const { ejes: regionEjes } = useRegionEjes(region.cod)

  // ── Minuta "Contexto Regional" (tipo 'ficha') — descarga la última versión
  // guardada por "Mi Región" → "Generar Contexto Regional". Panel de solo
  // lectura: nunca genera, solo descarga si ya existe una versión en caché.
  const [fichaCached, setFichaCached] = useState(false)
  const [downloadingFicha, setDownloadingFicha] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFichaCached(false)
    fetch(`/api/minuta?region_cod=${region.cod}&tipo=ficha`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) setFichaCached(!!data?.cached) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [region.cod])

  async function descargarContextoRegional() {
    if (downloadingFicha) return
    setDownloadingFicha(true)
    try {
      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
      const now = new Date()
      const fecha = `${meses[now.getMonth()]} ${now.getFullYear()}`
      const res = await fetch('/api/minuta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, fecha, tipo: 'ficha' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `minuta-${region.nombre.toLowerCase().replace(/\s+/g, '-')}-contexto-regional.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Best-effort: sin toast en este panel de preview (solo lectura, sin infra de errores hoy).
    } finally {
      setDownloadingFicha(false)
    }
  }

  // ── Cómputos ───────────────────────────────────────────────────────────────

  const regionIniciativas = useMemo(
    () => iniciativasDeRegion(region.cod, projects),
    [region.cod, projects],
  )

  // Breakdown completo de ejes (TODOS, no cutoff a 3). Ordenado por número
  // ascendente para mantener el orden estructural del catálogo.
  const ejes = useMemo(
    () => ejeBreakdownFor(region.cod, projects, regionEjes),
    [region.cod, projects, regionEjes],
  )

  // Eje seleccionado en la grid → reemplaza la grid (mismo espacio, sin abrir
  // nada nuevo) por solo las iniciativas de prioridad alta de ese eje.
  const [selectedEjeId, setSelectedEjeId] = useState<number | null>(null)
  const selectedEje = selectedEjeId != null ? regionEjes.find(re => re.id === selectedEjeId) ?? null : null
  const iniciativasAltaDelEje = useMemo(
    () => selectedEjeId != null
      ? regionIniciativas.filter(p => p.eje_id === selectedEjeId && p.prioridad === 'Alta')
      : [],
    [selectedEjeId, regionIniciativas],
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Header strip */}
      <div className="px-4 pt-3 pb-2.5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h2 className="text-fluid-lg font-bold text-slate-900 truncate">{region.nombre}</h2>
              <span className="text-[11px] text-gray-400 shrink-0">{region.zona}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-gray-400 truncate">{regionIniciativas.length} iniciativas · {region.capital}</p>
              {fichaCached && (
                <button
                  onClick={descargarContextoRegional}
                  disabled={downloadingFicha}
                  className="flex items-center gap-1.5 px-2 py-1 border border-gray-200 text-gray-600 text-[10px] font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors shrink-0"
                  title="Descarga la última Minuta de Contexto Regional generada en Mi Región"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 1v7M3 5l3 3 3-3M1 11h10"/>
                  </svg>
                  {downloadingFicha ? 'Descargando…' : 'Minuta Contexto Regional'}
                </button>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1"
            title="Cerrar"
            aria-label="Cerrar preview"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Cuerpo — pensado para caber en una sola pantalla sin scroll (letra
          chica en ambos módulos); overflow-y-auto queda como resguardo. */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Avance por eje estratégico — misma grid que Mi Región. Al hacer
            click en un eje, la grid desaparece y en el mismo espacio se
            muestran solo las iniciativas de prioridad alta de ese eje. */}
        <section>
          {selectedEjeId == null ? (
            <>
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Avance por eje estratégico</h3>
              {ejes.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic px-2 py-2">
                  {regionEjes.length === 0
                    ? 'Esta región aún no tiene ejes en el catálogo.'
                    : 'El catálogo está definido pero no hay iniciativas asociadas todavía.'}
                </p>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {ejes.map(e => {
                    const barColor = e.avgPct >= 70 ? 'bg-green-500' : e.avgPct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                    return (
                      <div
                        key={e.ejeId}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedEjeId(e.ejeId)}
                        onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSelectedEjeId(e.ejeId) } }}
                        className="p-2 rounded-lg text-left cursor-pointer border border-gray-100 bg-white hover:border-slate-300 transition-colors"
                        title="Ver iniciativas de prioridad alta de este eje"
                      >
                        <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 mb-1">
                          Eje {e.numero}
                        </span>
                        <p className="text-[10px] font-semibold text-slate-700 mb-1 leading-tight line-clamp-2">{e.nombre}</p>
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="flex-1 bg-gray-100 rounded-full h-1">
                            <div className={`${barColor} h-1 rounded-full transition-all`} style={{ width: `${e.avgPct}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-800 tabular-nums">{e.avgPct}%</span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-gray-400">
                          <div className="flex items-center gap-1">
                            {e.rojo  > 0 && <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-red-500"/>{e.rojo}</span>}
                            {e.ambar > 0 && <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-amber-400"/>{e.ambar}</span>}
                            {e.verde > 0 && <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-green-500"/>{e.verde}</span>}
                          </div>
                          <span>{e.total} init.</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div>
              <button
                onClick={() => setSelectedEjeId(null)}
                className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-slate-700 font-medium mb-1.5 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7.5 2.5L3 6l4.5 3.5"/>
                </svg>
                Volver
              </button>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 truncate">
                Prioridad alta{selectedEje ? ` — Eje ${selectedEje.numero}: ${selectedEje.nombre}` : ''}
              </p>
              <div className="space-y-1.5">
                {iniciativasAltaDelEje.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic text-center py-4">
                    Sin iniciativas de prioridad alta en este eje.
                  </p>
                ) : (
                  iniciativasAltaDelEje.map(p => {
                    const barColor = p.estado_semaforo === 'verde' ? 'bg-green-500'
                      : p.estado_semaforo === 'ambar' ? 'bg-amber-400'
                      : p.estado_semaforo === 'rojo'  ? 'bg-red-500'
                      : 'bg-gray-300'
                    const pct = p.pct_avance ?? 0
                    const ministerios = splitMinisterio(p.ministerio).join(' / ')
                    const comunas = (p.comuna ?? '').split(';').map(c => c.trim()).filter(Boolean).join(' / ')
                    return (
                      <div key={p.n} className="bg-slate-50/70 border border-gray-100 rounded-lg p-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[11px] font-medium text-slate-800 leading-snug">{p.nombre}</p>
                          <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${barColor}`} />
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-[9px] text-gray-400 truncate flex-1 min-w-0">
                            {comunas || 'Sin comuna'} · {ministerios || 'Sin asignar'}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            <div className="w-10 bg-gray-200 rounded-full h-1">
                              <div className={`${barColor} h-1 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[9px] font-semibold text-slate-600 tabular-nums w-7 text-right">{pct}%</span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </section>

        {/* Métricas clave — misma sección que Mi Región (Desocupación, PIB, Seguridad), en modo compacto */}
        <MetricasClaveSection
          region={region}
          compact
          onVerMasIndicadores={onVerMasIndicadores ? () => onVerMasIndicadores(region) : undefined}
        />
      </div>

      {/* Footer con CTA */}
      <div className="border-t border-gray-100 px-4 py-2.5 bg-white">
        <button
          onClick={onGoToDashboard}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          <span>Ver Mi Región</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 3l4 4-4 4"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
