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
 *      en un eje, su box se expande en el mismo lugar (sigue mostrando su % de
 *      avance total) y despliega debajo sus iniciativas (ordenadas por capa,
 *      con scroll propio si son muchas); la flecha para volver va integrada,
 *      sutil, en el mismo box.
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
import { CapaBadge } from './CapaBadge'
import MetricasClaveSection from './MetricasClaveSection'
import { fmtMM } from '@/lib/comunaStats'
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
  // Modo detalle comunal (drill del Mapa): mismo panel, filtrado por CUT
  // (`comuna_cods @> {cut}`), con header propio. Oculta Métricas clave y
  // Minuta (artefactos regionales sin equivalente comunal).
  comuna?:                { cut: number; nombre: string } | null
  // CTA "Ver detalle comunal" — solo en modo región (equivale al doble click
  // en el polígono; regla 6 del spec del drill).
  onVerDetalleComunal?:   () => void
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function RegionPreviewPanel({
  region,
  projects,
  onClose,
  onGoToDashboard,
  onVerMasIndicadores,
  comuna = null,
  onVerDetalleComunal,
}: Props) {
  const { ejes: regionEjes } = useRegionEjes(region.cod)

  // ── Minuta "Contexto Regional" (tipo 'ficha') — descarga la última versión
  // guardada por "Mi Región" → "Generar Contexto Regional". Panel de solo
  // lectura: nunca genera, solo descarga si ya existe una versión en caché.
  const [fichaCached, setFichaCached] = useState(false)
  const [downloadingFicha, setDownloadingFicha] = useState(false)

  useEffect(() => {
    if (comuna) return // modo comuna: sin botón de minuta, no consultar
    let cancelled = false
    setFichaCached(false)
    fetch(`/api/minuta?region_cod=${region.cod}&tipo=ficha`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) setFichaCached(!!data?.cached) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [region.cod, comuna])

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

  // En modo comuna, el universo del panel completo se acota por CUT — el
  // desglose por eje y la lista de iniciativas operan sobre el subconjunto.
  const regionIniciativas = useMemo(() => {
    const deRegion = iniciativasDeRegion(region.cod, projects)
    return comuna ? deRegion.filter(p => p.comuna_cods.includes(comuna.cut)) : deRegion
  }, [region.cod, projects, comuna])

  const comunaInvMM = useMemo(
    () => comuna ? regionIniciativas.reduce((s, p) => s + (p.inversion_mm ?? 0), 0) : 0,
    [comuna, regionIniciativas],
  )

  // Breakdown completo de ejes (TODOS, no cutoff a 3). Ordenado por número
  // ascendente para mantener el orden estructural del catálogo. En modo
  // comuna se calcula sobre el subconjunto (regionIniciativas ya filtrado).
  const ejes = useMemo(
    () => ejeBreakdownFor(region.cod, regionIniciativas, regionEjes),
    [region.cod, regionIniciativas, regionEjes],
  )

  // Eje seleccionado en la grid → el box de ese eje se expande en su lugar
  // (sigue mostrando su % de avance total) y despliega debajo TODAS sus
  // iniciativas (Capa I, II y III), ordenadas por capa (las más importantes
  // primero) para que arriba queden las que más importan; cuando son muchas,
  // la lista tiene su propio scroll. Aplica igual a nivel regional y comunal
  // (regionIniciativas ya viene filtrado por CUT en modo comuna).
  const [selectedEjeId, setSelectedEjeId] = useState<number | null>(null)
  const selectedEjeData = selectedEjeId != null ? ejes.find(e => e.ejeId === selectedEjeId) ?? null : null
  const iniciativasDelEje = useMemo(() => {
    if (selectedEjeId == null) return []
    const ordenCapa = { l: 0, ll: 1, lll: 2 } as const
    return regionIniciativas
      .filter(p => p.eje_id === selectedEjeId)
      .sort((a, b) => (ordenCapa[a.capa] ?? 3) - (ordenCapa[b.capa] ?? 3))
  }, [selectedEjeId, regionIniciativas])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Header strip */}
      <div className="px-4 pt-3 pb-2.5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h2 className="text-fluid-lg font-bold text-slate-900 truncate">{comuna ? comuna.nombre : region.nombre}</h2>
              <span className="text-[11px] text-gray-400 shrink-0">{comuna ? region.nombre : region.zona}</span>
            </div>
            {comuna && (
              <>
                <p className="text-[11px] text-gray-500 truncate">
                  {regionIniciativas.length} iniciativa{regionIniciativas.length === 1 ? '' : 's'} · {fmtMM(comunaInvMM)} de inversión asociada · CUT {comuna.cut}
                </p>
                <p className="text-[10px] text-gray-400 truncate">Las iniciativas multi-comuna se cuentan completas en cada comuna.</p>
              </>
            )}
            <div className="flex items-center justify-between gap-2">
              {!comuna && (
                <p className="text-[11px] text-gray-400 truncate">{regionIniciativas.length} iniciativas · {region.capital}</p>
              )}
              {!comuna && fichaCached && (
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
            click en un eje, su box se expande en el mismo lugar (conserva su %
            de avance) y despliega debajo sus iniciativas (ordenadas por capa). */}
        <section>
          {selectedEjeId == null ? (
            <>
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Ejes estratégicos</h3>
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
                        title="Ver las iniciativas de este eje"
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
            <>
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Ejes estratégicos</h3>
              {/* Box del eje seleccionado, expandido en su lugar: sigue mostrando
                  su % de avance total; la flecha para volver va integrada, sutil,
                  arriba a la derecha del mismo box. Un click en el header colapsa. */}
              <div className="rounded-lg border border-slate-300 bg-white overflow-hidden shadow-sm">
                <button
                  onClick={() => setSelectedEjeId(null)}
                  className="w-full p-2 text-left hover:bg-slate-50 transition-colors"
                  title="Volver a todos los ejes"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                      Eje {selectedEjeData?.numero}
                    </span>
                    <svg
                      width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-gray-400"
                      aria-label="Volver a todos los ejes"
                    >
                      <path d="M7.5 2.5L3 6l4.5 3.5"/>
                    </svg>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-700 mb-1 leading-tight line-clamp-2">{selectedEjeData?.nombre}</p>
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="flex-1 bg-gray-100 rounded-full h-1">
                      <div
                        className={`${(selectedEjeData?.avgPct ?? 0) >= 70 ? 'bg-green-500' : (selectedEjeData?.avgPct ?? 0) >= 40 ? 'bg-amber-400' : 'bg-red-400'} h-1 rounded-full transition-all`}
                        style={{ width: `${selectedEjeData?.avgPct ?? 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-800 tabular-nums">{selectedEjeData?.avgPct ?? 0}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-gray-400">
                    <div className="flex items-center gap-1">
                      {selectedEjeData && selectedEjeData.rojo  > 0 && <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-red-500"/>{selectedEjeData.rojo}</span>}
                      {selectedEjeData && selectedEjeData.ambar > 0 && <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-amber-400"/>{selectedEjeData.ambar}</span>}
                      {selectedEjeData && selectedEjeData.verde > 0 && <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-green-500"/>{selectedEjeData.verde}</span>}
                    </div>
                    <span>{selectedEjeData?.total ?? 0} init.</span>
                  </div>
                </button>

                {/* Detalle desplegado: iniciativas del eje (Capa I/II/III),
                    ordenadas por capa. Scroll propio cuando son muchas. */}
                <div className="border-t border-gray-100 bg-slate-50/40 px-2 py-2">
                  <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Iniciativas{iniciativasDelEje.length > 0 ? ` · ${iniciativasDelEje.length}` : ''}
                  </p>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {iniciativasDelEje.length === 0 ? (
                      <p className="text-[11px] text-gray-400 italic text-center py-3">
                        Este eje aún no tiene iniciativas.
                      </p>
                    ) : (
                      iniciativasDelEje.map(p => {
                        const barColor = p.estado_semaforo === 'verde' ? 'bg-green-500'
                          : p.estado_semaforo === 'ambar' ? 'bg-amber-400'
                          : p.estado_semaforo === 'rojo'  ? 'bg-red-500'
                          : 'bg-gray-300'
                        const pct = p.pct_avance ?? 0
                        const ministerios = splitMinisterio(p.ministerio).join(' / ')
                        const comunas = (p.comuna ?? '').split(';').map(c => c.trim()).filter(Boolean).join(' / ')
                        return (
                          <div key={p.n} className="bg-white border border-gray-100 rounded-lg p-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-1.5 min-w-0 flex-1">
                                <CapaBadge value={p.capa} size="sm" hideDefault className="flex-shrink-0 mt-px" />
                                <p className="text-[11px] font-medium text-slate-800 leading-snug min-w-0">{p.nombre}</p>
                              </div>
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
              </div>
            </>
          )}
        </section>

        {/* Métricas clave — misma sección que Mi Región (Desocupación, PIB,
            Seguridad), en modo compacto. Son indicadores REGIONALES: en el
            detalle de comuna se ocultan (no hay equivalente comunal). */}
        {!comuna && (
          <MetricasClaveSection
            region={region}
            compact
            onVerMasIndicadores={onVerMasIndicadores ? () => onVerMasIndicadores(region) : undefined}
          />
        )}
      </div>

      {/* Footer con CTA */}
      <div className="border-t border-gray-100 px-4 py-2.5 bg-white">
        {!comuna && onVerDetalleComunal && (
          <button
            onClick={onVerDetalleComunal}
            className="w-full mb-1.5 flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            title="Equivale al doble click sobre la región en el mapa"
          >
            <span>Ver detalle comunal</span>
            <span className="text-[10px] text-gray-400">o doble click en el mapa</span>
          </button>
        )}
        <button
          onClick={onGoToDashboard}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-violet-700 text-white rounded-lg text-sm font-medium hover:bg-violet-800 transition-colors"
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
