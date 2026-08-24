'use client'

import { useState } from 'react'
import type { Seguimiento, SeguimientoAsistente, SeguimientoCompromiso } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import { useCanEditOperational } from '@/lib/context/UserContext'
import { useRegionConfig } from '@/lib/hooks/useRegionConfig'
import CompromisosSesionSection from '../CompromisosSesionSection'
import { EmptyState, Modal } from '@/components/ui'

const TIPO_CONFIG = {
  avance:  { label: 'Avance',  color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500'   },
  reunion: { label: 'Reunión', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  hito:    { label: 'Hito',    color: 'bg-green-100 text-green-700',   dot: 'bg-green-500'  },
} as const

const ESTADO_CONFIG = {
  en_curso:   { label: 'Avanzando',  color: 'bg-blue-100 text-blue-700'   },
  completado: { label: 'Completado', color: 'bg-green-100 text-green-700' },
  bloqueado:  { label: 'Bloqueado',  color: 'bg-red-100 text-red-700'     },
  pendiente:  { label: 'Pendiente',  color: 'bg-gray-100 text-gray-600'   },
} as const

const COMPROMISO_ESTADO_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'bg-gray-100 text-gray-600'   },
  en_curso:  { label: 'En curso',  color: 'bg-blue-100 text-blue-700'   },
  cumplido:  { label: 'Cumplido',  color: 'bg-green-100 text-green-700' },
} as const

type TipoKey = keyof typeof TIPO_CONFIG
type Usuario = { email: string; name: string }
type CompromisoDraft = { descripcion: string; responsable_nombre: string; responsable_institucion: string; plazo: string }

const emptyCompDraft = { desc: '', resp: '', inst: '', plazo: '' }

// Clases compartidas entre los editores de este tab — a nivel de módulo para
// que los sub-componentes de abajo (definidos también a nivel de módulo, NO
// dentro de SeguimientoTab) puedan usarlas sin depender de closures.
const inputCls = 'w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white'
const selectCls = 'text-sm text-gray-700 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white'

