'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Iniciativa } from '@/lib/projects'
import type {
  DesalojoCapa,
  DesalojoChecklistEstado,
  DesalojoDetalle,
  DesalojoDimension,
  DesalojoDocumento,
  DesalojoFaseConSemaforo,
  DesalojoFaseEstado,
  DesalojoResponsable,
  DesalojoSeguimiento,
  DesalojoSeguimientoTipo,
  SemaforoDimension,
} from '@/lib/types'
import DesalojoAvanceTab from './DesalojoAvanceTab'
import DesalojoBadge from './DesalojoBadge'
import DesalojoCalendarioDrawer from './DesalojoCalendarioDrawer'
import DesalojoContextoTab from './DesalojoContextoTab'
import DesalojoResponsablesTab from './DesalojoResponsablesTab'

/**
 * Ficha del caso de desalojo seleccionado. v2: dos tabs (Contexto / Seguimiento)
 * y todas las mutaciones suben/bajan por callbacks contra las APIs.
 *
 * Estado: detalle, capas, seguimientos, documentos — todos vienen del
 * endpoint GET /api/desalojos/[n] en un solo round-trip.
 *
 * Mutaciones (optimistic + rollback en error):
 *   - PATCH detalle (resumen_narrativo) → /api/desalojos/[n]
 *   - PATCH capa (todo lo demás)         → /api/desalojos/[n]/capas/[capa_id]
 *   - POST capa                          → /api/desalojos/[n]/capas
 *   - DELETE capa (soft)                 → /api/desalojos/[n]/capas/[capa_id]
 *   - POST seguimiento (por capa+dim)    → /api/desalojos/[n]/seguimientos
 *   - POST documento (multipart)         → /api/desalojos/[n]/documentos
 *   - DELETE documento                   → /api/desalojos/[n]/documentos/[doc_id]
 *
 * Botón "Generar minuta" queda disabled con tooltip — reaprovecha
 * /api/minuta en otra sesión.
 */

type Props = {
  iniciativa: Iniciativa
}

type Tab = 'contexto' | 'avance' | 'responsables'

