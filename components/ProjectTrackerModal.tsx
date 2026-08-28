'use client'

import { useState, useEffect, useRef } from 'react'
import type { Iniciativa, Capa } from '@/lib/projects'
import type { Seguimiento, SeguimientoCompromiso, Documento, SemaforoLog, Tarea, EjeSesion } from '@/lib/types'
import { REGIONS } from '@/lib/regions'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import { logSemaforoChange } from '@/lib/db'
import { SEMAFORO_CONFIG, MINISTERIOS_CANONICOS, splitMinisterios, joinMinisterios, etapaColor, type SemaforoKey } from '@/lib/config'
import { VALID_ETAPA, VALID_PROXIMO_HITO } from '@/lib/enums'
import { useRegionEjes } from '@/lib/hooks/useRegionEjes'
import { useRegionConfig } from '@/lib/hooks/useRegionConfig'
import { composeEjeLabel } from '@/lib/ejes'
import { comunasDeRegion, comunaNombre, normalizeComunaText } from '@/lib/comunas'
import { tagColor } from '@/lib/tagColor'
import SeguimientoTab from './modal/SeguimientoTab'
import HistorialTab   from './modal/HistorialTab'
import CalendarioTab  from './modal/CalendarioTab'
import DocumentosTab  from './modal/DocumentosTab'
import TareasTab      from './modal/TareasTab'
import HistorialSesionesModal from './HistorialSesionesModal'
import { useCanEdit, useCanEditAny, useCanEditOperational, useCurrentUserEmail, useIsAdmin } from '@/lib/context/UserContext'
import { FlagIcon } from './icons/FlagIcon'
import { HomeIcon } from './icons/HomeIcon'
import { CapaBadge } from './CapaBadge'

type Tab = 'seguimiento' | 'historial' | 'calendario' | 'documentos' | 'tareas'

type Props = {
  prioridad: Iniciativa
  onClose: () => void
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
  onDeletePrioridad?: (n: number) => void
}

