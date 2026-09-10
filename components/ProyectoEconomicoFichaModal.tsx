'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import type { ComiteEconomicoProyecto, ComiteEconomicoProyectoPermiso, ComiteEconomicoProyectoSeguimiento, PasCatalogo } from '@/lib/types'
import { LISTA_CANONICA } from '@/lib/ministerios'
import { ESTADO_ACTUAL_ECONOMICO_OPCIONES } from '@/lib/comiteEconomico'
import { catalogoAvanzo, camposPendientes } from '@/lib/carteraOrigen'
import { EmptyState, Modal } from '@/components/ui'
import FilterPopover, { type FilterOption } from './FilterPopover'
import ActiveFiltersBar, { setChip } from './ActiveFiltersBar'

/**
 * Ficha de un proyecto privado del Comité Económico — mismo lenguaje visual
 * que ProjectTrackerModal.tsx (ficha de iniciativa):
 *   · Encabezado = Nombre + Descripción (acá, el campo `notas`) editables
 *     inline con click-to-edit, la descripción con line-clamp + "Ver más".
 *   · El resto de los 14 campos restantes vive en UNA tarjeta desplegable
 *     (grid label/valor, mismo estilo que la metadata de la iniciativa),
 *     colapsable con preferencia persistida en localStorage.
 *   · Avances = timeline con fecha editable inline (mismo patrón que
 *     SeguimientoTab.tsx), pero el "estado" que se puede cambiar es el del
 *     PERMISO asociado (Pendiente/Otorgado/Frenado), no uno propio del
 *     avance: un avance o se liga a un permiso del proyecto (y ahí puede
 *     mover su estado) o queda general, sin estado ni permiso. Los avances
 *     ligados a un mismo permiso se agrupan en una única "bitácora" (estilo
 *     LinkedIn cuando alguien tiene varios cargos en la misma empresa):
 *     máximo 5 visibles, el resto tras "Ver más" — ver PermisoBitacoraCard.
 *
 * Los avances se crean SOLO acá. La sesión del comité no tiene formulario
 * propio: su «Agregar avance» abre esta misma ficha (sin saltar directo al
 * form — primero el detalle, tal como pidió Diego). Tenerlo en un solo lugar
 * evita el desfase que había cuando la sesión guardaba su propia copia — al
 * borrar un avance acá, allá seguía apareciendo.
 *
 * Se abre desde ComiteEconomicoProyectosPanel.tsx (cartera) o desde la
 * zona "Proyectos tratados" de la sesión — ambos casos solo necesitan el id.
 */

type Props = {
  proyectoId: number
  puedeOperar: boolean
  currentUserEmail: string
  onClose: () => void
  /** Refresca la lista del llamador (nombre/campos pueden haber cambiado). */
  onChanged?: () => void
  /**
   * Sesión desde la que se abrió la ficha (mig 101). Los avances que se creen
   * quedan marcados con ella y el acta de esa sesión los reporta bajo su
   * proyecto. NULL/ausente = avance normal de cartera, fuera de toda acta.
   */
  sesionId?: number | null
  /**
   * La ficha se abrió justo después de traer el proyecto del catálogo. Fuerza
   * la tarjeta de detalle abierta, ignorando la preferencia guardada: quien
   * acaba de agregar viene a llenar lo que falta, y ese es el único momento en
   * que el detalle importa más que la bitácora.
   */
  reciénImportado?: boolean
}

// El estado que se puede cambiar al registrar un avance es el del PERMISO
// (tricolor Pendiente/Otorgado/Frenado) — no existe un estado propio del
// avance desacoplado de eso: un avance o habla de un permiso puntual (y
// entonces puede mover SU estado) o es general (sin estado, punto gris).
const ESTADO_PERMISO = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  otorgado:  { label: 'Otorgado',  cls: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  frenado:   { label: 'Frenado',   cls: 'bg-red-100 text-red-700',     dot: 'bg-red-500'   },
} as const

type PermisoConCatalogo = ComiteEconomicoProyectoPermiso & { pas: PasCatalogo }
type Usuario = { email: string; ministerio: string | null }

const inputCls = 'px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 w-full'
// Sin `w-full` — para campos de ancho fijo en una fila junto a otro que sí
// debe expandirse (ej. fecha compacta al lado del selector de permiso).
// `${inputCls} w-32` no sirve: w-full siempre gana en el CSS generado.
const inputFixedCls = 'px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-300'
const DETAIL_COLLAPSED_KEY = 'workos:proyectoEconomicoDetailCollapsed'

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