// `fecha` es un date puro YYYY-MM-DD (sin hora). Parsearlo directo con
// `new Date()` lo interpreta en UTC y puede mostrar el día anterior según
// el timezone local — se ancla a mediodía para evitar el corrimiento.
function fmtFechaActividad(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtHora(hora: string | null) {
  if (!hora) return null
  return hora.slice(0, 5)
}

// ── Editor de asistentes — chip por persona. Buscador sobre el padrón
// completo del sistema (no acotado a la región de la iniciativa, ya que
// a una reunión pueden asistir personas de otras regiones o transversales);
// cada resultado tiene su propio (+) para agregarlo al toque. Ahí no se pide
// institución porque ya tienen perfil. Las personas externas se cargan una
// por una a mano, con nombre + institución (no tienen perfil que la traiga sola).
//
// IMPORTANTE: este componente vive a nivel de MÓDULO (no anidado dentro de
// SeguimientoTab) — definirlo adentro haría que React lo recree en cada
// render del padre (cada tecla tipeada cambia estado y re-renderiza) y
// desmontara/remontara el input en cada keystroke, perdiendo el foco.
function AsistentesEditor({
  value, onChange, usuarios,
}: {
  value: SeguimientoAsistente[]
  onChange: (v: SeguimientoAsistente[]) => void
  usuarios: Usuario[]
}) {
  const [busqueda, setBusqueda] = useState('')
  const [nombreExt, setNombreExt] = useState('')
  const [institucionExt, setInstitucionExt] = useState('')

  const yaAgregados = new Set(value.filter(a => a.email).map(a => a.email as string))
  const disponibles = usuarios.filter(u => !yaAgregados.has(u.email))
  const q = busqueda.trim().toLowerCase()
  const resultados = q
    ? disponibles.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    : disponibles

  function addUsuario(u: Usuario) {
    onChange([...value, { nombre: u.name, institucion: '', email: u.email }])
  }

  function addExterno() {
    if (!nombreExt.trim()) return
    onChange([...value, { nombre: nombreExt.trim(), institucion: institucionExt.trim(), email: null }])
    setNombreExt(''); setInstitucionExt('')
  }

  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)) }

  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">Asistentes</label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full pl-2 pr-1 py-1 text-gray-700">
              {a.email && (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="text-slate-400 shrink-0">
                  <circle cx="8" cy="5" r="3"/><path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" strokeWidth="0" />
                </svg>
              )}
              <span>{a.nombre}{a.institucion ? ` — ${a.institucion}` : ''}</span>
              <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 px-0.5">×</button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        placeholder="Buscar persona por nombre o correo…"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className={inputCls}
      />
      {busqueda.trim() && (
        <div className="border border-gray-200 rounded-lg bg-white mt-1 max-h-28 overflow-y-auto divide-y divide-gray-100">
          {resultados.length === 0 ? (
            <p className="text-xs text-gray-400 px-2.5 py-1.5">Sin resultados</p>
          ) : (
            resultados.map(u => (
              <div key={u.email} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                <span className="truncate">{u.name !== u.email ? `${u.name} (${u.email})` : u.email}</span>
                <button
                  type="button"
                  onClick={() => addUsuario(u)}
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-700 hover:text-white transition-colors"
                  title="Agregar"
                >
                  +
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex gap-1.5 mt-1.5">
        <input
          type="text"
          placeholder="Persona externa — nombre"
          value={nombreExt}
          onChange={e => setNombreExt(e.target.value)}
          className="flex-1 text-sm text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
        />
        <input
          type="text"
          placeholder="Institución"
          value={institucionExt}
          onChange={e => setInstitucionExt(e.target.value)}
          className="flex-1 text-sm text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
        />
        <button
          type="button"
          onClick={addExterno}
          disabled={!nombreExt.trim()}
          className="text-sm px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white transition-colors flex-shrink-0"
        >
          + Agregar
        </button>
      </div>
    </div>
  )
}

// ── Editor de compromisos en borrador — solo para el form de ALTA de una
// reunión ("mientras está ocurriendo"). Los compromisos de una reunión ya
// guardada se agregan aparte, desde su card en la lista (más abajo) — así
// "durante" y "después" quedan cubiertos con el mismo molde de datos.
// A nivel de módulo por la misma razón que AsistentesEditor.
function CompromisosDraftEditor({
  value, onChange,
}: {
  value: CompromisoDraft[]
  onChange: (v: CompromisoDraft[]) => void
}) {
  const [desc, setDesc] = useState('')
  const [resp, setResp] = useState('')
  const [inst, setInst] = useState('')
  const [plazo, setPlazo] = useState('')

  function add() {
    if (!desc.trim()) return
    onChange([...value, { descripcion: desc.trim(), responsable_nombre: resp.trim(), responsable_institucion: inst.trim(), plazo }])
    setDesc(''); setResp(''); setInst(''); setPlazo('')
  }
  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)) }

  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">Compromisos tomados en la reunión</label>
      {value.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {value.map((c, i) => (
            <div key={i} className="flex items-start gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
              <div className="flex-1 min-w-0 text-xs text-gray-700">
                <p>{c.descripcion}</p>
                {(c.responsable_nombre || c.responsable_institucion || c.plazo) && (
                  <p className="text-gray-400 mt-0.5">
                    {[c.responsable_nombre, c.responsable_institucion].filter(Boolean).join(' · ')}
                    {c.plazo ? `${c.responsable_nombre || c.responsable_institucion ? ' · ' : ''}plazo ${c.plazo}` : ''}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 px-0.5">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        <input type="text" placeholder="Descripción del compromiso" value={desc} onChange={e => setDesc(e.target.value)} className={inputCls} />
        <div className="grid grid-cols-2 gap-1.5">
          <input type="text" placeholder="Responsable" value={resp} onChange={e => setResp(e.target.value)} className={inputCls} />
          <input type="text" placeholder="Institución" value={inst} onChange={e => setInst(e.target.value)} className={inputCls} />
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={plazo} onChange={e => setPlazo(e.target.value)} className={`${selectCls} flex-shrink-0`} />
          <div className="flex-1" />
          <button
            type="button" onClick={add} disabled={!desc.trim()}
            className="text-sm px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
          >
            + Agregar
          </button>
        </div>
      </div>
    </div>
  )
}

function TipoChips({ value, onChange }: { value: TipoKey; onChange: (t: TipoKey) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {(Object.entries(TIPO_CONFIG) as [TipoKey, typeof TIPO_CONFIG[TipoKey]][]).map(([key, cfg]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
            value === key ? cfg.color : 'bg-white text-gray-400 border border-gray-200'
          }`}
        >
          {cfg.label}
        </button>
      ))}
    </div>
  )
}

// Campos propios de cada tipo — compartido entre el form de alta y el de
// edición. `mostrarCompromisos` solo se prende en el form de alta: en
// edición, los compromisos de la reunión se gestionan aparte (card de la
// lista), no re-editando el array completo acá.
function CamposPorTipo({
  tipo, desc, setDesc,
  nombre, setNombre, hora, setHora, lugar, setLugar,
  asistentes, setAsistentes,
  usuarios, mostrarCompromisos, compromisosDraft, setCompromisosDraft,
}: {
  tipo: TipoKey
  desc: string; setDesc: (v: string) => void
  nombre: string; setNombre: (v: string) => void
  hora: string; setHora: (v: string) => void
  lugar: string; setLugar: (v: string) => void
  asistentes: SeguimientoAsistente[]; setAsistentes: (v: SeguimientoAsistente[]) => void
  usuarios: Usuario[]
  mostrarCompromisos?: boolean
  compromisosDraft?: CompromisoDraft[]
  setCompromisosDraft?: (v: CompromisoDraft[]) => void
}) {
  if (tipo === 'hito') {
    return (
      <>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Nombre del hito</label>
          <input type="text" placeholder="Nombre del hito" value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Descripción</label>
          <textarea
            placeholder="¿En qué consiste, quiénes asisten, entre otros?"
            value={desc} onChange={e => setDesc(e.target.value)} rows={2}
            className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
          />
        </div>
        <AsistentesEditor value={asistentes} onChange={setAsistentes} usuarios={usuarios} />
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Hora <span className="text-gray-300">(opcional)</span></label>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} className={`${selectCls} w-full`} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Lugar <span className="text-gray-300">(opcional)</span></label>
            <input type="text" value={lugar} onChange={e => setLugar(e.target.value)} className={inputCls} />
          </div>
        </div>
      </>
    )
  }
  if (tipo === 'reunion') {
    return (
      <>
        <AsistentesEditor value={asistentes} onChange={setAsistentes} usuarios={usuarios} />
        <div>
          <label className="text-xs text-gray-500 block mb-1">Temas tratados y notas</label>
          <textarea
            placeholder="Temas tratados y notas de la reunión..."
            value={desc} onChange={e => setDesc(e.target.value)} rows={3}
            className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
          />
        </div>
        {mostrarCompromisos && compromisosDraft && setCompromisosDraft ? (
          <CompromisosDraftEditor value={compromisosDraft} onChange={setCompromisosDraft} />
        ) : (
          <p className="text-xs text-gray-400">Los compromisos se gestionan desde la tarjeta de la reunión, abajo en la lista.</p>
        )}
      </>
    )
  }
  // avance — el estado (y si mueve el semáforo) se elige arriba, junto a
  // la fecha, no acá.
  return (
    <textarea
      placeholder="Describe el avance..."
      value={desc} onChange={e => setDesc(e.target.value)} rows={3}
      className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
    />
  )
}

type Props = {
  prioridadId: number
  nombreIniciativa: string
  regionCod: string
  seguimientos: Seguimiento[]
  compromisos: SeguimientoCompromiso[]
  usuarios: Usuario[]
  onRefresh: () => Promise<void>
  // Notifica al padre (ProjectTrackerModal) que un "avance" recién guardó un
  // estado — el padre decide si eso mueve el semáforo de la iniciativa.
  onAvanceEstadoChange?: (estado: string) => void
  canCreate?: boolean
  canDeleteAny?: boolean
  currentUserEmail?: string
  prioridadIdEstable?: number
}

export default function SeguimientoTab({
  prioridadId,
  nombreIniciativa,
  regionCod,
  seguimientos,
  compromisos,
  usuarios,
  onRefresh,
  onAvanceEstadoChange,
  canCreate = true,
  canDeleteAny = true,
  currentUserEmail = '',
  prioridadIdEstable,
}: Props) {
  const canEditOperational = useCanEditOperational()
  const { config: regionConfig } = useRegionConfig(regionCod)
  // Alcance v1: derivar solo existe hacia Gabinete Regional, y solo si el
  // usuario tiene permiso operativo (mismo gate que semáforo/%avance —
  // gabinete_temas RLS excluye a viewer, igual que editar_operativo).
  const puedeDerivar = canEditOperational && !!regionConfig?.gabinete_habilitado

  const today = () => new Date().toISOString().split('T')[0]

  const [showForm, setShowForm]   = useState(false)
  const [formTipo, setFormTipo]   = useState<TipoKey>('avance')
  const [formFecha, setFormFecha] = useState(today)
  const [formDesc, setFormDesc]     = useState('')
  const [formEstado, setFormEstado] = useState('')
  const [formNombre, setFormNombre] = useState('')
  const [formHora, setFormHora]     = useState('')
  const [formLugar, setFormLugar]   = useState('')
  const [formAsistentes, setFormAsistentes] = useState<SeguimientoAsistente[]>([])
  const [formCompromisosDraft, setFormCompromisosDraft] = useState<CompromisoDraft[]>([])
  const [saving, setSaving]       = useState(false)

  const [editingId, setEditingId]   = useState<number | null>(null)
  const [editTipo, setEditTipo]     = useState<TipoKey>('avance')
  const [editFecha, setEditFecha]   = useState('')
  const [editDesc, setEditDesc]     = useState('')
  const [editEstado, setEditEstado] = useState('')
  const [editNombre, setEditNombre] = useState('')
  const [editHora, setEditHora]     = useState('')
  const [editLugar, setEditLugar]   = useState('')
  const [editAsistentes, setEditAsistentes] = useState<SeguimientoAsistente[]>([])
  const [editSaving, setEditSaving] = useState(false)

  const [derivandoId, setDerivandoId] = useState<number | null>(null)
  const [showAddCompFor, setShowAddCompFor] = useState<number | null>(null)
  const [compDraftBySeg, setCompDraftBySeg] = useState<Record<number, typeof emptyCompDraft>>({})
  const [compSavingId, setCompSavingId] = useState<number | null>(null)

  // "Mío vs ajeno": el seguimiento es mío si su autor coincide con mi email.
  const isOwn = (s: Seguimiento) => !!currentUserEmail && s.autor === currentUserEmail
  const canManage = (s: Seguimiento) => canDeleteAny || isOwn(s)

  function resetForm() {
    setFormTipo('avance'); setFormFecha(today())
    setFormDesc(''); setFormEstado('')
    setFormNombre(''); setFormHora(''); setFormLugar('')
    setFormAsistentes([]); setFormCompromisosDraft([])
    setShowForm(false)
  }

  function puedeGuardarForm(): boolean {
    if (formTipo === 'hito') return !!formNombre.trim()
    return !!formDesc.trim()
  }

  async function handleSave() {
    if (!puedeGuardarForm()) return
    setSaving(true)
    try {
      const rows = await safeWrite(
        getSupabase().from('seguimientos').insert({
          prioridad_id: prioridadId,
          tipo:         formTipo,
          descripcion:  formDesc.trim(),
          autor:        currentUserEmail || null,
          estado:       formTipo === 'avance' ? (formEstado || null) : null,
          fecha:        formFecha,
          nombre:       (formTipo === 'hito' || formTipo === 'reunion') && formNombre.trim() ? formNombre.trim() : null,
          hora:         formTipo === 'hito' && formHora ? formHora : null,
          lugar:        formTipo === 'hito' && formLugar.trim() ? formLugar.trim() : null,
          asistentes:   (formTipo === 'hito' || formTipo === 'reunion') ? formAsistentes : [],
        }),
        `seguimientos insert prioridad=${prioridadId}`,
      )
      // Compromisos cargados "mientras ocurría" la reunión (antes de guardar) —
      // se insertan en bloque una vez que ya existe el id del seguimiento.
      if (formTipo === 'reunion' && formCompromisosDraft.length > 0) {
        const seguimientoId = (rows[0] as { id: number }).id
        await safeWrite(
          getSupabase().from('seguimiento_compromisos').insert(
            formCompromisosDraft.map(c => ({
              seguimiento_id: seguimientoId,
              prioridad_id:   prioridadId,
              descripcion:    c.descripcion,
              responsable_nombre:      c.responsable_nombre || null,
              responsable_institucion: c.responsable_institucion || null,
              plazo:          c.plazo || null,
              autor:          currentUserEmail || null,
            })),
          ),
          `seguimiento_compromisos bulk insert seguimiento=${seguimientoId}`,
        )
      }
      if (formTipo === 'avance' && formEstado) onAvanceEstadoChange?.(formEstado)
      resetForm()
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(s: Seguimiento) {
    setEditingId(s.id)
    setEditTipo(s.tipo)
    setEditFecha(s.fecha ? s.fecha.split('T')[0] : today())
    setEditDesc(s.descripcion)
    setEditEstado(s.estado ?? '')
    setEditNombre(s.nombre ?? '')
    setEditHora(s.hora ? s.hora.slice(0, 5) : '')
    setEditLugar(s.lugar ?? '')
    setEditAsistentes(s.asistentes ?? [])
  }

  function puedeGuardarEdit(): boolean {
    if (editTipo === 'hito') return !!editNombre.trim()
    return !!editDesc.trim()
  }

  async function handleUpdate() {
    if (!puedeGuardarEdit() || editingId === null) return
    setEditSaving(true)
    try {
      // No tocamos `autor` en update — queda quien lo creó originalmente.
      await safeWrite(
        getSupabase().from('seguimientos').update({
          tipo:        editTipo,
          descripcion: editDesc.trim(),
          estado:      editTipo === 'avance' ? (editEstado || null) : null,
          fecha:       editFecha,
          nombre:      (editTipo === 'hito' || editTipo === 'reunion') && editNombre.trim() ? editNombre.trim() : null,
          hora:        editTipo === 'hito' && editHora ? editHora : null,
          lugar:       editTipo === 'hito' && editLugar.trim() ? editLugar.trim() : null,
          asistentes:  (editTipo === 'hito' || editTipo === 'reunion') ? editAsistentes : [],
        }).eq('id', editingId),
        `seguimientos update id=${editingId}`,
      )
      if (editTipo === 'avance' && editEstado) onAvanceEstadoChange?.(editEstado)
      setEditingId(null)
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta actualización?')) return
    try {
      await safeDelete(
        getSupabase().from('seguimientos').delete().eq('id', id),
        `seguimientos delete id=${id}`,
      )
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  function buildTemaTexto(s: Seguimiento): string {
    const tipoLabel = TIPO_CONFIG[s.tipo]?.label ?? s.tipo
    const cuerpo = s.tipo === 'hito' ? (s.nombre || s.descripcion) : s.descripcion
    return `${nombreIniciativa} — ${tipoLabel}: ${cuerpo}`.slice(0, 500)
  }

  async function handleDerivar(s: Seguimiento) {
    if (s.derivado_gabinete_tema_id || derivandoId) return
    if (!confirm('¿Derivar esta actualización a los Temas a tratar de la próxima sesión de Gabinete Regional?')) return
    setDerivandoId(s.id)
    try {
      const { data: pendientes } = await getSupabase()
        .from('gabinete_temas').select('id').eq('region_cod', regionCod).is('sesion_id', null)
      const rows = await safeWrite(
        getSupabase().from('gabinete_temas').insert({
          region_cod: regionCod,
          texto: buildTemaTexto(s),
          orden: pendientes?.length ?? 0,
          created_by_email: currentUserEmail || null,
        }),
        `gabinete_temas insert desde seguimiento=${s.id}`,
      )
      const temaId = (rows[0] as { id: number }).id
      await safeWrite(
        getSupabase().from('seguimientos').update({ derivado_gabinete_tema_id: temaId }).eq('id', s.id),
        `seguimientos derivar_gabinete id=${s.id}`,
      )
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setDerivandoId(null)
    }
  }

  async function handleAddCompromiso(seguimientoId: number) {
    const draft = compDraftBySeg[seguimientoId] ?? emptyCompDraft
    if (!draft.desc.trim()) return
    setCompSavingId(seguimientoId)
    try {
      await safeWrite(
        getSupabase().from('seguimiento_compromisos').insert({
          seguimiento_id: seguimientoId,
          prioridad_id:   prioridadId,
          descripcion:    draft.desc.trim(),
          responsable_nombre:      draft.resp.trim() || null,
          responsable_institucion: draft.inst.trim() || null,
          plazo:          draft.plazo || null,
          autor:          currentUserEmail || null,
        }),
        `seguimiento_compromisos insert seguimiento=${seguimientoId}`,
      )
      setCompDraftBySeg(prev => ({ ...prev, [seguimientoId]: emptyCompDraft }))
      setShowAddCompFor(null)
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setCompSavingId(null)
    }
  }

  async function handleCompromisoEstado(c: SeguimientoCompromiso, estado: string) {
    try {
      await safeWrite(
        getSupabase().from('seguimiento_compromisos').update({ estado }).eq('id', c.id),
        `seguimiento_compromisos estado id=${c.id}`,
      )
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function handleDeleteCompromiso(id: number) {
    if (!confirm('¿Eliminar este compromiso?')) return
    try {
      await safeDelete(
        getSupabase().from('seguimiento_compromisos').delete().eq('id', id),
        `seguimiento_compromisos delete id=${id}`,
      )
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  // Fecha y estado se editan directo desde el encabezado de cada tarjeta
  // (junto a los íconos de acción) sin pasar por el modo edición completo —
  // se guardan solos al cambiar, sin un botón "Guardar" aparte.
  async function handleInlineFecha(id: number, fecha: string) {
    try {
      await safeWrite(
        getSupabase().from('seguimientos').update({ fecha }).eq('id', id),
        `seguimientos update fecha id=${id}`,
      )
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function handleInlineEstado(id: number, estado: string) {
    try {
      await safeWrite(
        getSupabase().from('seguimientos').update({ estado: estado || null }).eq('id', id),
        `seguimientos update estado id=${id}`,
      )
      if (estado) onAvanceEstadoChange?.(estado)
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  return (
    <div className="px-6 py-4">
      {prioridadIdEstable != null && <CompromisosSesionSection prioridadId={prioridadIdEstable} />}
      {canCreate && (
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

      <Modal
        open={showForm}
        onClose={resetForm}
        title="Agregar actualización"
        size="lg"
        dismissable={!saving}
        footer={
          <>
            <button onClick={resetForm} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !puedeGuardarForm()}
              className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <TipoChips value={formTipo} onChange={setFormTipo} />
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {formTipo === 'avance' && (
                <select value={formEstado} onChange={e => setFormEstado(e.target.value)} className={selectCls}>
                  <option value="">Estado (sin cambio)</option>
                  {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              )}
              <input
                type="date" value={formFecha} onChange={e => setFormFecha(e.target.value)}
                className={selectCls}
              />
            </div>
          </div>
          {formTipo === 'avance' && formEstado && (
            <p className="text-xs text-gray-400 -mt-2">El semáforo de la iniciativa se actualizará según este estado.</p>
          )}
          <CamposPorTipo
            tipo={formTipo}
            desc={formDesc} setDesc={setFormDesc}
            nombre={formNombre} setNombre={setFormNombre}
            hora={formHora} setHora={setFormHora}
            lugar={formLugar} setLugar={setFormLugar}
            asistentes={formAsistentes} setAsistentes={setFormAsistentes}
            usuarios={usuarios}
            mostrarCompromisos
            compromisosDraft={formCompromisosDraft}
            setCompromisosDraft={setFormCompromisosDraft}
          />
          {currentUserEmail && (
            <p className="text-xs text-gray-400">
              Se registrará a tu nombre: <span className="font-mono">{currentUserEmail}</span>
            </p>
          )}
        </div>
      </Modal>

      {seguimientos.length === 0 ? (
        <EmptyState
          title="Sin actualizaciones aún"
          description="Las novedades y acuerdos de esta iniciativa quedan registrados acá."
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4l3 3" strokeLinecap="round"/>
            </svg>
          }
        />
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-100" />
          <div className="space-y-5">
            {seguimientos.map(s => {
              const cfg = TIPO_CONFIG[s.tipo] ?? TIPO_CONFIG.avance
              const isEditing = editingId === s.id
              const estadoActivo = isEditing ? editEstado : (s.estado ?? '')
              const estCfg = estadoActivo ? ESTADO_CONFIG[estadoActivo as keyof typeof ESTADO_CONFIG] : null
              const misCompromisos = compromisos.filter(c => c.seguimiento_id === s.id)
              const draft = compDraftBySeg[s.id] ?? emptyCompDraft

              return (
                <div key={s.id} className="flex gap-4 pl-1 group">
                  <div className={`w-3.5 h-3.5 rounded-full mt-1 flex-shrink-0 ${cfg.dot} ring-2 ring-white`} />
                  <div className="flex-1 min-w-0">
                    {/* Encabezado — fecha y estado se editan directo acá, sin
                        entrar a modo edición, junto a los íconos de acción. */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                      {(isEditing ? editTipo : s.tipo) === 'avance' && (
                        <select
                          value={estadoActivo}
                          onChange={e => isEditing ? setEditEstado(e.target.value) : handleInlineEstado(s.id, e.target.value)}
                          className={`text-xs rounded-full pl-1.5 pr-1 py-0.5 border-0 ${estCfg ? estCfg.color : 'bg-gray-100 text-gray-500'}`}
                        >
                          <option value="">Estado (sin cambio)</option>
                          {Object.entries(ESTADO_CONFIG).map(([key, cfg2]) => (
                            <option key={key} value={key}>{cfg2.label}</option>
                          ))}
                        </select>
                      )}
                      {s.derivado_gabinete_tema_id && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">Derivado a Gabinete</span>
                      )}
                      <input
                        type="date"
                        value={isEditing ? editFecha : (s.fecha ?? '')}
                        onChange={e => isEditing ? setEditFecha(e.target.value) : handleInlineFecha(s.id, e.target.value)}
                        className="text-xs text-gray-500 ml-auto border-0 bg-transparent hover:bg-gray-100 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-300"
                      />
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {puedeDerivar && (
                          <button
                            onClick={() => handleDerivar(s)}
                            disabled={!!s.derivado_gabinete_tema_id || derivandoId === s.id}
                            className="p-1 text-gray-400 hover:text-violet-700 rounded hover:bg-violet-50 transition-colors disabled:opacity-40 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                            title={s.derivado_gabinete_tema_id ? 'Ya derivado a Gabinete Regional' : 'Derivar a Gabinete Regional (temas a tratar)'}
                          >
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 3l10 5-10 5V9.5L9 8 3 6.5V3z"/>
                            </svg>
                          </button>
                        )}
                        {canManage(s) && (
                          <>
                            <button
                              onClick={() => isEditing ? setEditingId(null) : startEdit(s)}
                              className="p-1 text-gray-400 hover:text-slate-700 rounded hover:bg-gray-100 transition-colors"
                              title={isEditing ? 'Cerrar edición' : (isOwn(s) ? 'Editar' : 'Editar (eres admin/editor)')}
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" strokeLinejoin="round"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(s.id)}
                              className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                              title={isOwn(s) ? 'Eliminar' : 'Eliminar (eres admin/editor)'}
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M2 3.5h8M4.5 3.5V2h3v1.5M4 3.5l.5 7h3l.5-7"/>
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="bg-gray-50 rounded-xl p-3 space-y-2.5">
                        <TipoChips value={editTipo} onChange={setEditTipo} />
                        <CamposPorTipo
                          tipo={editTipo}
                          desc={editDesc} setDesc={setEditDesc}
                          nombre={editNombre} setNombre={setEditNombre}
                          hora={editHora} setHora={setEditHora}
                          lugar={editLugar} setLugar={setEditLugar}
                          asistentes={editAsistentes} setAsistentes={setEditAsistentes}
                          usuarios={usuarios}
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingId(null)} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
                            Cancelar
                          </button>
                          <button
                            onClick={handleUpdate}
                            disabled={editSaving || !puedeGuardarEdit()}
                            className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
                          >
                            {editSaving ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {s.tipo === 'hito' && s.nombre && (
                          <p className="text-sm font-medium text-gray-800 mb-0.5">{s.nombre}</p>
                        )}
                        {s.tipo === 'reunion' && s.nombre && (
                          <p className="text-sm font-medium text-gray-800 mb-0.5">{s.nombre}</p>
                        )}
                        {s.tipo === 'reunion' && (s.asistentes?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {s.asistentes.map((a, i) => (
                              <span key={i} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                                {a.nombre}{a.institucion ? ` — ${a.institucion}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-sm text-gray-700 leading-snug">{s.descripcion}</p>

                        {s.tipo === 'hito' && (s.hora || s.lugar) && (
                          <p className="text-xs text-gray-500 mt-1">
                            {fmtHora(s.hora) && <span>🕐 {fmtHora(s.hora)}</span>}
                            {fmtHora(s.hora) && s.lugar ? ' · ' : ''}
                            {s.lugar && <span>📍 {s.lugar}</span>}
                          </p>
                        )}
                        {s.tipo === 'hito' && s.asistentes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {s.asistentes.map((a, i) => (
                              <span key={i} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                                {a.nombre}{a.institucion ? ` — ${a.institucion}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        {s.tipo === 'reunion' && s.notas && (
                          <p className="text-xs text-gray-500 mt-1.5">
                            <span className="font-medium text-gray-600">Notas: </span>{s.notas}
                          </p>
                        )}

                        {s.tipo === 'reunion' && (
                          <div className="mt-2.5 pl-3 border-l-2 border-gray-100 space-y-1.5">
                            <p className="text-xs font-medium text-gray-500">Compromisos</p>
                            {misCompromisos.length === 0 && showAddCompFor !== s.id && (
                              <p className="text-xs text-gray-300">Sin compromisos registrados.</p>
                            )}
                            {misCompromisos.map(c => (
                              <div key={c.id} className="flex items-start gap-2 group/comp">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-gray-700">{c.descripcion}</p>
                                  <p className="text-xs text-gray-400">
                                    {c.responsable_nombre || c.responsable_institucion
                                      ? `${c.responsable_nombre ?? ''}${c.responsable_nombre && c.responsable_institucion ? ' · ' : ''}${c.responsable_institucion ?? ''}`
                                      : 'Sin responsable'}
                                    {c.plazo ? ` · plazo ${fmtFechaActividad(c.plazo)}` : ''}
                                  </p>
                                </div>
                                <select
                                  value={c.estado}
                                  onChange={e => handleCompromisoEstado(c, e.target.value)}
                                  className={`text-xs rounded-full px-1.5 py-0.5 border-0 ${COMPROMISO_ESTADO_CONFIG[c.estado].color}`}
                                >
                                  {Object.entries(COMPROMISO_ESTADO_CONFIG).map(([key, cc]) => (
                                    <option key={key} value={key}>{cc.label}</option>
                                  ))}
                                </select>
                                {canManage(s) && (
                                  <button
                                    onClick={() => handleDeleteCompromiso(c.id)}
                                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover/comp:opacity-100 transition-opacity px-0.5"
                                    title="Eliminar compromiso"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                            {canCreate && (
                              showAddCompFor === s.id ? (
                                <div className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1.5 mt-1.5">
                                  <input
                                    type="text" placeholder="Descripción del compromiso"
                                    value={draft.desc}
                                    onChange={e => setCompDraftBySeg(prev => ({ ...prev, [s.id]: { ...draft, desc: e.target.value } }))}
                                    className={inputCls}
                                  />
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <input
                                      type="text" placeholder="Responsable"
                                      value={draft.resp}
                                      onChange={e => setCompDraftBySeg(prev => ({ ...prev, [s.id]: { ...draft, resp: e.target.value } }))}
                                      className={inputCls}
                                    />
                                    <input
                                      type="text" placeholder="Institución"
                                      value={draft.inst}
                                      onChange={e => setCompDraftBySeg(prev => ({ ...prev, [s.id]: { ...draft, inst: e.target.value } }))}
                                      className={inputCls}
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="date" value={draft.plazo}
                                      onChange={e => setCompDraftBySeg(prev => ({ ...prev, [s.id]: { ...draft, plazo: e.target.value } }))}
                                      className={`${selectCls} flex-shrink-0`}
                                    />
                                    <div className="flex-1" />
                                    <button onClick={() => setShowAddCompFor(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">
                                      Cancelar
                                    </button>
                                    <button
                                      onClick={() => handleAddCompromiso(s.id)}
                                      disabled={compSavingId === s.id || !draft.desc.trim()}
                                      className="text-xs bg-slate-900 text-white px-3 py-1 rounded-lg hover:bg-slate-700 disabled:opacity-50"
                                    >
                                      {compSavingId === s.id ? 'Guardando...' : 'Agregar'}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setShowAddCompFor(s.id)}
                                  className="text-xs text-slate-500 hover:text-slate-800 mt-1"
                                >
                                  + Agregar compromiso
                                </button>
                              )
                            )}
                          </div>
                        )}

                        {s.autor && <p className="text-xs text-gray-500 mt-1.5">{s.autor}</p>}
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
  )
}
