'use client'

import { useState, useEffect, useRef } from 'react'
import type { Project } from '@/lib/projects'
import type { Seguimiento, Documento, SemaforoLog } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'
import { logSemaforoChange } from '@/lib/db'

const TIPO_CONFIG = {
  avance:  { label: 'Avance',  color: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500'   },
  reunion: { label: 'Reunión', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  hito:    { label: 'Hito',    color: 'bg-green-100 text-green-700',  dot: 'bg-green-500'  },
  alerta:  { label: 'Alerta',  color: 'bg-red-100 text-red-700',      dot: 'bg-red-500'    },
} as const

const ESTADO_CONFIG = {
  en_curso:   { label: 'En curso',   color: 'bg-blue-100 text-blue-700'   },
  completado: { label: 'Completado', color: 'bg-green-100 text-green-700' },
  bloqueado:  { label: 'Bloqueado',  color: 'bg-red-100 text-red-700'     },
  pendiente:  { label: 'Pendiente',  color: 'bg-gray-100 text-gray-600'   },
} as const

const EJE_COLORS: Record<string, string> = {
  'Seguridad y Orden Público':       'bg-red-100 text-red-700',
  'Infraestructura y Conectividad':  'bg-blue-100 text-blue-700',
  'Desarrollo Económico y Empleo':   'bg-green-100 text-green-700',
  'Vivienda y Urbanismo':            'bg-orange-100 text-orange-700',
  'Energía y Transición Energética': 'bg-yellow-100 text-yellow-700',
  'Medio Ambiente y Territorio':     'bg-teal-100 text-teal-700',
  'Desarrollo Social y Familia':     'bg-pink-100 text-pink-700',
  'Modernización e Innovación':      'bg-purple-100 text-purple-700',
}

type Tab = 'seguimiento' | 'documentos' | 'calendario' | 'historial'

const SEMAFORO_CONFIG = {
  verde: { dot: 'bg-green-500',  ring: 'ring-green-300',  label: 'En verde'    },
  ambar: { dot: 'bg-amber-400',  ring: 'ring-amber-300',  label: 'En revisión' },
  rojo:  { dot: 'bg-red-500',    ring: 'ring-red-300',    label: 'Bloqueado'   },
  gris:  { dot: 'bg-gray-300',   ring: 'ring-gray-200',   label: 'Sin evaluar' },
} as const

type SemaforoKey = keyof typeof SEMAFORO_CONFIG

type Props = {
  prioridad: Project
  onClose: () => void
  onUpdatePrioridad: (n: number, patch: Partial<Pick<Project, 'estado_semaforo' | 'pct_avance' | 'responsable'>>) => void
}

export default function ProjectTrackerModal({ prioridad, onClose, onUpdatePrioridad }: Props) {
  const [tab, setTab]                   = useState<Tab>('seguimiento')
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([])
  const [documentos, setDocumentos]     = useState<Documento[]>([])
  const [semaforoLog, setSemaforoLog]   = useState<SemaforoLog[]>([])
  const [loading, setLoading]           = useState(true)
  const [uploading, setUploading]       = useState(false)
  const fileInputRef                    = useRef<HTMLInputElement>(null)

  // New entry form
  const [showForm, setShowForm]   = useState(false)
  const [formDesc, setFormDesc]   = useState('')
  const [formTipo, setFormTipo]   = useState<keyof typeof TIPO_CONFIG>('avance')
  const [formEstado, setFormEstado] = useState('')
  const [formAutor, setFormAutor] = useState('')
  const [formFecha, setFormFecha] = useState(() => new Date().toISOString().split('T')[0])
  const [saving, setSaving]       = useState(false)

  // Edit entry
  const [editingId, setEditingId]       = useState<number | null>(null)
  const [editDesc, setEditDesc]         = useState('')
  const [editTipo, setEditTipo]         = useState<keyof typeof TIPO_CONFIG>('avance')
  const [editEstado, setEditEstado]     = useState('')
  const [editAutor, setEditAutor]       = useState('')
  const [editFecha, setEditFecha]       = useState('')
  const [editSaving, setEditSaving]     = useState(false)

  // Calendar
  const [calMonth, setCalMonth]         = useState(() => new Date())
  const [calDay, setCalDay]             = useState<string | null>(null)

  // Semáforo + % avance (local state, synced to DB on change)
  const [semaforo, setSemaforo]       = useState<SemaforoKey>(prioridad.estado_semaforo as SemaforoKey ?? 'gris')
  const [pctAvance, setPctAvance]     = useState<number>(prioridad.pct_avance ?? 0)
  const [savingSem, setSavingSem]     = useState(false)

  // Fecha límite
  const [fechaLimite, setFechaLimite]         = useState<string>(prioridad.fecha_limite ?? '')
  const [editingFecha, setEditingFecha]       = useState(false)
  const [savingFecha, setSavingFecha]         = useState(false)

  // Responsable
  const [responsable, setResponsable]         = useState<string>(prioridad.responsable ?? '')
  const [editingResponsable, setEditingResponsable] = useState(false)
  const [savingResponsable, setSavingResponsable]   = useState(false)

  const ejeColor     = EJE_COLORS[prioridad.eje] ?? 'bg-gray-100 text-gray-600'
  const currentEstado = seguimientos.find(s => s.estado)?.estado as keyof typeof ESTADO_CONFIG | undefined

  useEffect(() => { loadData() }, [prioridad.n])

  async function loadData() {
    setLoading(true)
    const sb = getSupabase()
    const [segRes, docRes, logRes] = await Promise.all([
      sb.from('seguimientos').select('*').eq('prioridad_id', prioridad.n).order('created_at', { ascending: false }),
      sb.from('documentos_prioridad').select('*').eq('prioridad_id', prioridad.n).order('created_at', { ascending: false }),
      sb.from('semaforo_log').select('*').eq('prioridad_id', prioridad.n).order('created_at', { ascending: true }),
    ])
    setSeguimientos((segRes.data ?? []) as Seguimiento[])
    setDocumentos((docRes.data ?? []) as Documento[])
    setSemaforoLog((logRes.data ?? []) as SemaforoLog[])
    setLoading(false)
  }

  async function handleSave() {
    if (!formDesc.trim()) return
    setSaving(true)
    const { error } = await getSupabase().from('seguimientos').insert({
      prioridad_id: prioridad.n,
      tipo:         formTipo,
      descripcion:  formDesc.trim(),
      autor:        formAutor.trim() || null,
      estado:       formEstado || null,
      fecha:        formFecha,
    })
    if (!error) {
      setFormDesc(''); setFormEstado(''); setFormAutor('')
      setFormFecha(new Date().toISOString().split('T')[0]); setShowForm(false)
      await loadData()
    }
    setSaving(false)
  }

  function startEdit(s: Seguimiento) {
    setEditingId(s.id)
    setEditDesc(s.descripcion)
    setEditTipo(s.tipo)
    setEditEstado(s.estado ?? '')
    setEditAutor(s.autor ?? '')
    setEditFecha(s.fecha ? s.fecha.split('T')[0] : new Date().toISOString().split('T')[0])
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function handleUpdate() {
    if (!editDesc.trim() || editingId === null) return
    setEditSaving(true)
    const { error } = await getSupabase().from('seguimientos').update({
      tipo:        editTipo,
      descripcion: editDesc.trim(),
      autor:       editAutor.trim() || null,
      estado:      editEstado || null,
      fecha:       editFecha,
    }).eq('id', editingId)
    if (!error) {
      setEditingId(null)
      await loadData()
    }
    setEditSaving(false)
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

  async function handleSavePct(value: number) {
    const clamped = Math.max(0, Math.min(100, value))
    const anterior = pctAvance
    setPctAvance(clamped)
    const sb = getSupabase()
    const { data: { session } } = await sb.auth.getSession()
    await Promise.all([
      sb.from('prioridades_territoriales').update({ pct_avance: clamped }).eq('n', prioridad.n),
      logSemaforoChange(prioridad.n, 'pct_avance', anterior, clamped, session?.user?.email ?? null),
    ])
    onUpdatePrioridad(prioridad.n, { pct_avance: clamped })
  }

  async function handleSaveResponsable() {
    setSavingResponsable(true)
    await getSupabase()
      .from('prioridades_territoriales')
      .update({ responsable: responsable.trim() || null })
      .eq('n', prioridad.n)
    onUpdatePrioridad(prioridad.n, { responsable: responsable.trim() || null })
    setEditingResponsable(false)
    setSavingResponsable(false)
  }

  async function handleSaveFechaLimite(value: string) {
    setSavingFecha(true)
    await getSupabase()
      .from('prioridades_territoriales')
      .update({ fecha_limite: value || null })
      .eq('n', prioridad.n)
    setFechaLimite(value)
    setEditingFecha(false)
    setSavingFecha(false)
  }

  async function handleDeleteSeg(id: number) {
    if (!confirm('¿Eliminar esta actualización?')) return
    await getSupabase().from('seguimientos').delete().eq('id', id)
    await loadData()
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const sb   = getSupabase()
    const path = `${prioridad.n}/${Date.now()}_${file.name}`

    const { error: storageErr } = await sb.storage.from('project-docs').upload(path, file)
    if (storageErr) {
      alert(`Error subiendo archivo: ${storageErr.message}`)
      setUploading(false)
      return
    }
    const { data: { publicUrl } } = sb.storage.from('project-docs').getPublicUrl(path)
    await sb.from('documentos_prioridad').insert({
      prioridad_id: prioridad.n,
      nombre:       file.name,
      url:          publicUrl,
      tipo_archivo: file.type || null,
      tamano_bytes: file.size,
    })
    await loadData()
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDeleteDoc(doc: Documento) {
    if (!confirm(`¿Eliminar "${doc.nombre}"?`)) return
    await getSupabase().from('documentos_prioridad').delete().eq('id', doc.id)
    await loadData()
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function fmtBytes(b: number | null) {
    if (!b) return ''
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  function fileIcon(tipo: string | null) {
    if (!tipo) return '📎'
    if (tipo.includes('pdf'))                                          return '📄'
    if (tipo.includes('sheet') || tipo.includes('excel') || tipo.includes('csv')) return '📊'
    if (tipo.includes('word') || tipo.includes('doc'))                 return '📝'
    if (tipo.includes('image'))                                        return '🖼️'
    if (tipo.includes('presentation') || tipo.includes('powerpoint'))  return '📑'
    return '📎'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
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
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  prioridad.prioridad === 'Alta' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {prioridad.prioridad}
                </span>
                {currentEstado && ESTADO_CONFIG[currentEstado] && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_CONFIG[currentEstado].color}`}>
                    {ESTADO_CONFIG[currentEstado].label}
                  </span>
                )}
              </div>
              <p className="text-base font-semibold text-gray-900 leading-snug">{prioridad.meta}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="1" y="2" width="10" height="9" rx="1.5"/>
                    <path d="M4 1v2M8 1v2M1 5h10"/>
                  </svg>
                  {prioridad.plazo}
                </span>
                <span>·</span>
                <span>{prioridad.region}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5 flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l12 12M16 4L4 16"/>
              </svg>
            </button>
          </div>

          {/* Ministerios */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {prioridad.ministerios.map((m, i) => (
              <span key={i} className="text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded-md border border-gray-100">
                {m}
              </span>
            ))}
          </div>

          {/* Semáforo + % avance */}
          <div className="flex items-center gap-3 mb-3 py-2.5 px-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-600 mr-0.5">Estado</span>
              {(Object.keys(SEMAFORO_CONFIG) as SemaforoKey[]).map(s => (
                <button
                  key={s}
                  onClick={() => handleSaveSemaforo(s)}
                  disabled={savingSem}
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
              <input
                type="range"
                min={0} max={100} step={5}
                value={pctAvance}
                onChange={e => setPctAvance(Number(e.target.value))}
                onMouseUp={e => handleSavePct(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={e => handleSavePct(Number((e.target as HTMLInputElement).value))}
                className="flex-1 accent-slate-900 h-1.5"
              />
              <input
                type="number"
                min={0} max={100}
                value={pctAvance}
                onChange={e => setPctAvance(Number(e.target.value))}
                onBlur={e => handleSavePct(Number(e.target.value))}
                className="w-12 text-xs border border-gray-200 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-slate-300"
              />
              <span className="text-xs text-gray-600">%</span>
            </div>
          </div>

          {/* Responsable */}
          <div className="px-5 py-2 border-t border-gray-100 flex items-center gap-2">
            <span className="text-xs text-gray-500 w-24 flex-shrink-0">Responsable</span>
            {editingResponsable ? (
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="text"
                  value={responsable}
                  onChange={e => setResponsable(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveResponsable(); if (e.key === 'Escape') setEditingResponsable(false) }}
                  placeholder="Nombre del responsable"
                  autoFocus
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-300"
                />
                <button onClick={handleSaveResponsable} disabled={savingResponsable}
                  className="text-xs px-2 py-1 bg-slate-900 text-white rounded hover:bg-slate-700 disabled:opacity-50">
                  {savingResponsable ? '...' : 'Guardar'}
                </button>
                <button onClick={() => setEditingResponsable(false)}
                  className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700">
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingResponsable(true)}
                className="flex-1 text-left text-xs text-gray-700 hover:text-slate-900 group"
              >
                {responsable || <span className="text-gray-400 group-hover:text-gray-500">Sin asignar — clic para editar</span>}
              </button>
            )}
          </div>

          {/* Fecha límite */}
          <div className="px-5 py-2 border-t border-gray-100 flex items-center gap-2">
            <span className="text-xs text-gray-500 w-24 flex-shrink-0">Fecha límite</span>
            {editingFecha ? (
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="date"
                  value={fechaLimite}
                  onChange={e => setFechaLimite(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveFechaLimite(fechaLimite); if (e.key === 'Escape') setEditingFecha(false) }}
                  autoFocus
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-300 text-gray-700"
                />
                <button onClick={() => handleSaveFechaLimite(fechaLimite)} disabled={savingFecha}
                  className="text-xs px-2 py-1 bg-slate-900 text-white rounded hover:bg-slate-700 disabled:opacity-50">
                  {savingFecha ? '...' : 'Guardar'}
                </button>
                <button onClick={() => { setFechaLimite(prioridad.fecha_limite ?? ''); setEditingFecha(false) }}
                  className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700">
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingFecha(true)}
                className="flex-1 text-left text-xs text-gray-700 hover:text-slate-900 group"
              >
                {fechaLimite
                  ? new Date(fechaLimite + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
                  : <span className="text-gray-400 group-hover:text-gray-500">Sin fecha — clic para editar</span>
                }
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex mt-1">
            {(['seguimiento', 'historial', 'calendario', 'documentos'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  tab === t
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {t === 'seguimiento'
                  ? `Seguimiento${seguimientos.length ? ` (${seguimientos.length})` : ''}`
                  : t === 'historial'
                  ? 'Historial'
                  : t === 'calendario'
                  ? 'Calendario'
                  : `Documentos${documentos.length ? ` (${documentos.length})` : ''}`}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Cargando...</div>
          ) : tab === 'historial' ? (
            // ── Historial tab ──
            <div className="px-6 py-5 space-y-6">

              {/* ── Barra de progreso con tiempo ── */}
              {(() => {
                const pct = pctAvance
                const limite = prioridad.fecha_limite ?? fechaLimite
                let tiempoPct: number | null = null
                let diasRestantes: number | null = null
                let atrasado = false

                if (limite) {
                  const inicio = new Date(prioridad.plazo?.match(/\d{4}/)?.[0] + '-01-01') ?? new Date()
                  const fin = new Date(limite + 'T12:00:00')
                  const hoy = new Date()
                  const total = fin.getTime() - inicio.getTime()
                  const transcurrido = hoy.getTime() - inicio.getTime()
                  tiempoPct = Math.max(0, Math.min(100, Math.round((transcurrido / total) * 100)))
                  diasRestantes = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
                  atrasado = diasRestantes < 0
                }

                return (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Progreso</h3>
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                      {/* % Avance */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600">Avance del proyecto</span>
                          <span className="text-xs font-bold text-gray-800">{pct}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              semaforo === 'rojo' ? 'bg-red-400' :
                              semaforo === 'ambar' ? 'bg-amber-400' :
                              semaforo === 'verde' ? 'bg-green-500' : 'bg-gray-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Tiempo transcurrido */}
                      {tiempoPct !== null && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-600">Tiempo transcurrido</span>
                            <span className={`text-xs font-bold ${atrasado ? 'text-red-600' : tiempoPct > pct + 20 ? 'text-amber-600' : 'text-gray-800'}`}>
                              {tiempoPct}%
                              {diasRestantes !== null && (
                                <span className="font-normal text-gray-500 ml-1">
                                  {atrasado
                                    ? `· venció hace ${Math.abs(diasRestantes)}d`
                                    : `· ${diasRestantes}d restantes`}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${atrasado ? 'bg-red-400' : tiempoPct > pct + 20 ? 'bg-amber-400' : 'bg-blue-400'}`}
                              style={{ width: `${Math.min(tiempoPct, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {!limite && (
                        <p className="text-xs text-gray-400">
                          Agrega una fecha límite para ver el progreso de tiempo
                        </p>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* ── Historial de semáforo ── */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Trayectoria del semáforo</h3>
                {semaforoLog.length === 0 ? (
                  <p className="text-xs text-gray-400">Sin cambios registrados aún</p>
                ) : (
                  <div className="space-y-3">
                    {/* Sparkline de semáforos */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {semaforoLog.filter(l => l.campo === 'semaforo').map((l, i) => {
                        const colorMap: Record<string, string> = {
                          verde: 'bg-green-500', ambar: 'bg-amber-400',
                          rojo: 'bg-red-500', gris: 'bg-gray-300',
                        }
                        return (
                          <div key={l.id} className="flex items-center gap-1">
                            {i > 0 && <span className="text-gray-300 text-xs">→</span>}
                            <div className="flex flex-col items-center gap-0.5" title={`${new Date(l.created_at).toLocaleDateString('es-CL')}${l.cambiado_por ? ` · ${l.cambiado_por}` : ''}`}>
                              <span className={`w-5 h-5 rounded-full ${colorMap[l.valor_nuevo] ?? 'bg-gray-300'}`} />
                              <span className="text-xs text-gray-400" style={{ fontSize: '9px' }}>
                                {new Date(l.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                      {/* Estado actual */}
                      {semaforoLog.some(l => l.campo === 'semaforo') && (() => {
                        const colorMap: Record<string, string> = {
                          verde: 'bg-green-500', ambar: 'bg-amber-400',
                          rojo: 'bg-red-500', gris: 'bg-gray-300',
                        }
                        return (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-300 text-xs">→</span>
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`w-5 h-5 rounded-full ring-2 ring-offset-1 ring-gray-400 ${colorMap[semaforo]}`} />
                              <span className="text-xs text-gray-500 font-medium" style={{ fontSize: '9px' }}>hoy</span>
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Log de cambios */}
                    <div className="space-y-1.5 mt-2">
                      {semaforoLog.map(l => {
                        const colorMap: Record<string, string> = {
                          verde: 'text-green-600', ambar: 'text-amber-600',
                          rojo: 'text-red-600', gris: 'text-gray-500',
                        }
                        const labelMap: Record<string, string> = {
                          verde: 'En verde', ambar: 'En revisión', rojo: 'Bloqueado', gris: 'Sin evaluar',
                        }
                        return (
                          <div key={l.id} className="flex items-start gap-2 text-xs text-gray-600">
                            <span className="text-gray-400 flex-shrink-0 w-20 mt-0.5">
                              {new Date(l.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </span>
                            {l.campo === 'semaforo' ? (
                              <span>
                                Semáforo:&nbsp;
                                <span className="text-gray-500">{labelMap[l.valor_anterior ?? ''] ?? l.valor_anterior ?? '—'}</span>
                                &nbsp;→&nbsp;
                                <span className={`font-semibold ${colorMap[l.valor_nuevo] ?? ''}`}>{labelMap[l.valor_nuevo] ?? l.valor_nuevo}</span>
                              </span>
                            ) : (
                              <span>
                                Avance:&nbsp;
                                <span className="text-gray-500">{l.valor_anterior ?? '—'}%</span>
                                &nbsp;→&nbsp;
                                <span className="font-semibold text-slate-700">{l.valor_nuevo}%</span>
                              </span>
                            )}
                            {l.cambiado_por && <span className="text-gray-400 ml-auto">{l.cambiado_por}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Timeline de seguimientos por mes ── */}
              {seguimientos.length > 0 && (() => {
                const byMonth: Record<string, Seguimiento[]> = {}
                for (const s of seguimientos) {
                  const d = new Date(s.fecha ? s.fecha + 'T12:00:00' : s.created_at)
                  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                  if (!byMonth[key]) byMonth[key] = []
                  byMonth[key].push(s)
                }
                const months = Object.keys(byMonth).sort().reverse()

                return (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Actividad por mes
                    </h3>
                    <div className="space-y-4">
                      {months.map(monthKey => {
                        const [y, m] = monthKey.split('-')
                        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
                        const entries = byMonth[monthKey]
                        const counts = { avance: 0, reunion: 0, hito: 0, alerta: 0 }
                        entries.forEach(s => counts[s.tipo] = (counts[s.tipo] ?? 0) + 1)
                        return (
                          <div key={monthKey}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold text-gray-700 capitalize">{label}</span>
                              <div className="flex items-center gap-1 ml-auto">
                                {(Object.entries(counts) as [keyof typeof TIPO_CONFIG, number][])
                                  .filter(([, n]) => n > 0)
                                  .map(([tipo, n]) => (
                                    <span key={tipo} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TIPO_CONFIG[tipo].color}`}>
                                      {n} {TIPO_CONFIG[tipo].label}
                                    </span>
                                  ))}
                              </div>
                            </div>
                            <div className="relative pl-4">
                              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-gray-100" />
                              <div className="space-y-2">
                                {entries.map(s => {
                                  const cfg = TIPO_CONFIG[s.tipo]
                                  const est = s.estado ? ESTADO_CONFIG[s.estado] : null
                                  return (
                                    <div key={s.id} className="flex gap-2 items-start">
                                      <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${cfg.dot} ring-2 ring-white`} />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                                          {est && <span className={`text-xs px-1.5 py-0.5 rounded-full ${est.color}`}>{est.label}</span>}
                                          <span className="text-xs text-gray-400 ml-auto">
                                            {new Date((s.fecha ?? s.created_at) + (s.fecha ? 'T12:00:00' : '')).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                                          </span>
                                        </div>
                                        <p className="text-xs text-gray-700 leading-snug">{s.descripcion}</p>
                                        {s.autor && <p className="text-xs text-gray-400 mt-0.5">{s.autor}</p>}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          ) : tab === 'calendario' ? (
            // ── Calendario tab ──
            (() => {
              const today = new Date().toISOString().split('T')[0]
              const year  = calMonth.getFullYear()
              const month = calMonth.getMonth()

              // Group seguimientos by fecha
              const byDate: Record<string, Seguimiento[]> = {}
              for (const s of seguimientos) {
                const d = s.fecha ? s.fecha.split('T')[0] : s.created_at.split('T')[0]
                if (!byDate[d]) byDate[d] = []
                byDate[d].push(s)
              }

              // Build grid (Mon-first)
              const firstDow = new Date(year, month, 1).getDay()
              const offset   = (firstDow + 6) % 7
              const daysInMonth = new Date(year, month + 1, 0).getDate()
              const cells: (string | null)[] = Array(offset).fill(null)
              for (let d = 1; d <= daysInMonth; d++) {
                cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
              }
              while (cells.length % 7 !== 0) cells.push(null)

              const _mn = calMonth.toLocaleDateString('es-CL', { month: 'long' })
              const monthLabel = `${_mn.charAt(0).toUpperCase() + _mn.slice(1)} ${calMonth.getFullYear()}`
              const dayNames   = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

              const selectedEntries = calDay ? (byDate[calDay] ?? []) : []

              return (
                <div className="px-6 py-4">
                  {/* Month nav */}
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => setCalMonth(new Date(year, month - 1, 1))}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M9 2L4 7l5 5"/>
                      </svg>
                    </button>
                    <span className="text-sm font-medium text-gray-800 capitalize">{monthLabel}</span>
                    <button
                      onClick={() => setCalMonth(new Date(year, month + 1, 1))}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M5 2l5 5-5 5"/>
                      </svg>
                    </button>
                  </div>

                  {/* Day headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {dayNames.map((d, i) => (
                      <div key={i} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                    ))}
                  </div>

                  {/* Day grid */}
                  <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
                    {cells.map((dateStr, i) => {
                      if (!dateStr) return <div key={i} className="bg-white h-16" />
                      const entries = byDate[dateStr] ?? []
                      const isToday    = dateStr === today
                      const isSelected = dateStr === calDay
                      const dayNum     = parseInt(dateStr.split('-')[2])
                      return (
                        <button
                          key={i}
                          onClick={() => setCalDay(isSelected ? null : dateStr)}
                          className={`bg-white h-16 p-1.5 flex flex-col items-start transition-colors hover:bg-slate-50 ${
                            isSelected ? 'bg-slate-50 ring-2 ring-inset ring-slate-900' : ''
                          }`}
                        >
                          <span className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                            isToday ? 'bg-slate-900 text-white' : 'text-gray-600'
                          }`}>{dayNum}</span>
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {entries.slice(0, 4).map((s, j) => (
                              <span
                                key={j}
                                title={`${TIPO_CONFIG[s.tipo]?.label}: ${s.descripcion}`}
                                className={`w-2 h-2 rounded-full flex-shrink-0 ${TIPO_CONFIG[s.tipo]?.dot ?? 'bg-gray-300'}`}
                              />
                            ))}
                            {entries.length > 4 && (
                              <span className="text-xs text-gray-400 leading-none">+{entries.length - 4}</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    {(Object.entries(TIPO_CONFIG) as [keyof typeof TIPO_CONFIG, typeof TIPO_CONFIG[keyof typeof TIPO_CONFIG]][]).map(([key, cfg]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                        <span className="text-xs text-gray-500">{cfg.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Selected day entries */}
                  {calDay && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <p className="text-xs font-medium text-gray-500 mb-3">
                        {new Date(calDay + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                        {selectedEntries.length === 0 && ' — Sin actividad'}
                      </p>
                      {selectedEntries.length > 0 && (
                        <div className="space-y-2">
                          {selectedEntries.map(s => {
                            const cfg = TIPO_CONFIG[s.tipo] ?? TIPO_CONFIG.avance
                            const est = s.estado ? ESTADO_CONFIG[s.estado] : null
                            return (
                              <div key={s.id} className="flex gap-3 items-start p-2.5 rounded-lg bg-gray-50 group">
                                <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${cfg.dot}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                                    {est && <span className={`text-xs px-1.5 py-0.5 rounded-full ${est.color}`}>{est.label}</span>}
                                    <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => { startEdit(s); setTab('seguimiento') }}
                                        className="p-1 text-gray-400 hover:text-slate-700 rounded hover:bg-white transition-colors"
                                        title="Editar"
                                      >
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                          <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" strokeLinejoin="round"/>
                                        </svg>
                                      </button>
                                      <button
                                        onClick={() => handleDeleteSeg(s.id)}
                                        className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-white transition-colors"
                                        title="Eliminar"
                                      >
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                          <path d="M2 3.5h8M4.5 3.5V2h3v1.5M4 3.5l.5 7h3l.5-7"/>
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                  <p className="text-sm text-gray-700 leading-snug">{s.descripcion}</p>
                                  {s.autor && <p className="text-xs text-gray-500 mt-0.5">{s.autor}</p>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()
          ) : tab === 'seguimiento' ? (
            <div className="px-6 py-4">

              {/* Add button */}
              {!showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-slate-300 hover:text-slate-500 transition-colors mb-5"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 2v10M2 7h10" strokeLinecap="round"/>
                  </svg>
                  Agregar actualización
                </button>
              )}

              {/* Form */}
              {showForm && (
                <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {(Object.entries(TIPO_CONFIG) as [keyof typeof TIPO_CONFIG, typeof TIPO_CONFIG[keyof typeof TIPO_CONFIG]][]).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => setFormTipo(key)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                          formTipo === key ? cfg.color : 'bg-white text-gray-400 border border-gray-200'
                        }`}
                      >
                        {cfg.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Describe el avance, reunión, hito o alerta..."
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    rows={3}
                    className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Autor (opcional)"
                      value={formAutor}
                      onChange={e => setFormAutor(e.target.value)}
                      className="flex-1 text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
                    />
                    <select
                      value={formEstado}
                      onChange={e => setFormEstado(e.target.value)}
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white text-gray-600"
                    >
                      <option value="">Estado (sin cambio)</option>
                      {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 flex-shrink-0">Fecha</label>
                    <input
                      type="date"
                      value={formFecha}
                      onChange={e => setFormFecha(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white text-gray-700"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowForm(false)} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !formDesc.trim()}
                      className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Timeline */}
              {seguimientos.length === 0 ? (
                <div className="text-center py-10 text-gray-300">
                  <svg className="mx-auto mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4l3 3" strokeLinecap="round"/>
                  </svg>
                  <p className="text-sm">Sin actualizaciones aún</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-100" />
                  <div className="space-y-5">
                    {seguimientos.map(s => {
                      const cfg = TIPO_CONFIG[s.tipo] ?? TIPO_CONFIG.avance
                      const est = s.estado ? ESTADO_CONFIG[s.estado] : null
                      const isEditing = editingId === s.id
                      return (
                        <div key={s.id} className="flex gap-4 pl-1 group">
                          <div className={`w-3.5 h-3.5 rounded-full mt-1 flex-shrink-0 ${cfg.dot} ring-2 ring-white`} />
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="bg-gray-50 rounded-xl p-3 space-y-2.5">
                                <div className="flex gap-2 flex-wrap">
                                  {(Object.entries(TIPO_CONFIG) as [keyof typeof TIPO_CONFIG, typeof TIPO_CONFIG[keyof typeof TIPO_CONFIG]][]).map(([key, c]) => (
                                    <button
                                      key={key}
                                      onClick={() => setEditTipo(key)}
                                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                                        editTipo === key ? c.color : 'bg-white text-gray-400 border border-gray-200'
                                      }`}
                                    >
                                      {c.label}
                                    </button>
                                  ))}
                                </div>
                                <textarea
                                  value={editDesc}
                                  onChange={e => setEditDesc(e.target.value)}
                                  rows={3}
                                  className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
                                />
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Autor (opcional)"
                                    value={editAutor}
                                    onChange={e => setEditAutor(e.target.value)}
                                    className="flex-1 text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
                                  />
                                  <select
                                    value={editEstado}
                                    onChange={e => setEditEstado(e.target.value)}
                                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white text-gray-600"
                                  >
                                    <option value="">Sin estado</option>
                                    {Object.entries(ESTADO_CONFIG).map(([key, c]) => (
                                      <option key={key} value={key}>{c.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-500 flex-shrink-0">Fecha</label>
                                  <input
                                    type="date"
                                    value={editFecha}
                                    onChange={e => setEditFecha(e.target.value)}
                                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white text-gray-700"
                                  />
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <button onClick={cancelEdit} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={handleUpdate}
                                    disabled={editSaving || !editDesc.trim()}
                                    className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
                                  >
                                    {editSaving ? 'Guardando...' : 'Guardar'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                                    {cfg.label}
                                  </span>
                                  {est && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${est.color}`}>
                                      {est.label}
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-500 ml-auto">{fmtDate(s.created_at)}</span>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => startEdit(s)}
                                      className="p-1 text-gray-400 hover:text-slate-700 rounded hover:bg-gray-100 transition-colors"
                                      title="Editar"
                                    >
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" strokeLinejoin="round"/>
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteSeg(s.id)}
                                      className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                                      title="Eliminar"
                                    >
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path d="M2 3.5h8M4.5 3.5V2h3v1.5M4 3.5l.5 7h3l.5-7"/>
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                <p className="text-sm text-gray-700 leading-snug">{s.descripcion}</p>
                                {s.autor && <p className="text-xs text-gray-500 mt-1">{s.autor}</p>}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // ── Documentos tab ──
            <div className="px-6 py-4">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-slate-300 hover:text-slate-500 transition-colors disabled:opacity-50 mb-4"
              >
                {uploading ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                      <circle cx="6" cy="6" r="4" strokeDasharray="12" strokeDashoffset="4"/>
                    </svg>
                    Subiendo...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 10V2M3 6l4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 11h10" strokeLinecap="round"/>
                    </svg>
                    Subir archivo (minuta, Excel, PDF…)
                  </>
                )}
              </button>

              {documentos.length === 0 ? (
                <div className="text-center py-10 text-gray-300">
                  <svg className="mx-auto mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                  </svg>
                  <p className="text-sm">Sin documentos adjuntos</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documentos.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all group">
                      <span className="text-xl flex-shrink-0">{fileIcon(doc.tipo_archivo)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{doc.nombre}</p>
                        <p className="text-xs text-gray-500">
                          {fmtDate(doc.created_at)}
                          {doc.tamano_bytes ? ` · ${fmtBytes(doc.tamano_bytes)}` : ''}
                          {doc.subido_por ? ` · ${doc.subido_por}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-gray-50"
                          title="Abrir"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M11 9v3a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1h3"/>
                            <path d="M8 1h5v5M5.5 8.5L13 1"/>
                          </svg>
                        </a>
                        <button
                          onClick={() => handleDeleteDoc(doc)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                          title="Eliminar"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M2 4h10M5 4V2h4v2M5.5 7v4M8.5 7v4M3 4l1 8h6l1-8"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
