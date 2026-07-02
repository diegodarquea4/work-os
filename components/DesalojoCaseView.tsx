'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { Iniciativa } from '@/lib/projects'
import type {
  DesalojoCapa,
  DesalojoChecklistEstado,
  DesalojoDetalle,
  DesalojoDimension,
  DesalojoDocumento,
  DesalojoFaseConSemaforo,
  DesalojoFaseEstado,
  DesalojoPlanificacion,
  DesalojoPoligono,
  DesalojoResponsable,
  DesalojoSeguimiento,
  DesalojoSeguimientoTipo,
  SemaforoDimension,
} from '@/lib/types'
import DesalojoAvanceTab from './DesalojoAvanceTab'
import DesalojoBadge from './DesalojoBadge'
import DesalojoCalendarioDrawer from './DesalojoCalendarioDrawer'
import DesalojoContextoTab from './DesalojoContextoTab'
import DesalojoPlanificacionTab from './DesalojoPlanificacionTab'
import DesalojoResponsablesTab from './DesalojoResponsablesTab'

// Leaflet no soporta SSR (requiere `window`). Cargamos el drawer del mapa
// solo cliente + lazy: no infla el bundle hasta que el usuario clickea "Mapa".
const DesalojoMapaDrawer = dynamic(() => import('./DesalojoMapaDrawer'), { ssr: false })

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

type Tab = 'contexto' | 'avance' | 'planificacion' | 'responsables'

