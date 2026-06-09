'use client'

import { useState, useMemo, useRef } from 'react'
import type { Iniciativa } from '@/lib/projects'
import { REGIONS } from '@/lib/regions'
import ProjectTrackerModal from './ProjectTrackerModal'
import * as XLSX from 'xlsx'
import { prioridadColor } from '@/lib/config'
import { useIsAdmin } from '@/lib/context/UserContext'
import { downloadTemplate as downloadTemplateExcel, buildPrefilledWorkbook, downloadPrefilled } from '@/lib/templateExcel'
import { parseImportWorkbook, buildImportPayload, type ParsedRow } from '@/lib/importParser'
import { getSupabase } from '@/lib/supabase'
import type { RegionEje } from '@/lib/types'
import { useRegionEjes } from '@/lib/hooks/useRegionEjes'
import { composeEjeLabel } from '@/lib/ejes'
import TagChips from './TagChips'

const SEMAFORO_CONFIG = {
  verde: { dot: 'bg-green-500', label: 'En verde',    badge: 'bg-green-50 text-green-700 ring-1 ring-green-200',  bar: 'bg-green-500'  },
  ambar: { dot: 'bg-amber-400', label: 'En revisión', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',  bar: 'bg-amber-400'  },
  rojo:  { dot: 'bg-red-500',   label: 'Bloqueadas',  badge: 'bg-red-50 text-red-700 ring-1 ring-red-200',        bar: 'bg-red-500'    },
  gris:  { dot: 'bg-gray-300',  label: 'Sin evaluar', badge: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',    bar: 'bg-gray-300'   },
} as const

const SEMAFORO_ORDER = { rojo: 0, ambar: 1, verde: 2, gris: 3 }

type SemaforoKey = keyof typeof SEMAFORO_CONFIG
type SortCol = 'n' | 'region' | 'eje' | 'ejeGobierno' | 'semaforo' | 'avance' | 'prioridad' | 'actividad'
type SortDir = 'asc' | 'desc'
type ColId = 'n' | 'estado' | 'iniciativa' | 'region' | 'ejeRegional' | 'ejeGobierno' | 'avance' | 'prioridad' | 'proximoHito' | 'estadoTermino' | 'inversion' | 'rat' | 'fuente' | 'responsable' | 'actividad' | 'tags'

const ALL_COLS: { id: ColId; label: string; defaultVisible: boolean }[] = [
  { id: 'n',             label: '#',                     defaultVisible: false },
  { id: 'estado',        label: 'Estado',                defaultVisible: true  },
  { id: 'iniciativa',    label: 'Iniciativa',            defaultVisible: true  },
  { id: 'region',        label: 'Región',                defaultVisible: true  },
  { id: 'ejeRegional',   label: 'Eje Regional',          defaultVisible: false },
  { id: 'ejeGobierno',   label: 'Eje Gobierno',          defaultVisible: false },
  { id: 'avance',        label: 'Avance',                defaultVisible: true  },
  { id: 'prioridad',     label: 'Prioridad',             defaultVisible: false },
  { id: 'proximoHito',   label: 'Próximo Hito',          defaultVisible: true  },
  { id: 'estadoTermino', label: 'Estado Término Gob.',   defaultVisible: false },
  { id: 'inversion',     label: 'Inversión',             defaultVisible: true  },
  { id: 'rat',           label: 'RAT',                   defaultVisible: false },
  { id: 'fuente',        label: 'Fuente Financiamiento', defaultVisible: false },
  { id: 'responsable',   label: 'Responsable',           defaultVisible: false },
  { id: 'actividad',     label: 'Actividad',             defaultVisible: true  },
  { id: 'tags',          label: 'Etiquetas',             defaultVisible: false },
]

const DEFAULT_COLS = new Set<ColId>(ALL_COLS.filter(c => c.defaultVisible).map(c => c.id))

type Props = {
  projects: Iniciativa[]
  actividad: Record<number, string | null>
  actividadLoading?: boolean
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
  onDeletePrioridad?: (n: number) => void
}

// ImportPreviewRow ahora vive en lib/importParser como ParsedRow (reusable
// client/server). El alias mantiene compatibilidad con los usos previos.
type ImportPreviewRow = ParsedRow

function diasSinActividad(lastIso: string | null | undefined): number | null {
  if (!lastIso) return null
  return Math.floor((Date.now() - new Date(lastIso).getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

function ratColor(r: string): string {
  if (['FI', 'IN', 'RS', 'RE', 'OT'].includes(r)) return 'bg-green-100 text-green-700'
  if (r === 'En Tramitación') return 'bg-orange-100 text-orange-700'
  return 'bg-gray-100 text-gray-500'
}

export default function NationalDashboard({ projects, actividad, actividadLoading = false, onUpdatePrioridad, onDeletePrioridad }: Props) {
  // Importar masivo es solo para admin. Editores/regionales/viewers no tienen
  // este botón — los regionales/viewers usan el flow de propuesta desde "Mi región".
  const canImport = useIsAdmin()
  const [search, setSearch]                   = useState('')
  const [filterRegion, setFilterRegion]       = useState('todas')
  const [filterEje, setFilterEje]             = useState('todos')
  const [filterSemaforo, setFilterSemaforo]   = useState<Set<SemaforoKey>>(new Set())
  const [filterPrioridad, setFilterPrioridad] = useState<Set<'Alta' | 'Media' | 'Baja'>>(new Set())
  const [filterEjeGobierno, setFilterEjeGobierno] = useState('todos')
  // Multi-tag filter: OR lógico. Source se computa abajo de los tags presentes
  // en las iniciativas visibles antes de aplicar este filtro.
  const [filterTags, setFilterTags]               = useState<Set<string>>(new Set())
  // Multi-responsable filter: OR. Source dinámica como tags. Excluye null/vacío.
  const [filterResponsable, setFilterResponsable] = useState<Set<string>>(new Set())
  // Toggle "En foco": activo → solo p.en_foco === true; inactivo → todas.
  const [filterFoco, setFilterFoco]               = useState<boolean>(false)
  const [sortCol, setSortCol]                 = useState<SortCol>('semaforo')
  const [sortDir, setSortDir]                 = useState<SortDir>('asc')
  const [selected, setSelected]               = useState<Iniciativa | null>(null)
  const [importing, setImporting]             = useState(false)
  const [importResult, setImportResult]       = useState<{ inserted: number; updated: number; errors: string[] } | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importPreview, setImportPreview]     = useState<ImportPreviewRow[] | null>(null)
  const [importParseErrors, setImportParseErrors] = useState<string[]>([])
  const [importFileName, setImportFileName]       = useState<string>('')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportRegions, setExportRegions]     = useState<Set<string>>(() => new Set(REGIONS.map(r => r.nombre)))
  // Loading state mientras descargamos los ejes del catálogo para construir
  // la hoja "Ejes válidos" del Excel exportado. Bloquea el botón.
  const [exporting, setExporting]             = useState(false)
  const fileInputRef                          = useRef<HTMLInputElement>(null)

  // New UI state
  const [showSecondaryFilters, setShowSecondaryFilters] = useState(false)
  const [visibleCols, setVisibleCols]                   = useState<Set<ColId>>(DEFAULT_COLS)
  const [showColsPanel, setShowColsPanel]               = useState(false)

  const selectedSynced = selected
    ? (projects.find(p => p.n === selected.n) ?? selected)
    : null

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function toggleSemaforo(s: SemaforoKey) {
    setFilterSemaforo(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  function toggleColId(id: ColId) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = useMemo(() => {
    let list = projects.filter(p => {
      if (search) {
        const q = search.toLowerCase()
        if (!p.nombre.toLowerCase().includes(q) &&
            !p.region.toLowerCase().includes(q) &&
            !(p.ministerio ?? '').toLowerCase().includes(q)) return false
      }
      if (filterRegion !== 'todas' && p.region !== filterRegion) return false
      if (filterEje !== 'todos' && p.eje !== filterEje) return false
      if (filterEjeGobierno !== 'todos' && p.eje_gobierno !== filterEjeGobierno) return false
      if (filterSemaforo.size > 0 && !filterSemaforo.has(p.estado_semaforo as SemaforoKey)) return false
      if (filterPrioridad.size > 0 && !filterPrioridad.has(p.prioridad as 'Alta' | 'Media' | 'Baja')) return false
      // Filtro multi-tag: OR. Basta con que la iniciativa tenga AL MENOS uno
      // de los tags seleccionados para que pase.
      if (filterTags.size > 0 && !(p.tags ?? []).some(t => filterTags.has(t))) return false
      // Filtro multi-responsable: OR. Si responsable es null/vacío, no matchea
      // cuando hay un filtro activo (la iniciativa sin responsable no aparece
      // si el usuario filtra por nombres).
      if (filterResponsable.size > 0 && !(p.responsable && filterResponsable.has(p.responsable))) return false
      // Filtro "En foco" — toggle. Activo: solo en_foco === true. Inactivo: todas.
      if (filterFoco && p.en_foco !== true) return false
      return true
    })

    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'n')           cmp = a.n - b.n
      if (sortCol === 'region')      cmp = a.region.localeCompare(b.region)
      if (sortCol === 'eje')         cmp = a.eje.localeCompare(b.eje)
      if (sortCol === 'ejeGobierno') cmp = (a.eje_gobierno ?? '').localeCompare(b.eje_gobierno ?? '')
      if (sortCol === 'semaforo')    cmp = SEMAFORO_ORDER[a.estado_semaforo] - SEMAFORO_ORDER[b.estado_semaforo]
      if (sortCol === 'avance')      cmp = a.pct_avance - b.pct_avance
      if (sortCol === 'prioridad')   cmp = (a.prioridad === 'Alta' ? 0 : 1) - (b.prioridad === 'Alta' ? 0 : 1)
      if (sortCol === 'actividad') {
        const da = actividad[a.n] ? new Date(actividad[a.n]!).getTime() : 0
        const db = actividad[b.n] ? new Date(actividad[b.n]!).getTime() : 0
        cmp = da - db
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [projects, search, filterRegion, filterEje, filterEjeGobierno, filterSemaforo, filterPrioridad, filterTags, filterResponsable, filterFoco, sortCol, sortDir, actividad])

  // Catálogo formal de ejes per-región (migración 015). Si hay región filtrada,
  // carga el catálogo de esa región para alimentar el dropdown. Si está en
  // "todas", el hook recibe null y no hace fetch — usamos la unión derivada
  // de iniciativas más abajo.
  const regionCodFiltered = useMemo(() => {
    if (filterRegion === 'todas') return null
    return REGIONS.find(r => r.nombre === filterRegion)?.cod ?? null
  }, [filterRegion])
  const { ejes: regionEjesCat } = useRegionEjes(regionCodFiltered)

  // availableEjes: con región filtrada y catálogo disponible, lista del catálogo
  // (composeEjeLabel canónico). Sin región filtrada o catálogo vacío, fallback
  // a la unión de strings `eje` realmente usados en iniciativas — así nunca
  // queda dropdown vacío si hay datos. Reemplaza la constante hardcoded EJES.
  const availableEjes = useMemo(() => {
    if (regionCodFiltered && regionEjesCat.length > 0) {
      return regionEjesCat.map(re => composeEjeLabel(re.numero, re.nombre))
    }
    return Array.from(new Set(projects.map(p => p.eje).filter(Boolean))).sort()
  }, [regionCodFiltered, regionEjesCat, projects])

  // Pool base = iniciativas que pasan todos los filtros EXCEPTO el dinámico.
  // Reusado para availableTags, availableResponsables.
  function basePool(excluding: 'tags' | 'responsable') {
    const q = search.toLowerCase()
    return projects.filter(p => {
      if (search) {
        if (!p.nombre.toLowerCase().includes(q) &&
            !p.region.toLowerCase().includes(q) &&
            !(p.ministerio ?? '').toLowerCase().includes(q)) return false
      }
      if (filterRegion !== 'todas' && p.region !== filterRegion) return false
      if (filterEje !== 'todos' && p.eje !== filterEje) return false
      if (filterEjeGobierno !== 'todos' && p.eje_gobierno !== filterEjeGobierno) return false
      if (filterSemaforo.size > 0 && !filterSemaforo.has(p.estado_semaforo as SemaforoKey)) return false
      if (filterPrioridad.size > 0 && !filterPrioridad.has(p.prioridad as 'Alta' | 'Media' | 'Baja')) return false
      if (excluding !== 'tags' && filterTags.size > 0 && !(p.tags ?? []).some(t => filterTags.has(t))) return false
      if (excluding !== 'responsable' && filterResponsable.size > 0 && !(p.responsable && filterResponsable.has(p.responsable))) return false
      if (filterFoco && p.en_foco !== true) return false
      return true
    })
  }

  const availableTags = useMemo(() => {
    return Array.from(new Set(basePool('tags').flatMap(p => p.tags ?? []))).sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, search, filterRegion, filterEje, filterEjeGobierno, filterSemaforo, filterPrioridad, filterResponsable, filterFoco])

  const availableResponsables = useMemo(() => {
    return Array.from(new Set(
      basePool('responsable').map(p => p.responsable).filter((r): r is string => !!r && r.trim() !== '')
    )).sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, search, filterRegion, filterEje, filterEjeGobierno, filterSemaforo, filterPrioridad, filterTags, filterFoco])

  const rojo   = filtered.filter(p => p.estado_semaforo === 'rojo').length
  const ambar  = filtered.filter(p => p.estado_semaforo === 'ambar').length
  const verde  = filtered.filter(p => p.estado_semaforo === 'verde').length
  const gris   = filtered.filter(p => p.estado_semaforo === 'gris').length
  const total  = filtered.length
  const avgPct = total
    ? Math.round(filtered.reduce((s, p) => s + p.pct_avance, 0) / total)
    : 0

  function clearFilters() {
    setSearch(''); setFilterRegion('todas'); setFilterEje('todos')
    setFilterEjeGobierno('todos'); setFilterSemaforo(new Set()); setFilterPrioridad(new Set())
    setFilterTags(new Set())
    setFilterResponsable(new Set())
    setFilterFoco(false)
  }

  function toggleTagFilter(t: string) {
    setFilterTags(prev => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }

  function toggleResponsableFilter(r: string) {
    setFilterResponsable(prev => {
      const next = new Set(prev)
      next.has(r) ? next.delete(r) : next.add(r)
      return next
    })
  }

  // ── Template & Import ────────────────────────────────────────────────────
  // El generador del template y el parser del Excel viven ahora en
  // lib/templateExcel.ts y lib/importParser.ts (ver razones en sus comentarios).

  function downloadTemplate() {
    downloadTemplateExcel()
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    setImportPreview(null)
    setImportParseErrors([])
    setImportResult(null)
    setImportFileName('')

    try {
      const arrayBuffer = await file.arrayBuffer()
      // Cargamos el catálogo completo de ejes — el parser lo necesita para
      // validar cada string "Eje" del Excel contra (region_cod, numero).
      const { data: ejesData } = await getSupabase()
        .from('region_ejes')
        .select('*')
      const regionEjesByCod = new Map<string, RegionEje[]>()
      for (const e of (ejesData ?? []) as RegionEje[]) {
        const arr = regionEjesByCod.get(e.region_cod) ?? []
        arr.push(e)
        regionEjesByCod.set(e.region_cod, arr)
      }
      const { rows, fileErrors, sheetName } = parseImportWorkbook(arrayBuffer, projects, regionEjesByCod)
      setImportFileName(`${file.name}  ·  Hoja: ${sheetName}`)
      setImportParseErrors(fileErrors)
      setImportPreview(rows)
    } catch (err) {
      setImportParseErrors([`Error al leer el archivo: ${String(err)}`])
      setImportPreview([])
    }
    setImportModalOpen(true)
  }


  async function applyImport() {
    if (!importPreview) return
    setImporting(true)

    const valid   = importPreview.filter(r => r.errors.length === 0)
    const updates = valid.filter(r => !r.isNew && Object.keys(r.patch).length > 0).map(r => ({ n: r.n, patch: r.patch }))
    const inserts = valid.filter(r => r.isNew && r.insertData).map(r => r.insertData!)

    let result: { inserted: number; updated: number; errors: string[] }
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, inserts }),
      })
      const json = await res.json()
      if (!res.ok) {
        result = { inserted: 0, updated: 0, errors: [json?.error ?? `HTTP ${res.status}`] }
      } else {
        result = json as { inserted: number; updated: number; errors: string[] }
      }
    } catch (err) {
      result = { inserted: 0, updated: 0, errors: [`Error de red: ${String(err)}`] }
    }

    for (const { n, patch } of updates) {
      if (!result.errors.some(e => e.startsWith(`#${n}:`))) {
        onUpdatePrioridad(n, patch as Partial<Iniciativa>)
      }
    }

    setImporting(false)
    if (result.errors.length > 0) {
      setImportResult({ inserted: result.inserted, updated: result.updated, errors: result.errors })
    } else {
      setImportModalOpen(false)
      setImportPreview(null)
      setImportResult({ inserted: result.inserted, updated: result.updated, errors: [] })
      window.location.reload()
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  //
  // El Excel exportado desde Dashboard usa el MISMO formato que el flow de
  // propuestas en Mi Región (`buildPrefilledWorkbook` + TEMPLATE_COLS). Las
  // dos rutas son espejo: misma hoja "Carga", mismas columnas, mismas hojas
  // "Instrucciones" y "Ejes válidos". El import del Dashboard valida contra
  // las MISMAS columnas — formato uniforme en ambas direcciones.
  //
  // En multi-región la hoja "Ejes válidos" agrega la columna Región para que
  // se pueda identificar qué eje pertenece a cada una (ver buildPrefilledWorkbook).

  function openExportModal() {
    setExportModalOpen(true)
  }

  const exportCount = projects.filter(p => exportRegions.has(p.region)).length

  async function exportExcelFiltered() {
    if (exportRegions.size === 0 || exporting) return
    setExporting(true)
    try {
      const toExport = projects.filter(p => exportRegions.has(p.region))
      // Mapeo región → cod para cargar el catálogo de ejes correspondiente
      // y construir la hoja "Ejes válidos". Si una región seleccionada no
      // tiene cod conocido (REGIONS no la trae), se omite — defensivo.
      const codsByRegionName = new Map(REGIONS.map(r => [r.nombre, r.cod]))
      const selectedCods = Array.from(exportRegions)
        .map(name => codsByRegionName.get(name))
        .filter((c): c is string => Boolean(c))
      const { data: ejesData } = await getSupabase()
        .from('region_ejes')
        .select('*')
        .in('region_cod', selectedCods)
      const regionEjes = (ejesData ?? []) as RegionEje[]

      // Single región: usamos downloadPrefilled para que el filename + el
      // slugify queden idénticos a Mi Región (espejo total). Multi-región:
      // construimos el wb y le ponemos un filename agregado.
      if (exportRegions.size === 1) {
        const regionName = Array.from(exportRegions)[0]
        downloadPrefilled(regionName, toExport, regionEjes)
      } else {
        const wb = buildPrefilledWorkbook(toExport, regionEjes)
        const fecha = new Date().toISOString().split('T')[0]
        XLSX.writeFile(wb, `iniciativas-${exportRegions.size}-regiones-${fecha}.xlsx`)
      }
      setExportModalOpen(false)
    } finally {
      setExporting(false)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const hasFilters = search || filterRegion !== 'todas' || filterEje !== 'todos' ||
    filterEjeGobierno !== 'todos' || filterSemaforo.size > 0 || filterPrioridad.size > 0 ||
    filterTags.size > 0 || filterResponsable.size > 0 || filterFoco

  const hasSecondaryFilter = filterEje !== 'todos' || filterEjeGobierno !== 'todos' ||
    filterPrioridad.size > 0 || filterTags.size > 0 || filterResponsable.size > 0 || filterFoco

  // Dynamic column count for colspan calculation
  const colCount = visibleCols.size

  function ColHeader({ col, label }: { col: SortCol; label: string }) {
    const active = sortCol === col
    return (
      <th
        onClick={() => handleSort(col)}
        className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-800 select-none whitespace-nowrap"
      >
        <span className="flex items-center gap-1">
          {label}
          <span className={active ? 'text-gray-700' : 'text-gray-300'}>
            {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </span>
      </th>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header: summary bar + actions ── */}
      <div className="flex-shrink-0 px-6 pt-4 pb-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-5">

          {/* Stacked bar + legend */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-4 mb-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-800 text-sm">{total} iniciativas</span>
              {([['rojo', rojo], ['ambar', ambar], ['verde', verde], ['gris', gris]] as const).map(([key, count]) =>
                count > 0 && (
                  <button
                    key={key}
                    onClick={() => toggleSemaforo(key)}
                    className={`flex items-center gap-1.5 transition-opacity ${filterSemaforo.size > 0 && !filterSemaforo.has(key) ? 'opacity-40' : ''}`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEMAFORO_CONFIG[key].dot}`}/>
                    <span className="font-medium text-gray-700">{count}</span>
                    <span>{SEMAFORO_CONFIG[key].label}</span>
                  </button>
                )
              )}
            </div>
            {total > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden gap-px bg-gray-100">
                {([['rojo', rojo], ['ambar', ambar], ['verde', verde], ['gris', gris]] as const).map(([key, count]) =>
                  count > 0 && (
                    <div
                      key={key}
                      className={`${SEMAFORO_CONFIG[key].bar} cursor-pointer transition-opacity hover:opacity-80 ${filterSemaforo.size > 0 && !filterSemaforo.has(key) ? 'opacity-30' : ''}`}
                      style={{ width: `${(count / total) * 100}%` }}
                      onClick={() => toggleSemaforo(key)}
                      title={`${count} ${SEMAFORO_CONFIG[key].label}`}
                    />
                  )
                )}
              </div>
            )}
          </div>

          {/* Avance */}
          <div className="flex-shrink-0 text-center px-3">
            <div className="text-2xl font-bold text-slate-700 leading-none">{avgPct}%</div>
            <div className="text-xs text-gray-400 mt-0.5">avance</div>
          </div>

          {/* Action buttons */}
          <div className="flex-shrink-0 flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
            {canImport && (
              <button
                onClick={() => { setImportModalOpen(true); setImportPreview(null); setImportParseErrors([]); setImportResult(null); setImportFileName('') }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 9h8M6 7V2M3.5 4.5L6 2l2.5 2.5"/>
                </svg>
                Importar
              </button>
            )}
            <button
              onClick={openExportModal}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors font-medium"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 9h8M6 2v6M3.5 5.5L6 8l2.5-2.5"/>
              </svg>
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex-shrink-0 px-6 py-2.5 border-b border-gray-100 bg-white space-y-2">

        {/* Primary row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
              <circle cx="5.5" cy="5.5" r="4"/><path d="M9 9l2.5 2.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar meta, región, ministerio..."
              className="pl-8 pr-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white w-56"
            />
          </div>

          {/* Region */}
          <select
            value={filterRegion}
            onChange={e => setFilterRegion(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
          >
            <option value="todas">Todas las regiones</option>
            {REGIONS.map(r => <option key={r.cod} value={r.nombre}>{r.nombre}</option>)}
          </select>

          {/* Semáforo chips */}
          <div className="flex items-center gap-1">
            {(['rojo', 'ambar', 'verde', 'gris'] as const).map(s => {
              const active = filterSemaforo.has(s)
              const activeClass =
                s === 'rojo'  ? 'bg-red-100 text-red-700 ring-1 ring-red-300'      :
                s === 'ambar' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' :
                s === 'verde' ? 'bg-green-100 text-green-700 ring-1 ring-green-300' :
                                'bg-gray-200 text-gray-700 ring-1 ring-gray-400'
              return (
                <button
                  key={s}
                  onClick={() => toggleSemaforo(s)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${
                    active ? activeClass : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${SEMAFORO_CONFIG[s].dot}`}/>
                  {SEMAFORO_CONFIG[s].label}
                </button>
              )
            })}
          </div>

          {/* Más filtros toggle */}
          <button
            onClick={() => setShowSecondaryFilters(v => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
              showSecondaryFilters || hasSecondaryFilter
                ? 'bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {hasSecondaryFilter && <span className="w-1.5 h-1.5 rounded-full bg-blue-500"/>}
            Más filtros
            <span className="text-gray-400">{showSecondaryFilters ? '↑' : '↓'}</span>
          </button>

          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-700 underline">
              Limpiar
            </button>
          )}

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-2">
            {/* Columns toggle */}
            <div className="relative">
              <button
                onClick={() => setShowColsPanel(v => !v)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
                  showColsPanel
                    ? 'bg-slate-100 border-slate-300 text-slate-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="1" y="1" width="4" height="10" rx="1"/><rect x="7" y="1" width="4" height="10" rx="1"/>
                </svg>
                Columnas
              </button>

              {showColsPanel && (
                <div className="absolute right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-30 w-52">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Columnas visibles</div>
                  <div className="space-y-1">
                    {ALL_COLS.map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer hover:text-gray-900 py-0.5">
                        <input
                          type="checkbox"
                          checked={visibleCols.has(c.id)}
                          onChange={() => toggleColId(c.id)}
                          className="rounded"
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowColsPanel(false)}
                    className="mt-2 w-full text-xs text-center text-gray-400 hover:text-gray-600"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Secondary filters (collapsible) */}
        {showSecondaryFilters && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {/* Eje regional — alimentado por el catálogo per-región cuando
                hay una región seleccionada. En "todas" usa la unión derivada
                de iniciativas en uso, así nunca queda dropdown vacío. */}
            <select
              value={filterEje}
              onChange={e => setFilterEje(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300 max-w-[280px]"
            >
              <option value="todos">Todos los ejes</option>
              {availableEjes.map(e => <option key={e} value={e}>{e}</option>)}
            </select>

            {/* Eje Gobierno */}
            <select
              value={filterEjeGobierno}
              onChange={e => setFilterEjeGobierno(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              <option value="todos">Eje Gobierno: todos</option>
              {Array.from(new Set(projects.map(p => p.eje_gobierno).filter(Boolean))).sort().map(eg => (
                <option key={eg!} value={eg!}>{eg}</option>
              ))}
            </select>

            {/* Prioridad chips */}
            <div className="flex items-center gap-1">
              {(['Alta', 'Media', 'Baja'] as const).map(p => {
                const active = filterPrioridad.has(p)
                const activeClass =
                  p === 'Alta'  ? 'bg-red-50 text-red-700 ring-1 ring-red-200'       :
                  p === 'Media' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'  :
                                  'bg-gray-200 text-gray-600 ring-1 ring-gray-300'
                return (
                  <button
                    key={p}
                    onClick={() => setFilterPrioridad(prev => {
                      const next = new Set(prev)
                      next.has(p) ? next.delete(p) : next.add(p)
                      return next
                    })}
                    className={`text-xs px-2 py-1 rounded-full transition-colors ${
                      active ? activeClass : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>

            {/* En Foco — toggle simple. Activo: solo iniciativas con bandera. */}
            <button
              onClick={() => setFilterFoco(v => !v)}
              className={`text-xs px-2 py-1 rounded-full transition-colors font-medium flex items-center gap-1 ${
                filterFoco
                  ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title="Filtrar solo iniciativas en foco"
            >
              <span className="text-[10px]">⚑</span>
              En foco
            </button>

            {/* Responsable multi-select — mismo patrón que tags. Solo aparece
                si hay responsables asignados entre las iniciativas visibles. */}
            {availableResponsables.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-gray-400 ml-1 mr-0.5">Responsable:</span>
                {availableResponsables.map(r => {
                  const active = filterResponsable.has(r)
                  // Display compacto: mostrar nombre antes del @ si es email.
                  const short = r.includes('@') ? r.split('@')[0] : r
                  return (
                    <button
                      key={r}
                      onClick={() => toggleResponsableFilter(r)}
                      title={r}
                      className={`text-xs px-2 py-1 rounded-full transition-colors border max-w-[160px] truncate ${
                        active
                          ? 'bg-slate-700 text-white border-slate-700'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {short}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Tags multi-select. Solo se renderiza si hay tags en uso entre
                las iniciativas que pasan los OTROS filtros. Si no, el control
                es ruido — no aparece. */}
            {availableTags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-gray-400 ml-1 mr-0.5">Etiquetas:</span>
                {availableTags.map(t => {
                  const active = filterTags.has(t)
                  return (
                    <button
                      key={t}
                      onClick={() => toggleTagFilter(t)}
                      className={`text-xs px-2 py-1 rounded-full transition-colors border ${
                        active
                          ? 'bg-slate-700 text-white border-slate-700'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Import result banner ── */}
      {importResult && (
        <div className={`flex-shrink-0 px-6 py-2.5 border-b text-xs flex items-start gap-3 ${
          importResult.errors.length === 0
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <span className="font-semibold whitespace-nowrap">
            {importResult.errors.length === 0
              ? (() => {
                  const parts = []
                  if (importResult.inserted > 0) parts.push(`${importResult.inserted} nueva${importResult.inserted !== 1 ? 's' : ''} creada${importResult.inserted !== 1 ? 's' : ''}`)
                  if (importResult.updated  > 0) parts.push(`${importResult.updated} actualizada${importResult.updated !== 1 ? 's' : ''}`)
                  return parts.length ? parts.join(' · ') + ' correctamente.' : 'Sin cambios.'
                })()
              : `${(importResult.inserted ?? 0) + importResult.updated} guardadas, ${importResult.errors.length} error${importResult.errors.length !== 1 ? 'es' : ''}:`}
          </span>
          {importResult.errors.length > 0 && (
            <span className="text-amber-700">{importResult.errors.join(' · ')}</span>
          )}
          <button onClick={() => setImportResult(null)} className="ml-auto text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto" onClick={() => showColsPanel && setShowColsPanel(false)}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
            <tr>
              {visibleCols.has('n')             && <ColHeader col="n" label="#" />}
              {visibleCols.has('estado')        && <ColHeader col="semaforo" label="Estado" />}
              {visibleCols.has('iniciativa')    && <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Iniciativa</th>}
              {visibleCols.has('region')        && <ColHeader col="region" label="Región" />}
              {visibleCols.has('ejeRegional')   && <ColHeader col="eje" label="Eje Regional" />}
              {visibleCols.has('ejeGobierno')   && <ColHeader col="ejeGobierno" label="Eje Gobierno" />}
              {visibleCols.has('avance')        && <ColHeader col="avance" label="Avance" />}
              {visibleCols.has('prioridad')     && <ColHeader col="prioridad" label="Prioridad" />}
              {visibleCols.has('proximoHito')   && <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Próximo Hito</th>}
              {visibleCols.has('estadoTermino') && <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Estado Término Gob.</th>}
              {visibleCols.has('inversion')     && <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Inversión</th>}
              {visibleCols.has('rat')           && <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">RAT</th>}
              {visibleCols.has('fuente')        && <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Fuente</th>}
              {visibleCols.has('responsable')   && <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Responsable</th>}
              {visibleCols.has('actividad')     && <ColHeader col="actividad" label="Actividad" />}
              {visibleCols.has('tags')          && <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Etiquetas</th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {total === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-6 py-16 text-center text-gray-400 text-sm">
                  Sin prioridades con estos filtros.{' '}
                  <button onClick={clearFilters} className="underline text-slate-600">Limpiar filtros</button>
                </td>
              </tr>
            ) : (
              filtered.map(p => <DataRow key={p.n} p={p} />)
            )}
          </tbody>
        </table>
      </div>

      {/* ── Import modal ── */}
      {importModalOpen && (() => {
        const hasFile    = importPreview !== null || importParseErrors.length > 0
        const validRows  = importPreview?.filter(r => r.errors.length === 0 && (r.isNew || Object.keys(r.patch).length > 0)) ?? []
        const insertRows = importPreview?.filter(r => r.errors.length === 0 && r.isNew) ?? []
        const updateRows = importPreview?.filter(r => r.errors.length === 0 && !r.isNew && Object.keys(r.patch).length > 0) ?? []
        const errorRows  = importPreview?.filter(r => r.errors.length > 0) ?? []
        const isAllOk    = hasFile && importParseErrors.length === 0 && errorRows.length === 0 && validRows.length > 0
        const hasErrors  = hasFile && (importParseErrors.length > 0 || errorRows.length > 0)
        const isIdle     = !hasFile
        const headerBg         = isIdle ? 'bg-white border-b border-gray-100' : isAllOk ? 'bg-green-600' : hasErrors ? 'bg-red-600' : 'bg-slate-800'
        const headerTextPrimary   = isIdle ? 'text-gray-900' : 'text-white'
        const headerTextSecondary = isIdle ? 'text-gray-500' : 'text-white/70'
        const headerCloseBtn      = isIdle ? 'text-gray-400 hover:text-gray-600' : 'text-white/60 hover:text-white'
        const bodyBg    = isAllOk ? 'bg-green-50' : hasErrors ? 'bg-red-50' : 'bg-white'
        const footerBg  = isIdle  ? 'bg-white'    : isAllOk ? 'bg-green-50' : hasErrors ? 'bg-red-50' : 'bg-gray-50'
        const borderCol = isIdle  ? 'border-gray-100' : isAllOk ? 'border-green-200' : hasErrors ? 'border-red-200' : 'border-gray-200'

        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className={`rounded-2xl shadow-2xl w-full max-w-3xl max-h-[82vh] flex flex-col overflow-hidden border ${borderCol}`}>
              <div className={`${headerBg} px-6 py-4 flex items-start justify-between`}>
                <div>
                  <h2 className={`text-base font-semibold ${headerTextPrimary}`}>
                    {isAllOk   ? `✓ Todo OK — ${validRows.length} iniciativa${validRows.length !== 1 ? 's' : ''} listas para guardar`
                    : hasErrors ? `Archivo con problemas`
                    : 'Importar iniciativas'}
                  </h2>
                  <p className={`text-xs mt-0.5 ${headerTextSecondary}`}>
                    {isAllOk   ? (importFileName || 'Revisa los cambios y confirma para guardar en la base de datos.')
                    : hasErrors ? `${errorRows.length + importParseErrors.length} fila${errorRows.length + importParseErrors.length !== 1 ? 's' : ''} con errores — corrígelas en el archivo y vuelve a cargarlo.`
                    : 'Carga el archivo .xlsx con los datos completados. Revisaremos el formato antes de guardar.'}
                  </p>
                </div>
                <button onClick={() => setImportModalOpen(false)} className={`${headerCloseBtn} mt-0.5 text-lg leading-none`}>✕</button>
              </div>

              <div className={`flex-1 overflow-auto p-5 space-y-4 ${bodyBg}`}>
                {!hasFile && (
                  <div className="space-y-4">
                    <div className="text-xs text-gray-600 space-y-1 leading-relaxed">
                      <p><span className="font-semibold">1.</span> Descarga el template, completa los campos editables a partir de la fila 3.</p>
                      <p><span className="font-semibold">2.</span> Las primeras 4 columnas son solo referencia — no las modifiques.</p>
                      <p><span className="font-semibold">3.</span> Carga el archivo aquí. Revisaremos el formato antes de guardar.</p>
                    </div>
                    <button
                      onClick={downloadTemplate}
                      className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 9h8M6 2v6M3.5 5.5L6 8l2.5-2.5"/>
                      </svg>
                      Descargar template de carga
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center gap-2 py-10 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/40 transition-colors cursor-pointer"
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <span className="text-sm font-medium">Seleccionar archivo .xlsx</span>
                    </button>
                  </div>
                )}

                {hasFile && importParseErrors.length > 0 && (
                  <div className="p-3 bg-red-100 border border-red-200 rounded-lg text-xs text-red-800 space-y-0.5">
                    {importParseErrors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                  </div>
                )}

                {hasFile && importPreview && importPreview.length > 0 && (
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    {insertRows.length > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-medium border border-blue-200">
                        + {insertRows.length} nueva{insertRows.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {updateRows.length > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 font-medium border border-green-200">
                        ✓ {updateRows.length} actualizacion{updateRows.length !== 1 ? 'es' : ''}
                      </span>
                    )}
                    {errorRows.length > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-medium border border-red-200">
                        ✗ {errorRows.length} con errores
                      </span>
                    )}
                    {importPreview.filter(r => r.errors.length === 0 && !r.isNew && Object.keys(r.patch).length === 0).length > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                        — {importPreview.filter(r => r.errors.length === 0 && !r.isNew && Object.keys(r.patch).length === 0).length} sin cambios
                      </span>
                    )}
                    <button onClick={() => fileInputRef.current?.click()} className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">
                      Cargar otro archivo
                    </button>
                  </div>
                )}

                {hasFile && importPreview && importPreview.length > 0 && (
                  <table className="w-full text-xs border-collapse rounded-lg overflow-hidden">
                    <thead>
                      <tr className={`border-b ${borderCol} ${isAllOk ? 'bg-green-100' : hasErrors ? 'bg-red-100' : 'bg-gray-50'}`}>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 w-8">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Región</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Nombre</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Campos / Errores</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 w-16">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map(row => (
                        <tr key={`${row.isNew ? 'new' : ''}${row.n}`} className={`border-b border-gray-100 ${row.errors.length > 0 ? 'bg-red-50' : row.isNew ? 'bg-blue-50/40' : ''}`}>
                          <td className="px-3 py-2 font-mono text-gray-400">
                            {row.isNew
                              ? <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-semibold">Nuevo</span>
                              : row.n}
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.region}</td>
                          <td className="px-3 py-2 text-gray-700 max-w-[180px]">
                            <span className="line-clamp-2 leading-snug">{row.nombre}</span>
                            {row.isNew && !!row.insertData?.codigo_iniciativa && (
                              <span className="block font-mono text-blue-600 text-xs mt-0.5">{String(row.insertData.codigo_iniciativa)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 max-w-[280px]">
                            {row.errors.length > 0
                              ? <span className="text-red-600">{row.errors.join(' · ')}</span>
                              : row.isNew
                                ? <span className="text-blue-700">nueva iniciativa</span>
                                : Object.keys(row.patch).length > 0
                                  ? <span className="text-green-700">{Object.keys(row.patch).join(', ')}</span>
                                  : <span className="text-gray-400">Sin cambios</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap font-medium">
                            {row.errors.length > 0
                              ? <span className="text-red-500">✗</span>
                              : row.isNew
                                ? <span className="text-blue-600">+</span>
                                : Object.keys(row.patch).length > 0
                                  ? <span className="text-green-600">✓</span>
                                  : <span className="text-gray-400">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {hasFile && importPreview?.length === 0 && !importParseErrors.length && (
                  <p className="text-xs text-gray-400 text-center py-8">No se encontraron filas con datos en el archivo.</p>
                )}
              </div>

              {importResult && importResult.errors.length > 0 && (
                <div className="mx-6 mb-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-xs font-semibold text-red-700 mb-1">Error al guardar — revisa los detalles en la consola del navegador (F12)</p>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600 mt-0.5">{e}</p>
                  ))}
                </div>
              )}

              <div className={`px-6 py-4 border-t ${borderCol} ${footerBg} flex items-center justify-between`}>
                <div className="text-xs text-gray-500">
                  {hasFile
                    ? [insertRows.length > 0 && `${insertRows.length} nueva${insertRows.length !== 1 ? 's' : ''}`, updateRows.length > 0 && `${updateRows.length} actualización${updateRows.length !== 1 ? 'es' : ''}`].filter(Boolean).join(' · ') || 'Sin cambios'
                    : 'Ningún cambio guardado aún'}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setImportModalOpen(false)}
                    className="text-xs px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    {hasFile && validRows.length === 0 ? 'Cerrar' : 'Cancelar'}
                  </button>
                  {hasFile && (
                    <button
                      onClick={applyImport}
                      disabled={importing || validRows.length === 0}
                      className={`text-xs px-4 py-2 rounded-lg text-white disabled:opacity-60 font-medium flex items-center gap-1.5 ${
                        isAllOk ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {importing && (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="animate-spin">
                          <circle cx="6" cy="6" r="4" strokeDasharray="20 5"/>
                        </svg>
                      )}
                      {importing ? 'Guardando…' : `Confirmar${validRows.length > 0 ? ` (${validRows.length})` : ''}`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Export modal ── */}
      {exportModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Exportar a Excel</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Mismo formato que el archivo de propuesta de Mi Región — apto
                  para volver a importarlo aquí o repartirlo a la delegación.
                </p>
              </div>
              <button onClick={() => setExportModalOpen(false)} className="text-gray-400 hover:text-gray-600 mt-0.5">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Regiones</span>
                  <div className="flex gap-2">
                    <button onClick={() => setExportRegions(new Set(REGIONS.map(r => r.nombre)))} className="text-xs text-blue-600 hover:underline">Todas</button>
                    <button onClick={() => setExportRegions(new Set())} className="text-xs text-gray-400 hover:underline">Ninguna</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-y-1 gap-x-4">
                  {REGIONS.map(r => (
                    <label key={r.cod} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer hover:text-gray-900 py-0.5">
                      <input
                        type="checkbox"
                        checked={exportRegions.has(r.nombre)}
                        onChange={ev => {
                          const next = new Set(exportRegions)
                          if (ev.target.checked) next.add(r.nombre)
                          else next.delete(r.nombre)
                          setExportRegions(next)
                        }}
                        className="rounded"
                      />
                      <span className="truncate">{r.nombre}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">{exportCount} iniciativas seleccionadas</span>
              <div className="flex gap-2">
                <button onClick={() => setExportModalOpen(false)} className="text-xs px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium">
                  Cancelar
                </button>
                <button
                  onClick={exportExcelFiltered}
                  disabled={exportCount === 0 || exporting}
                  className="text-xs px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-60 font-medium flex items-center gap-1.5"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 9h8M6 2v6M3.5 5.5L6 8l2.5-2.5"/>
                  </svg>
                  {exporting ? 'Generando…' : 'Descargar Excel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project tracker modal */}
      {selectedSynced && (
        <ProjectTrackerModal
          prioridad={selectedSynced}
          onClose={() => setSelected(null)}
          onUpdatePrioridad={onUpdatePrioridad}
          onDeletePrioridad={onDeletePrioridad}
        />
      )}
    </div>
  )

  // ── Row component (inner, accesses closure state) ─────────────────────────

  function DataRow({ p }: { p: Iniciativa }) {
    const sem      = SEMAFORO_CONFIG[p.estado_semaforo]
    const ejeColor = 'bg-gray-100 text-gray-600'
    return (
      <tr
        onClick={() => setSelected(p)}
        className="hover:bg-blue-50/40 cursor-pointer transition-colors"
      >
        {visibleCols.has('n') && (
          <td className="px-3 py-3.5 text-xs text-gray-400 font-mono">{p.n}</td>
        )}
        {visibleCols.has('estado') && (
          <td className="px-3 py-3.5">
            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${sem.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sem.dot}`}/>
              {sem.label}
            </span>
          </td>
        )}
        {visibleCols.has('iniciativa') && (
          <td className="px-3 py-3.5 max-w-xs">
            <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-snug">{p.nombre}</p>
            <span className="text-xs text-gray-400 mt-0.5 block">{p.ministerio ?? 'Sin asignar'}</span>
          </td>
        )}
        {visibleCols.has('region') && (
          <td className="px-3 py-3.5 whitespace-nowrap">
            <div className="text-xs font-medium text-gray-700">{p.region}</div>
            <div className="text-xs text-gray-400">{p.capital}</div>
          </td>
        )}
        {visibleCols.has('ejeRegional') && (
          <td className="px-3 py-3.5">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ejeColor}`}>
              {p.eje}
            </span>
          </td>
        )}
        {visibleCols.has('ejeGobierno') && (
          <td className="px-3 py-3.5 whitespace-nowrap">
            {(() => {
              const gob = p.eje_gobierno
              const cls = gob === 'Seguridad' ? 'bg-red-50 text-red-700' :
                          gob === 'Social'    ? 'bg-purple-50 text-purple-700' :
                                               'bg-blue-50 text-blue-700'
              return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>{gob ?? '—'}</span>
            })()}
          </td>
        )}
        {visibleCols.has('avance') && (
          <td className="px-3 py-3.5">
            <div className="flex items-center gap-2">
              <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                <div
                  className={`h-1.5 rounded-full ${
                    p.estado_semaforo === 'rojo'  ? 'bg-red-400' :
                    p.estado_semaforo === 'ambar' ? 'bg-amber-400' :
                    p.estado_semaforo === 'verde' ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                  style={{ width: `${p.pct_avance}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-700 w-8 text-right">{p.pct_avance}%</span>
            </div>
          </td>
        )}
        {visibleCols.has('prioridad') && (
          <td className="px-3 py-3.5">
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${prioridadColor(p.prioridad).bg} ${prioridadColor(p.prioridad).text}`}>
              {p.prioridad}
            </span>
          </td>
        )}
        {visibleCols.has('proximoHito') && (
          <td className="px-3 py-3.5 max-w-[200px]">
            {p.proximo_hito
              ? <>
                  <p className="text-xs text-gray-700 line-clamp-2 leading-snug">{p.proximo_hito}</p>
                  {p.fecha_proximo_hito && (
                    <span className="text-xs text-gray-400 mt-0.5 block">{formatDate(p.fecha_proximo_hito)}</span>
                  )}
                </>
              : <span className="text-gray-300 text-xs">—</span>}
          </td>
        )}
        {visibleCols.has('estadoTermino') && (
          <td className="px-3 py-3.5 text-xs text-gray-600 whitespace-nowrap">
            {p.estado_termino_gobierno ?? <span className="text-gray-300">—</span>}
          </td>
        )}
        {visibleCols.has('inversion') && (
          <td className="px-3 py-3.5 whitespace-nowrap">
            {p.inversion_mm != null
              ? <span className="text-xs font-mono text-gray-700">{p.inversion_mm.toLocaleString('es-CL')} MM$</span>
              : <span className="text-gray-300 text-xs">—</span>}
          </td>
        )}
        {visibleCols.has('rat') && (
          <td className="px-3 py-3.5 whitespace-nowrap">
            {p.rat
              ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ratColor(p.rat)}`}>{p.rat}</span>
              : <span className="text-gray-300 text-xs">—</span>}
          </td>
        )}
        {visibleCols.has('fuente') && (
          <td className="px-3 py-3.5 text-xs text-gray-600 max-w-[140px]">
            {p.fuente_financiamiento
              ? <span className="line-clamp-2 block">{p.fuente_financiamiento}</span>
              : <span className="text-gray-300">—</span>}
          </td>
        )}
        {visibleCols.has('responsable') && (
          <td className="px-3 py-3.5 text-xs text-gray-600 whitespace-nowrap max-w-[120px]">
            {p.responsable
              ? <span className="truncate block">{p.responsable}</span>
              : <span className="text-gray-300">—</span>}
          </td>
        )}
        {visibleCols.has('actividad') && (
          <td className="px-3 py-3.5 whitespace-nowrap">
            {actividadLoading ? (
              <div className="h-3 bg-gray-100 rounded animate-pulse w-14" />
            ) : (() => {
              const dias = diasSinActividad(actividad[p.n])
              if (dias === null) return <span className="text-xs text-red-500 font-medium">Sin actividad</span>
              if (dias > 15)    return <span className="text-xs text-red-500">Hace {dias}d</span>
              if (dias > 7)     return <span className="text-xs text-amber-600">Hace {dias}d</span>
              return <span className="text-xs text-gray-500">{dias === 0 ? 'Hoy' : `Hace ${dias}d`}</span>
            })()}
          </td>
        )}
        {visibleCols.has('tags') && (
          <td className="px-3 py-3.5 max-w-[220px]">
            {(p.tags?.length ?? 0) === 0
              ? <span className="text-xs text-gray-300">—</span>
              : <TagChips tags={p.tags} max={3} />}
          </td>
        )}
      </tr>
    )
  }
}
