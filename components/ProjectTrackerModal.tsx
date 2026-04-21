'use client'

import { useState, useEffect } from 'react'
import type { Iniciativa } from '@/lib/projects'
import type { Seguimiento, Documento, SemaforoLog } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'
import { logSemaforoChange } from '@/lib/db'
import { SEMAFORO_CONFIG, EJE_COLORS, prioridadColor, type SemaforoKey } from '@/lib/config'
import SeguimientoTab from './modal/SeguimientoTab'
import HistorialTab   from './modal/HistorialTab'
import CalendarioTab  from './modal/CalendarioTab'
import DocumentosTab  from './modal/DocumentosTab'
import { useCanEdit, useCanEditAny } from '@/lib/context/UserContext'

type Tab = 'seguimiento' | 'historial' | 'calendario' | 'documentos'

type Props = {
  prioridad: Iniciativa
  onClose: () => void
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
  onDeletePrioridad?: (n: number) => void
}

export default function ProjectTrackerModal({ prioridad, onClose, onUpdatePrioridad, onDeletePrioridad }: Props) {
  const canEditRegion = useCanEdit()
  const canEditAny = useCanEditAny()
  const canEdit = canEditRegion(prioridad.region)

  const [tab, setTab]               = useState<Tab>('seguimiento')
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([])
  const [documentos, setDocumentos]     = useState<Documento[]>([])
  const [semaforoLog, setSemaforoLog]   = useState<SemaforoLog[]>([])
  const [loading, setLoading]           = useState(true)

  const [semaforo, setSemaforo]       = useState<SemaforoKey>(prioridad.estado_semaforo as SemaforoKey ?? 'gris')
  const [pctAvance, setPctAvance]     = useState<number>(prioridad.pct_avance ?? 0)
  const [savingSem, setSavingSem]     = useState(false)

  const [prioridadLocal, setPrioridadLocal] = useState<'Alta' | 'Media' | 'Baja'>(prioridad.prioridad)
  const [responsable, setResponsable]       = useState<string>(prioridad.responsable ?? '')
  const [usuarios, setUsuarios]             = useState<{email: string; name: string}[]>([])

  const [etapaActual, setEtapaActual]               = useState<string>(prioridad.etapa_actual ?? '')
  const [proximoHito, setProximoHito]               = useState<string>(prioridad.proximo_hito ?? '')
  const [fechaProximoHito, setFechaProximoHito]     = useState<string>(prioridad.fecha_proximo_hito ?? '')
  const [fuenteFinanciamiento, setFuenteFinanciamiento] = useState<string>(prioridad.fuente_financiamiento ?? '')
  const [estadoTerminoGob, setEstadoTerminoGob]     = useState<string>(prioridad.estado_termino_gobierno ?? '')
  const [rat, setRat]                               = useState<string>(prioridad.rat ?? '')
  const [inversionMm, setInversionMm]               = useState<string>(prioridad.inversion_mm != null ? String(prioridad.inversion_mm) : '')
  const [codigoBip, setCodigoBip]                   = useState<string>(prioridad.codigo_bip ?? '')
  const [editingField, setEditingField]             = useState<string | null>(null)
  const [savingField, setSavingField]               = useState(false)
  const [confirmDelete, setConfirmDelete]           = useState(false)
  const [deleting, setDeleting]                     = useState(false)

  const ejeColor = EJE_COLORS[prioridad.eje] ?? 'bg-gray-100 text-gray-600'
  const pc = prioridadColor(prioridadLocal)

  useEffect(() => {
    loadData()
    fetch('/api/users').then(r => r.ok ? r.json() : []).then(setUsuarios)
  }, [prioridad.n])

  function calcPctFromHitos(segs: Seguimiento[]): number {
    const hitos = segs.filter(s => s.tipo === 'hito')
    if (!hitos.length) return 0
    return Math.round((hitos.filter(h => h.estado === 'completado').length / hitos.length) * 100)
  }

  async function loadData() {
    setLoading(true)
    const sb = getSupabase()
    const [segRes, docRes, logRes] = await Promise.all([
      sb.from('seguimientos').select('*').eq('prioridad_id', prioridad.n).order('created_at', { ascending: false }),
      sb.from('documentos_prioridad').select('*').eq('prioridad_id', prioridad.n).order('created_at', { ascending: false }),
      sb.from('semaforo_log').select('*').eq('prioridad_id', prioridad.n).order('created_at', { ascending: true }),
    ])
    const segsData = (segRes.data ?? []) as Seguimiento[]
    setSeguimientos(segsData)
    setDocumentos((docRes.data ?? []) as Documento[])
    setSemaforoLog((logRes.data ?? []) as SemaforoLog[])

    const newPct = calcPctFromHitos(segsData)
    if (newPct !== (prioridad.pct_avance ?? 0)) {
      setPctAvance(newPct)
      const sb2 = getSupabase()
      const { data: { session } } = await sb2.auth.getSession()
      await Promise.all([
        sb2.from('prioridades_territoriales').update({ pct_avance: newPct }).eq('n', prioridad.n),
        logSemaforoChange(prioridad.n, 'pct_avance', prioridad.pct_avance ?? 0, newPct, session?.user?.email ?? null),
      ])
      onUpdatePrioridad(prioridad.n, { pct_avance: newPct })
    }
    setLoading(false)
  }

  async function handleSaveSemaforo(newSem: SemaforoKey) {
    const anterior = semaforo
    setSemaforo(newSem)
    setSavingSem(true)
    const sb = getSupabase()
    const { data: { session } } = await sb.auth.getSession()
    await Promise.all([
      sb.from('prioridades_territoriales').update({ estado_semaforo: newSem }).eq('n', prioridad.n),
      logSemaforoChange(prioridad.n, 'semaforo', anterior, newSem, session?.user?.email ?? null),
    ])
    onUpdatePrioridad(prioridad.n, { estado_semaforo: newSem })
    setSavingSem(false)
  }

  async function saveMetaField(field: string, value: string) {
    setSavingField(true)
    const patch: Record<string, string | null> = { [field]: value || null }
    if (field === 'proximo_hito') patch.fecha_proximo_hito = fechaProximoHito || null
    if (field === 'fecha_proximo_hito') patch.proximo_hito = proximoHito || null
    await getSupabase().from('prioridades_territoriales').update(patch).eq('n', prioridad.n)
    onUpdatePrioridad(prioridad.n, patch as Partial<Iniciativa>)
    setEditingField(null)
    setSavingField(false)
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/iniciativa/${prioridad.n}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      setConfirmDelete(false)
      return
    }
    onDeletePrioridad?.(prioridad.n)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-6xl max-h-[95vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ejeColor}`}>
                  {prioridad.eje}
                </span>
                {/* Prioridad chip */}
                <label className={`relative inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full cursor-pointer hover:brightness-95 transition-all group ${pc.bg}`}>
                  <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor" className={pc.flag}>
                    <path d="M1 0v9M1 0h5.5L4.5 3.5 6.5 7H1z"/>
                  </svg>
                  <span className={`text-xs font-semibold ${pc.text}`}>{prioridadLocal}</span>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`opacity-40 group-hover:opacity-70 transition-opacity ${pc.text}`}>
                    <path d="M1.5 3L4 5.5L6.5 3"/>
                  </svg>
                  <select
                    value={prioridadLocal}
                    disabled={!canEdit}
                    onChange={async e => {
                      const val = e.target.value as 'Alta' | 'Media' | 'Baja'
                      setPrioridadLocal(val)
                      await getSupabase().from('prioridades_territoriales').update({ prioridad: val }).eq('n', prioridad.n)
                      onUpdatePrioridad(prioridad.n, { prioridad: val })
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full disabled:cursor-default"
                  >
                    <option value="Alta">Alta</option>
                    <option value="Media">Media</option>
                    <option value="Baja">Baja</option>
                  </select>
                </label>
              </div>
              <p className="text-base font-semibold text-gray-900 leading-snug">{prioridad.nombre}</p>
              {prioridad.descripcion && (
                <p className="text-xs text-gray-500 leading-relaxed mt-1 line-clamp-2">{prioridad.descripcion}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 flex-wrap">
                <span>{prioridad.region}</span>
                {prioridad.comuna && <><span>·</span><span>{prioridad.comuna}</span></>}
                {prioridad.codigo_iniciativa && (
                  <span className="font-mono text-gray-400">{prioridad.codigo_iniciativa}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canEditAny && onDeletePrioridad && !confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-gray-300 hover:text-red-500 transition-colors mt-0.5"
                  title="Eliminar iniciativa"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h14M8 6V4h4v2M19 6l-1 12H2L1 6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              {confirmDelete && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-medium">¿Eliminar?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? '…' : 'Sí'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    No
                  </button>
                </div>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l12 12M16 4L4 16"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Ministerio */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className="text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded-md border border-gray-100">
              {prioridad.ministerio}
            </span>
          </div>

          {/* Semáforo + % avance */}
          <div className="flex items-center gap-3 mb-3 py-2.5 px-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-600 mr-0.5">Estado</span>
              {(Object.keys(SEMAFORO_CONFIG) as SemaforoKey[]).map(s => (
                <button
                  key={s}
                  onClick={() => handleSaveSemaforo(s)}
                  disabled={savingSem || !canEdit}
                  title={SEMAFORO_CONFIG[s].label}
                  className={`w-5 h-5 rounded-full transition-all disabled:opacity-50 ${SEMAFORO_CONFIG[s].dot} ${
                    semaforo === s
                      ? `ring-2 ring-offset-1 ${SEMAFORO_CONFIG[s].ring} scale-110`
                      : 'opacity-30 hover:opacity-60'
                  }`}
                />
              ))}
              <span className="text-xs text-gray-700 ml-1">{SEMAFORO_CONFIG[semaforo].label}</span>
            </div>
            <div className="w-px h-4 bg-gray-200"/>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs text-gray-600 flex-shrink-0">Avance</span>
              <div className="w-32 bg-gray-200 rounded-full h-1.5">
                <div className="bg-slate-700 h-1.5 rounded-full transition-all" style={{ width: `${pctAvance}%` }} />
              </div>
              <span className="text-xs font-semibold text-gray-700">{pctAvance}%</span>
              <span className="text-xs text-gray-400 italic">calculado desde hitos</span>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-x-3 px-3 py-1 bg-gray-50 rounded-xl mb-2 text-xs">
          <div className="flex flex-col divide-y divide-gray-200/60">

            {/* Responsable */}
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-gray-400 w-36 flex-shrink-0">Responsable</span>
              <label className="relative inline-flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full bg-white border border-gray-200 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-colors group">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 flex-shrink-0">
                  <circle cx="5" cy="3.5" r="2"/>
                  <path d="M1 9c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5"/>
                </svg>
                <span className="text-xs font-medium text-gray-700 truncate max-w-[200px]">
                  {responsable
                    ? (usuarios.find(u => u.email === responsable)?.name ?? responsable)
                    : <span className="text-gray-400">Sin asignar</span>}
                </span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 opacity-50 group-hover:opacity-80 flex-shrink-0">
                  <path d="M1.5 3L4 5.5L6.5 3"/>
                </svg>
                <select
                  value={responsable}
                  disabled={!canEdit}
                  onChange={async e => {
                    const val = e.target.value
                    setResponsable(val)
                    await getSupabase().from('prioridades_territoriales').update({ responsable: val || null }).eq('n', prioridad.n)
                    onUpdatePrioridad(prioridad.n, { responsable: val || null })
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full disabled:cursor-default"
                >
                  <option value="">Sin asignar</option>
                  {usuarios.map(u => (
                    <option key={u.email} value={u.email}>
                      {u.name !== u.email ? `${u.name} (${u.email})` : u.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Etapa actual */}
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-gray-400 w-36 flex-shrink-0">Etapa actual</span>
              <label className={`relative inline-flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full cursor-pointer hover:brightness-95 transition-all group ${
                etapaActual === 'Terminado'    ? 'bg-green-100' :
                etapaActual === 'Ejecución'    ? 'bg-blue-100'  :
                etapaActual === 'Diseño'       ? 'bg-violet-100':
                etapaActual === 'Preinversión' ? 'bg-orange-100': 'bg-gray-100'
              } ${savingField ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className={`text-xs font-medium truncate max-w-[110px] ${
                  etapaActual === 'Terminado'    ? 'text-green-700' :
                  etapaActual === 'Ejecución'    ? 'text-blue-700'  :
                  etapaActual === 'Diseño'       ? 'text-violet-700':
                  etapaActual === 'Preinversión' ? 'text-orange-700': 'text-gray-500'
                }`}>{etapaActual || '—'}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40 group-hover:opacity-70 text-gray-500">
                  <path d="M1.5 3L4 5.5L6.5 3"/>
                </svg>
                <select
                  value={etapaActual}
                  onChange={async e => { setEtapaActual(e.target.value); await saveMetaField('etapa_actual', e.target.value) }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                >
                  <option value="">—</option>
                  <option>Preinversión</option>
                  <option>Diseño</option>
                  <option>Ejecución</option>
                  <option>Terminado</option>
                </select>
              </label>
            </div>

            {/* Fuente de financiamiento */}
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-gray-400 w-36 flex-shrink-0">Fuente de financiamiento</span>
              <label className={`relative inline-flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full cursor-pointer hover:bg-slate-200 transition-colors group bg-slate-100 ${savingField ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className="text-xs font-medium text-slate-700 truncate max-w-[110px]">{fuenteFinanciamiento || '—'}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40 group-hover:opacity-70 text-slate-500">
                  <path d="M1.5 3L4 5.5L6.5 3"/>
                </svg>
                <select
                  value={fuenteFinanciamiento}
                  onChange={async e => { setFuenteFinanciamiento(e.target.value); await saveMetaField('fuente_financiamiento', e.target.value) }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                >
                  <option value="">—</option>
                  <option>Sectorial</option>
                  <option>FNDR</option>
                  <option>Mixto</option>
                  <option>Privado</option>
                  <option>FONDEMA</option>
                  <option>PEDZE</option>
                </select>
              </label>
            </div>

            {/* Próximo hito */}
            <div className="flex items-start gap-2 py-1.5">
              <span className="text-gray-400 w-36 flex-shrink-0 pt-0.5">Próximo hito</span>
              {editingField === 'proximo_hito' ? (
                <div className="flex flex-1 gap-1.5">
                  <select
                    value={proximoHito}
                    onChange={e => setProximoHito(e.target.value)}
                    className="flex-1 text-xs text-gray-700 border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                    autoFocus
                  >
                    <option value="">—</option>
                    <option>Obtención RS</option>
                    <option>Obtención Financiamiento</option>
                    <option>Presentación Core</option>
                    <option>Publicación Bases Licitación</option>
                    <option>Adjudicación Licitación</option>
                    <option>Término Diseño/Preinversión</option>
                    <option>Primera Piedra</option>
                    <option>Inicio Obras/Programa</option>
                    <option>Término Obras/Programa</option>
                    <option>Inauguración</option>
                    <option>Finalizado</option>
                    <option>Otro</option>
                  </select>
                  <input
                    type="date"
                    value={fechaProximoHito}
                    onChange={e => setFechaProximoHito(e.target.value)}
                    className="text-xs text-gray-700 border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400 w-32"
                  />
                  <button
                    onClick={() => saveMetaField('proximo_hito', proximoHito)}
                    disabled={savingField}
                    className="text-xs px-2 py-0.5 bg-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-50"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => { setEditingField(null); setProximoHito(prioridad.proximo_hito ?? ''); setFechaProximoHito(prioridad.fecha_proximo_hito ?? '') }}
                    className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => canEdit && setEditingField('proximo_hito')}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors group cursor-pointer"
                  >
                    <span className="text-xs font-medium text-slate-700">
                      {proximoHito || <span className="text-slate-400">Agregar hito...</span>}
                    </span>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40 group-hover:opacity-70 text-slate-500">
                      <path d="M1.5 3L4 5.5L6.5 3"/>
                    </svg>
                  </button>
                  {fechaProximoHito && (
                    <button
                      onClick={() => setEditingField('proximo_hito')}
                      className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
                    >
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-gray-400">
                        <rect x="0.5" y="1" width="8" height="7.5" rx="1.5"/>
                        <path d="M3 0.5v1M6 0.5v1M0.5 3.5h8"/>
                      </svg>
                      <span className="text-xs text-gray-500">
                        {new Date(fechaProximoHito + 'T12:00:00').toLocaleDateString('es-CL', { year: 'numeric', month: 'short' })}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>{/* end left col */}
          <div className="flex flex-col divide-y divide-gray-200/60 border-l border-gray-200/60 pl-3">

            {/* Al término gob. */}
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-gray-400 w-28 flex-shrink-0">Al término gob.</span>
              <label className={`relative inline-flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full cursor-pointer hover:brightness-95 transition-all group ${
                estadoTerminoGob === 'En operación' || estadoTerminoGob === 'Terminado' ? 'bg-green-100' :
                estadoTerminoGob === 'En ejecución'  ? 'bg-blue-100'   :
                estadoTerminoGob === 'En diseño'     ? 'bg-violet-100' :
                estadoTerminoGob === 'En licitación' || estadoTerminoGob === 'En preinversión' ? 'bg-orange-100' :
                estadoTerminoGob === 'Sin iniciar'   ? 'bg-gray-100'   : 'bg-gray-100'
              } ${savingField ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className={`text-xs font-medium truncate max-w-[160px] ${
                  estadoTerminoGob === 'En operación' || estadoTerminoGob === 'Terminado' ? 'text-green-700' :
                  estadoTerminoGob === 'En ejecución'  ? 'text-blue-700'   :
                  estadoTerminoGob === 'En diseño'     ? 'text-violet-700' :
                  estadoTerminoGob === 'En licitación' || estadoTerminoGob === 'En preinversión' ? 'text-orange-700' :
                  'text-gray-400'
                }`}>{estadoTerminoGob || '—'}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40 group-hover:opacity-70 text-gray-500">
                  <path d="M1.5 3L4 5.5L6.5 3"/>
                </svg>
                <select
                  value={estadoTerminoGob}
                  onChange={async e => {
                    setEstadoTerminoGob(e.target.value)
                    await saveMetaField('estado_termino_gobierno', e.target.value)
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                >
                  <option value="">—</option>
                  <option>Sin iniciar</option>
                  <option>En preinversión</option>
                  <option>En diseño</option>
                  <option>En licitación</option>
                  <option>En ejecución</option>
                  <option>En operación</option>
                  <option>Terminado</option>
                </select>
              </label>
            </div>

            {/* Inversión */}
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-gray-400 w-28 flex-shrink-0">Inversión (MM$)</span>
              {editingField === 'inversion_mm' ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={inversionMm}
                    onChange={e => setInversionMm(e.target.value)}
                    placeholder="0"
                    className="w-28 text-xs text-gray-800 placeholder:text-gray-400 border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                    autoFocus
                  />
                  <button
                    onClick={async () => {
                      setSavingField(true)
                      const val = inversionMm ? parseFloat(inversionMm) : null
                      await getSupabase().from('prioridades_territoriales').update({ inversion_mm: val }).eq('n', prioridad.n)
                      onUpdatePrioridad(prioridad.n, { inversion_mm: val })
                      setEditingField(null)
                      setSavingField(false)
                    }}
                    disabled={savingField}
                    className="text-xs px-2 py-0.5 bg-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-50"
                  >Guardar</button>
                  <button
                    onClick={() => { setEditingField(null); setInversionMm(prioridad.inversion_mm != null ? String(prioridad.inversion_mm) : '') }}
                    className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => canEdit && setEditingField('inversion_mm')}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors group cursor-pointer"
                >
                  <span className={`text-xs font-medium ${inversionMm ? 'text-slate-700' : 'text-slate-400'}`}>
                    {inversionMm ? `$${parseFloat(inversionMm).toLocaleString('es-CL')} MM` : '—'}
                  </span>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40 group-hover:opacity-70 text-slate-500">
                    <path d="M1.5 3L4 5.5L6.5 3"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Cód. BIP */}
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-gray-400 w-28 flex-shrink-0">Cód. BIP</span>
              {editingField === 'codigo_bip' ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={codigoBip}
                    onChange={e => setCodigoBip(e.target.value)}
                    placeholder="Ej: 30123456"
                    className="w-36 text-xs text-gray-800 placeholder:text-gray-400 border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white font-mono"
                    autoFocus
                  />
                  <button
                    onClick={() => saveMetaField('codigo_bip', codigoBip)}
                    disabled={savingField}
                    className="text-xs px-2 py-0.5 bg-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-50"
                  >Guardar</button>
                  <button
                    onClick={() => { setEditingField(null); setCodigoBip(prioridad.codigo_bip ?? '') }}
                    className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => canEdit && setEditingField('codigo_bip')}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors group cursor-pointer"
                >
                  <span className={`text-xs font-medium font-mono ${codigoBip ? 'text-slate-700' : 'text-slate-400'}`}>
                    {codigoBip || '—'}
                  </span>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40 group-hover:opacity-70 text-slate-500">
                    <path d="M1.5 3L4 5.5L6.5 3"/>
                  </svg>
                </button>
              )}
            </div>

            {/* RAT */}
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-gray-400 w-28 flex-shrink-0">RAT</span>
              <label className={`relative inline-flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full cursor-pointer hover:brightness-95 transition-all group ${
                ['FI','IN','RS','RE','OT'].includes(rat) ? 'bg-green-100'  :
                rat === 'En Tramitación'                 ? 'bg-orange-100' : 'bg-gray-100'
              } ${savingField ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className={`text-xs font-medium truncate max-w-[160px] ${
                  ['FI','IN','RS','RE','OT'].includes(rat) ? 'text-green-700'  :
                  rat === 'En Tramitación'                 ? 'text-orange-700' : 'text-gray-400'
                }`}>{rat && rat !== 'No Requiere' && rat !== 'No Ingresado' ? rat : '—'}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40 group-hover:opacity-70 text-gray-500">
                  <path d="M1.5 3L4 5.5L6.5 3"/>
                </svg>
                <select
                  value={rat}
                  onChange={async e => {
                    setRat(e.target.value)
                    await saveMetaField('rat', e.target.value)
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                >
                  <option value="">—</option>
                  <option>No Requiere</option>
                  <option>No Ingresado</option>
                  <option>En Tramitación</option>
                  <option>FI</option>
                  <option>IN</option>
                  <option>OT</option>
                  <option>RE</option>
                  <option>RS</option>
                </select>
              </label>
            </div>
          </div>{/* end right col */}
          </div>{/* end metadata grid */}

          {/* Tabs */}
          <div className="flex mt-1">
            {(['seguimiento', 'historial', 'calendario', 'documentos'] as Tab[]).map(t => {
              const label =
                t === 'seguimiento' ? `Seguimiento${seguimientos.length ? ` (${seguimientos.length})` : ''}` :
                t === 'historial'   ? 'Historial' :
                t === 'calendario'  ? 'Calendario' :
                `Documentos${documentos.length ? ` (${documentos.length})` : ''}`
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    tab === t
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Cargando...</div>
          ) : tab === 'seguimiento' ? (
            <SeguimientoTab prioridadId={prioridad.n} seguimientos={seguimientos} onRefresh={loadData} canEdit={canEdit} />
          ) : tab === 'historial' ? (
            <HistorialTab seguimientos={seguimientos} semaforoLog={semaforoLog} semaforo={semaforo} pctAvance={pctAvance} />
          ) : tab === 'calendario' ? (
            <CalendarioTab seguimientos={seguimientos} />
          ) : (
            <DocumentosTab prioridadId={prioridad.n} documentos={documentos} onRefresh={loadData} canEdit={canEdit} />
          )}
        </div>
      </div>
    </div>
  )
}
