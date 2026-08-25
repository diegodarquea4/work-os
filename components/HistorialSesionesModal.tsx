'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useIsAdmin } from '@/lib/context/UserContext'
import type { Region } from '@/lib/regions'
import type { RegionEje, SesionCompromiso, ComiteInstitucion, ComiteDesglose } from '@/lib/types'
import { COMITE_INSTITUCIONES } from '@/lib/sesiones/helpers'
import {
  HistorialShell, SesionCard, ActaAcciones, AsistenciaCard, CompromisosCard,
  DetalleCard, SeccionLabel, CargandoDetalle, SinDetalle, useActaAcciones,
  type SesionResumen, type AsistenciaRow,
} from './historial/historialUi'

/**
 * Historial de sesiones de la instancia — comité (región, eje), Gabinete
 * Regional o Comité de Infraestructura (región, instancia sin eje): lista
 * fecha DESC con asistentes / compromisos / estado del acta; el detalle se
 * expande por fila. En gabinete e infraestructura el detalle muestra las
 * INICIATIVAS TRATADAS con su acuerdo (snapshot del cierre) en lugar del
 * reporte por institución.
 * El acta se descarga vía GET /api/sesiones/[id]/acta (URL firmada, bucket
 * privado). Si una sesión quedó cerrada sin acta (falló el PDF), acá está el
 * botón de reintento (POST /acta — solo regenera el PDF, nunca las métricas).
 * El shell + fila + asistencia + compromisos viven en ./historial/historialUi.
 */

type Props = {
  region: Region
  instancia: 'eje' | 'gabinete' | 'infraestructura'
  eje: RegionEje | null          // null ⇔ instancia≠'eje'
  nombreInstancia: string
  onClose: () => void
  // Deep-link (ej. desde el calendario regional): abre directo con esta
  // sesión expandida en vez de arrancar con la lista colapsada.
  initialSesionId?: number | null
}

type DetalleSesion = {
  asistencia: AsistenciaRow[]
  // Reporte por institución del comité (mig 048).
  valores: {
    valor_num: number | null; valor_texto: string | null; observaciones: string | null; desglose: ComiteDesglose[]
    metrica: { nombre: string; unidad: string | null; tipo: 'numerico' | 'texto'; institucion: ComiteInstitucion; orden: number } | null
  }[]
  iniciativas: { semaforo_al_momento: string | null; pct_avance_al_momento: number | null; acuerdo: string | null; prioridad: { nombre: string } | null }[]
  // "Temas a tratar" archivados a la sesión al cierre (mig 053/054) — solo gabinete.
  temas: { texto: string; subitems: string[] }[]
  compromisos: SesionCompromiso[]
}

const SEM_DOT: Record<string, string> = {
  rojo: 'bg-red-500', ambar: 'bg-amber-400', verde: 'bg-green-500',
}