export default function DesalojoCaseView({ iniciativa }: Props) {
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [tab, setTab]                   = useState<Tab>('contexto')
  const [detalle, setDetalle]           = useState<DesalojoDetalle | null>(null)
  const [capas, setCapas]               = useState<DesalojoCapa[]>([])
  const [fasesEstado, setFasesEstado]   = useState<DesalojoFaseEstado[]>([])
  const [seguimientos, setSeguimientos] = useState<DesalojoSeguimiento[]>([])
  const [documentos, setDocumentos]     = useState<DesalojoDocumento[]>([])
  const [planificacion, setPlanificacion] = useState<DesalojoPlanificacion[]>([])
  const [poligonos, setPoligonos]         = useState<DesalojoPoligono[]>([])
  const [selectedCapaId, setSelectedCapaId] = useState<number | null>(null)
  const [calOpen,  setCalOpen]              = useState(false)
  const [mapaOpen, setMapaOpen]             = useState(false)

  // En la tab Planificación el drawer del calendario no tiene sentido (el
  // Gantt ya ocupa el lado derecho). Lo cerramos al entrar; el user lo
  // re-abre manualmente al volver a otra tab si quiere. El Mapa aplica igual
  // lógica por consistencia visual (no queremos aside coexistiendo con Gantt).
  useEffect(() => {
    if (tab === 'planificacion') {
      if (calOpen)  setCalOpen(false)
      if (mapaOpen) setMapaOpen(false)
    }
  }, [tab, calOpen, mapaOpen])

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
        setPlanificacion(json.planificacion ?? [])
        setPoligonos(json.poligonos ?? [])
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

  async function handlePatchCapa(
    capaId: number,
    patch:  Partial<DesalojoCapa> & { justificacion_avance?: string },
  ) {
    const prev = capas
    // El optimistic update aplica solo los campos de la tabla, no metadatos
    // del PATCH como `justificacion_avance`.
    const { justificacion_avance: _justOpt, ...optimisticPatch } = patch
    void _justOpt
    setCapas(prev.map(c => c.id === capaId ? { ...c, ...optimisticPatch } : c))
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/capas/${capaId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) {
        setCapas(prev)
        // Si el server pide justificación (soft-override), el modal del stepper
        // ya está en pantalla pidiéndola — no se vuelve a llamar al PATCH sin
        // justificación. Llegar acá implica desincronía cliente/server.
        if (json?.requires_justification) {
          const reasons = (json?.reasons as string[] | undefined)?.join('\n• ') ?? ''
          window.alert(
            `El servidor pide justificación para avanzar:\n• ${reasons}\n\nRecarga la página para reintentar.`,
          )
          return
        }
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
    setCapas(prev.filter(c => c.id !== capaId))
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

  // Upload direct-to-Storage: pide signed URL, sube file directo al bucket,
  // luego registra metadata en el server. Esto evita el límite de 4.5MB del
  // body de las API routes en Vercel.
  async function uploadDirectAndRegister(
    file:    File,
    extras: {
      capa_id?:   number | null
      dimension?: DesalojoDimension | null
      fase?:      DesalojoFaseConSemaforo | null
      item_key?:  string | null
    },
  ) {
    // 1. Pedir signed upload URL al server.
    const urlRes = await fetch(`/api/desalojos/${iniciativa.n}/documentos/upload-url`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        filename: file.name,
        capa_id:  extras.capa_id ?? null,
        fase:     extras.fase    ?? null,
      }),
    })
    const urlJson = await urlRes.json().catch(() => ({}))
    if (!urlRes.ok) {
      window.alert(urlJson?.error ?? `Error HTTP ${urlRes.status} pidiendo URL de subida`)
      return
    }
    const { uploadUrl, path } = urlJson as { uploadUrl: string; path: string }

    // 2. Subir el archivo directo a Storage.
    const upRes = await fetch(uploadUrl, {
      method:  'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body:    file,
    })
    if (!upRes.ok) {
      const text = await upRes.text().catch(() => '')
      window.alert(`Error subiendo a Storage: HTTP ${upRes.status} ${text.slice(0, 200)}`)
      return
    }

    // 3. Registrar la fila en desalojo_documentos con metadata.
    const regRes = await fetch(`/api/desalojos/${iniciativa.n}/documentos`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        path,
        nombre:       file.name,
        tipo_archivo: file.type || null,
        tamano_bytes: file.size,
        capa_id:      extras.capa_id   ?? null,
        dimension:    extras.dimension ?? null,
        fase:         extras.fase      ?? null,
        item_key:     extras.item_key  ?? null,
      }),
    })
    const regJson = await regRes.json().catch(() => ({}))
    if (!regRes.ok) {
      window.alert(regJson?.error ?? `Error HTTP ${regRes.status} registrando documento`)
      return
    }
    if (regJson.documento) {
      setDocumentos(prev => [regJson.documento, ...prev])
    }
  }

  async function handleUploadDoc(
    capaId:    number | null,
    dimension: DesalojoDimension | null,
    file:      File,
  ) {
    try {
      await uploadDirectAndRegister(file, { capa_id: capaId, dimension })
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
    try {
      await uploadDirectAndRegister(file, { capa_id: capaId, fase, item_key: itemKey })
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

  // ── Planificación ───────────────────────────────────────────────────────

  function sortEventos(arr: DesalojoPlanificacion[]): DesalojoPlanificacion[] {
    return [...arr].sort((a, b) => {
      if (a.fecha_inicio !== b.fecha_inicio) return a.fecha_inicio.localeCompare(b.fecha_inicio)
      if (a.orden !== b.orden)               return a.orden - b.orden
      return a.id - b.id
    })
  }

  async function handleAddEvento(input: {
    capa_id?:     number | null
    parent_id?:   number | null
    titulo:       string
    descripcion?: string | null
    fecha_inicio: string
    fecha_fin?:   string | null
  }) {
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/planificacion`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(input),
      })
      const json = await res.json()
      if (!res.ok) {
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
      if (json.evento) {
        setPlanificacion(prev => sortEventos([json.evento, ...prev]))
      }
    } catch (err) {
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  async function handlePatchEvento(id: number, patch: Partial<DesalojoPlanificacion>) {
    const prev = planificacion
    setPlanificacion(sortEventos(prev.map(e => e.id === id ? { ...e, ...patch } : e)))
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/planificacion/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) {
        setPlanificacion(prev)
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
      if (json.evento) {
        setPlanificacion(p => sortEventos(p.map(e => e.id === id ? json.evento : e)))
      }
    } catch (err) {
      setPlanificacion(prev)
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  async function handleDeleteEvento(id: number) {
    const prev = planificacion
    // Cascada local: si borramos un evento top-level, sus hitos también
    // desaparecen (espejo del soft-delete server-side).
    setPlanificacion(prev.filter(e => e.id !== id && e.parent_id !== id))
    try {
      const res = await fetch(`/api/desalojos/${iniciativa.n}/planificacion/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setPlanificacion(prev)
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
      }
    } catch (err) {
      setPlanificacion(prev)
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
          - Cerrado normal: max-w-5xl (1024px) mx-auto.
          - Cerrado en Planificación: max-w-[1500px] (Gantt necesita espacio).
          - Abierto (calOpen o mapaOpen): max-w-[1500px] flex → contenido +
            columna derecha (Hitos arriba, Mapa abajo cuando ambos abiertos). */}
      <div className={`mx-auto h-full ${
        (calOpen || mapaOpen)
          ? 'max-w-[1500px] flex gap-6'
          : tab === 'planificacion'
            ? 'max-w-[1500px]'
            : 'max-w-5xl'
      }`}>
        <div className={`flex-1 min-w-0 h-full overflow-y-auto ${tab === 'planificacion' ? 'max-w-[1500px]' : 'max-w-5xl'}`}>
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
            onClick={() => setTab('planificacion')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === 'planificacion' ? 'border-slate-900 text-slate-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Planificación{planificacion.length > 0 && <span className="ml-1 text-gray-400 font-normal">({planificacion.length})</span>}
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

          {/* Triggers del calendario y del mapa — pestañas derechas. No
              cambian el contenido del pane, abren paneles laterales. En la
              tab Planificación quedan deshabilitados: el Gantt ocupa ese
              lado derecho. */}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCalOpen(o => !o)}
              disabled={tab === 'planificacion'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === 'planificacion'
                  ? 'text-gray-300 cursor-not-allowed'
                  : calOpen
                    ? 'bg-slate-900 text-white hover:bg-slate-700'
                    : 'text-gray-600 hover:text-slate-900 hover:bg-gray-100'
              }`}
              title={
                tab === 'planificacion'
                  ? 'El Gantt de Planificación reemplaza el calendario en esta tab'
                  : calOpen ? 'Cerrar calendario' : 'Abrir calendario de hitos'
              }
              aria-label={calOpen ? 'Cerrar calendario' : 'Abrir calendario de hitos'}
              aria-pressed={calOpen}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="12" height="11" rx="1.5"/>
                <path d="M2 6h12M5.5 1.5v3M10.5 1.5v3"/>
              </svg>
              <span>Hitos</span>
              {totalHitos > 0 && !calOpen && tab !== 'planificacion' && (
                <span className="ml-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center">
                  {totalHitos > 9 ? '9+' : totalHitos}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMapaOpen(o => !o)}
              disabled={tab === 'planificacion'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === 'planificacion'
                  ? 'text-gray-300 cursor-not-allowed'
                  : mapaOpen
                    ? 'bg-slate-900 text-white hover:bg-slate-700'
                    : 'text-gray-600 hover:text-slate-900 hover:bg-gray-100'
              }`}
              title={
                tab === 'planificacion'
                  ? 'El Gantt de Planificación reemplaza este panel en esta tab'
                  : mapaOpen ? 'Cerrar mapa' : 'Abrir mapa del caso'
              }
              aria-label={mapaOpen ? 'Cerrar mapa' : 'Abrir mapa del caso'}
              aria-pressed={mapaOpen}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4l4-1.5 4 1.5 4-1.5v10L10 14l-4-1.5L2 14z"/>
                <path d="M6 2.5v10M10 4v10"/>
              </svg>
              <span>Mapa</span>
              {poligonos.length > 0 && !mapaOpen && tab !== 'planificacion' && (
                <span className="ml-0.5 bg-slate-700 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center">
                  {poligonos.length > 9 ? '9+' : poligonos.length}
                </span>
              )}
            </button>
          </div>
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
            regionCaso={iniciativa.region}
          />
        )}
        {tab === 'planificacion' && (
          <DesalojoPlanificacionTab
            eventos={planificacion}
            capas={capas}
            onCreate={handleAddEvento}
            onPatch={handlePatchEvento}
            onDelete={handleDeleteEvento}
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

        {/* Columna derecha: cuando ambos paneles están abiertos se apilan
            verticalmente — Hitos arriba, Mapa justo abajo. El wrapper es la
            única superficie con scroll; los drawers hijos son "bare" (sin
            h-full ni overflow) para que sus alturas fluyan naturalmente. */}
        {(calOpen || mapaOpen) && (
          <div className="flex-shrink-0 flex flex-col gap-4 h-full overflow-y-auto py-6 pr-6">
            {calOpen && (
              <DesalojoCalendarioDrawer
                open={calOpen}
                onClose={() => setCalOpen(false)}
                capas={capas}
                fasesEstado={fasesEstado}
              />
            )}
            {mapaOpen && (
              <DesalojoMapaDrawer
                open={mapaOpen}
                onClose={() => setMapaOpen(false)}
                prioridadId={iniciativa.n}
                capas={capas}
                selectedCapaId={selectedCapaId}
                poligonos={poligonos}
                onCreated={(p) => setPoligonos(prev => [...prev, p])}
                onUpdated={(p) => setPoligonos(prev => prev.map(x => x.id === p.id ? p : x))}
                onDeleted={(id) => setPoligonos(prev => prev.filter(x => x.id !== id))}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