export default function DesalojoCaseView({ iniciativa }: Props) {
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [tab, setTab]                   = useState<Tab>('contexto')
  const [detalle, setDetalle]           = useState<DesalojoDetalle | null>(null)
  const [capas, setCapas]               = useState<DesalojoCapa[]>([])
  const [fasesEstado, setFasesEstado]   = useState<DesalojoFaseEstado[]>([])
  const [seguimientos, setSeguimientos] = useState<DesalojoSeguimiento[]>([])
  const [documentos, setDocumentos]     = useState<DesalojoDocumento[]>([])
  const [selectedCapaId, setSelectedCapaId] = useState<number | null>(null)
  const [calOpen, setCalOpen]               = useState(false)

  const loadCase = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? `Error HTTP ${res.status}`)
      } else {
        setDetalle(json.detalle ?? null)
        setCapas(json.capas ?? [])
        setFasesEstado(json.fases_estado ?? [])
        setSeguimientos(json.seguimientos ?? [])
        setDocumentos(json.documentos ?? [])
      }
    } catch (err) {
      setError(`Error de red: ${String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [iniciativa.n])

  useEffect(() => { loadCase() }, [loadCase])

  // ── Mutaciones detalle ──────────────────────────────────────────────────

  async function handlePatchResumen(resumen: string | null) {
    if (!detalle) return
    const prev = detalle
    setDetalle({ ...detalle, resumen_narrativo: resumen })
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ resumen_narrativo: resumen }),
      })
      const json = await res.json()
      if (!res.ok) {
        setDetalle(prev)
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
      if (json.detalle) setDetalle(json.detalle)
    } catch (err) {
      setDetalle(prev)
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  // ── Mutaciones capa ─────────────────────────────────────────────────────

  async function handlePatchCapa(capaId: number, patch: Partial<DesalojoCapa>) {
    const prev = capas
    setCapas(prev.map(c => c.id === capaId ? { ...c, ...patch } : c))
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/capas/${capaId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) {
        setCapas(prev)
        const reasons = (json?.reasons as string[] | undefined)?.join(' · ')
        const msg = reasons
          ? `${json.error}\n• ${reasons}`
          : (json?.error ?? `Error HTTP ${res.status}`)
        window.alert(msg)
        return
      }
      if (json.capa) {
        setCapas(c => c.map(x => x.id === capaId ? json.capa : x))
      }
    } catch (err) {
      setCapas(prev)
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  async function handlePatchFase(
    capaId: number,
    fase:   DesalojoFaseConSemaforo,
    patch:  { semaforo?: SemaforoDimension; notas?: string | null; checklist_patch?: DesalojoChecklistEstado },
  ) {
    // Optimistic: aplicar el patch al estado local correspondiente.
    const prev = fasesEstado
    setFasesEstado(prev.map(e => {
      if (e.capa_id !== capaId || e.fase !== fase) return e
      const next = { ...e }
      if (patch.semaforo !== undefined) next.semaforo = patch.semaforo
      if (patch.notas    !== undefined) next.notas    = patch.notas
      if (patch.checklist_patch) {
        next.checklist_estado = { ...(e.checklist_estado ?? {}), ...patch.checklist_patch }
      }
      return next
    }))
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/capas/${capaId}/fases/${fase}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) {
        setFasesEstado(prev)
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
      if (json.estado) {
        setFasesEstado(curr => curr.map(e =>
          e.capa_id === capaId && e.fase === fase ? json.estado : e
        ))
      }
    } catch (err) {
      setFasesEstado(prev)
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  async function handleCrearCapa(nombre: string) {
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/capas`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nombre }),
      })
      const json = await res.json()
      if (!res.ok) {
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
      if (json.capa) {
        setCapas(prev => [...prev, json.capa])
        setSelectedCapaId(json.capa.id)
        // Cargar las nuevas filas de fase (el server las creó en el POST de capa).
        // En vez de re-fetch, sintetizamos optimísticamente las 6 filas en gris.
        const fases: DesalojoFaseConSemaforo[] = ['pr', 'f1', 'f2', 'f3', 'f4', 'f5']
        const nuevasFases: DesalojoFaseEstado[] = fases.map(f => ({
          id: 0,  // placeholder; se reemplaza al primer fetch
          prioridad_id:     iniciativa.n,
          capa_id:          json.capa.id,
          fase:             f,
          semaforo:         'gris',
          checklist_estado: {},
          notas:            null,
          completed_at:     null,
          completed_by:     null,
          updated_at:       new Date().toISOString(),
        }))
        setFasesEstado(prev => [...prev, ...nuevasFases])
      }
    } catch (err) {
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  async function handleRenombrarCapa(capaId: number, nombre: string) {
    await handlePatchCapa(capaId, { nombre })
  }

  // ── Responsables ────────────────────────────────────────────────────────
  // Optimistic: merge local del rol en la capa, rollback si el server rechaza.
  async function handlePatchResponsable(
    capaId: number,
    rolKey: string,
    value:  DesalojoResponsable | null,
  ) {
    const prev = capas
    setCapas(prev.map(c => {
      if (c.id !== capaId) return c
      const responsables = { ...(c.responsables ?? {}) }
      if (value === null) delete responsables[rolKey]
      else                responsables[rolKey] = value
      return { ...c, responsables }
    }))
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/capas/${capaId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ responsables_patch: { [rolKey]: value } }),
      })
      const json = await res.json()
      if (!res.ok) {
        setCapas(prev)
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
      if (json.capa) {
        setCapas(c => c.map(x => x.id === capaId ? json.capa : x))
      }
    } catch (err) {
      setCapas(prev)
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  async function handleArchivarCapa(capaId: number) {
    const prev = capas
    setCapas(prev.map(c => c.id === capaId ? { ...c, activa: false } : c))
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/capas/${capaId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setCapas(prev)
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
      }
    } catch (err) {
      setCapas(prev)
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  // ── Seguimientos ────────────────────────────────────────────────────────

  async function handleAddSeguimiento(
    capaId:      number,
    dimension:   DesalojoDimension,
    tipo:        DesalojoSeguimientoTipo,
    descripcion: string,
  ) {
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/seguimientos`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ capa_id: capaId, dimension, tipo, descripcion }),
      })
      const json = await res.json()
      if (!res.ok) {
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
      if (json.seguimiento) {
        setSeguimientos(prev => [json.seguimiento, ...prev])
      }
    } catch (err) {
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  // ── Documentos ──────────────────────────────────────────────────────────

  async function handleUploadDoc(
    capaId:    number | null,
    dimension: DesalojoDimension | null,
    file:      File,
  ) {
    const form = new FormData()
    form.set('file', file)
    if (capaId    !== null) form.set('capa_id',  String(capaId))
    if (dimension !== null) form.set('dimension', dimension)
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/documentos`, {
        method: 'POST',
        body:   form,
      })
      const json = await res.json()
      if (!res.ok) {
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
      if (json.documento) {
        setDocumentos(prev => [json.documento, ...prev])
      }
    } catch (err) {
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  /** Sube un doc vinculado a un item específico del checklist de una fase. */
  async function handleUploadDocItem(
    capaId:  number,
    fase:    DesalojoFaseConSemaforo,
    itemKey: string,
    file:    File,
  ) {
    const form = new FormData()
    form.set('file', file)
    form.set('capa_id',  String(capaId))
    form.set('fase',     fase)
    form.set('item_key', itemKey)
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/documentos`, {
        method: 'POST',
        body:   form,
      })
      const json = await res.json()
      if (!res.ok) {
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
      if (json.documento) {
        setDocumentos(prev => [json.documento, ...prev])
      }
    } catch (err) {
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  async function handleDeleteDoc(docId: number) {
    if (!window.confirm('¿Eliminar este documento?')) return
    const prev = documentos
    setDocumentos(prev.filter(d => d.id !== docId))
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/documentos/${docId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setDocumentos(prev)
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
      }
    } catch (err) {
      setDocumentos(prev)
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Cargando caso…
      </div>
    )
  }
  if (error) {
    return (
      <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
        {error}
      </div>
    )
  }
  if (!detalle) {
    return (
      <div className="m-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        Este caso no tiene seguimiento inicializado. Vuelve a marcar la iniciativa como desalojo para crearlo.
      </div>
    )
  }

  const segCount  = seguimientos.length
  const docsCount = documentos.length

  // Conteo de hitos para el badge del botón flotante.
  const totalHitos = capas.reduce((acc, c) => {
    if (!c.activa) return acc
    let n = 0
    if (c.fecha_instrumento) n++
    if (c.fecha_tentativa_operativo) n++
    for (const e of fasesEstado) {
      if (e.capa_id !== c.id) continue
      for (const key of Object.keys(e.checklist_estado ?? {})) {
        if (e.checklist_estado?.[key]?.fecha) n++
      }
    }
    return acc + n
  }, 0)

  return (
    // Scroll INDEPENDIENTE: el outer NO scrollea. La columna de contenido y
    // la del calendario son cada una su propio overflow-y-auto. Así el usuario
    // puede tener el calendario fijo en febrero mientras hace deep-dive en el
    // contenido (o viceversa).
    <div className="h-full overflow-hidden">
      {/* Contenedor centrado.
          - Cerrado: max-w-5xl (1024px) mx-auto.
          - Abierto: max-w-[1500px] flex → contenido + calendario adyacentes,
            el bloque entero sigue mx-auto centrado. */}
      <div className={`mx-auto h-full ${calOpen ? 'max-w-[1500px] flex gap-6' : 'max-w-5xl'}`}>
        <div className="flex-1 min-w-0 max-w-5xl h-full overflow-y-auto">
        <div className="px-6 py-6 space-y-4">

        {/* Header del caso */}
        <header className="space-y-2">
          <div className="flex items-start gap-2 flex-wrap">
            <DesalojoBadge size="md" />
            <h1 className="text-xl font-bold text-gray-900 flex-1 min-w-0">{iniciativa.nombre}</h1>
            <button
              type="button"
              disabled
              title="Próximamente"
              className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-400 cursor-not-allowed font-medium"
            >
              Generar minuta
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            <span>{iniciativa.region}</span>
            {iniciativa.comuna && <><span>·</span><span>{iniciativa.comuna.replace(/;/g, ', ')}</span></>}
            {iniciativa.ministerio && <><span>·</span><span>{iniciativa.ministerio.replace(/;/g, ' · ')}</span></>}
            {iniciativa.responsable && <><span>·</span><span>{iniciativa.responsable}</span></>}
          </div>
        </header>

        {/* Tabs */}
        <div className="flex items-center border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTab('contexto')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === 'contexto' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Contexto{docsCount > 0 && <span className="ml-1 text-gray-400 font-normal">({docsCount})</span>}
          </button>
          <button
            type="button"
            onClick={() => setTab('avance')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === 'avance' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Avance{segCount > 0 && <span className="ml-1 text-gray-400 font-normal">({segCount})</span>}
          </button>
          <button
            type="button"
            onClick={() => setTab('responsables')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === 'responsables' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Responsables
          </button>

          {/* Trigger del calendario — pestaña derecha. Visualmente distinta de
              las tabs de contenido: no cambia el contenido del pane, abre el
              panel lateral del calendario. */}
          <button
            type="button"
            onClick={() => setCalOpen(o => !o)}
            className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              calOpen
                ? 'bg-slate-900 text-white hover:bg-slate-700'
                : 'text-gray-600 hover:text-slate-900 hover:bg-gray-100'
            }`}
            title={calOpen ? 'Cerrar calendario' : 'Abrir calendario de hitos'}
            aria-label={calOpen ? 'Cerrar calendario' : 'Abrir calendario de hitos'}
            aria-pressed={calOpen}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="12" height="11" rx="1.5"/>
              <path d="M2 6h12M5.5 1.5v3M10.5 1.5v3"/>
            </svg>
            <span>Hitos</span>
            {totalHitos > 0 && !calOpen && (
              <span className="ml-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center">
                {totalHitos > 9 ? '9+' : totalHitos}
              </span>
            )}
          </button>
        </div>

        {/* Cuerpo del tab activo */}
        {tab === 'contexto' && (
          <DesalojoContextoTab
            detalle={detalle}
            capas={capas}
            fasesEstado={fasesEstado}
            documentos={documentos}
            onPatchResumen={handlePatchResumen}
            onSelectCapa={(capaId) => { setSelectedCapaId(capaId); setTab('avance') }}
            onCrearCapa={handleCrearCapa}
            onRenombrarCapa={handleRenombrarCapa}
            onArchivarCapa={handleArchivarCapa}
            onUploadDoc={async (file) => { await handleUploadDoc(null, null, file) }}
            onDeleteDoc={handleDeleteDoc}
          />
        )}
        {tab === 'avance' && (
          <DesalojoAvanceTab
            capas={capas}
            fasesEstado={fasesEstado}
            seguimientos={seguimientos}
            documentos={documentos}
            selectedCapaId={selectedCapaId}
            onSelectCapa={setSelectedCapaId}
            onPatchCapa={handlePatchCapa}
            onPatchFase={handlePatchFase}
            onAddSeguimiento={handleAddSeguimiento}
            onUploadDoc={handleUploadDoc}
            onUploadDocItem={handleUploadDocItem}
            onDeleteDoc={handleDeleteDoc}
          />
        )}
        {tab === 'responsables' && (
          <DesalojoResponsablesTab
            capas={capas}
            selectedCapaId={selectedCapaId}
            onSelectCapa={setSelectedCapaId}
            onPatchResponsable={handlePatchResponsable}
          />
        )}
        </div>
        </div>

        {/* Calendario — sibling adyacente al contenido, con su propio
            overflow-y-auto: scrollea independiente del contenido principal. */}
        <DesalojoCalendarioDrawer
          open={calOpen}
          onClose={() => setCalOpen(false)}
          capas={capas}
          fasesEstado={fasesEstado}
        />
      </div>
    </div>
  )
}