export default function ProjectTrackerModal({ prioridad, onClose, onUpdatePrioridad, onDeletePrioridad }: Props) {
  const canEditRegion = useCanEdit()
  const canEditAny = useCanEditAny()
  const isAdmin    = useIsAdmin()
  const canEditOperational = useCanEditOperational()
  const currentUserEmail   = useCurrentUserEmail()
  // canEdit = estructural (admin/editor). Operativo (semáforo, %avance,
  // responsable, seguimientos, docs) usa canEditOperational en su lugar.
  const canEdit = canEditRegion(prioridad.region)

  const [tab, setTab]               = useState<Tab>('seguimiento')
  // Detalle (ministerio, etiquetas, semáforo/avance y la grilla de metadatos)
  // colapsable: al trabajar mucho en Seguimiento/Tareas se gana espacio abajo.
  // La preferencia se persiste entre aperturas (patrón de columnas del Dashboard).
  const [detailCollapsed, setDetailCollapsed] = useState<boolean>(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('workos:iniciativaDetailCollapsed') === '1' } catch { return false }
  })
  function toggleDetail() {
    setDetailCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('workos:iniciativaDetailCollapsed', next ? '1' : '0') } catch { /* noop */ }
      return next
    })
  }
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([])
  const [seguimientoCompromisos, setSeguimientoCompromisos] = useState<SeguimientoCompromiso[]>([])
  const [documentos, setDocumentos]     = useState<Documento[]>([])
  const [semaforoLog, setSemaforoLog]   = useState<SemaforoLog[]>([])
  const [tareas, setTareas]             = useState<Tarea[]>([])
  // Constancia "Tratado en Gabinete N° X" (v2, mig 074): sesiones de gabinete
  // cerradas que trataron esta iniciativa (vínculo por id estable). Tolerante:
  // vacío si la tabla no existe (pre-migración) o si RLS la oculta.
  const [gabineteTratado, setGabineteTratado] = useState<{ numero: number; fecha: string }[]>([])
  // Sesiones de Gabinete/Infraestructura donde esta iniciativa estuvo en la
  // agenda (sesion_iniciativas — cubre borrador Y cerrada, a diferencia de
  // gabineteTratado que solo mira cerradas vía la pauta v2). Alimenta el tab
  // Calendario; click en una abre su historial (mismo mecanismo que el
  // calendario regional).
  const [sesionesTratada, setSesionesTratada] = useState<EjeSesion[]>([])
  const [selectedSesionTratada, setSelectedSesionTratada] = useState<EjeSesion | null>(null)
  const [loading, setLoading]           = useState(true)

  const [semaforo, setSemaforo]       = useState<SemaforoKey>(prioridad.estado_semaforo as SemaforoKey ?? 'gris')
  const [pctAvance, setPctAvance]     = useState<number>(prioridad.pct_avance ?? 0)
  const [savingSem, setSavingSem]     = useState(false)
  const [savingPct, setSavingPct]     = useState(false)

  const [nombreLocal, setNombreLocal]       = useState<string>(prioridad.nombre)
  const [editingNombre, setEditingNombre]   = useState(false)
  const [savingNombre, setSavingNombre]     = useState(false)
  const [descripcionLocal, setDescripcionLocal] = useState<string>(prioridad.descripcion ?? '')
  const [editingDescripcion, setEditingDescripcion] = useState(false)
  const [savingDescripcion, setSavingDescripcion]   = useState(false)
  const [descripcionExpanded, setDescripcionExpanded] = useState(false)
  const [descripcionOverflow, setDescripcionOverflow]  = useState(false)
  const descripcionRef = useRef<HTMLParagraphElement>(null)
  const [responsable, setResponsable]       = useState<string>(prioridad.responsable ?? '')
  const [usuarios, setUsuarios]             = useState<{email: string; name: string}[]>([])
  // Padrón acotado a la región de la iniciativa + transversales (admin/
  // editor) — solo para el selector de Responsable de tareas en el tab
  // Planificación. El selector de Responsable de la iniciativa (arriba)
  // sigue usando `usuarios`, el padrón completo.
  const [usuariosRegion, setUsuariosRegion] = useState<{email: string; name: string}[]>([])

  const [etapaActual, setEtapaActual]               = useState<string>(prioridad.etapa_actual ?? '')
  const [proximoHito, setProximoHito]               = useState<string>(prioridad.proximo_hito ?? '')
  const [fechaProximoHito, setFechaProximoHito]     = useState<string>(prioridad.fecha_proximo_hito ?? '')
  const [fuenteFinanciamiento, setFuenteFinanciamiento] = useState<string>(prioridad.fuente_financiamiento ?? '')
  const [estadoTerminoGob, setEstadoTerminoGob]     = useState<string>(prioridad.estado_termino_gobierno ?? '')
  const [rat, setRat]                               = useState<string>(prioridad.rat ?? '')
  const [inversionMm, setInversionMm]               = useState<string>(prioridad.inversion_mm != null ? String(prioridad.inversion_mm) : '')
  const [codigoBip, setCodigoBip]                   = useState<string>(prioridad.codigo_bip ?? '')
  const [ministerios, setMinisterios]               = useState<string[]>(splitMinisterios(prioridad.ministerio))
  const [savingMinisterio, setSavingMinisterio]     = useState(false)
  // Tags multi-valor (migración 016). Estructural: admin/editor edita directo
  // en la ficha, regional propone vía Excel. Sin catálogo cerrado — el control
  // queda en la aprobación de la propuesta.
  const [tagsLocal, setTagsLocal]                   = useState<string[]>(prioridad.tags ?? [])
  const [tagDraft, setTagDraft]                     = useState<string>('')
  const [savingTags, setSavingTags]                 = useState(false)
  // Universo de etiquetas ya usadas en otras iniciativas (visibles según RLS
  // del usuario) — para sugerir mientras se escribe y evitar duplicados por
  // variantes de tipeo (ej. "Salud" vs "salud "). Se carga una sola vez.
  const [universoEtiquetas, setUniversoEtiquetas]   = useState<string[]>([])
  // Comunas — igual espíritu que Tags pero restringido al catálogo oficial
  // (data/comunas-cut.json, 345 CUT vía comunasDeRegion) en vez de texto libre:
  // el picker solo deja elegir comunas que existen. `comuna` (texto) queda como
  // espejo legible y `alcance_regional` se recalcula con el mismo criterio que
  // usa el importador (mig 045) — vacío = alcance regional.
  const [comunaCodsLocal, setComunaCodsLocal]       = useState<number[]>(prioridad.comuna_cods ?? [])
  const [comunaQuery, setComunaQuery]               = useState<string>('')
  const [savingComunas, setSavingComunas]           = useState(false)
  // Popover de edición, anclado al texto "· <comuna>" del header (no es una
  // sección aparte) — se abre al click, se cierra al click afuera.
  const [editingComunas, setEditingComunas]         = useState(false)
  const comunasPopoverRef = useRef<HTMLDivElement>(null)
  const [enFoco, setEnFoco]                         = useState<boolean>(prioridad.en_foco === true)
  const [savingFoco, setSavingFoco]                 = useState(false)
  // Marca admin-only para casos de la Mesa Interministerial de Desalojos
  // (migración 017). El toggle pasa por API admin-only — NO via cliente —
  // porque la columna `es_desalojo` vive en `prioridades_territoriales` cuya
  // RLS es authenticated_write (cualquier autenticado puede mutar).
  const [esDesalojo, setEsDesalojo]                 = useState<boolean>(prioridad.es_desalojo === true)
  const [savingDesalojo, setSavingDesalojo]         = useState(false)
  // Nivel de importancia (migración 024). Solo admin/editor edita — para
  // regional/viewer se renderiza el badge read-only. El trigger 023 bloquea
  // el UPDATE si lo intenta un regional (capa no está en la whitelist).
  const [capaLocal, setCapaLocal]                   = useState<Capa>(prioridad.capa)
  const [savingCapa, setSavingCapa]                 = useState(false)
  const [editingField, setEditingField]             = useState<string | null>(null)
  const [savingField, setSavingField]               = useState(false)
  const [confirmDelete, setConfirmDelete]           = useState(false)
  const [deleting, setDeleting]                     = useState(false)

  // Color uniforme gris para todos los ejes — confirmado con Diego. La
  // antigua paleta `EJE_COLORS` no matcheaba la data real y todos caían
  // al fallback igual, así que se eliminó.
  const ejeColor = 'bg-gray-100 text-gray-600'

  // Catálogo de ejes para componer label uniforme "Eje N: Nombre" desde el
  // dato estructural. Si la iniciativa todavía no tiene eje_id (legacy),
  // cae al string original sin lookup.
  const { ejes: regionEjes } = useRegionEjes(prioridad.cod)
  // Region completa (no solo el cod) — la necesita el historial de sesiones
  // que se abre desde el tab Calendario (Gabinete/Infraestructura donde se
  // trató esta iniciativa).
  const region = REGIONS.find(r => r.cod === prioridad.cod) ?? null
  // Etiquetas "funcionales" — las que el sistema reconoce y usa para algo
  // (CRI/tag del Comité de Infraestructura de la región, megaproyectos
  // curados por ese comité) llevan color pastel. Cualquier otra etiqueta es
  // texto libre sin función propia y se muestra neutra, como antes.
  const { config: regionConfigTags } = useRegionConfig(prioridad.cod)
  const etiquetasFuncionales = new Set(
    [regionConfigTags?.infraestructura_tag, ...(regionConfigTags?.infraestructura_megaproyectos ?? [])]
      .filter((t): t is string => !!t),
  )
  const ejeFromCatalog = prioridad.eje_id
    ? regionEjes.find(e => e.id === prioridad.eje_id)
    : undefined
  const ejeDisplay = ejeFromCatalog
    ? composeEjeLabel(ejeFromCatalog.numero, ejeFromCatalog.nombre)
    : prioridad.eje

  useEffect(() => {
    loadData()
    fetch('/api/users').then(r => r.ok ? r.json() : []).then(setUsuarios)
    fetch(`/api/users?region=${encodeURIComponent(prioridad.cod)}`).then(r => r.ok ? r.json() : []).then(setUsuariosRegion)
  }, [prioridad.n])

  // "Ver más..." de la descripción solo aparece si el texto REALMENTE se
  // corta con el line-clamp-2 — medido contra el DOM (scrollHeight vs
  // clientHeight), no por un largo de string heurístico (dos líneas caben
  // distinto según qué tan largas son las palabras). Solo se puede medir
  // mientras está clampeado (expandido, clientHeight = scrollHeight siempre)
  // — el valor queda cacheado en el state así que "Ver menos" se sigue
  // mostrando una vez expandido.
  useEffect(() => {
    if (descripcionExpanded) return
    function medir() {
      const el = descripcionRef.current
      setDescripcionOverflow(!!el && el.scrollHeight > el.clientHeight + 1)
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [descripcionLocal, descripcionExpanded])

  useEffect(() => {
    // Vía API (cliente admin) y no el cliente RLS directo — `prioridades_
    // territoriales` está scopeada por región (mig 072) y esto necesita el
    // universo completo del panel, no solo lo que ve la región del usuario.
    fetch('/api/tags').then(r => r.ok ? r.json() : []).then(setUniversoEtiquetas)
  }, [])

  useEffect(() => {
    if (!editingComunas) return
    function onMouseDown(e: MouseEvent) {
      if (comunasPopoverRef.current && !comunasPopoverRef.current.contains(e.target as Node)) {
        setEditingComunas(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [editingComunas])

  // ── A11y del diálogo (Fase 4a) ──────────────────────────────────────────────
  // El modal se monta inline (sin portal), así que no hay un árbol hermano al que
  // ponerle el atributo `inert`. Cubrimos las mismas tres dimensiones de otra
  // forma: aria-modal (los lectores de pantalla ignoran el fondo), el backdrop
  // z-50 (el mouse no alcanza los controles de atrás) y un focus-trap por teclado
  // (handleDialogKeyDown). Al abrir movemos el foco al botón de cerrar; al cerrar
  // lo restauramos al elemento que lo tenía (la fila/tarjeta que abrió la ficha).
  const panelRef    = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeBtnRef.current?.focus()
    return () => { previouslyFocused?.focus?.() }
  }, [])
  function handleDialogKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      // Escape dentro de un campo de texto = cancelar ese campo (lo maneja el
      // input), no cerrar la ficha: evita perder lo tipeado. Cerrar solo si el
      // foco NO está en un input/textarea/select/contenteditable.
      const t = e.target as HTMLElement
      const enCampo = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
      if (!enCampo) { e.preventDefault(); requestClose() }
      return
    }
    if (e.key === 'Tab' && panelRef.current) {
      // Focus-trap: el Tab cicla dentro del panel (equivalente por teclado a
      // `inert` en el fondo). Solo cuenta lo realmente renderizado — el detalle
      // colapsado y las tabs inactivas no están en el DOM, así que no aparecen.
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last  = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  async function loadData() {
    setLoading(true)
    const sb = getSupabase()
    const [segRes, compRes, docRes, logRes, tareasRes] = await Promise.all([
      sb.from('seguimientos').select('*').eq('prioridad_id', prioridad.n).order('created_at', { ascending: false }),
      sb.from('seguimiento_compromisos').select('*').eq('prioridad_id', prioridad.n).order('created_at', { ascending: true }),
      sb.from('documentos_prioridad').select('*').eq('prioridad_id', prioridad.n).order('created_at', { ascending: false }),
      sb.from('semaforo_log').select('*').eq('prioridad_id', prioridad.n).order('created_at', { ascending: true }),
      sb.from('tareas').select('*').eq('prioridad_id', prioridad.n).order('fecha_termino', { ascending: true, nullsFirst: false }),
    ])
    setSeguimientos((segRes.data ?? []) as Seguimiento[])
    setSeguimientoCompromisos((compRes.data ?? []) as SeguimientoCompromiso[])
    setDocumentos((docRes.data ?? []) as Documento[])
    setSemaforoLog((logRes.data ?? []) as SemaforoLog[])
    setTareas((tareasRes.data ?? []) as Tarea[])

    // Constancia de tratamiento en Gabinete (v2). Query aislada y tolerante a
    // error: si gabinete_tema_iniciativas no existe aún (pre-migración) o RLS la
    // bloquea (viewer), `data` viene null y la constancia queda vacía — nunca
    // rompe la ficha. Vínculo por prioridad.id (llave estable), NO por n.
    type GabRow = { tema: { sesion: { numero: number | null; fecha: string; estado: string; instancia: string } | null } | null }
    const { data: gabData } = await sb
      .from('gabinete_tema_iniciativas')
      .select('tema:gabinete_temas(sesion:eje_sesiones(numero, fecha, estado, instancia))')
      .eq('prioridad_id', prioridad.id)
    const tratado = new Map<number, { numero: number; fecha: string }>()
    for (const r of (gabData ?? []) as unknown as GabRow[]) {
      const s = r.tema?.sesion
      if (s && s.estado === 'cerrada' && s.instancia === 'gabinete' && s.numero != null) {
        tratado.set(s.numero, { numero: s.numero, fecha: s.fecha })
      }
    }
    setGabineteTratado([...tratado.values()].sort((a, b) => a.numero - b.numero))

    // Sesiones de Gabinete/Infraestructura con esta iniciativa en la agenda
    // (sesion_iniciativas — solo esas dos instancias la usan; los demás
    // comités no vinculan iniciativas puntuales). Tolerante al mismo criterio
    // que gabineteTratado arriba.
    type TratadaRow = { sesion: EjeSesion | null }
    const { data: tratadaData } = await sb
      .from('sesion_iniciativas')
      .select('sesion:eje_sesiones(*)')
      .eq('prioridad_id', prioridad.id)
    setSesionesTratada(
      ((tratadaData ?? []) as unknown as TratadaRow[])
        .map(r => r.sesion)
        .filter((s): s is EjeSesion => !!s)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    )

    setLoading(false)
  }

  /** Persiste el % avance que el usuario ajustó manualmente. El % de avance
   *  es siempre manual — no se recalcula ni se pisa automáticamente al
   *  reabrir el modal. */
  async function commitPctAvance(newPct: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(newPct)))
    const prevPct = prioridad.pct_avance ?? 0
    if (clamped === prevPct) return
    setSavingPct(true)
    const sb = getSupabase()
    const { data: { session } } = await sb.auth.getSession()
    try {
      await safeWrite(
        sb.from('prioridades_territoriales').update({ pct_avance: clamped }).eq('id', prioridad.id),
        `pct_avance n=${prioridad.n}`,
      )
      await logSemaforoChange(prioridad.n, 'pct_avance', prevPct, clamped, session?.user?.email ?? null)
      onUpdatePrioridad(prioridad.n, { pct_avance: clamped })
    } catch (err) {
      setPctAvance(prevPct)
      window.alert((err as Error).message)
    } finally {
      setSavingPct(false)
    }
  }

  async function handleSaveSemaforo(newSem: SemaforoKey) {
    const anterior = semaforo
    setSemaforo(newSem)
    setSavingSem(true)
    const sb = getSupabase()
    const { data: { session } } = await sb.auth.getSession()
    try {
      await safeWrite(
        sb.from('prioridades_territoriales').update({ estado_semaforo: newSem }).eq('id', prioridad.id),
        `estado_semaforo n=${prioridad.n}`,
      )
      await logSemaforoChange(prioridad.n, 'semaforo', anterior, newSem, session?.user?.email ?? null)
      onUpdatePrioridad(prioridad.n, { estado_semaforo: newSem })
    } catch (err) {
      setSemaforo(anterior)
      window.alert((err as Error).message)
    } finally {
      setSavingSem(false)
    }
  }

  // Mapeo estado de un "avance" (Seguimiento) → semáforo de la iniciativa.
  // bloqueado→rojo, pendiente→ámbar, en_curso/completado→verde — calca los
  // labels ya vigentes (Avanzando/Pendiente/Frenado). Reusa handleSaveSemaforo
  // (mismo UPDATE + audit log que el selector manual del header).
  const ESTADO_AVANCE_A_SEMAFORO: Record<string, SemaforoKey> = {
    bloqueado: 'rojo', pendiente: 'ambar', en_curso: 'verde', completado: 'verde',
  }
  function handleAvanceEstadoChange(estado: string) {
    const next = ESTADO_AVANCE_A_SEMAFORO[estado]
    if (!next || next === semaforo) return
    handleSaveSemaforo(next)
  }

  async function saveMetaField(field: string, value: string) {
    setSavingField(true)
    const patch: Record<string, string | null> = { [field]: value || null }
    if (field === 'proximo_hito') patch.fecha_proximo_hito = fechaProximoHito || null
    if (field === 'fecha_proximo_hito') patch.proximo_hito = proximoHito || null
    try {
      await safeWrite(
        getSupabase().from('prioridades_territoriales').update(patch).eq('id', prioridad.id),
        `meta ${field} n=${prioridad.n}`,
      )
      onUpdatePrioridad(prioridad.n, patch as Partial<Iniciativa>)
      setEditingField(null)
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSavingField(false)
    }
  }

  async function saveMinisterios(next: string[]) {
    const prev = ministerios
    setSavingMinisterio(true)
    setMinisterios(next)
    const joined = joinMinisterios(next)
    try {
      await safeWrite(
        getSupabase().from('prioridades_territoriales').update({ ministerio: joined }).eq('id', prioridad.id),
        `ministerio n=${prioridad.n}`,
      )
      onUpdatePrioridad(prioridad.n, { ministerio: joined })
    } catch (err) {
      setMinisterios(prev)
      window.alert((err as Error).message)
    } finally {
      setSavingMinisterio(false)
    }
  }

  // Tags: dedup case-sensitive + trim antes de persistir. Array vacío es
  // válido (borra todos los tags) — solo admin/editor llega acá.
  async function saveTags(next: string[]) {
    const cleaned = Array.from(new Set(next.map(t => t.trim()).filter(Boolean)))
    const prev = tagsLocal
    setSavingTags(true)
    setTagsLocal(cleaned)
    try {
      await safeWrite(
        getSupabase().from('prioridades_territoriales').update({ tags: cleaned }).eq('id', prioridad.id),
        `tags n=${prioridad.n}`,
      )
      onUpdatePrioridad(prioridad.n, { tags: cleaned })
    } catch (err) {
      setTagsLocal(prev)
      window.alert((err as Error).message)
    } finally {
      setSavingTags(false)
    }
  }

  function commitTagDraft() {
    const v = tagDraft.trim()
    if (!v) { setTagDraft(''); return }
    if (tagsLocal.includes(v)) { setTagDraft(''); return }
    saveTags([...tagsLocal, v])
    setTagDraft('')
  }

  // Comunas: dedup + `comuna` (texto) recompuesto como espejo de los nombres
  // elegidos + `alcance_regional` recalculado — mismos tres campos que escribe
  // el importador (lib/importParser.ts), mismo criterio (vacío = regional).
  async function saveComunas(nextCods: number[]) {
    const cleaned = Array.from(new Set(nextCods))
    const prev = comunaCodsLocal
    const comunaTexto = cleaned.map(c => comunaNombre(c)).filter((n): n is string => !!n).join('; ')
    setSavingComunas(true)
    setComunaCodsLocal(cleaned)
    try {
      await safeWrite(
        getSupabase().from('prioridades_territoriales').update({
          comuna_cods: cleaned,
          comuna: comunaTexto || null,
          alcance_regional: cleaned.length === 0,
        }).eq('id', prioridad.id),
        `comuna_cods n=${prioridad.n}`,
      )
      onUpdatePrioridad(prioridad.n, { comuna_cods: cleaned, comuna: comunaTexto || null, alcance_regional: cleaned.length === 0 })
    } catch (err) {
      setComunaCodsLocal(prev)
      window.alert((err as Error).message)
    } finally {
      setSavingComunas(false)
    }
  }

  async function handleToggleFoco() {
    const next = !enFoco
    setSavingFoco(true)
    setEnFoco(next)
    onUpdatePrioridad(prioridad.n, { en_foco: next })
    const { data, error } = await getSupabase()
      .from('prioridades_territoriales')
      .update({ en_foco: next })
      .eq('id', prioridad.id)
      .select('n, en_foco')
    const failed = !!error || !data || data.length === 0
    if (failed) {
      setEnFoco(!next)
      onUpdatePrioridad(prioridad.n, { en_foco: !next })
      const msg = error
        ? `Error guardando foco: ${error.message}`
        : 'No se pudo guardar el foco (0 filas actualizadas — probable RLS / permisos).'
      console.error('[ProjectTrackerModal] handleToggleFoco:', { n: prioridad.n, next, error, data })
      window.alert(msg)
    } else {
      console.log('[ProjectTrackerModal] Foco guardado:', data)
    }
    setSavingFoco(false)
  }

  // Toggle "Marcar/Quitar desalojo" — admin only. A diferencia de en_foco,
  // este NO va via getSupabase().update() porque la RLS de la tabla principal
  // permite el UPDATE a cualquier autenticado. La validación admin vive en
  // la API route, que además mantiene el side-effect de crear la fila de
  // desalojo_detalle (eager init) y registrar en desalojo_log.
  async function handleToggleDesalojo() {
    const next = !esDesalojo
    setSavingDesalojo(true)
    setEsDesalojo(next)
    onUpdatePrioridad(prioridad.n, { es_desalojo: next })
    try {
      const res  = await fetch(`/api/desalojos/${prioridad.n}/toggle`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ es_desalojo: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEsDesalojo(!next)
        onUpdatePrioridad(prioridad.n, { es_desalojo: !next })
        const msg = json?.error || `Error guardando desalojo (HTTP ${res.status})`
        console.error('[ProjectTrackerModal] handleToggleDesalojo:', { n: prioridad.n, next, json })
        window.alert(msg)
      }
    } catch (err) {
      setEsDesalojo(!next)
      onUpdatePrioridad(prioridad.n, { es_desalojo: !next })
      console.error('[ProjectTrackerModal] handleToggleDesalojo network:', err)
      window.alert(`Error de red al guardar: ${String(err)}`)
    }
    setSavingDesalojo(false)
  }

  // Capa de importancia (migración 024). Solo admin/editor edita — el trigger
  // 023 bloquea el UPDATE si lo intenta un regional/viewer. La columna `capa`
  // NO está en la whitelist de la migración 023, intencional.
  async function handleSetCapa(next: Capa) {
    if (next === capaLocal) return
    const prev = capaLocal
    setSavingCapa(true)
    setCapaLocal(next)
    onUpdatePrioridad(prioridad.n, { capa: next })
    try {
      await safeWrite(
        getSupabase().from('prioridades_territoriales').update({ capa: next }).eq('id', prioridad.id).select('id, capa'),
        `capa n=${prioridad.n}`,
      )
    } catch (err) {
      setCapaLocal(prev)
      onUpdatePrioridad(prioridad.n, { capa: prev })
      window.alert((err as Error).message)
    }
    setSavingCapa(false)
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

  // ── Enter/leave del modal (Fase 4b) ──────────────────────────────────────────
  // Al montar, el backdrop hace fade y el panel entra con opacity+scale; al cerrar
  // se reproduce la salida (~150ms, ~75% del enter) antes de desmontar (el padre
  // quita `selected`). reduced-motion: la regla global de la Fase 1 colapsa las
  // transiciones a instantáneo, así que degrada a aparición/desaparición seca.
  const [entered, setEntered] = useState(false)
  const closingRef = useRef(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  function requestClose() {
    if (closingRef.current) return
    closingRef.current = true
    setEntered(false)
    window.setTimeout(onClose, 150)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={requestClose}>
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-150 ${entered ? 'opacity-100' : 'opacity-0'}`} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={nombreLocal}
        onKeyDown={handleDialogKeyDown}
        className={`relative w-full max-w-[min(72rem,95vw)] max-h-[95vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ejeColor}`}>
                  {ejeDisplay}
                </span>
              </div>
              {editingNombre && canEditAny ? (
                <input
                  autoFocus
                  value={nombreLocal}
                  disabled={savingNombre}
                  onChange={e => setNombreLocal(e.target.value)}
                  onBlur={async () => {
                    const val = nombreLocal.trim()
                    setEditingNombre(false)
                    if (!val || val === prioridad.nombre) {
                      setNombreLocal(prioridad.nombre)
                      return
                    }
                    setSavingNombre(true)
                    try {
                      await safeWrite(
                        getSupabase().from('prioridades_territoriales').update({ nombre: val }).eq('id', prioridad.id),
                        `nombre n=${prioridad.n}`,
                      )
                      onUpdatePrioridad(prioridad.n, { nombre: val })
                    } catch (err) {
                      setNombreLocal(prioridad.nombre)
                      window.alert((err as Error).message)
                    } finally {
                      setSavingNombre(false)
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur() }
                    if (e.key === 'Escape') { setNombreLocal(prioridad.nombre); setEditingNombre(false) }
                  }}
                  className="text-base font-semibold text-gray-900 leading-snug w-full rounded px-1 -mx-1 bg-white ring-1 ring-blue-300 focus:ring-blue-500 focus:outline-none"
                />
              ) : (
                <p
                  onClick={() => canEditAny && setEditingNombre(true)}
                  title={canEditAny ? 'Click para editar el nombre' : undefined}
                  className={`text-base font-semibold text-gray-900 leading-snug ${canEditAny ? 'cursor-text hover:bg-gray-50 rounded px-1 -mx-1' : ''}`}
                >
                  {nombreLocal}
                </p>
              )}
              {editingDescripcion && canEditAny ? (
                <textarea
                  autoFocus
                  rows={2}
                  value={descripcionLocal}
                  disabled={savingDescripcion}
                  onChange={e => setDescripcionLocal(e.target.value)}
                  onBlur={async () => {
                    const val = descripcionLocal.trim()
                    setEditingDescripcion(false)
                    if (val === (prioridad.descripcion ?? '')) return
                    setSavingDescripcion(true)
                    try {
                      await safeWrite(
                        getSupabase().from('prioridades_territoriales').update({ descripcion: val || null }).eq('id', prioridad.id),
                        `descripcion n=${prioridad.n}`,
                      )
                      onUpdatePrioridad(prioridad.n, { descripcion: val || null })
                    } catch (err) {
                      setDescripcionLocal(prioridad.descripcion ?? '')
                      window.alert((err as Error).message)
                    } finally {
                      setSavingDescripcion(false)
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setDescripcionLocal(prioridad.descripcion ?? ''); setEditingDescripcion(false) }
                  }}
                  className="text-xs text-gray-700 leading-relaxed mt-1 w-full rounded px-1 -mx-1 bg-white ring-1 ring-blue-300 focus:ring-blue-500 focus:outline-none resize-none"
                />
              ) : (
                <div>
                  <p
                    ref={descripcionRef}
                    onClick={() => canEditAny && setEditingDescripcion(true)}
                    title={canEditAny ? 'Click para editar la descripción' : undefined}
                    className={`text-xs leading-relaxed mt-1 ${descripcionExpanded ? '' : 'line-clamp-2'} ${canEditAny ? 'cursor-text hover:bg-gray-50 rounded px-1 -mx-1' : ''} ${descripcionLocal ? 'text-gray-500' : 'text-gray-300 italic'}`}
                  >
                    {descripcionLocal || (canEditAny ? 'Sin descripción — click para agregar' : 'Sin descripción')}
                  </p>
                  {descripcionOverflow && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setDescripcionExpanded(v => !v) }}
                      className="text-[10px] text-slate-500 hover:text-slate-800 font-medium px-1"
                    >
                      {descripcionExpanded ? 'Ver menos' : 'Ver más...'}
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 flex-wrap">
                <span>{prioridad.region}</span>
                <span>·</span>
                <div className="relative" ref={comunasPopoverRef}>
                  <button
                    type="button"
                    onClick={() => canEdit && setEditingComunas(v => !v)}
                    title={canEdit ? 'Click para modificar comunas' : undefined}
                    className={canEdit ? 'hover:text-slate-700 hover:underline underline-offset-2' : ''}
                  >
                    {comunaCodsLocal.length > 0
                      ? comunaCodsLocal.map(c => comunaNombre(c) ?? c).join(', ')
                      : (prioridad.alcance_regional ? 'Alcance regional' : 'Sin comuna')}
                  </button>
                  {canEdit && editingComunas && (
                    <div className={`absolute z-10 top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 space-y-1.5 ${savingComunas ? 'opacity-50 pointer-events-none' : ''}`}>
                      {comunaCodsLocal.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {comunaCodsLocal.map(cut => (
                            <span
                              key={cut}
                              className="text-xs bg-gray-50 text-gray-700 pl-2 pr-1 py-0.5 rounded-md border border-gray-200 flex items-center gap-1"
                            >
                              {comunaNombre(cut) ?? cut}
                              <button
                                onClick={() => saveComunas(comunaCodsLocal.filter(c => c !== cut))}
                                className="text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center w-4 h-4 rounded hover:bg-red-50"
                                title={`Quitar ${comunaNombre(cut) ?? cut}`}
                              >
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M1 1l6 6M7 1L1 7"/>
                                </svg>
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <input
                        type="text"
                        autoFocus
                        value={comunaQuery}
                        onChange={e => setComunaQuery(e.target.value)}
                        placeholder="Buscar comuna…"
                        className="w-full text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-700 placeholder-gray-400 outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-200"
                      />
                      {comunaQuery.trim() && (() => {
                        const q = normalizeComunaText(comunaQuery.trim())
                        const sugerencias = comunasDeRegion(prioridad.cod)
                          .filter(c => normalizeComunaText(c.nombre).includes(q) && !comunaCodsLocal.includes(c.cut))
                        return (
                          <div className="max-h-40 overflow-y-auto border-t border-gray-100 pt-1">
                            {sugerencias.length === 0 ? (
                              <p className="text-xs text-gray-400 px-1 py-1">Sin coincidencias en {prioridad.region}</p>
                            ) : (
                              sugerencias.map(c => (
                                <button
                                  key={c.cut}
                                  type="button"
                                  onClick={() => { saveComunas([...comunaCodsLocal, c.cut]); setComunaQuery('') }}
                                  className="block w-full text-left text-xs px-1.5 py-1 rounded text-gray-700 hover:bg-gray-50 truncate"
                                >
                                  {c.nombre}
                                </button>
                              ))
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Capa de importancia (migración 024). Segmented control
                  visible solo para admin/editor. Regional/viewer ve el badge
                  read-only (si no es 'lll'). Convive con "En foco" — capa es
                  permanente y centralizada, foco es ciclo y editable por todos. */}
              {canEditAny ? (
                <div className="inline-flex items-center rounded-md ring-1 ring-gray-200 bg-white overflow-hidden" title="Nivel de importancia (Capa)">
                  {(['l','ll','lll'] as Capa[]).map(v => {
                    const active = capaLocal === v
                    // Escala sobria "neutro con acento": vino como acento solo en
                    // Capa I, slate en II/III. Fill en el segmento activo para que
                    // se distinga del inactivo (ver CapaBadge para el badge).
                    const activeBg = v === 'l'
                      ? 'bg-wine/10 text-wine'
                      : v === 'll'
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-slate-100 text-slate-500'
                    const label = v === 'l' ? 'I' : v === 'll' ? 'II' : 'III'
                    return (
                      <button
                        key={v}
                        onClick={() => handleSetCapa(v)}
                        disabled={savingCapa}
                        className={`px-2 py-1 text-[11px] font-semibold tracking-wide transition-colors disabled:opacity-50 ${active ? activeBg : 'text-gray-400 hover:bg-gray-50'}`}
                        title={`Capa ${label}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <CapaBadge value={capaLocal} size="md" hideDefault />
              )}
              {/* Marcar/quitar foco es transversal: cualquier usuario autenticado
                  (incluyendo regional/viewer) puede priorizar iniciativas para
                  su seguimiento. Va directo a BD via cliente — RLS authenticated_write
                  permite el UPDATE. Mantener consistencia con Kanban y Bandeja. */}
              <button
                onClick={handleToggleFoco}
                disabled={savingFoco}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] disabled:opacity-50 ring-1 ${
                  enFoco
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 ring-amber-200'
                    : 'text-gray-500 hover:bg-gray-100 ring-gray-200'
                }`}
                title={enFoco ? 'Quitar del foco' : 'Marcar en foco'}
              >
                <FlagIcon filled={enFoco} className="w-3.5 h-3.5 transition-colors duration-150" />
                {enFoco ? 'En foco' : 'Marcar foco'}
              </button>
              <button ref={closeBtnRef} onClick={requestClose} aria-label="Cerrar ficha" className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l12 12M16 4L4 16"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Ministerio, Etiquetas y Semáforo/Avance quedan siempre visibles —
              solo la grilla de metadata (Responsable en adelante) es colapsable.
              Al minimizar, el contenido de abajo (Seguimiento/Tareas/…) gana espacio. */}
          {/* Ministerio — multi-select editable */}
          <div className={`flex flex-wrap items-center gap-1.5 mb-3 ${savingMinisterio ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="text-xs text-gray-400">Ministerio:</span>
            {ministerios.length === 0 && (
              <span className="text-xs text-gray-400 italic">Sin asignar</span>
            )}
            {ministerios.map(m => (
              <span
                key={m}
                className="text-xs bg-gray-50 text-gray-700 pl-2 pr-1 py-0.5 rounded-md border border-gray-200 flex items-center gap-1"
              >
                {m}
                {canEdit && (
                  <button
                    onClick={() => saveMinisterios(ministerios.filter(x => x !== m))}
                    className="text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center w-4 h-4 rounded hover:bg-red-50"
                    title={`Quitar ${m}`}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 1l6 6M7 1L1 7"/>
                    </svg>
                  </button>
                )}
              </span>
            ))}
            {canEdit && (
              <label className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-gray-300 text-xs text-gray-500 hover:bg-gray-50 hover:border-gray-400 cursor-pointer transition-colors">
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 1v8M1 5h8"/>
                </svg>
                <span>Agregar</span>
                <select
                  value=""
                  onChange={e => {
                    if (e.target.value) saveMinisterios([...ministerios, e.target.value])
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                >
                  <option value="">—</option>
                  {MINISTERIOS_CANONICOS.filter(m => !ministerios.includes(m)).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Etiquetas — multi-valor libre. Admin/editor edita en línea (input
              + Enter / coma). Regional solo lee con nota explicativa. Coma o
              Enter dispara commit; Backspace en input vacío quita el último. */}
          <div className={`flex flex-wrap items-center gap-1.5 mb-3 ${savingTags ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="text-xs text-gray-400">Etiquetas:</span>
            {tagsLocal.length === 0 && !esDesalojo && (
              <span className="text-xs text-gray-400 italic">Sin etiquetas</span>
            )}
            {/* Desalojo — mismo diseño de chip que una etiqueta cualquiera,
                pero en negro para diferenciarla: es un flag admin-only real
                (es_desalojo), no un tag del array `tags`. Lo que significa un
                desalojo y cómo se gestiona (desalojo_detalle, Mesa
                Interministerial) no cambia — solo cambió dónde se selecciona. */}
            {esDesalojo && (
              <span className="text-xs bg-slate-900 text-white pl-2 pr-1 py-0.5 rounded-md flex items-center gap-1">
                <HomeIcon filled className="w-3 h-3" />
                Desalojo
                {isAdmin && (
                  <button
                    onClick={handleToggleDesalojo}
                    disabled={savingDesalojo}
                    className="text-slate-300 hover:text-white transition-colors flex items-center justify-center w-4 h-4 rounded hover:bg-white/10"
                    title="Quitar marca de desalojo"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 1l6 6M7 1L1 7"/>
                    </svg>
                  </button>
                )}
              </span>
            )}
            {tagsLocal.map(t => {
              const funcional = etiquetasFuncionales.has(t)
              const c = funcional ? tagColor(t) : { bg: 'bg-gray-50', text: 'text-gray-700' }
              return (
                <span
                  key={t}
                  className={`text-xs ${c.bg} ${c.text} pl-2 pr-1 py-0.5 rounded-md flex items-center gap-1 ${funcional ? '' : 'border border-gray-200'}`}
                >
                  {t}
                  {canEdit && (
                    <button
                      onClick={() => saveTags(tagsLocal.filter(x => x !== t))}
                      className="text-current opacity-50 hover:opacity-100 transition-opacity flex items-center justify-center w-4 h-4 rounded hover:bg-black/10"
                      title={`Quitar ${t}`}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 1l6 6M7 1L1 7"/>
                      </svg>
                    </button>
                  )}
                </span>
              )
            })}
            {canEdit ? (
              <div className="relative">
                <input
                type="text"
                value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onKeyDown={e => {
                  // Enter o ; comitean el draft. La coma deja de ser separador
                  // porque tags pueden contener comas dentro (ej: "Salud,
                  // bienestar"). Backspace en input vacío quita el último chip.
                  if (e.key === 'Enter' || e.key === ';') {
                    e.preventDefault()
                    commitTagDraft()
                  } else if (e.key === 'Backspace' && tagDraft === '' && tagsLocal.length > 0) {
                    saveTags(tagsLocal.slice(0, -1))
                  }
                }}
                onBlur={commitTagDraft}
                placeholder="+ etiqueta"
                className="text-xs px-2 py-0.5 rounded-md border border-dashed border-gray-300 text-gray-700 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 min-w-[100px]"
                />
                {tagDraft.trim() && (() => {
                  const q = tagDraft.trim().toLowerCase()
                  const sugerencias = universoEtiquetas
                    .filter(t => t.toLowerCase().includes(q) && !tagsLocal.includes(t))
                  // Desalojo aparece como sugerencia especial (admin-only, no
                  // viene del universo de tags) cuando el texto tipeado matchea.
                  const sugerirDesalojo = isAdmin && !esDesalojo && 'desalojo'.includes(q)
                  if (sugerencias.length === 0 && !sugerirDesalojo) return null
                  return (
                    <div className="absolute z-10 top-full left-0 mt-1 min-w-[160px] max-w-[260px] max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                      {sugerirDesalojo && (
                        <button
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault()
                            handleToggleDesalojo()
                            setTagDraft('')
                          }}
                          className="flex items-center gap-1.5 w-full text-left text-xs px-2.5 py-1.5 text-white bg-slate-900 hover:bg-slate-800 truncate"
                        >
                          <HomeIcon filled className="w-3 h-3" />
                          Desalojo
                        </button>
                      )}
                      {sugerencias.map(s => (
                        <button
                          key={s}
                          type="button"
                          // onMouseDown (no onClick) para que dispare antes del
                          // onBlur del input — si no, el blur comitea el texto
                          // tipeado como tag nuevo antes de que el click llegue.
                          onMouseDown={e => {
                            e.preventDefault()
                            saveTags([...tagsLocal, s])
                            setTagDraft('')
                          }}
                          className="block w-full text-left text-xs px-2.5 py-1.5 text-gray-700 hover:bg-gray-50 truncate"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>
            ) : (
              tagsLocal.length === 0 && !esDesalojo && (
                <span className="text-xs text-gray-400 italic">
                  Para agregar etiquetas, propónlo en tu carga semanal de Excel.
                </span>
              )
            )}
          </div>

          {/* Semáforo + % avance */}
          <div className="flex items-center gap-6 mb-3 py-2.5 px-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-600 mr-0.5">Estado</span>
              {(Object.keys(SEMAFORO_CONFIG) as SemaforoKey[]).map(s => (
                <button
                  key={s}
                  onClick={() => handleSaveSemaforo(s)}
                  disabled={savingSem || !canEditOperational}
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

            {/* % avance — editable arrastrando o tipeando. Auto-calcula desde
                hitos al abrir el modal; el ajuste manual queda hasta el
                próximo recálculo. */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs text-gray-600 flex-shrink-0">Avance</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={pctAvance}
                disabled={savingPct || !canEditOperational}
                onChange={e => setPctAvance(Number(e.target.value))}
                onMouseUp={e => commitPctAvance(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={e => commitPctAvance(Number((e.target as HTMLInputElement).value))}
                onKeyUp={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') commitPctAvance(Number((e.target as HTMLInputElement).value)) }}
                title={canEditOperational ? 'Arrastra para ajustar' : 'No tienes permiso para editar'}
                className="flex-1 h-1.5 rounded-full accent-slate-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={pctAvance}
                disabled={savingPct || !canEditOperational}
                onChange={e => setPctAvance(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                onBlur={e => commitPctAvance(Number(e.target.value))}
                className="w-12 text-xs text-right text-slate-800 border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <span className="text-xs text-gray-500 flex-shrink-0">%</span>
              {savingPct && <span className="text-xs text-gray-400 ml-1">…</span>}
            </div>

            {/* Único toggle de la metadata (Responsable en adelante) — Estado/
                Avance quedan siempre visibles junto con Ministerio y Etiquetas,
                así que este botón (acá, siempre a la vista) alcanza solo: sin
                texto, solo la flecha, apuntando hacia el lado que va a hacer. */}
            <button
              onClick={toggleDetail}
              className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
              title={detailCollapsed ? 'Mostrar el detalle' : 'Minimizar el detalle (más espacio abajo)'}
              aria-expanded={!detailCollapsed}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={detailCollapsed ? 'M5 8l5 5 5-5' : 'M5 12l5-5 5 5'}/>
              </svg>
            </button>
          </div>

          {!detailCollapsed && (
          <>
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-x-3 px-3 py-1 bg-gray-50 rounded-xl mb-2 text-xs">
          <div className="flex flex-col divide-y divide-gray-200/60">

            {/* Responsable */}
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-gray-400 w-36 flex-shrink-0">Responsable</span>
              <label className={`relative flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full bg-white border border-gray-200 transition-colors group w-44 ${canEditOperational ? 'cursor-pointer hover:bg-gray-50 hover:border-gray-300' : 'cursor-default'}`}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 flex-shrink-0">
                  <circle cx="5" cy="3.5" r="2"/>
                  <path d="M1 9c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5"/>
                </svg>
                <span className="text-xs font-medium text-gray-700 truncate flex-1">
                  {responsable
                    ? (usuarios.find(u => u.email === responsable)?.name ?? responsable)
                    : <span className="text-gray-400">Sin asignar</span>}
                </span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 opacity-50 group-hover:opacity-80 flex-shrink-0">
                  <path d="M1.5 3L4 5.5L6.5 3"/>
                </svg>
                <select
                  value={responsable}
                  disabled={!canEditOperational}
                  onChange={async e => {
                    const val = e.target.value
                    const prev = responsable
                    setResponsable(val)
                    try {
                      await safeWrite(
                        getSupabase().from('prioridades_territoriales').update({ responsable: val || null }).eq('id', prioridad.id),
                        `responsable n=${prioridad.n}`,
                      )
                      onUpdatePrioridad(prioridad.n, { responsable: val || null })
                    } catch (err) {
                      setResponsable(prev)
                      window.alert((err as Error).message)
                    }
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
              <label className={`relative flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full ${canEdit ? 'cursor-pointer hover:brightness-95' : 'cursor-default'} transition-all group w-44 ${
                etapaColor(etapaActual || null).bg
              } ${savingField ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className={`text-xs font-medium truncate flex-1 ${etapaColor(etapaActual || null).text}`}>{etapaActual || '—'}</span>
                {canEdit && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40 group-hover:opacity-70 text-gray-500">
                    <path d="M1.5 3L4 5.5L6.5 3"/>
                  </svg>
                )}
                <select
                  value={etapaActual}
                  disabled={!canEdit}
                  onChange={async e => {
                    if (!canEdit) return
                    setEtapaActual(e.target.value); await saveMetaField('etapa_actual', e.target.value)
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full disabled:cursor-default"
                >
                  <option value="">—</option>
                  {VALID_ETAPA.map(et => <option key={et}>{et}</option>)}
                </select>
              </label>
            </div>

            {/* Fuente de financiamiento */}
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-gray-400 w-36 flex-shrink-0">Fuente de financiamiento</span>
              <label className={`relative flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full ${canEdit ? 'cursor-pointer hover:bg-slate-200' : 'cursor-default'} transition-colors group bg-slate-100 w-44 ${savingField ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className="text-xs font-medium text-slate-700 truncate flex-1">{fuenteFinanciamiento || '—'}</span>
                {canEdit && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40 group-hover:opacity-70 text-slate-500">
                    <path d="M1.5 3L4 5.5L6.5 3"/>
                  </svg>
                )}
                <select
                  value={fuenteFinanciamiento}
                  disabled={!canEdit}
                  onChange={async e => {
                    if (!canEdit) return
                    setFuenteFinanciamiento(e.target.value); await saveMetaField('fuente_financiamiento', e.target.value)
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full disabled:cursor-default"
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
                <div className="flex flex-col flex-1 gap-1.5">
                  <select
                    value={proximoHito}
                    onChange={e => setProximoHito(e.target.value)}
                    className="w-full text-xs text-gray-700 border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                    autoFocus
                  >
                    <option value="">—</option>
                    {VALID_PROXIMO_HITO.map(h => <option key={h}>{h}</option>)}
                  </select>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={fechaProximoHito}
                      onChange={e => setFechaProximoHito(e.target.value)}
                      className="flex-1 text-xs text-gray-700 border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                    <button
                      onClick={() => saveMetaField('proximo_hito', proximoHito)}
                      disabled={savingField}
                      className="text-xs px-2 py-0.5 bg-violet-700 text-white rounded hover:bg-violet-800 disabled:opacity-50 flex-shrink-0"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => { setEditingField(null); setProximoHito(prioridad.proximo_hito ?? ''); setFechaProximoHito(prioridad.fecha_proximo_hito ?? '') }}
                      className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => canEdit && setEditingField('proximo_hito')}
                    className="flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors group cursor-pointer w-44"
                  >
                    <span className="text-xs font-medium text-slate-700 flex-1 truncate">
                      {proximoHito || <span className="text-slate-400">Agregar hito...</span>}
                    </span>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40 group-hover:opacity-70 text-slate-500">
                      <path d="M1.5 3L4 5.5L6.5 3"/>
                    </svg>
                  </button>
                  {fechaProximoHito && (
                    <button
                      onClick={() => canEdit && setEditingField('proximo_hito')}
                      className={`inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full bg-gray-100 transition-colors ${canEdit ? 'hover:bg-gray-200 cursor-pointer' : 'cursor-default'}`}
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
              <label className={`relative flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full cursor-pointer hover:brightness-95 transition-all group w-44 ${
                estadoTerminoGob === 'En Operación' || estadoTerminoGob === 'Terminado' ? 'bg-green-100' :
                estadoTerminoGob === 'En ejecución'  ? 'bg-blue-100'   :
                estadoTerminoGob === 'En diseño'     ? 'bg-violet-100' :
                estadoTerminoGob === 'En licitación' || estadoTerminoGob === 'En preinversión' ? 'bg-orange-100' :
                estadoTerminoGob === 'Sin iniciar'   ? 'bg-gray-100'   : 'bg-gray-100'
              } ${savingField ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className={`text-xs font-medium truncate flex-1 ${
                  estadoTerminoGob === 'En Operación' || estadoTerminoGob === 'Terminado' ? 'text-green-700' :
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
                  disabled={!canEdit}
                  onChange={async e => {
                    if (!canEdit) return
                    setEstadoTerminoGob(e.target.value)
                    await saveMetaField('estado_termino_gobierno', e.target.value)
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full disabled:cursor-default"
                >
                  <option value="">—</option>
                  <option>Sin iniciar</option>
                  <option>En preinversión</option>
                  <option>En diseño</option>
                  <option>En licitación</option>
                  <option>En ejecución</option>
                  <option>En Operación</option>
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
                      try {
                        await safeWrite(
                          getSupabase().from('prioridades_territoriales').update({ inversion_mm: val }).eq('id', prioridad.id),
                          `inversion_mm n=${prioridad.n}`,
                        )
                        onUpdatePrioridad(prioridad.n, { inversion_mm: val })
                        setEditingField(null)
                      } catch (err) {
                        window.alert((err as Error).message)
                      } finally {
                        setSavingField(false)
                      }
                    }}
                    disabled={savingField}
                    className="text-xs px-2 py-0.5 bg-violet-700 text-white rounded hover:bg-violet-800 disabled:opacity-50"
                  >Guardar</button>
                  <button
                    onClick={() => { setEditingField(null); setInversionMm(prioridad.inversion_mm != null ? String(prioridad.inversion_mm) : '') }}
                    className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => canEdit && setEditingField('inversion_mm')}
                  className="flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors group cursor-pointer w-44"
                >
                  <span className={`text-xs font-medium flex-1 truncate ${inversionMm ? 'text-slate-700' : 'text-slate-400'}`}>
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
                    className="text-xs px-2 py-0.5 bg-violet-700 text-white rounded hover:bg-violet-800 disabled:opacity-50"
                  >Guardar</button>
                  <button
                    onClick={() => { setEditingField(null); setCodigoBip(prioridad.codigo_bip ?? '') }}
                    className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => canEdit && setEditingField('codigo_bip')}
                  className="flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors group cursor-pointer w-44"
                >
                  <span className={`text-xs font-medium font-mono flex-1 truncate ${codigoBip ? 'text-slate-700' : 'text-slate-400'}`}>
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
              <label className={`relative flex items-center gap-1.5 pl-2.5 pr-2 py-0.5 rounded-full cursor-pointer hover:brightness-95 transition-all group w-44 ${
                ['FI','IN','RS','RE','OT','AD','CF'].includes(rat) ? 'bg-green-100'  :
                rat === 'En Tramitación'                            ? 'bg-orange-100' : 'bg-gray-100'
              } ${savingField ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className={`text-xs font-medium truncate flex-1 ${
                  ['FI','IN','RS','RE','OT','AD','CF'].includes(rat) ? 'text-green-700'  :
                  rat === 'En Tramitación'                            ? 'text-orange-700' : 'text-gray-400'
                }`}>{rat && rat !== 'No Requiere' && rat !== 'No Ingresado' ? rat : '—'}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40 group-hover:opacity-70 text-gray-500">
                  <path d="M1.5 3L4 5.5L6.5 3"/>
                </svg>
                <select
                  value={rat}
                  disabled={!canEdit}
                  onChange={async e => {
                    if (!canEdit) return
                    setRat(e.target.value)
                    await saveMetaField('rat', e.target.value)
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full disabled:cursor-default"
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
                  <option>AD</option>
                  <option>CF</option>
                </select>
              </label>
            </div>
          </div>{/* end right col */}
          </div>{/* end metadata grid */}
          </>
          )}

          {/* Tabs */}
          <div className="flex mt-1">
            {(['seguimiento', 'tareas', 'historial', 'calendario', 'documentos'] as Tab[]).map(t => {
              const label =
                t === 'seguimiento' ? `Seguimiento${seguimientos.length ? ` (${seguimientos.length})` : ''}` :
                t === 'tareas'      ? `Planificación${tareas.length ? ` (${tareas.length})` : ''}` :
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
            <>
              {gabineteTratado.length > 0 && (
                <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-100">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Tratado en Gabinete Regional</span>
                  {gabineteTratado.map(g => (
                    <span key={g.numero} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-800 bg-white border border-violet-200 rounded-full px-2 py-0.5">
                      N° {g.numero}
                      <span className="text-violet-400 font-normal">· {new Date(g.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </span>
                  ))}
                </div>
              )}
              <SeguimientoTab
                prioridadId={prioridad.n}
                prioridadIdEstable={prioridad.id}
                nombreIniciativa={prioridad.nombre}
                regionCod={prioridad.cod}
                seguimientos={seguimientos}
                compromisos={seguimientoCompromisos}
                usuarios={usuarios}
                onRefresh={loadData}
                onAvanceEstadoChange={handleAvanceEstadoChange}
                canCreate={!!currentUserEmail}
                canDeleteAny={canEditAny}
                currentUserEmail={currentUserEmail}
              />
            </>
          ) : tab === 'tareas' ? (
            <TareasTab
              prioridadId={prioridad.n}
              nombreIniciativa={prioridad.nombre}
              tareas={tareas}
              usuarios={usuarios}
              usuariosRegion={usuariosRegion}
              onRefresh={loadData}
              canCreate={!!currentUserEmail}
              canDeleteAny={canEditAny}
              currentUserEmail={currentUserEmail}
            />
          ) : tab === 'historial' ? (
            <HistorialTab seguimientos={seguimientos} semaforoLog={semaforoLog} semaforo={semaforo} pctAvance={pctAvance} />
          ) : tab === 'calendario' ? (
            <CalendarioTab
              seguimientos={seguimientos}
              tareas={tareas}
              usuarios={usuarios}
              fechaProximoHito={fechaProximoHito || null}
              proximoHitoTexto={proximoHito || null}
              comites={sesionesTratada.map(s => ({
                sesion: s,
                titulo: s.instancia === 'gabinete'
                  ? (regionConfigTags?.gabinete_nombre || 'Gabinete Regional')
                  : (regionConfigTags?.infraestructura_nombre || 'Comité de Infraestructura'),
              }))}
              onSelectSesion={setSelectedSesionTratada}
            />
          ) : (
            <DocumentosTab
              prioridadId={prioridad.n}
              documentos={documentos}
              onRefresh={loadData}
              canCreate={!!currentUserEmail}
              canDeleteAny={canEditAny}
              currentUserEmail={currentUserEmail}
            />
          )}
        </div>

        {/* ── Footer: eliminar iniciativa (esquina inferior derecha) ── */}
        {canEditAny && onDeletePrioridad && (
          <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-2 flex items-center justify-end">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 transition-colors"
                title="Eliminar iniciativa"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h14M8 6V4h4v2M19 6l-1 12H2L1 6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Eliminar iniciativa
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-medium">¿Eliminar esta iniciativa?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs px-2.5 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleting ? '…' : 'Sí, eliminar'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Historial de una sesión puntual (deep-link desde el tab Calendario) ── */}
      {region && selectedSesionTratada?.instancia === 'gabinete' && (
        <HistorialSesionesModal
          region={region}
          instancia="gabinete"
          eje={null}
          nombreInstancia={regionConfigTags?.gabinete_nombre || 'Gabinete Regional'}
          initialSesionId={selectedSesionTratada.id}
          onClose={() => setSelectedSesionTratada(null)}
        />
      )}
      {region && selectedSesionTratada?.instancia === 'infraestructura' && (
        <HistorialSesionesModal
          region={region}
          instancia="infraestructura"
          eje={null}
          nombreInstancia={regionConfigTags?.infraestructura_nombre || 'Comité de Infraestructura'}
          initialSesionId={selectedSesionTratada.id}
          onClose={() => setSelectedSesionTratada(null)}
        />
      )}
    </div>
  )
}