export default function HistorialSesionesModal({ region, instancia, eje, nombreInstancia, onClose, initialSesionId = null }: Props) {
  const [sesiones, setSesiones] = useState<SesionResumen[]>([])
  const [loading, setLoading]   = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detalle, setDetalle]   = useState<Record<number, DetalleSesion>>({})

  const load = useCallback(async () => {
    setLoading(true)
    let q = getSupabase()
      .from('eje_sesiones')
      .select('*, sesion_asistencia(count)')
      .eq('region_cod', region.cod)
    q = instancia === 'eje' ? q.eq('eje_id', eje!.id) : q.eq('instancia', instancia)
    const { data } = await q
      .order('fecha', { ascending: false })
      .order('id',    { ascending: false })
    setSesiones((data ?? []) as SesionResumen[])
    setLoading(false)
  }, [region.cod, instancia, eje?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isAdmin = useIsAdmin()
  const { working, descargarActa, reintentarActa, eliminarSesion } = useActaAcciones(load)

  async function toggleExpand(s: SesionResumen) {
    if (expandedId === s.id) { setExpandedId(null); return }
    setExpandedId(s.id)
    if (detalle[s.id]) return
    const sb = getSupabase()
    const [asisRes, valRes, iniRes, temasRes, compRes] = await Promise.all([
      sb.from('sesion_asistencia')
        .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, institucion, calidad)')
        .eq('sesion_id', s.id),
      // Reporte por institución: solo en comités (el gabinete tiene iniciativas).
      instancia === 'eje'
        ? sb.from('sesion_comite_valor')
            .select('valor_num, valor_texto, observaciones, desglose, metrica:comite_metrica(nombre, unidad, tipo, institucion, orden)')
            .eq('sesion_id', s.id)
        : Promise.resolve({ data: [] }),
      // Iniciativas tratadas: gabinete (en foco) e infraestructura (por tag) —
      // ambas usan sesion_iniciativas como agenda con snapshot + acuerdo.
      (instancia === 'gabinete' || instancia === 'infraestructura')
        ? sb.from('sesion_iniciativas')
            .select('semaforo_al_momento, pct_avance_al_momento, acuerdo, prioridad:prioridades_territoriales(nombre)')
            .eq('sesion_id', s.id)
            .order('created_at')
        : Promise.resolve({ data: [] }),
      // Temas a tratar archivados a la sesión (mig 053/054): solo en gabinete.
      instancia === 'gabinete'
        ? sb.from('gabinete_temas')
            .select('texto, subitems')
            .eq('sesion_id', s.id)
            .order('orden')
            .order('id')
        : Promise.resolve({ data: [] }),
      sb.from('sesion_compromisos')
        .select('*')
        .eq('sesion_origen_id', s.id)
        .order('created_at'),
    ])
    setDetalle(prev => ({
      ...prev,
      [s.id]: {
        asistencia:  (asisRes.data ?? []) as unknown as DetalleSesion['asistencia'],
        valores:     (valRes.data ?? []) as unknown as DetalleSesion['valores'],
        iniciativas: (iniRes.data ?? []) as unknown as DetalleSesion['iniciativas'],
        temas:       ((temasRes.data ?? []) as { texto: string; subitems: unknown }[]).map(t => ({
          texto: t.texto,
          subitems: Array.isArray(t.subitems) ? t.subitems as string[] : [],
        })),
        compromisos: (compRes.data ?? []) as SesionCompromiso[],
      },
    }))
  }

  // Deep-link: una vez cargada la lista, expande directo la sesión pedida
  // (ej. click en un item de Comités y Gabinetes del calendario regional).
  useEffect(() => {
    if (!initialSesionId || expandedId === initialSesionId) return
    const s = sesiones.find(x => x.id === initialSesionId)
    if (s) toggleExpand(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesiones, initialSesionId])

  return (
    <HistorialShell
      title={`Historial — ${nombreInstancia}`}
      subtitle={region.nombre}
      onClose={onClose}
      loading={loading}
      isEmpty={sesiones.length === 0}
    >
      {sesiones.map(s => {
        const det = detalle[s.id]
        return (
          <SesionCard
            key={s.id}
            sesion={s}
            nAsis={s.sesion_asistencia?.[0]?.count ?? 0}
            expanded={expandedId === s.id}
            onToggle={() => toggleExpand(s)}
            onDelete={isAdmin ? () => eliminarSesion(s.id) : undefined}
          >
            <ActaAcciones
              sesion={s}
              working={working}
              onDescargar={() => descargarActa(s.id)}
              onReintentar={() => reintentarActa(s.id)}
            />

            {!det ? <CargandoDetalle /> : (() => {
              const allEmpty = det.valores.length === 0 && det.iniciativas.length === 0 && det.temas.length === 0 && det.asistencia.length === 0 && det.compromisos.length === 0
              return (
                <>
                  {det.valores.length > 0 && (
                    <DetalleCard>
                      <SeccionLabel>Reporte por institución</SeccionLabel>
                      <div className="space-y-4">
                        {COMITE_INSTITUCIONES.map(instDef => {
                          const filas = det.valores
                            .filter(v => v.metrica?.institucion === instDef.key)
                            .sort((a, b) => (a.metrica?.orden ?? 0) - (b.metrica?.orden ?? 0))
                          if (filas.length === 0) return null
                          return (
                            <div key={instDef.key}>
                              <p className="text-sm font-semibold text-slate-700 mb-1.5">{instDef.label}</p>
                              <div className="space-y-2">
                                {filas.map((v, i) => {
                                  const desg = Array.isArray(v.desglose) ? v.desglose.filter(d => d.etiqueta.trim() || d.valor.trim()) : []
                                  return (
                                    <div key={i} className="text-sm text-slate-700">
                                      <div className="flex justify-between gap-3">
                                        <span className="min-w-0">{v.metrica?.nombre ?? '—'}</span>
                                        {v.metrica?.tipo === 'numerico' && (
                                          <span className="font-semibold tabular-nums flex-shrink-0">
                                            {v.valor_num != null ? v.valor_num.toLocaleString('es-CL') : '—'}{v.metrica?.unidad ? ` ${v.metrica.unidad}` : ''}
                                          </span>
                                        )}
                                      </div>
                                      {v.metrica?.tipo === 'texto' && v.valor_texto && <p className="text-[13px] text-slate-500 leading-snug mt-0.5">{v.valor_texto}</p>}
                                      {desg.length > 0 && (
                                        <p className="text-[13px] text-slate-500 mt-0.5">{desg.map(d => `${d.etiqueta}: ${d.valor}`).join(' · ')}</p>
                                      )}
                                      {v.observaciones && <p className="text-[13px] text-slate-400 italic mt-0.5">{v.observaciones}</p>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </DetalleCard>
                  )}

                  {det.temas.length > 0 && (
                    <DetalleCard>
                      <SeccionLabel>Temas a tratar</SeccionLabel>
                      <div className="space-y-2">
                        {det.temas.map((t, i) => (
                          <div key={i}>
                            <div className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-violet-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                              <p className="flex-1 min-w-0 text-sm text-slate-700 leading-snug">{t.texto}</p>
                            </div>
                            {t.subitems.length > 0 && (
                              <div className="ml-2.5 mt-1 border-l border-slate-200 pl-3 space-y-0.5">
                                {t.subitems.map((sub, si) => (
                                  <div key={si} className="flex items-start gap-1.5">
                                    <span className="text-slate-400 text-sm flex-shrink-0 leading-none mt-0.5">•</span>
                                    <p className="flex-1 min-w-0 text-[13px] text-slate-500 leading-snug">{sub}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </DetalleCard>
                  )}

                  {det.iniciativas.length > 0 && (
                    <DetalleCard>
                      <SeccionLabel>Iniciativas tratadas</SeccionLabel>
                      <div className="space-y-2.5">
                        {det.iniciativas.map((ini, i) => (
                          <div key={i} className="text-sm text-slate-700">
                            <div className="flex items-center gap-2">
                              {ini.semaforo_al_momento && (
                                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${SEM_DOT[ini.semaforo_al_momento] ?? 'bg-slate-300'}`} />
                              )}
                              <span className="font-medium min-w-0 truncate">{ini.prioridad?.nombre ?? '—'}</span>
                              {ini.pct_avance_al_momento != null && (
                                <span className="text-slate-400 tabular-nums flex-shrink-0">{Math.round(Number(ini.pct_avance_al_momento))}%</span>
                              )}
                            </div>
                            {ini.acuerdo && <p className="text-[13px] text-slate-500 mt-0.5 pl-[18px] leading-snug">Acuerdo: {ini.acuerdo}</p>}
                          </div>
                        ))}
                      </div>
                    </DetalleCard>
                  )}

                  {(det.asistencia.length > 0 || det.compromisos.length > 0) && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <AsistenciaCard asistencia={det.asistencia} />
                      <CompromisosCard compromisos={det.compromisos} />
                    </div>
                  )}

                  {allEmpty && <SinDetalle />}
                </>
              )
            })()}
          </SesionCard>
        )
      })}
    </HistorialShell>
  )
}