export default function ProyectoEconomicoFichaModal({ proyectoId, puedeOperar, currentUserEmail, onClose, onChanged, sesionId = null, reciénImportado = false }: Props) {
  const [proyecto, setProyecto] = useState<ComiteEconomicoProyecto | null>(null)
  const [estadoEnCatalogo, setEstadoEnCatalogo] = useState<string | null>(null)
  const [urlOrigen, setUrlOrigen] = useState<string | null>(null)
  const [avances, setAvances]   = useState<ComiteEconomicoProyectoSeguimiento[]>([])
  const [loading, setLoading]   = useState(true)

  const [tab, setTab] = useState<'avances' | 'permisos'>('avances')

  // Permisos del proyecto (join con el catálogo global) + catálogo completo
  // (para el picker "+ Agregar permiso") + padrón de usuarios con su
  // ministerio (mig 087) — para el filtro de avances por ministerio.
  const [permisos, setPermisos]       = useState<PermisoConCatalogo[]>([])
  const [pasCatalogo, setPasCatalogo] = useState<PasCatalogo[]>([])
  const [usuarios, setUsuarios]       = useState<Usuario[]>([])

  // Alta de permiso: buscar en el catálogo, o crear uno nuevo si no existe.
  const [permisoQuery, setPermisoQuery]   = useState('')
  const [permisoOpen, setPermisoOpen]     = useState(false)
  const [nuevoPasOpen, setNuevoPasOpen]   = useState(false)
  const [nuevoPasNumero, setNuevoPasNumero]   = useState('')
  const [nuevoPasSector, setNuevoPasSector]   = useState('')
  const [nuevoPasNombre, setNuevoPasNombre]   = useState('')
  const [nuevoPasOrgano, setNuevoPasOrgano]   = useState('')
  const [permisoSaving, setPermisoSaving]     = useState(false)

  // Filtros de avances — por permiso, por institución (órgano otorgante del
  // permiso asociado) y por ministerio (del autor del avance). Mismo patrón
  // multi-select (Set<string>) que los filtros de ComiteEconomicoProyectosPanel.tsx.
  const [fPermiso, setFPermiso]         = useState<Set<string>>(new Set())
  const [fInstitucion, setFInstitucion] = useState<Set<string>>(new Set())
  const [fMinisterio, setFMinisterio]   = useState<Set<string>>(new Set())

  const [showForm, setShowForm]                   = useState(false)
  const [avanceFecha, setAvanceFecha]             = useState(hoyISO)
  const [avanceDescripcion, setAvanceDescripcion] = useState('')
  // Permiso asociado (opcional) — el único cambio de estado posible en un
  // avance es el del permiso elegido; sin permiso, el avance queda general
  // y sin estado.
  const [avancePermisoId, setAvancePermisoId]         = useState<number | ''>('')
  const [avancePermisoEstado, setAvancePermisoEstado] = useState<'' | keyof typeof ESTADO_PERMISO>('')
  const [avanceSaving, setAvanceSaving]           = useState(false)

  // Encabezado — nombre y descripción (campo `notas`) editables inline,
  // mismo patrón click-to-edit que ProjectTrackerModal.tsx.
  const [nombreLocal, setNombreLocal]         = useState('')
  const [editingNombre, setEditingNombre]     = useState(false)
  const [savingNombre, setSavingNombre]       = useState(false)
  const [descLocal, setDescLocal]             = useState('')
  const [editingDesc, setEditingDesc]         = useState(false)
  const [savingDesc, setSavingDesc]           = useState(false)
  const [descExpanded, setDescExpanded]       = useState(false)
  const [descOverflow, setDescOverflow]       = useState(false)
  const descRef = useRef<HTMLParagraphElement>(null)

  // Buscador de permisos: el desplegable se saca de la ficha con createPortal
  // + position:fixed (mismo patrón que IniciativaTypeahead en SesionModal.tsx).
  // La ficha tiene overflow-hidden y su cuerpo hace scroll, así que un
  // desplegable `absolute` quedaba recortado y obligaba a scrollear la ficha
  // entera para verlo. Anclado al input por getBoundingClientRect, se
  // reposiciona en scroll/resize y abre hacia arriba si no cabe abajo.
  const permisoInputRef = useRef<HTMLInputElement>(null)
  const [permisoRect, setPermisoRect] = useState<DOMRect | null>(null)
  const medirPermiso = useCallback(() => {
    const el = permisoInputRef.current
    if (el) setPermisoRect(el.getBoundingClientRect())
  }, [])

  useEffect(() => {
    if (!permisoOpen) return
    window.addEventListener('scroll', medirPermiso, true)
    window.addEventListener('resize', medirPermiso)
    return () => {
      window.removeEventListener('scroll', medirPermiso, true)
      window.removeEventListener('resize', medirPermiso)
    }
  }, [permisoOpen, medirPermiso])

  // Tarjeta de detalle (los otros 14 campos) — colapsable, preferencia
  // persistida igual que el detalle de la ficha de iniciativa.
  const [detailCollapsed, setDetailCollapsed] = useState<boolean>(() => {
    if (reciénImportado) return false
    try { return typeof window !== 'undefined' && localStorage.getItem(DETAIL_COLLAPSED_KEY) === '1' } catch { return false }
  })
  function toggleDetail() {
    setDetailCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(DETAIL_COLLAPSED_KEY, next ? '1' : '0') } catch { /* noop */ }
      return next
    })
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    const sb = getSupabase()
    const [{ data: p }, { data: segs }, { data: perms }, { data: catalogo }] = await Promise.all([
      sb.from('comite_economico_proyecto').select('*').eq('id', proyectoId).single(),
      sb.from('comite_economico_proyecto_seguimiento').select('*').eq('proyecto_id', proyectoId).order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      sb.from('comite_economico_proyecto_permiso').select('*, pas:pas_catalogo(*)').eq('proyecto_id', proyectoId).order('created_at'),
      sb.from('pas_catalogo').select('*').order('n_pas'),
    ])
    const proy = (p as ComiteEconomicoProyecto | null) ?? null
    setProyecto(proy)
    setNombreLocal(proy?.nombre ?? '')
    setDescLocal(proy?.notas ?? '')
    setAvances((segs ?? []) as ComiteEconomicoProyectoSeguimiento[])
    setPermisos((perms ?? []) as unknown as PermisoConCatalogo[])
    setPasCatalogo((catalogo ?? []) as PasCatalogo[])
    setLoading(false)
  }, [proyectoId])

  useEffect(() => { cargar() }, [cargar])

  // Si el proyecto se importó del catálogo (mig 106), se contrasta el estado
  // que tenía la fuente al importarlo contra el que tiene ahora. Es lo que
  // hace útil volver a correr el sync más allá de sumar expedientes nuevos:
  // avisa que uno que ya se sigue avanzó. No se toca nada — solo se avisa; la
  // ficha es de las personas y el estado lo cambian ellas.
  const pendientes = useMemo(
    () => camposPendientes(proyecto as unknown as Record<string, unknown> | null),
    [proyecto],
  )

  const origenId = proyecto?.origen_id ?? null
  useEffect(() => {
    if (!origenId) { setEstadoEnCatalogo(null); setUrlOrigen(null); return }
    let vivo = true
    getSupabase()
      .from('v2_proyectos_inversion')
      .select('estado, url_ficha')
      .eq('id', origenId)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return
        setEstadoEnCatalogo((data as { estado: string | null } | null)?.estado ?? null)
        setUrlOrigen((data as { url_ficha: string | null } | null)?.url_ficha ?? null)
      })
    return () => { vivo = false }
  }, [origenId])

  // Padrón con ministerio (mig 087) — una sola vez, no depende del proyecto.
  // Alimenta el filtro de avances por ministerio del autor. `ministerio` solo
  // se puebla para el rol `seremi` (en cualquier otro rol acotaría su cartera
  // — ver mig 087), así que el filtro separa solo a esos autores. Es
  // deliberado: los avances los cargan principalmente los SEREMI, y para el
  // resto el filtro simplemente no aparece.
  useEffect(() => {
    fetch('/api/users').then(r => r.ok ? r.json() : []).then(setUsuarios).catch(() => {})
  }, [])

  // Al entrar a Permisos se colapsa la tarjeta de detalle (sin tocar la
  // preferencia guardada) — evita el doble scroll: página + dropdown del
  // buscador de permisos, cuando el detalle ya venía desplegado.
  useEffect(() => {
    if (tab === 'permisos') setDetailCollapsed(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Mide overflow de la descripción para saber si hace falta "Ver más" —
  // mismo mecanismo que ProjectTrackerModal.tsx (scrollHeight > clientHeight
  // mientras está clampeada con line-clamp-2).
  useEffect(() => {
    if (descExpanded) return
    function medir() {
      const el = descRef.current
      setDescOverflow(!!el && el.scrollHeight > el.clientHeight + 1)
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [descLocal, descExpanded])

  const editable = puedeOperar

  async function commitCampo<K extends keyof ComiteEconomicoProyecto>(campo: K, valor: ComiteEconomicoProyecto[K]) {
    if (!proyecto || valor === proyecto[campo]) return
    setProyecto(prev => prev ? { ...prev, [campo]: valor } : prev)
    try {
      await safeWrite(
        getSupabase().from('comite_economico_proyecto').update({ [campo]: valor, updated_at: new Date().toISOString() }).eq('id', proyectoId),
        `comite_economico_proyecto ${String(campo)} id=${proyectoId}`,
      )
      onChanged?.()
    } catch (err) {
      window.alert((err as Error).message)
      cargar()
    }
  }

  async function commitNombre() {
    const val = nombreLocal.trim()
    setEditingNombre(false)
    if (!proyecto || !val || val === proyecto.nombre) { setNombreLocal(proyecto?.nombre ?? ''); return }
    setSavingNombre(true)
    try {
      await safeWrite(
        getSupabase().from('comite_economico_proyecto').update({ nombre: val, updated_at: new Date().toISOString() }).eq('id', proyectoId),
        `comite_economico_proyecto nombre id=${proyectoId}`,
      )
      setProyecto(prev => prev ? { ...prev, nombre: val } : prev)
      onChanged?.()
    } catch (err) {
      setNombreLocal(proyecto.nombre)
      window.alert((err as Error).message)
    } finally {
      setSavingNombre(false)
    }
  }

  async function commitDescripcion() {
    const val = descLocal.trim()
    setEditingDesc(false)
    if (!proyecto || val === (proyecto.notas ?? '')) return
    setSavingDesc(true)
    try {
      await safeWrite(
        getSupabase().from('comite_economico_proyecto').update({ notas: val || null, updated_at: new Date().toISOString() }).eq('id', proyectoId),
        `comite_economico_proyecto notas id=${proyectoId}`,
      )
      setProyecto(prev => prev ? { ...prev, notas: val || null } : prev)
      onChanged?.()
    } catch (err) {
      setDescLocal(proyecto.notas ?? '')
      window.alert((err as Error).message)
    } finally {
      setSavingDesc(false)
    }
  }

  function resetAvanceForm() {
    setAvanceFecha(hoyISO()); setAvanceDescripcion('')
    setAvancePermisoId(''); setAvancePermisoEstado(''); setShowForm(false)
  }

  async function agregarAvance() {
    if (!avanceDescripcion.trim()) return
    setAvanceSaving(true)
    try {
      const estadoRegistrado = avancePermisoId && avancePermisoEstado ? avancePermisoEstado : null
      const rows = await safeWrite(
        getSupabase().from('comite_economico_proyecto_seguimiento').insert({
          proyecto_id: proyectoId,
          fecha: avanceFecha || undefined,
          descripcion: avanceDescripcion.trim(),
          permiso_id: avancePermisoId || null,
          // Snapshot histórico del cambio de estado que este avance deja
          // registrado (mig 098) — la bitácora del permiso lo muestra junto
          // a este avance, no solo como el estado actual del permiso.
          estado_permiso_registrado: estadoRegistrado,
          // Si la ficha se abrió desde una sesión, el avance queda ligado a
          // ella y sale en su acta (mig 101).
          sesion_id: sesionId,
          autor: currentUserEmail || null,
        }),
        `comite_economico_proyecto_seguimiento insert proyecto=${proyectoId}`,
      )
      setAvances(prev => [rows[0] as ComiteEconomicoProyectoSeguimiento, ...prev])
      // El avance puede además dejar registrado el nuevo estado del permiso
      // al que se refiere — dos escrituras, mismo criterio que el resto de
      // la app (sin triggers cruzados entre tablas).
      if (estadoRegistrado) {
        await cambiarEstadoPermiso(avancePermisoId as number, estadoRegistrado)
      }
      resetAvanceForm()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setAvanceSaving(false)
    }
  }

  async function borrarAvance(a: ComiteEconomicoProyectoSeguimiento) {
    if (!confirm('¿Borrar este avance?')) return
    try {
      await safeDelete(
        getSupabase().from('comite_economico_proyecto_seguimiento').delete().eq('id', a.id),
        `comite_economico_proyecto_seguimiento delete id=${a.id}`,
      )
      setAvances(prev => prev.filter(x => x.id !== a.id))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function handleInlineFecha(a: ComiteEconomicoProyectoSeguimiento, fecha: string) {
    setAvances(prev => prev.map(x => x.id === a.id ? { ...x, fecha } : x))
    try {
      await safeWrite(
        getSupabase().from('comite_economico_proyecto_seguimiento').update({ fecha }).eq('id', a.id),
        `comite_economico_proyecto_seguimiento fecha id=${a.id}`,
      )
    } catch (err) {
      window.alert((err as Error).message)
      cargar()
    }
  }

  // Editar el texto de un avance ya guardado — solo quien lo redactó (o
  // quien opera el comité, misma RLS que borrar/mover la fecha).
  async function editarDescripcionAvance(a: ComiteEconomicoProyectoSeguimiento, descripcion: string) {
    const val = descripcion.trim()
    if (!val || val === a.descripcion) return
    setAvances(prev => prev.map(x => x.id === a.id ? { ...x, descripcion: val } : x))
    try {
      await safeWrite(
        getSupabase().from('comite_economico_proyecto_seguimiento').update({ descripcion: val }).eq('id', a.id),
        `comite_economico_proyecto_seguimiento descripcion id=${a.id}`,
      )
    } catch (err) {
      window.alert((err as Error).message)
      cargar()
    }
  }

  // ── Permisos (PAS) del proyecto ─────────────────────────────────────────

  async function agregarPermiso(pas: PasCatalogo) {
    if (permisos.some(p => p.pas_id === pas.id)) { setPermisoQuery(''); setPermisoOpen(false); return }
    setPermisoSaving(true)
    try {
      const rows = await safeWrite(
        getSupabase().from('comite_economico_proyecto_permiso').insert({
          proyecto_id: proyectoId,
          pas_id: pas.id,
          created_by_email: currentUserEmail || null,
        }),
        `comite_economico_proyecto_permiso insert proyecto=${proyectoId} pas=${pas.id}`,
      )
      setPermisos(prev => [...prev, { ...(rows[0] as ComiteEconomicoProyectoPermiso), pas }])
      setPermisoQuery(''); setPermisoOpen(false)
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setPermisoSaving(false)
    }
  }

  async function crearYAgregarPas() {
    if (!nuevoPasNombre.trim()) return
    setPermisoSaving(true)
    try {
      const rows = await safeWrite(
        getSupabase().from('pas_catalogo').insert({
          n_pas: nuevoPasNumero.trim() || `PAS ${Date.now()}`,
          sector_materia: nuevoPasSector.trim() || null,
          nombre: nuevoPasNombre.trim(),
          organo_otorgante: nuevoPasOrgano.trim() || null,
          created_by_email: currentUserEmail || null,
        }),
        'pas_catalogo insert',
      )
      const nuevoPas = rows[0] as PasCatalogo
      setPasCatalogo(prev => [...prev, nuevoPas].sort((a, b) => a.n_pas.localeCompare(b.n_pas)))
      await agregarPermiso(nuevoPas)
      setNuevoPasNumero(''); setNuevoPasSector(''); setNuevoPasNombre(''); setNuevoPasOrgano(''); setNuevoPasOpen(false)
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setPermisoSaving(false)
    }
  }

  async function cambiarEstadoPermiso(permisoId: number, estado: string) {
    const val = (estado || null) as ComiteEconomicoProyectoPermiso['estado']
    setPermisos(prev => prev.map(p => p.id === permisoId ? { ...p, estado: val } : p))
    try {
      await safeWrite(
        getSupabase().from('comite_economico_proyecto_permiso').update({ estado: val }).eq('id', permisoId),
        `comite_economico_proyecto_permiso estado id=${permisoId}`,
      )
    } catch (err) {
      window.alert((err as Error).message)
      cargar()
    }
  }

  async function quitarPermiso(permiso: PermisoConCatalogo) {
    if (!confirm(`¿Quitar "${permiso.pas.n_pas}" de este proyecto?`)) return
    try {
      await safeDelete(
        getSupabase().from('comite_economico_proyecto_permiso').delete().eq('id', permiso.id),
        `comite_economico_proyecto_permiso delete id=${permiso.id}`,
      )
      setPermisos(prev => prev.filter(p => p.id !== permiso.id))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  function fmtFecha(fecha: string): string {
    return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // ── Derivados: filtros de avances (permiso / institución / ministerio) ──

  const ministerioPorEmail = useMemo(() => new Map(usuarios.map(u => [u.email, u.ministerio])), [usuarios])

  const permisoById = useMemo(() => new Map(permisos.map(p => [p.id, p])), [permisos])

  const opcionesPermisoFiltro = useMemo((): FilterOption[] =>
    permisos.map(p => ({ value: String(p.id), label: `${p.pas.n_pas} — ${p.pas.nombre}` })),
  [permisos])

  const opcionesInstitucion = useMemo((): FilterOption[] => {
    const vistos = new Set<string>()
    for (const p of permisos) if (p.pas.organo_otorgante) vistos.add(p.pas.organo_otorgante)
    return [...vistos].sort().map(v => ({ value: v, label: v }))
  }, [permisos])

  const opcionesMinisterio = useMemo((): FilterOption[] => {
    const vistos = new Set<string>()
    for (const a of avances) {
      const m = a.autor ? ministerioPorEmail.get(a.autor) : null
      if (m) vistos.add(m)
    }
    return [...vistos].sort().map(v => ({ value: v, label: v }))
  }, [avances, ministerioPorEmail])

  const avancesFiltrados = useMemo(() => {
    return avances.filter(a => {
      if (fPermiso.size && (a.permiso_id == null || !fPermiso.has(String(a.permiso_id)))) return false
      if (fInstitucion.size) {
        const permiso = a.permiso_id != null ? permisoById.get(a.permiso_id) : null
        if (!permiso?.pas.organo_otorgante || !fInstitucion.has(permiso.pas.organo_otorgante)) return false
      }
      if (fMinisterio.size) {
        const m = a.autor ? ministerioPorEmail.get(a.autor) : null
        if (!m || !fMinisterio.has(m)) return false
      }
      return true
    })
  }, [avances, fPermiso, fInstitucion, fMinisterio, permisoById, ministerioPorEmail])

  // Agrupa los avances filtrados en "items" para el timeline: los ligados a
  // un mismo permiso quedan juntos como una bitácora (estilo LinkedIn —
  // varios cargos bajo una misma empresa), posicionada en el punto del más
  // reciente; los avances generales (sin permiso) quedan como items propios.
  // `avancesFiltrados` ya viene ordenado desc por fecha, así que el primer
  // avance que se ve de cada permiso determina la posición del grupo.
  type AvanceItem =
    | { kind: 'permiso'; permisoId: number; avances: ComiteEconomicoProyectoSeguimiento[] }
    | { kind: 'general'; avance: ComiteEconomicoProyectoSeguimiento }
  const avanceItems = useMemo(() => {
    const items: AvanceItem[] = []
    const indexPorPermiso = new Map<number, number>()
    for (const a of avancesFiltrados) {
      if (a.permiso_id != null) {
        const idx = indexPorPermiso.get(a.permiso_id)
        if (idx != null) {
          (items[idx] as Extract<AvanceItem, { kind: 'permiso' }>).avances.push(a)
        } else {
          indexPorPermiso.set(a.permiso_id, items.length)
          items.push({ kind: 'permiso', permisoId: a.permiso_id, avances: [a] })
        }
      } else {
        items.push({ kind: 'general', avance: a })
      }
    }
    return items
  }, [avancesFiltrados])

  const chipsAvances = [
    setChip('Permiso', fPermiso, () => setFPermiso(new Set()), v => opcionesPermisoFiltro.find(o => o.value === v)?.label ?? v),
    setChip('Institución', fInstitucion, () => setFInstitucion(new Set())),
    setChip('Ministerio', fMinisterio, () => setFMinisterio(new Set())),
  ].filter((c): c is NonNullable<typeof c> => c !== null)

  function clearFiltrosAvances() {
    setFPermiso(new Set()); setFInstitucion(new Set()); setFMinisterio(new Set())
  }

  // ── Derivados: picker de permisos (catálogo global, excluye ya agregados) ──

  const permisoQ = permisoQuery.trim().toLowerCase()
  const pasDisponibles = useMemo(
    () => pasCatalogo.filter(p => !permisos.some(link => link.pas_id === p.id)),
    [pasCatalogo, permisos],
  )
  const pasMatches = useMemo(() => {
    if (!permisoQ) return pasDisponibles.slice(0, 20)
    return pasDisponibles
      .filter(p => p.n_pas.toLowerCase().includes(permisoQ) || p.nombre.toLowerCase().includes(permisoQ))
      .slice(0, 20)
  }, [pasDisponibles, permisoQ])

  // Geometría del desplegable de permisos. Las filas tienen alto fijo para que
  // "3 a la vez" sea exacto: el resto se alcanza scrolleando ahí adentro, no
  // moviendo la ficha. El pie ("crear nuevo") queda fuera del scroll, siempre
  // visible.
  const PERMISO_FILA_H = 58
  const PERMISO_PIE_H  = 42
  const PERMISO_GAP    = 4
  const PERMISO_LISTA_MAXH = PERMISO_FILA_H * 3
  let permisoDropStyle: CSSProperties = {}
  let permisoListaMaxH = PERMISO_LISTA_MAXH
  if (permisoOpen && permisoRect) {
    const espacioAbajo = window.innerHeight - permisoRect.bottom
    const deseado = PERMISO_LISTA_MAXH + PERMISO_PIE_H + PERMISO_GAP
    const arriba = espacioAbajo < deseado && permisoRect.top > espacioAbajo
    const disponible = (arriba ? permisoRect.top : espacioAbajo) - PERMISO_GAP
    permisoListaMaxH = Math.max(PERMISO_FILA_H, Math.min(PERMISO_LISTA_MAXH, disponible - PERMISO_PIE_H))
    permisoDropStyle = {
      position: 'fixed',
      left: permisoRect.left,
      width: permisoRect.width,
      zIndex: 9999,
      ...(arriba
        ? { bottom: window.innerHeight - permisoRect.top + PERMISO_GAP }
        : { top: permisoRect.bottom + PERMISO_GAP }),
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[min(72rem,95vw)] max-h-[95vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {loading || !proyecto ? (
          <div className="px-5 py-10">
            <p className="text-center text-sm text-gray-400">Cargando…</p>
          </div>
        ) : (
          <>
            {/* Encabezado — Nombre + Descripción (campo notas), click-to-edit */}
            <header className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">Proyecto privado — Comité Económico</span>
                  {proyecto.origen_sistema && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wide"
                      title={`Agregado desde el catálogo${proyecto.origen_importado_at ? ` el ${new Date(proyecto.origen_importado_at).toLocaleDateString('es-CL')}` : ''}`}
                    >
                      {proyecto.origen_sistema}
                    </span>
                  )}
                </div>

                {/* El catálogo cambió de estado desde que se importó. Solo se
                    avisa: cambiar el estado de la ficha es decisión de quien
                    la lleva, no del sync. */}
                {/* Recién traído del catálogo: llega con lo que la fuente sabe y
                    el resto en blanco. En vez de dejar que la persona recorra la
                    tarjeta de detalle adivinando qué falta, se le dice. */}
                {proyecto.origen_id && pendientes.length > 0 && (
                  <div className="mb-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-[11px] text-violet-900">
                    <p className="font-semibold mb-1">
                      Falta{pendientes.length === 1 ? '' : 'n'} {pendientes.length} dato{pendientes.length === 1 ? '' : 's'} que el catálogo no sabe:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {pendientes.map(p => (
                        <span key={p} className="px-1.5 py-0.5 rounded-full bg-white border border-violet-200 font-medium">{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {catalogoAvanzo(proyecto.origen_estado_al_importar, estadoEnCatalogo) && (
                  <div className="mb-2 flex items-start gap-2 text-[11px] rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-900">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 mt-px"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z"/></svg>
                    <span>
                      En la fuente pasó de <strong>{proyecto.origen_estado_al_importar}</strong> a <strong>{estadoEnCatalogo}</strong> desde que se agregó.
                      {urlOrigen && (
                        <> <a href={urlOrigen} target="_blank" rel="noreferrer" className="underline font-semibold hover:text-amber-950">Ver expediente</a></>
                      )}
                    </span>
                  </div>
                )}

                {editingNombre && editable ? (
                  <input
                    autoFocus
                    value={nombreLocal}
                    disabled={savingNombre}
                    onChange={e => setNombreLocal(e.target.value)}
                    onBlur={commitNombre}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur() }
                      if (e.key === 'Escape') { setNombreLocal(proyecto.nombre); setEditingNombre(false) }
                    }}
                    className="text-base font-semibold text-gray-900 leading-snug w-full rounded px-1 -mx-1 bg-white ring-1 ring-violet-300 focus:ring-violet-500 focus:outline-none"
                  />
                ) : (
                  <p
                    onClick={() => editable && setEditingNombre(true)}
                    title={editable ? 'Click para editar el nombre' : undefined}
                    className={`text-base font-semibold text-gray-900 leading-snug ${editable ? 'cursor-text hover:bg-white/60 rounded px-1 -mx-1' : ''}`}
                  >
                    {nombreLocal}
                  </p>
                )}

                {editingDesc && editable ? (
                  <textarea
                    autoFocus
                    rows={2}
                    value={descLocal}
                    disabled={savingDesc}
                    onChange={e => setDescLocal(e.target.value)}
                    onBlur={commitDescripcion}
                    onKeyDown={e => { if (e.key === 'Escape') { setDescLocal(proyecto.notas ?? ''); setEditingDesc(false) } }}
                    placeholder="N° de RCA, fechas, contexto…"
                    className="text-xs text-gray-700 leading-relaxed mt-1 w-full rounded px-1 -mx-1 bg-white ring-1 ring-violet-300 focus:ring-violet-500 focus:outline-none resize-none"
                  />
                ) : (
                  <div>
                    <p
                      ref={descRef}
                      onClick={() => editable && setEditingDesc(true)}
                      title={editable ? 'Click para editar la descripción' : undefined}
                      className={`text-xs leading-relaxed mt-1 ${descExpanded ? '' : 'line-clamp-2'} ${editable ? 'cursor-text hover:bg-white/60 rounded px-1 -mx-1' : ''} ${descLocal ? 'text-gray-600' : 'text-gray-300 italic'}`}
                    >
                      {descLocal || (editable ? 'Sin descripción — click para agregar' : 'Sin descripción')}
                    </p>
                    {descOverflow && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setDescExpanded(v => !v) }}
                        className="text-[10px] text-violet-600 hover:text-violet-800 font-medium px-1"
                      >
                        {descExpanded ? 'Ver menos' : 'Ver más...'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5" title="Cerrar">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l12 12M16 4L4 16"/>
                </svg>
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Toggle de la tarjeta de detalle */}
              <button
                type="button"
                onClick={toggleDetail}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
                aria-expanded={!detailCollapsed}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${detailCollapsed ? '' : 'rotate-90'}`}>
                  <path d="M7 4l6 6-6 6"/>
                </svg>
                {detailCollapsed ? 'Mostrar detalle' : 'Ocultar detalle'}
              </button>

              {!detailCollapsed && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-x-3 px-3 py-1 bg-gray-50 rounded-xl">
                    <div className="flex flex-col divide-y divide-gray-200/60">
                      <PillField
                        label="Plazo" value={proyecto.plazo ?? ''} editable={editable}
                        options={[{ value: 'CP', label: 'Corto plazo' }, { value: 'MP', label: 'Mediano plazo' }, { value: 'LP', label: 'Largo plazo' }]}
                        display={proyecto.plazo ?? undefined}
                        colorClass={{ bg: 'bg-slate-100', text: 'text-slate-700' }}
                        onChange={v => commitCampo('plazo', (v || null) as ComiteEconomicoProyecto['plazo'])}
                      />
                      <TogglePillField label="Priorizado" value={proyecto.priorizado} editable={editable} activeBg="bg-violet-100" activeText="text-violet-700" onToggle={v => commitCampo('priorizado', v)} />
                      <TogglePillField label="Riesgo" value={proyecto.riesgo} editable={editable} activeBg="bg-red-100" activeText="text-red-700" onToggle={v => commitCampo('riesgo', v)} />
                      <PillField
                        label="SEREMI líder" value={proyecto.seremi_lider ?? ''} editable={editable}
                        options={LISTA_CANONICA.map(m => ({ value: m, label: m }))}
                        colorClass={{ bg: 'bg-slate-100', text: 'text-slate-700' }}
                        onChange={v => commitCampo('seremi_lider', v || null)}
                      />
                      <TextPillField label="Fuente de financiamiento" value={proyecto.fuente_financiamiento ?? ''} editable={editable} onCommit={v => commitCampo('fuente_financiamiento', v.trim() || null)} />
                      <TextPillField label="Responsable operativo" value={proyecto.responsable_operativo ?? ''} editable={editable} onCommit={v => commitCampo('responsable_operativo', v.trim() || null)} />
                      <TextAreaPillField label="Estado inicial" value={proyecto.estado_inicial ?? ''} editable={editable} onCommit={v => commitCampo('estado_inicial', v.trim() || null)} />
                    </div>
                    <div className="flex flex-col divide-y divide-gray-200/60 border-l border-gray-200/60 pl-3">
                      <PillField
                        label="Estado actual" value={proyecto.estado_actual ?? ''} editable={editable}
                        options={ESTADO_ACTUAL_ECONOMICO_OPCIONES.map(o => ({ value: o, label: o }))}
                        colorClass={ESTADO_ACTUAL_COLOR[proyecto.estado_actual ?? ''] ?? { bg: 'bg-gray-100', text: 'text-gray-400' }}
                        onChange={v => commitCampo('estado_actual', v || null)}
                      />
                      <InversionPillField
                        monto={proyecto.inversion_monto} moneda={proyecto.inversion_moneda} editable={editable}
                        onCommit={(monto, moneda) => { commitCampo('inversion_monto', monto); commitCampo('inversion_moneda', moneda) }}
                      />
                      <TextPillField label="M.O. directa" value={proyecto.mano_obra_directa != null ? String(proyecto.mano_obra_directa) : ''} editable={editable} type="number" onCommit={v => commitCampo('mano_obra_directa', v.trim() ? Number(v.trim()) : null)} />
                      <TextPillField label="M.O. indirecta" value={proyecto.mano_obra_indirecta != null ? String(proyecto.mano_obra_indirecta) : ''} editable={editable} type="number" onCommit={v => commitCampo('mano_obra_indirecta', v.trim() ? Number(v.trim()) : null)} />
                      <TextPillField label="KPI" value={proyecto.kpi ?? ''} editable={editable} onCommit={v => commitCampo('kpi', v.trim() || null)} />
                      <TextPillField
                        label="Vida útil" value={proyecto.vida_util_anios != null ? String(proyecto.vida_util_anios) : ''} editable={editable} type="number"
                        formatDisplay={v => `${v} años`}
                        onCommit={v => commitCampo('vida_util_anios', v.trim() ? Number(v.trim()) : null)}
                      />
                      <TextAreaPillField label="Meta 2026 - 2027" value={proyecto.meta_2026_2027 ?? ''} editable={editable} onCommit={v => commitCampo('meta_2026_2027', v.trim() || null)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Tabs — Avances | Permisos */}
              <div className="flex items-center gap-1 border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setTab('avances')}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'avances' ? 'border-violet-700 text-violet-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                  Avances
                </button>
                <button
                  type="button"
                  onClick={() => setTab('permisos')}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'permisos' ? 'border-violet-700 text-violet-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                  Permisos {permisos.length > 0 && <span className="text-gray-400 font-normal">({permisos.length})</span>}
                </button>
              </div>

              {tab === 'permisos' ? (
                <div className="pt-1 space-y-3">
                  {editable && (
                    <div className="relative">
                      <input
                        ref={permisoInputRef}
                        type="text"
                        value={permisoQuery}
                        onChange={e => { setPermisoQuery(e.target.value); setPermisoOpen(true); medirPermiso() }}
                        onFocus={() => { setPermisoOpen(true); medirPermiso() }}
                        onBlur={() => setTimeout(() => setPermisoOpen(false), 150)}
                        placeholder="Buscar permiso por N° PAS o nombre…"
                        className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
                      />
                      {permisoOpen && permisoRect && createPortal(
                        <div style={permisoDropStyle} className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden flex flex-col">
                          <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: permisoListaMaxH }}>
                            {pasMatches.length === 0 ? (
                              <p className="px-4 py-4 text-sm text-gray-400 text-center">Sin resultados en el catálogo.</p>
                            ) : pasMatches.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => agregarPermiso(p)}
                                style={{ height: PERMISO_FILA_H }}
                                className="w-full text-left px-4 flex flex-col justify-center hover:bg-violet-50 border-b border-gray-100 last:border-0"
                              >
                                <p className="text-sm text-gray-800 truncate"><span className="font-semibold">{p.n_pas}</span> — {p.nombre}</p>
                                <p className="text-xs text-gray-400 truncate">{p.organo_otorgante ?? '—'}</p>
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setNuevoPasOpen(true); setNuevoPasNombre(permisoQuery); setPermisoOpen(false) }}
                            style={{ height: PERMISO_PIE_H }}
                            className="flex-none border-t border-gray-100 w-full text-left px-4 text-sm text-violet-700 font-medium hover:bg-violet-50"
                          >
                            + Crear nuevo permiso en el catálogo
                          </button>
                        </div>,
                        document.body,
                      )}
                    </div>
                  )}

                  {nuevoPasOpen && (
                    <div className="bg-gray-50 rounded-xl p-3 space-y-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Nuevo permiso en el catálogo</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={nuevoPasNumero} onChange={e => setNuevoPasNumero(e.target.value)} placeholder="N° PAS (ej: PAS 161)" className={inputCls} />
                        <input type="text" value={nuevoPasSector} onChange={e => setNuevoPasSector(e.target.value)} placeholder="Sector / materia" className={inputCls} />
                      </div>
                      <input type="text" value={nuevoPasNombre} onChange={e => setNuevoPasNombre(e.target.value)} placeholder="Nombre del permiso" className={inputCls} />
                      <input type="text" value={nuevoPasOrgano} onChange={e => setNuevoPasOrgano(e.target.value)} placeholder="Órgano otorgante" className={inputCls} />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setNuevoPasOpen(false)} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">Cancelar</button>
                        <button
                          onClick={crearYAgregarPas}
                          disabled={permisoSaving || !nuevoPasNombre.trim()}
                          className="text-sm bg-violet-700 text-white px-4 py-1.5 rounded-lg hover:bg-violet-800 disabled:opacity-50 transition-colors"
                        >
                          {permisoSaving ? 'Guardando…' : 'Agregar al proyecto'}
                        </button>
                      </div>
                    </div>
                  )}

                  {permisos.length === 0 ? (
                    <EmptyState
                      title="Sin permisos registrados"
                      description="Los permisos (PAS) que este proyecto necesita tramitar quedan acá."
                      icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M9 12l2 2 4-4M7 3h10a2 2 0 0 1 2 2v14l-7-3-7 3V5a2 2 0 0 1 2-2z"/>
                        </svg>
                      }
                    />
                  ) : (
                    <div className="overflow-x-auto -mx-1 px-1">
                      <table className="w-full text-xs border-collapse min-w-[640px]">
                        <thead>
                          <tr className="border-b border-gray-200 text-gray-500">
                            <th className="text-left font-semibold py-1.5 pr-3">N°</th>
                            <th className="text-left font-semibold py-1.5 pr-3">Nombre</th>
                            <th className="text-left font-semibold py-1.5 pr-3">Sector / materia</th>
                            <th className="text-left font-semibold py-1.5 pr-3">Órgano otorgante</th>
                            <th className="text-left font-semibold py-1.5 pr-3">Estado</th>
                            <th className="py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {permisos.map(p => {
                            const cfg = p.estado ? ESTADO_PERMISO[p.estado] : null
                            return (
                              <tr key={p.id} className="border-b border-gray-100">
                                <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{p.pas.n_pas}</td>
                                <td className="py-2 pr-3 text-gray-800 max-w-[220px] truncate" title={p.pas.nombre}>{p.pas.nombre}</td>
                                <td className="py-2 pr-3 text-gray-600 max-w-[160px] truncate">{p.pas.sector_materia ?? '—'}</td>
                                <td className="py-2 pr-3 text-gray-600 max-w-[160px] truncate">{p.pas.organo_otorgante ?? '—'}</td>
                                <td className="py-2 pr-3">
                                  {editable ? (
                                    <select
                                      value={p.estado ?? ''}
                                      onChange={e => cambiarEstadoPermiso(p.id, e.target.value)}
                                      className={`text-xs rounded-full pl-2 pr-1 py-0.5 border-0 ${cfg ? cfg.cls : 'bg-gray-100 text-gray-500'}`}
                                    >
                                      <option value="">Sin estado</option>
                                      {(Object.keys(ESTADO_PERMISO) as (keyof typeof ESTADO_PERMISO)[]).map(k => (
                                        <option key={k} value={k}>{ESTADO_PERMISO[k].label}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg ? cfg.cls : 'bg-gray-100 text-gray-500'}`}>{cfg?.label ?? 'Sin estado'}</span>
                                  )}
                                </td>
                                <td className="py-2 text-right">
                                  {editable && (
                                    <button onClick={() => quitarPermiso(p)} className="text-gray-300 hover:text-red-500 p-0.5" title="Quitar permiso">
                                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                                        <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
                                      </svg>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
              <div className="pt-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Avances registrados</p>
                </div>

                {/* Filtros — por permiso, institución (órgano otorgante) y ministerio
                    del autor. Cada uno aparece solo si tiene por qué filtrar: un
                    FilterPopover sin opciones igual abre, y muestra "Sin resultados".
                    El de Ministerio es el que más se ausenta — solo el rol seremi
                    tiene ministerio, así que lista únicamente a esos autores. */}
                {avances.length > 0 && (opcionesPermisoFiltro.length > 0 || opcionesInstitucion.length > 0 || opcionesMinisterio.length > 0) && (
                  <div className="mb-3 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      {opcionesPermisoFiltro.length > 0 && <FilterPopover label="Permiso" options={opcionesPermisoFiltro} selected={fPermiso} onChange={setFPermiso} />}
                      {opcionesInstitucion.length > 0 && <FilterPopover label="Institución" options={opcionesInstitucion} selected={fInstitucion} onChange={setFInstitucion} />}
                      {opcionesMinisterio.length > 0 && <FilterPopover label="Ministerio" options={opcionesMinisterio} selected={fMinisterio} onChange={setFMinisterio} />}
                    </div>
                    {chipsAvances.length > 0 && <ActiveFiltersBar chips={chipsAvances} clearFilters={clearFiltrosAvances} />}
                  </div>
                )}

                {editable && (
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
                  onClose={resetAvanceForm}
                  title="Agregar actualización"
                  size="lg"
                  dismissable={!avanceSaving}
                  footer={
                    <>
                      <button onClick={resetAvanceForm} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">Cancelar</button>
                      <button
                        onClick={agregarAvance}
                        disabled={avanceSaving || !avanceDescripcion.trim()}
                        className="text-sm bg-violet-700 text-white px-4 py-1.5 rounded-lg hover:bg-violet-800 disabled:opacity-50 transition-colors"
                      >
                        {avanceSaving ? 'Guardando…' : 'Guardar'}
                      </button>
                    </>
                  }
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={avancePermisoId}
                        onChange={e => { setAvancePermisoId(e.target.value ? Number(e.target.value) : ''); setAvancePermisoEstado('') }}
                        className={`${inputCls} flex-1 min-w-0`}
                      >
                        <option value="">Avance general (sin permiso asociado)</option>
                        {permisos.map(p => <option key={p.id} value={p.id}>{p.pas.n_pas} — {p.pas.nombre}</option>)}
                      </select>
                      <input type="date" value={avanceFecha} onChange={e => setAvanceFecha(e.target.value)} className={`${inputFixedCls} w-36 flex-shrink-0`} />
                    </div>
                    {avancePermisoId !== '' && (
                      <select
                        value={avancePermisoEstado}
                        onChange={e => setAvancePermisoEstado(e.target.value as typeof avancePermisoEstado)}
                        className={inputCls}
                      >
                        <option value="">Estado del permiso (sin cambio)</option>
                        {(Object.keys(ESTADO_PERMISO) as (keyof typeof ESTADO_PERMISO)[]).map(k => (
                          <option key={k} value={k}>{ESTADO_PERMISO[k].label}</option>
                        ))}
                      </select>
                    )}
                    <textarea
                      autoFocus
                      value={avanceDescripcion}
                      onChange={e => setAvanceDescripcion(e.target.value)}
                      rows={3}
                      placeholder="Describe el avance…"
                      className={`${inputCls} resize-none`}
                    />
                    {currentUserEmail && (
                      <p className="text-xs text-gray-400">Se registrará a tu nombre: <span className="font-mono">{currentUserEmail}</span></p>
                    )}
                  </div>
                </Modal>

                {avanceItems.length === 0 ? (
                  <EmptyState
                    title={avances.length === 0 ? 'Sin avances aún' : 'Ningún avance calza con los filtros'}
                    description={avances.length === 0 ? 'Las actualizaciones que registre cada SEREMI en este proyecto quedan acá.' : undefined}
                    icon={
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 8v4l3 3" strokeLinecap="round"/>
                      </svg>
                    }
                  />
                ) : (
                  <div className="space-y-5">
                    {avanceItems.map(item => {
                      if (item.kind === 'general') {
                        const a = item.avance
                        const puedeEditar = puedeOperar || a.autor === currentUserEmail
                        const ministerioAutor = a.autor ? ministerioPorEmail.get(a.autor) : null
                        return (
                          <div key={`g-${a.id}`} className="flex gap-4 pl-1 group">
                            <div className="w-3.5 h-3.5 rounded-full mt-1 flex-shrink-0 bg-gray-300 ring-2 ring-white" />
                            <div className="flex-1 min-w-0">
                              <AvanceRow
                                avance={a}
                                puedeEditar={puedeEditar}
                                ministerioAutor={ministerioAutor}
                                onInlineFecha={handleInlineFecha}
                                onBorrar={borrarAvance}
                                onEditarDescripcion={editarDescripcionAvance}
                                fmtFecha={fmtFecha}
                                generalLabel="Avance general"
                              />
                            </div>
                          </div>
                        )
                      }
                      const permiso = permisoById.get(item.permisoId)
                      return (
                        <PermisoBitacoraCard
                          key={`p-${item.permisoId}`}
                          permiso={permiso}
                          avances={item.avances}
                          puedeOperar={puedeOperar}
                          currentUserEmail={currentUserEmail}
                          ministerioPorEmail={ministerioPorEmail}
                          onInlineFecha={handleInlineFecha}
                          onBorrar={borrarAvance}
                          onEditarDescripcion={editarDescripcionAvance}
                          onCambiarEstado={cambiarEstadoPermiso}
                          fmtFecha={fmtFecha}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Timeline de avances — fila individual + bitácora agrupada por permiso ──

// Una fila de avance suelta (fecha editable inline + borrar + texto +
// autor) — se usa tanto para avances generales como, dentro de la bitácora
// de un permiso. El texto se puede editar in situ (click-to-edit, mismo
// patrón Guardar/✕ que los TextPillField) — solo quien lo escribió o quien
// opera el comité (mismo criterio que borrar, gated por `puedeEditar`).
function AvanceRow({
  avance, puedeEditar, ministerioAutor, onInlineFecha, onBorrar, onEditarDescripcion, fmtFecha, generalLabel, estadoRegistrado,
}: {
  avance: ComiteEconomicoProyectoSeguimiento
  puedeEditar: boolean
  ministerioAutor: string | null | undefined
  onInlineFecha: (a: ComiteEconomicoProyectoSeguimiento, fecha: string) => void
  onBorrar: (a: ComiteEconomicoProyectoSeguimiento) => void
  onEditarDescripcion: (a: ComiteEconomicoProyectoSeguimiento, descripcion: string) => void
  fmtFecha: (fecha: string) => string
  generalLabel?: string
  estadoRegistrado?: keyof typeof ESTADO_PERMISO | null
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(avance.descripcion)
  useEffect(() => { setDraft(avance.descripcion) }, [avance.descripcion])

  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {generalLabel && <span className="text-xs text-gray-400">{generalLabel}</span>}
        {estadoRegistrado && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ESTADO_PERMISO[estadoRegistrado].cls}`}>
            → {ESTADO_PERMISO[estadoRegistrado].label}
          </span>
        )}
        {puedeEditar ? (
          <input
            type="date"
            value={avance.fecha}
            onChange={e => onInlineFecha(avance, e.target.value)}
            className="text-xs text-gray-500 ml-auto border-0 bg-transparent hover:bg-gray-100 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
          />
        ) : (
          <span className="text-xs text-gray-400 ml-auto">{fmtFecha(avance.fecha)}</span>
        )}
        {puedeEditar && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-violet-600 rounded hover:bg-violet-50 transition-colors"
            title="Editar avance"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 2l3 3-8 8-3.5 1 1-3.5z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        {puedeEditar && (
          <button
            onClick={() => onBorrar(avance)}
            className="p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
            title="Borrar avance"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 3.5h8M4.5 3.5V2h3v1.5M4 3.5l.5 7h3l.5-7"/>
            </svg>
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1.5">
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className={`w-full ${pillEditInputCls} resize-y`}
          />
          <div className="flex justify-end gap-1.5">
            <button onClick={() => { onEditarDescripcion(avance, draft); setEditing(false) }} className={pillSaveBtnCls}>Guardar</button>
            <button onClick={() => { setDraft(avance.descripcion); setEditing(false) }} className={pillCancelBtnCls}>✕</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-700 leading-snug">{avance.descripcion}</p>
      )}
      {avance.autor && (
        <p className="text-xs text-gray-400 mt-1">
          {avance.autor}{ministerioAutor ? ` · ${ministerioAutor}` : ''}
        </p>
      )}
    </div>
  )
}

// Bitácora de un permiso — todos sus avances agrupados bajo un único
// encabezado (N°/nombre + estado ACTUAL, el único que se ve arriba), mismo
// criterio visual que LinkedIn cuando una persona tiene varios cargos en la
// misma empresa: un solo bloque, ordenado cronológicamente (el más antiguo
// primero, como una bitácora), mostrando las últimas 3 entradas y el resto
// tras "Ver más" — cada avance conserva el cambio de estado que dejó
// registrado en su momento (estado_permiso_registrado), si tuvo uno.
const VISIBLES_DEFAULT = 3

function PermisoBitacoraCard({
  permiso, avances, puedeOperar, currentUserEmail, ministerioPorEmail, onInlineFecha, onBorrar, onEditarDescripcion, onCambiarEstado, fmtFecha,
}: {
  permiso: PermisoConCatalogo | undefined
  avances: ComiteEconomicoProyectoSeguimiento[]
  puedeOperar: boolean
  currentUserEmail: string
  ministerioPorEmail: Map<string, string | null>
  onInlineFecha: (a: ComiteEconomicoProyectoSeguimiento, fecha: string) => void
  onBorrar: (a: ComiteEconomicoProyectoSeguimiento) => void
  onEditarDescripcion: (a: ComiteEconomicoProyectoSeguimiento, descripcion: string) => void
  onCambiarEstado: (permisoId: number, estado: string) => void
  fmtFecha: (fecha: string) => string
}) {
  const [expanded, setExpanded] = useState(false)
  const cfg = permiso?.estado ? ESTADO_PERMISO[permiso.estado] : null

  // Cronológico ascendente (el más antiguo primero, como una bitácora) —
  // `avances` llega ordenado desc (más reciente primero), así que se invierte.
  const ordenados = useMemo(() => [...avances].reverse(), [avances])
  const resto = Math.max(0, ordenados.length - VISIBLES_DEFAULT)
  // Colapsado: solo las últimas (más recientes) VISIBLES_DEFAULT — "Ver más"
  // destapa las anteriores por arriba, la lectura sigue siendo cronológica.
  const visibles = expanded ? ordenados : ordenados.slice(resto)

  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2.5">
      <div className="flex items-center gap-2 pb-2 mb-2 border-b border-gray-100">
        <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${cfg?.dot ?? 'bg-gray-300'} ring-2 ring-white`} />
        <span className="text-sm font-semibold text-gray-800 flex-shrink-0" title={permiso?.pas.nombre}>{permiso?.pas.n_pas ?? '—'}</span>
        <span className="text-xs text-gray-400 truncate flex-1">{permiso?.pas.nombre}</span>
        {puedeOperar && permiso ? (
          <select
            value={permiso.estado ?? ''}
            onChange={e => onCambiarEstado(permiso.id, e.target.value)}
            className={`text-xs rounded-full pl-2 pr-1 py-0.5 border-0 flex-shrink-0 ${cfg ? cfg.cls : 'bg-gray-100 text-gray-500'}`}
            title="Cambia el estado de este permiso"
          >
            <option value="">Sin estado</option>
            {(Object.keys(ESTADO_PERMISO) as (keyof typeof ESTADO_PERMISO)[]).map(k => (
              <option key={k} value={k}>{ESTADO_PERMISO[k].label}</option>
            ))}
          </select>
        ) : (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg ? cfg.cls : 'bg-gray-100 text-gray-500'}`}>{cfg?.label ?? 'Sin estado'}</span>
        )}
      </div>
      <div className="pl-5 ml-1.5 border-l border-gray-100 space-y-4">
        {resto > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-violet-600 hover:text-violet-800 font-medium"
          >
            Ver {resto} más
          </button>
        )}
        {visibles.map(a => {
          const puedeEditar = puedeOperar || a.autor === currentUserEmail
          const ministerioAutor = a.autor ? ministerioPorEmail.get(a.autor) : null
          return (
            <AvanceRow
              key={a.id}
              avance={a}
              puedeEditar={puedeEditar}
              ministerioAutor={ministerioAutor}
              onInlineFecha={onInlineFecha}
              onBorrar={onBorrar}
              onEditarDescripcion={onEditarDescripcion}
              fmtFecha={fmtFecha}
              estadoRegistrado={a.estado_permiso_registrado}
            />
          )
        })}
        {expanded && resto > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-gray-400 hover:text-gray-600 font-medium"
          >
            Ver menos
          </button>
        )}
      </div>
    </div>
  )
}

// ── Pills de la tarjeta de detalle — mismo lenguaje visual que la metadata
// de ProjectTrackerModal.tsx (ficha de iniciativa): fila label + pill
// redondeada, click para editar, chevron sutil, sin bordes ásperos.

const ChevronDown = ({ cls = 'text-gray-500' }: { cls?: string }) => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`opacity-40 group-hover:opacity-70 flex-shrink-0 ${cls}`}>
    <path d="M1.5 3L4 5.5L6.5 3"/>
  </svg>
)

// Categorías estándar de estado_actual (lib/comiteEconomico.ts) — mismo
// criterio que etapaColor() para la iniciativa: progresión de madurez.
const ESTADO_ACTUAL_COLOR: Record<string, { bg: string; text: string }> = {
  'Preliminar':               { bg: 'bg-gray-100',   text: 'text-gray-500'   },
  'En calificación (SEIA)':   { bg: 'bg-orange-100',  text: 'text-orange-700' },
  'Aprobado ambientalmente':  { bg: 'bg-green-100',   text: 'text-green-700'  },
  'En construcción':          { bg: 'bg-blue-100',    text: 'text-blue-700'   },
  'En pruebas':                { bg: 'bg-violet-100',  text: 'text-violet-700' },
  'Operación':                 { bg: 'bg-green-100',   text: 'text-green-700'  },
  'Otro':                      { bg: 'bg-gray-100',    text: 'text-gray-500'   },
}

const pillRowCls = 'flex items-center gap-2 py-1.5 px-3'
const pillLabelCls = 'text-gray-400 w-36 flex-shrink-0 text-xs'
const pillEditInputCls = 'text-xs text-gray-800 placeholder:text-gray-400 border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white'
const pillSaveBtnCls = 'text-xs px-2 py-0.5 bg-violet-700 text-white rounded hover:bg-violet-800 flex-shrink-0'
const pillCancelBtnCls = 'text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 flex-shrink-0'

// Campo con opciones fijas (select) — pill de color + overlay transparente,
// mismo mecanismo que Etapa actual/RAT en ProjectTrackerModal.tsx.
function PillField({
  label, value, display, colorClass, editable, options, onChange,
}: {
  label: string
  value: string
  display?: string
  colorClass: { bg: string; text: string }
  editable: boolean
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className={pillRowCls}>
      <span className={pillLabelCls}>{label}</span>
      <label className={`relative flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full transition-all group flex-1 min-w-0 ${editable ? 'cursor-pointer hover:brightness-95' : 'cursor-default'} ${colorClass.bg}`}>
        <span className={`text-xs font-medium truncate flex-1 ${value ? colorClass.text : 'text-gray-400'}`}>{display ?? value ?? '—'}</span>
        {editable && <ChevronDown cls={colorClass.text} />}
        <select
          value={value}
          disabled={!editable}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full disabled:cursor-default"
        >
          <option value="">—</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    </div>
  )
}

// Campo booleano — pill que se togglea al click, sin checkbox.
function TogglePillField({
  label, value, editable, activeBg, activeText, onToggle,
}: {
  label: string
  value: boolean
  editable: boolean
  activeBg: string
  activeText: string
  onToggle: (v: boolean) => void
}) {
  return (
    <div className={pillRowCls}>
      <span className={pillLabelCls}>{label}</span>
      <button
        type="button"
        onClick={() => editable && onToggle(!value)}
        disabled={!editable}
        className={`flex items-center pl-2.5 pr-2 py-0.5 rounded-full flex-1 min-w-0 transition-colors ${value ? activeBg : 'bg-gray-100'} ${editable ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}
      >
        <span className={`text-xs font-medium flex-1 truncate text-left ${value ? activeText : 'text-gray-400'}`}>{value ? 'Sí' : 'No'}</span>
      </button>
    </div>
  )
}

// Campo de texto/número libre — pill neutra que al click abre un input +
// Guardar/✕, mismo patrón que Cód. BIP/Inversión en ProjectTrackerModal.tsx.
function TextPillField({
  label, value, editable, onCommit, type = 'text', placeholder, formatDisplay,
}: {
  label: string
  value: string
  editable: boolean
  onCommit: (v: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  formatDisplay?: (v: string) => string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value)
  useEffect(() => { setDraft(value) }, [value])

  if (editing) {
    return (
      <div className={pillRowCls}>
        <span className={pillLabelCls}>{label}</span>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <input
            autoFocus
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={placeholder}
            className={`flex-1 min-w-0 ${pillEditInputCls}`}
          />
          <button onClick={() => { onCommit(draft); setEditing(false) }} className={pillSaveBtnCls}>Guardar</button>
          <button onClick={() => { setDraft(value); setEditing(false) }} className={pillCancelBtnCls}>✕</button>
        </div>
      </div>
    )
  }
  return (
    <div className={pillRowCls}>
      <span className={pillLabelCls}>{label}</span>
      <button
        type="button"
        onClick={() => editable && setEditing(true)}
        disabled={!editable}
        className="flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors group flex-1 min-w-0 cursor-pointer disabled:cursor-default disabled:hover:bg-slate-100"
      >
        <span className={`text-xs font-medium flex-1 truncate text-left ${value ? 'text-slate-700' : 'text-slate-400'}`}>
          {value ? (formatDisplay ? formatDisplay(value) : value) : '—'}
        </span>
        {editable && <ChevronDown cls="text-slate-500" />}
      </button>
    </div>
  )
}

// Campo de texto largo (Estado inicial, Meta) — colapsado es una sola línea
// truncada, igual que los demás pills; al apretarlo se despliega: editable
// abre un textarea (mismo Guardar/✕ que TextPillField), de solo lectura
// alterna a mostrar el texto completo envuelto.
function TextAreaPillField({
  label, value, editable, onCommit, placeholder,
}: {
  label: string
  value: string
  editable: boolean
  onCommit: (v: string) => void
  placeholder?: string
}) {
  const [editing, setEditing]   = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft]       = useState(value)
  useEffect(() => { setDraft(value) }, [value])

  if (editing) {
    return (
      <div className={pillRowCls}>
        <span className={pillLabelCls}>{label}</span>
        <div className="flex-1 min-w-0 space-y-1.5">
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={placeholder}
            className={`w-full ${pillEditInputCls} resize-y`}
          />
          <div className="flex justify-end gap-1.5">
            <button onClick={() => { onCommit(draft); setEditing(false) }} className={pillSaveBtnCls}>Guardar</button>
            <button onClick={() => { setDraft(value); setEditing(false) }} className={pillCancelBtnCls}>✕</button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className={pillRowCls}>
      <span className={pillLabelCls}>{label}</span>
      <button
        type="button"
        onClick={() => editable ? setEditing(true) : setExpanded(v => !v)}
        disabled={!editable && !value}
        className={`flex-1 min-w-0 text-left pl-2.5 pr-2 py-0.5 bg-slate-100 hover:bg-slate-200 transition-colors group cursor-pointer disabled:cursor-default disabled:hover:bg-slate-100 ${expanded ? 'rounded-lg py-1.5' : 'rounded-full flex items-center gap-1.5'}`}
      >
        <span className={`text-xs font-medium ${value ? 'text-slate-700' : 'text-slate-400'} ${expanded ? 'block whitespace-pre-wrap' : 'flex-1 truncate'}`}>
          {value || '—'}
        </span>
        {!expanded && editable && <ChevronDown cls="text-slate-500" />}
      </button>
    </div>
  )
}

// Inversión — monto + moneda se editan juntos (dos inputs), mismo espíritu
// que "Próximo hito" (fecha + tipo) en ProjectTrackerModal.tsx.
function InversionPillField({
  monto, moneda, editable, onCommit,
}: {
  monto: number | null
  moneda: string | null
  editable: boolean
  onCommit: (monto: number | null, moneda: string | null) => void
}) {
  const [editing, setEditing]         = useState(false)
  const [draftMonto, setDraftMonto]   = useState(monto != null ? String(monto) : '')
  const [draftMoneda, setDraftMoneda] = useState(moneda ?? '')
  useEffect(() => { setDraftMonto(monto != null ? String(monto) : ''); setDraftMoneda(moneda ?? '') }, [monto, moneda])

  if (editing) {
    return (
      <div className={pillRowCls}>
        <span className={pillLabelCls}>Inversión</span>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <input autoFocus type="number" value={draftMonto} onChange={e => setDraftMonto(e.target.value)} placeholder="Monto" className={`w-24 flex-shrink-0 ${pillEditInputCls}`} />
          <input type="text" value={draftMoneda} onChange={e => setDraftMoneda(e.target.value)} placeholder="Moneda" className={`w-16 flex-shrink-0 ${pillEditInputCls}`} />
          <button onClick={() => { onCommit(draftMonto.trim() ? Number(draftMonto.trim()) : null, draftMoneda.trim() || null); setEditing(false) }} className={pillSaveBtnCls}>Guardar</button>
          <button onClick={() => { setDraftMonto(monto != null ? String(monto) : ''); setDraftMoneda(moneda ?? ''); setEditing(false) }} className={pillCancelBtnCls}>✕</button>
        </div>
      </div>
    )
  }
  return (
    <div className={pillRowCls}>
      <span className={pillLabelCls}>Inversión</span>
      <button
        type="button"
        onClick={() => editable && setEditing(true)}
        disabled={!editable}
        className="flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors group flex-1 min-w-0 cursor-pointer disabled:cursor-default disabled:hover:bg-slate-100"
      >
        <span className={`text-xs font-medium flex-1 truncate text-left ${monto != null ? 'text-slate-700' : 'text-slate-400'}`}>
          {monto != null ? `$${monto.toLocaleString('es-CL')} MM${moneda ? ` ${moneda}` : ''}` : '—'}
        </span>
        {editable && <ChevronDown cls="text-slate-500" />}
      </button>
    </div>
  )
}
