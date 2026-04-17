'use client'

import { useState, useMemo, useRef } from 'react'
import type { Iniciativa } from '@/lib/projects'
import { REGIONS } from '@/lib/regions'
import ProjectTrackerModal from './ProjectTrackerModal'
import * as XLSX from 'xlsx'
import { EJE_COLORS, prioridadColor } from '@/lib/config'
import { getSupabase } from '@/lib/supabase'

const SEMAFORO_CONFIG = {
  verde: { dot: 'bg-green-500', label: 'En verde',    badge: 'bg-green-50 text-green-700 ring-1 ring-green-200'  },
  ambar: { dot: 'bg-amber-400', label: 'En revisión', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'  },
  rojo:  { dot: 'bg-red-500',   label: 'Bloqueado',   badge: 'bg-red-50 text-red-700 ring-1 ring-red-200'        },
  gris:  { dot: 'bg-gray-300',  label: 'Sin evaluar', badge: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'    },
} as const

const SEMAFORO_ORDER = { rojo: 0, ambar: 1, verde: 2, gris: 3 }

type SemaforoKey = keyof typeof SEMAFORO_CONFIG
type SortCol = 'n' | 'region' | 'eje' | 'ejeGobierno' | 'semaforo' | 'avance' | 'prioridad' | 'actividad'
type SortDir = 'asc' | 'desc'

type Props = {
  projects: Iniciativa[]
  actividad: Record<number, string | null>
  actividadLoading?: boolean
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
}

type ImportPreviewRow = {
  n: number
  nombre: string
  region: string
  patch: Record<string, unknown>
  errors: string[]
}

const EJES = [
  'Eje 1: Infraestructura y Conectividad',
  'Eje 2: Energía y Medio Ambiente',
  'Eje 3: Salud y Servicios Básicos',
  'Eje 4: Seguridad y Soberanía',
  'Eje 5: Desarrollo Productivo e Innovación',
  'Eje 6: Familia, Educación y Equidad Territorial',
]

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

export default function NationalDashboard({ projects, actividad, actividadLoading = false, onUpdatePrioridad }: Props) {
  const [search, setSearch]                   = useState('')
  const [filterRegion, setFilterRegion]       = useState('todas')
  const [filterEje, setFilterEje]             = useState('todos')
  const [filterSemaforo, setFilterSemaforo]   = useState<SemaforoKey | 'todos'>('todos')
  const [filterPrioridad, setFilterPrioridad] = useState<'Alta' | 'Media' | 'Baja' | 'todas'>('todas')
  const [sortCol, setSortCol]                 = useState<SortCol>('semaforo')
  const [sortDir, setSortDir]                 = useState<SortDir>('asc')
  const [selected, setSelected]               = useState<Iniciativa | null>(null)
  const [importing, setImporting]             = useState(false)
  const [importResult, setImportResult]       = useState<{ updated: number; errors: string[] } | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importPreview, setImportPreview]     = useState<ImportPreviewRow[] | null>(null)
  const [importParseErrors, setImportParseErrors] = useState<string[]>([])
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportRegions, setExportRegions]     = useState<Set<string>>(() => new Set(REGIONS.map(r => r.nombre)))
  const [exportEjes, setExportEjes]           = useState<Set<string>>(() => new Set(EJES))
  const fileInputRef                          = useRef<HTMLInputElement>(null)

  // Sync selected when projects update (after modal saves)
  const selectedSynced = selected
    ? (projects.find(p => p.n === selected.n) ?? selected)
    : null

  const rojo   = projects.filter(p => p.estado_semaforo === 'rojo').length
  const ambar  = projects.filter(p => p.estado_semaforo === 'ambar').length
  const verde  = projects.filter(p => p.estado_semaforo === 'verde').length
  const gris   = projects.filter(p => p.estado_semaforo === 'gris').length
  const avgPct = projects.length
    ? Math.round(projects.reduce((s, p) => s + p.pct_avance, 0) / projects.length)
    : 0

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    let list = projects.filter(p => {
      if (search) {
        const q = search.toLowerCase()
        if (!p.nombre.toLowerCase().includes(q) &&
            !p.region.toLowerCase().includes(q) &&
            !p.ministerio.toLowerCase().includes(q)) return false
      }
      if (filterRegion !== 'todas' && p.region !== filterRegion) return false
      if (filterEje !== 'todos' && p.eje !== filterEje) return false
      if (filterSemaforo !== 'todos' && p.estado_semaforo !== filterSemaforo) return false
      if (filterPrioridad !== 'todas' && p.prioridad !== filterPrioridad) return false
      return true
    })

    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'n')         cmp = a.n - b.n
      if (sortCol === 'region')    cmp = a.region.localeCompare(b.region)
      if (sortCol === 'eje')        cmp = a.eje.localeCompare(b.eje)
      if (sortCol === 'ejeGobierno') cmp = (a.eje_gobierno ?? '').localeCompare(b.eje_gobierno ?? '')
      if (sortCol === 'semaforo')  cmp = SEMAFORO_ORDER[a.estado_semaforo] - SEMAFORO_ORDER[b.estado_semaforo]
      if (sortCol === 'avance')    cmp = a.pct_avance - b.pct_avance
      if (sortCol === 'prioridad') cmp = (a.prioridad === 'Alta' ? 0 : 1) - (b.prioridad === 'Alta' ? 0 : 1)
      if (sortCol === 'actividad') {
        const da = actividad[a.n] ? new Date(actividad[a.n]!).getTime() : 0
        const db = actividad[b.n] ? new Date(actividad[b.n]!).getTime() : 0
        cmp = da - db
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [projects, search, filterRegion, filterEje, filterSemaforo, filterPrioridad, sortCol, sortDir])

  function clearFilters() {
    setSearch(''); setFilterRegion('todas'); setFilterEje('todos')
    setFilterSemaforo('todos'); setFilterPrioridad('todas')
  }

  // ── Template & Import ────────────────────────────────────────────────────

  // Column definitions: key (used as DB field name), header label, description row, width
  // The description row is row 2 and tells users exactly what to fill in.
  // Import reads row 1 as headers and skips row 2 (description row).
  const TEMPLATE_COLS = [
    // ── Referencia (no modificar) ──────────────────────────────────────────
    { key: '#',                     label: '#',                     desc: '⚠ NO MODIFICAR — Identificador único',                                                                                     wch: 6,  editable: false },
    { key: 'region',                label: 'Región',                desc: '⚠ NO MODIFICAR — Solo referencia',                                                                                         wch: 22, editable: false },
    { key: 'nombre',                label: 'Nombre Iniciativa',     desc: '⚠ NO MODIFICAR — Solo referencia',                                                                                         wch: 52, editable: false },
    { key: 'ministerio',            label: 'Ministerio',            desc: '⚠ NO MODIFICAR — Solo referencia',                                                                                         wch: 24, editable: false },
    // ── Campos editables ───────────────────────────────────────────────────
    { key: 'eje_gobierno',          label: 'Eje Gobierno',          desc: 'Valores: Economía | Social | Seguridad',                                                                                   wch: 16, editable: true  },
    { key: 'prioridad',             label: 'Prioridad',             desc: 'Valores: Alta | Media | Baja   (máx. 10% en Alta)',                                                                        wch: 14, editable: true  },
    { key: 'etapa_actual',          label: 'Etapa Actual',          desc: 'Valores: Preinversión | Diseño | Ejecución | Terminado',                                                                   wch: 20, editable: true  },
    { key: 'estado_termino_gobierno', label: 'Estado Término Gob.', desc: 'Valores: Inaugurado/Terminado/Presentado | Término Diseño | Inicio Obras/Programa | Término Etapa Preinversional | Adjudicación de Licitación', wch: 36, editable: true },
    { key: 'estado_semaforo',       label: 'Semáforo',              desc: 'Valores: verde | ambar | rojo | gris',                                                                                     wch: 14, editable: true  },
    { key: 'pct_avance',            label: 'Avance %',              desc: 'Número entero de 0 a 100  (ej: 65)',                                                                                       wch: 12, editable: true  },
    { key: 'responsable',           label: 'Responsable',           desc: 'Texto libre — nombre del responsable en la Delegación',                                                                    wch: 24, editable: true  },
    { key: 'proximo_hito',          label: 'Próximo Hito',          desc: 'Valores: Otro | Obtención RS | Obtención Financiamiento | Presentación Core | Publicación Bases Licitación | Adjudicación Licitación | Término Diseño/Preinversión | Primera Piedra | Inicio Obras/Programa | Término Obras/Programa | Inauguración | Finalizado', wch: 42, editable: true },
    { key: 'fecha_proximo_hito',    label: 'Fecha Próximo Hito',    desc: 'Formato DD-MM-AAAA  (ej: 15-06-2025)  — puede estar vacío',                                                               wch: 22, editable: true  },
    { key: 'inversion_mm',          label: 'Inversión MM$',         desc: 'Número en millones de pesos, puede tener decimales  (ej: 1500  o  1500.5) — puede estar vacío',                          wch: 18, editable: true  },
    { key: 'codigo_bip',            label: 'Código BIP',            desc: 'Código numérico del BIP/MIDESO — puede estar vacío si no aplica',                                                         wch: 16, editable: true  },
    { key: 'codigo_iniciativa',     label: 'Código Iniciativa',     desc: 'Código interno del sistema DCI  (ej: INI-2025-0042) — puede estar vacío',                                                 wch: 22, editable: true  },
    { key: 'rat',                   label: 'RAT',                   desc: 'Valores: No Requiere | No Ingresado | En Tramitación | FI | IN | OT | RE | RS',                                           wch: 20, editable: true  },
    { key: 'fuente_financiamiento', label: 'Fuente Financiamiento', desc: 'Valores: FNDR | Mixto | Sectorial | Privado | FONDEMA | PEDZE — puede estar vacío',                                       wch: 24, editable: true  },
    { key: 'descripcion',           label: 'Descripción',           desc: 'Texto libre — descripción detallada de la iniciativa — puede estar vacío',                                                 wch: 54, editable: true  },
    { key: 'comuna',                label: 'Comuna',                desc: 'Texto libre — dejar vacío si abarca toda la región',                                                                       wch: 20, editable: true  },
  ] as const

  function downloadTemplate() {
    // Row 1: headers (column labels)
    const headerRow = TEMPLATE_COLS.map(c => c.label)
    // Row 2: descriptions (valid values guide) — no data rows, team fills this in
    const descRow = TEMPLATE_COLS.map(c => c.desc)

    const ws = XLSX.utils.aoa_to_sheet([headerRow, descRow])
    ws['!cols'] = TEMPLATE_COLS.map(c => ({ wch: c.wch }))
    // Freeze the 2-row header so users can always see field names + valid values while scrolling
    ws['!freeze'] = { xSplit: 4, ySplit: 2 }

    // ── Instrucciones sheet ─────────────────────────────────────────────────
    const instrAoa = [
      ['GUÍA DE LLENADO — Módulo de Importación de Iniciativas Territoriales', '', '', ''],
      ['División de Coordinación Interministerial  ·  Unidad de Regiones', '', '', ''],
      ['', '', '', ''],
      ['CÓMO USAR ESTE ARCHIVO', '', '', ''],
      ['1. Trabaja SOLO en la hoja "Carga". No mover ni renombrar esa hoja.', '', '', ''],
      ['2. Las primeras 4 columnas (# / Región / Nombre / Ministerio) son solo referencia — NO las modifiques.', '', '', ''],
      ['3. La fila 2 (en gris) indica los valores permitidos para cada campo. Esa fila NO se importa.', '', '', ''],
      ['4. Edita los campos desde la columna E en adelante, a partir de la fila 3.', '', '', ''],
      ['5. Para dejar un campo vacío (limpiar el dato), simplemente borra la celda.', '', '', ''],
      ['6. Sube el archivo desde el botón "Importar" en el Dashboard.', '', '', ''],
      ['', '', '', ''],
      ['CAMPO', 'OBLIGATORIO', 'VALORES PERMITIDOS', 'DESCRIPCIÓN'],
      ['#', 'Solo referencia', '—', 'Identificador único. NO MODIFICAR.'],
      ['Región', 'Solo referencia', '—', 'Región. NO MODIFICAR.'],
      ['Nombre Iniciativa', 'Solo referencia', '—', 'Nombre. NO MODIFICAR.'],
      ['Ministerio', 'Solo referencia', '—', 'Ministerio ejecutor. NO MODIFICAR.'],
      ['Eje Gobierno', 'No', 'Economía | Social | Seguridad', 'Eje presidencial al que pertenece la iniciativa.'],
      ['Prioridad', 'No', 'Alta | Media | Baja', 'Nivel de prioridad. Máximo 10% de iniciativas puede ser Alta.'],
      ['Etapa Actual', 'Sí', 'Preinversión | Diseño | Ejecución | Terminado', 'Etapa en que se encuentra actualmente la iniciativa.'],
      ['Estado Término Gob.', 'Sí', 'Inaugurado/Terminado/Presentado · Término Diseño · Inicio Obras/Programa · Término Etapa Preinversional · Adjudicación de Licitación', 'Estado en que se espera encontrar la iniciativa al término del gobierno. No puede quedar vacío.'],
      ['Semáforo', 'No', 'verde | ambar | rojo | gris', 'Estado de avance general de la iniciativa. verde = en tiempo; ambar = en revisión; rojo = bloqueado; gris = sin evaluar.'],
      ['Avance %', 'No', 'Número entero 0–100', 'Porcentaje de avance de la iniciativa.'],
      ['Responsable', 'No', 'Texto libre', 'Nombre del referente en la Delegación Presidencial.'],
      ['Próximo Hito', 'Sí', 'Otro · Obtención RS · Obtención Financiamiento · Presentación Core · Publicación Bases Licitación · Adjudicación Licitación · Término Diseño/Preinversión · Primera Piedra · Inicio Obras/Programa · Término Obras/Programa · Inauguración · Finalizado', 'Próximo hito concreto esperado. Debe actualizarse en cada reporte.'],
      ['Fecha Próximo Hito', 'No', 'DD-MM-AAAA  (ej: 15-06-2025)', 'Fecha estimada del próximo hito. Puede estar vacío.'],
      ['Inversión MM$', 'No', 'Número  (ej: 1500  o  1500.5)', 'Monto en millones de pesos. Puede estar vacío.'],
      ['Código BIP', 'No', 'Código numérico', 'Código del BIP/MIDESO. Dejar vacío si no aplica (ej: iniciativas legislativas).'],
      ['Código Iniciativa', 'No', 'Ej: INI-2025-0042', 'Código interno del sistema DCI. Puede estar vacío.'],
      ['RAT', 'No', 'No Requiere · No Ingresado · En Tramitación · FI · IN · OT · RE · RS', 'FI = Factibilidad Inicial; IN = Ingresado; RS = Recomendación Satisfactoria; RE = Revisado con Errores; OT = Otro.'],
      ['Fuente Financiamiento', 'No', 'FNDR · Mixto · Sectorial · Privado · FONDEMA · PEDZE', 'FNDR = Fondo Nacional de Desarrollo Regional; FONDEMA = Fondo de Desarrollo Zonas Extremas; PEDZE = Plan Especial Zonas Extremas.'],
      ['Descripción', 'No', 'Texto libre', 'Descripción detallada de la iniciativa. Puede estar vacío.'],
      ['Comuna', 'No', 'Texto libre', 'Comuna de ejecución. Dejar vacío si abarca toda la región.'],
    ]
    const wsInstr = XLSX.utils.aoa_to_sheet(instrAoa)
    wsInstr['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 80 }, { wch: 60 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Carga')
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones')
    XLSX.writeFile(wb, 'template-prioridades.xlsx')
  }

  // Closed-list validators
  const VALID_SEMAFORO       = ['verde', 'ambar', 'rojo', 'gris']
  const VALID_PRIORIDAD      = ['Alta', 'Media', 'Baja']
  const VALID_RAT            = ['No Requiere', 'No Ingresado', 'En Tramitación', 'FI', 'IN', 'OT', 'RE', 'RS']
  const VALID_ETAPA          = ['Preinversión', 'Diseño', 'Ejecución', 'Terminado']
  const VALID_ESTADO_TERMINO = ['Inaugurado/Terminado/Presentado', 'Término Diseño', 'Inicio Obras/Programa', 'Término Etapa Preinversional', 'Adjudicación de Licitación']
  const VALID_PROXIMO_HITO   = ['Otro', 'Obtención RS', 'Obtención Financiamiento', 'Presentación Core', 'Publicación Bases Licitación', 'Adjudicación Licitación', 'Término Diseño/Preinversión', 'Primera Piedra', 'Inicio Obras/Programa', 'Término Obras/Programa', 'Inauguración', 'Finalizado']
  const VALID_FUENTE         = ['FNDR', 'Mixto', 'Sectorial', 'Privado', 'FONDEMA', 'PEDZE']
  const VALID_EJE_GOBIERNO   = ['Economía', 'Social', 'Seguridad']

  // Phase 1: parse file and build preview (no DB writes)
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    const parseErrors: string[] = []

    try {
      const arrayBuffer = await file.arrayBuffer()
      const wb = XLSX.read(arrayBuffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]

      // row[0]=headers, row[1]=descriptions (skip), row[2+]=data
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
      if (raw.length < 3) {
        setImportParseErrors(['El archivo no tiene filas de datos. Agrega datos a partir de la fila 3.'])
        setImportPreview([])
        setImportModalOpen(true)
        return
      }

      const headers = raw[0] as string[]
      const dataRows = raw.slice(2)

      function col(row: string[], label: string): string {
        const idx = headers.indexOf(label)
        return idx >= 0 ? String(row[idx] ?? '').trim() : ''
      }

      const preview: ImportPreviewRow[] = []

      for (const row of dataRows) {
        const nStr = col(row, '#')
        if (!nStr) continue
        const n = Number(nStr)
        if (isNaN(n) || n <= 0) { parseErrors.push(`Fila con # inválido "${nStr}" — omitida`); continue }

        const project = projects.find(p => p.n === n)
        if (!project) { parseErrors.push(`#${n}: no encontrado en el sistema — omitido`); continue }

        const rowErrors: string[] = []
        const patch: Record<string, unknown> = {}

        // ── Closed-list fields ──
        const semaforo = col(row, 'Semáforo')
        if (semaforo) {
          if (!VALID_SEMAFORO.includes(semaforo)) rowErrors.push(`semáforo "${semaforo}" inválido`)
          else patch.estado_semaforo = semaforo
        }
        const prioridad = col(row, 'Prioridad')
        if (prioridad) {
          if (!VALID_PRIORIDAD.includes(prioridad)) rowErrors.push(`prioridad "${prioridad}" inválida`)
          else patch.prioridad = prioridad
        }
        const etapa = col(row, 'Etapa Actual')
        if (etapa) {
          if (!VALID_ETAPA.includes(etapa)) rowErrors.push(`etapa "${etapa}" inválida`)
          else patch.etapa_actual = etapa
        }
        const estadoTermino = col(row, 'Estado Término Gob.')
        if (estadoTermino) {
          if (!VALID_ESTADO_TERMINO.includes(estadoTermino)) rowErrors.push(`estado término "${estadoTermino}" inválido`)
          else patch.estado_termino_gobierno = estadoTermino
        }
        const proximoHito = col(row, 'Próximo Hito')
        if (proximoHito) {
          if (!VALID_PROXIMO_HITO.includes(proximoHito)) rowErrors.push(`próximo hito "${proximoHito}" inválido`)
          else patch.proximo_hito = proximoHito
        }
        const fuente = col(row, 'Fuente Financiamiento')
        if (fuente) {
          if (!VALID_FUENTE.includes(fuente)) rowErrors.push(`fuente "${fuente}" inválida`)
          else patch.fuente_financiamiento = fuente
        }
        const rat = col(row, 'RAT')
        if (rat) {
          if (!VALID_RAT.includes(rat)) rowErrors.push(`RAT "${rat}" inválido`)
          else patch.rat = rat
        }
        const ejeGobierno = col(row, 'Eje Gobierno')
        if (ejeGobierno) {
          if (!VALID_EJE_GOBIERNO.includes(ejeGobierno)) rowErrors.push(`eje gobierno "${ejeGobierno}" inválido`)
          else patch.eje_gobierno = ejeGobierno
        }

        // ── Numeric fields ──
        const avanceStr = col(row, 'Avance %')
        if (avanceStr !== '') {
          const num = Number(avanceStr)
          if (isNaN(num) || num < 0 || num > 100) rowErrors.push(`avance "${avanceStr}" inválido (0–100)`)
          else patch.pct_avance = Math.round(num)
        }
        const inversionStr = col(row, 'Inversión MM$')
        if (inversionStr !== '') {
          const num = Number(String(inversionStr).replace(',', '.'))
          if (isNaN(num)) rowErrors.push(`inversión "${inversionStr}" inválida`)
          else patch.inversion_mm = num
        }

        // ── Date: DD-MM-AAAA → YYYY-MM-DD ──
        const fechaRaw = col(row, 'Fecha Próximo Hito')
        if (fechaRaw !== '') {
          const dm = fechaRaw.match(/^(\d{2})-(\d{2})-(\d{4})$/)
          if (!dm) rowErrors.push(`fecha "${fechaRaw}" inválida — usar DD-MM-AAAA`)
          else patch.fecha_proximo_hito = `${dm[3]}-${dm[2]}-${dm[1]}`
        }

        // ── Free text fields ──
        for (const [label, dbCol] of [
          ['Responsable', 'responsable'],
          ['Código BIP', 'codigo_bip'],
          ['Código Iniciativa', 'codigo_iniciativa'],
          ['Descripción', 'descripcion'],
          ['Comuna', 'comuna'],
        ] as [string, string][]) {
          const val = col(row, label)
          if (val !== undefined) patch[dbCol] = val === '' ? null : val
        }

        preview.push({ n, nombre: project.nombre, region: project.region, patch, errors: rowErrors })
      }

      setImportParseErrors(parseErrors)
      setImportPreview(preview)
      setImportModalOpen(true)
    } catch (err) {
      setImportParseErrors([`Error al leer el archivo: ${String(err)}`])
      setImportPreview([])
      setImportModalOpen(true)
    }
  }

  // Phase 2: save validated rows to DB
  async function applyImport() {
    if (!importPreview) return
    setImporting(true)

    const toSave = importPreview.filter(r => r.errors.length === 0 && Object.keys(r.patch).length > 0)
    const errors: string[] = []
    let updated = 0

    for (const row of toSave) {
      const { error } = await getSupabase()
        .from('prioridades_territoriales')
        .update(row.patch)
        .eq('n', row.n)

      if (error) {
        errors.push(`#${row.n}: ${error.message}`)
      } else {
        updated++
        onUpdatePrioridad(row.n, row.patch as Partial<Iniciativa>)
      }
    }

    setImporting(false)
    setImportModalOpen(false)
    setImportPreview(null)
    setImportResult({ updated, errors })
  }

  // ── Export ────────────────────────────────────────────────────────────────

  const exportCount = projects.filter(p => exportRegions.has(p.region) && exportEjes.has(p.eje)).length

  function exportExcelFiltered() {
    const toExport = projects.filter(p => exportRegions.has(p.region) && exportEjes.has(p.eje))
    const rows = toExport.map(p => ({
      '#': p.n,
      Región: p.region,
      Capital: p.capital,
      Zona: p.zona,
      Comuna: p.comuna ?? '',
      'Eje Regional': p.eje,
      'Eje Gobierno': p.eje_gobierno ?? '',
      Iniciativa: p.nombre,
      Descripción: p.descripcion ?? '',
      Ministerio: p.ministerio,
      Prioridad: p.prioridad,
      'Etapa Actual': p.etapa_actual ?? '',
      'Estado Término Gob.': p.estado_termino_gobierno ?? '',
      Semáforo: SEMAFORO_CONFIG[p.estado_semaforo]?.label ?? p.estado_semaforo,
      'Avance (%)': p.pct_avance,
      Responsable: p.responsable ?? '',
      'Próximo Hito': p.proximo_hito ?? '',
      'Fecha Próximo Hito': p.fecha_proximo_hito ? formatDate(p.fecha_proximo_hito) : '',
      'Inversión MM$': p.inversion_mm ?? '',
      'Código BIP': p.codigo_bip ?? '',
      'Código Iniciativa': p.codigo_iniciativa ?? '',
      RAT: p.rat ?? '',
      'Fuente Financiamiento': p.fuente_financiamiento ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Prioridades')
    const fecha = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `prioridades-territoriales-${fecha}.xlsx`)
    setExportModalOpen(false)
  }

  const hasFilters = search || filterRegion !== 'todas' || filterEje !== 'todos' ||
    filterSemaforo !== 'todos' || filterPrioridad !== 'todas'

  function ColHeader({ col, label }: { col: SortCol; label: string }) {
    const active = sortCol === col
    return (
      <th
        onClick={() => handleSort(col)}
        className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-900 select-none whitespace-nowrap"
      >
        <span className="flex items-center gap-1">
          {label}
          <span className={`text-gray-300 ${active ? 'text-gray-600' : ''}`}>
            {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </span>
      </th>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Summary bar ── */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3 flex-wrap">
          <SummaryCard label="Total" value={projects.length.toString()} color="text-gray-800" bg="bg-gray-50" />
          <SummaryCard label="Bloqueadas" value={rojo.toString()} color="text-red-700" bg="bg-red-50" dot="bg-red-500" />
          <SummaryCard label="En revisión" value={ambar.toString()} color="text-amber-700" bg="bg-amber-50" dot="bg-amber-400" />
          <SummaryCard label="En verde" value={verde.toString()} color="text-green-700" bg="bg-green-50" dot="bg-green-500" />
          <SummaryCard label="Sin evaluar" value={gris.toString()} color="text-gray-600" bg="bg-gray-100" dot="bg-gray-300" />
          <div className="ml-auto flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2">
            <span className="text-xs text-gray-500">Avance promedio</span>
            <span className="text-lg font-bold text-slate-700">{avgPct}%</span>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-100 bg-white space-y-2">
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
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white w-64 text-gray-800"
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

          {/* Eje */}
          <select
            value={filterEje}
            onChange={e => setFilterEje(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300 max-w-[200px]"
          >
            <option value="todos">Todos los ejes</option>
            {EJES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>

          {/* Semáforo chips */}
          <div className="flex items-center gap-1">
            {(['todos', 'rojo', 'ambar', 'verde', 'gris'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterSemaforo(s)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${
                  filterSemaforo === s ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s !== 'todos' && <span className={`w-2 h-2 rounded-full ${SEMAFORO_CONFIG[s].dot}`}/>}
                {s === 'todos' ? 'Todos' : SEMAFORO_CONFIG[s].label}
              </button>
            ))}
          </div>

          {/* Prioridad chips */}
          <div className="flex items-center gap-1">
            {(['todas', 'Alta', 'Media', 'Baja'] as const).map(p => (
              <button
                key={p}
                onClick={() => setFilterPrioridad(p)}
                className={`text-xs px-2 py-1 rounded-full transition-colors ${
                  filterPrioridad === p ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {p === 'todas' ? 'Todas' : p}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-700 underline ml-1">
              Limpiar
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">{filtered.length} prioridades</span>

            {/* Import group */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 9h8M6 7V2M3.5 4.5L6 2l2.5 2.5"/>
                </svg>
                Importar
              </button>
              <button
                onClick={downloadTemplate}
                title="Descargar template de carga"
                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium border border-blue-200"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 9h8M6 2v6M3.5 5.5L6 8l2.5-2.5"/>
                </svg>
                Template
              </button>
            </div>

            <button
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-medium"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 9h8M6 2v6M3.5 5.5L6 8l2.5-2.5"/>
              </svg>
              Excel
            </button>
          </div>
        </div>
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
              ? `${importResult.updated} iniciativa${importResult.updated !== 1 ? 's' : ''} actualizada${importResult.updated !== 1 ? 's' : ''} correctamente.`
              : `${importResult.updated} actualizadas, ${importResult.errors.length} error${importResult.errors.length !== 1 ? 'es' : ''}:`}
          </span>
          {importResult.errors.length > 0 && (
            <span className="text-amber-700">{importResult.errors.join(' · ')}</span>
          )}
          <button onClick={() => setImportResult(null)} className="ml-auto text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
            <tr>
              <ColHeader col="n" label="#" />
              <ColHeader col="region" label="Región" />
              <ColHeader col="ejeGobierno" label="Eje Gobierno" />
              <ColHeader col="eje" label="Eje Regional" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Meta</th>
              <ColHeader col="semaforo" label="Estado" />
              <ColHeader col="avance" label="Avance" />
              <ColHeader col="prioridad" label="Prioridad" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Estado Término Gob.</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Próximo Hito</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Inversión MM$</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">RAT</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Fuente Financiamiento</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Responsable</th>
              <ColHeader col="actividad" label="Actividad" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-6 py-16 text-center text-gray-400 text-sm">
                  Sin prioridades con estos filtros.{' '}
                  <button onClick={clearFilters} className="underline text-slate-600">Limpiar filtros</button>
                </td>
              </tr>
            ) : filtered.map(p => {
              const sem = SEMAFORO_CONFIG[p.estado_semaforo]
              const ejeColor = EJE_COLORS[p.eje] ?? 'bg-gray-100 text-gray-600'
              return (
                <tr
                  key={p.n}
                  onClick={() => setSelected(p)}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-3 text-xs text-gray-500 font-mono">{p.n}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="text-xs font-medium text-gray-800">{p.region}</div>
                    <div className="text-xs text-gray-500">{p.capital}</div>
                    <div className="text-xs text-gray-400">{p.zona}{p.comuna ? ` · ${p.comuna}` : ''}</div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {(() => {
                      const gob = p.eje_gobierno
                      const cls = gob === 'Seguridad' ? 'bg-red-50 text-red-700' :
                                  gob === 'Social'    ? 'bg-purple-50 text-purple-700' :
                                                       'bg-blue-50 text-blue-700'
                      return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>{gob ?? '—'}</span>
                    })()}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ejeColor}`}>
                      {p.eje}
                    </span>
                  </td>
                  <td className="px-3 py-3 max-w-[300px]">
                    <p className="text-xs text-gray-800 line-clamp-2 leading-snug">{p.nombre}</p>
                    <span className="text-xs text-gray-500 mt-0.5 block">{p.ministerio}</span>
                    {p.etapa_actual && (
                      <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded mt-0.5 inline-block leading-tight">{p.etapa_actual}</span>
                    )}
                    {(p.codigo_bip || p.codigo_iniciativa) && (
                      <span className="text-xs text-gray-400 font-mono mt-0.5 block">
                        {[p.codigo_bip && `BIP: ${p.codigo_bip}`, p.codigo_iniciativa && `Cód: ${p.codigo_iniciativa}`].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${sem.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sem.dot}`}/>
                      {sem.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
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
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${prioridadColor(p.prioridad).bg} ${prioridadColor(p.prioridad).text}`}>
                      {p.prioridad}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {p.estado_termino_gobierno ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 max-w-[200px]">
                    {p.proximo_hito
                      ? <>
                          <p className="text-xs text-gray-700 line-clamp-2 leading-snug">{p.proximo_hito}</p>
                          {p.fecha_proximo_hito && (
                            <span className="text-xs text-gray-400 mt-0.5 block">{formatDate(p.fecha_proximo_hito)}</span>
                          )}
                        </>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {p.inversion_mm != null
                      ? <span className="text-xs font-mono text-gray-700">{p.inversion_mm.toLocaleString('es-CL')} MM$</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {p.rat
                      ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ratColor(p.rat)}`}>{p.rat}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600 max-w-[160px]">
                    {p.fuente_financiamiento
                      ? <span className="line-clamp-2 block">{p.fuente_financiamiento}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap max-w-[120px]">
                    {p.responsable
                      ? <span className="truncate block">{p.responsable}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Import preview modal ── */}
      {importModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Revisión de importación</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Revisa los cambios antes de confirmar. Solo se guardarán las filas sin errores.
                </p>
              </div>
              <button onClick={() => setImportModalOpen(false)} className="text-gray-400 hover:text-gray-600 mt-0.5">✕</button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              {/* Parse-level errors (not row-specific) */}
              {importParseErrors.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-0.5">
                  {importParseErrors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                </div>
              )}

              {/* Summary chips */}
              {importPreview && importPreview.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                    {importPreview.filter(r => r.errors.length === 0 && Object.keys(r.patch).length > 0).length} listas para guardar
                  </span>
                  {importPreview.filter(r => r.errors.length > 0).length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
                      {importPreview.filter(r => r.errors.length > 0).length} con errores
                    </span>
                  )}
                  {importPreview.filter(r => r.errors.length === 0 && Object.keys(r.patch).length === 0).length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                      {importPreview.filter(r => r.errors.length === 0 && Object.keys(r.patch).length === 0).length} sin cambios
                    </span>
                  )}
                </div>
              )}

              {/* Preview table */}
              {importPreview && importPreview.length > 0 ? (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 w-8">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Región</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Nombre</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Campos a actualizar / Errores</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 w-16">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map(row => (
                      <tr key={row.n} className={`border-b border-gray-50 ${row.errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 font-mono text-gray-400">{row.n}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.region}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[180px]">
                          <span className="line-clamp-2 leading-snug">{row.nombre}</span>
                        </td>
                        <td className="px-3 py-2 max-w-[280px]">
                          {row.errors.length > 0 ? (
                            <span className="text-red-600">{row.errors.join(' · ')}</span>
                          ) : Object.keys(row.patch).length > 0 ? (
                            <span className="text-green-700">{Object.keys(row.patch).join(', ')}</span>
                          ) : (
                            <span className="text-gray-400">Sin cambios en esta fila</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {row.errors.length > 0 ? (
                            <span className="text-red-500 font-medium">✗ Error</span>
                          ) : Object.keys(row.patch).length > 0 ? (
                            <span className="text-green-600 font-medium">✓ OK</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                !importParseErrors.length && (
                  <p className="text-xs text-gray-400 text-center py-8">No se encontraron filas con datos.</p>
                )
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {importPreview?.filter(r => r.errors.length === 0 && Object.keys(r.patch).length > 0).length ?? 0} iniciativas se actualizarán en la base de datos
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setImportModalOpen(false)}
                  className="text-xs px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={applyImport}
                  disabled={importing || (importPreview?.filter(r => r.errors.length === 0 && Object.keys(r.patch).length > 0).length ?? 0) === 0}
                  className="text-xs px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 font-medium flex items-center gap-1.5"
                >
                  {importing && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="animate-spin">
                      <circle cx="6" cy="6" r="4" strokeDasharray="20 5"/>
                    </svg>
                  )}
                  {importing ? 'Guardando…' : 'Confirmar importación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Export modal ── */}
      {exportModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Exportar a Excel</h2>
                <p className="text-xs text-gray-500 mt-0.5">Selecciona las regiones y ejes a incluir</p>
              </div>
              <button onClick={() => setExportModalOpen(false)} className="text-gray-400 hover:text-gray-600 mt-0.5">✕</button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-5">
              {/* Regions */}
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

              {/* Ejes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Ejes</span>
                  <div className="flex gap-2">
                    <button onClick={() => setExportEjes(new Set(EJES))} className="text-xs text-blue-600 hover:underline">Todos</button>
                    <button onClick={() => setExportEjes(new Set())} className="text-xs text-gray-400 hover:underline">Ninguno</button>
                  </div>
                </div>
                <div className="space-y-1">
                  {EJES.map(e => (
                    <label key={e} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer hover:text-gray-900 py-0.5">
                      <input
                        type="checkbox"
                        checked={exportEjes.has(e)}
                        onChange={ev => {
                          const next = new Set(exportEjes)
                          if (ev.target.checked) next.add(e)
                          else next.delete(e)
                          setExportEjes(next)
                        }}
                        className="rounded"
                      />
                      <span>{e}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">{exportCount} iniciativas seleccionadas</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setExportModalOpen(false)}
                  className="text-xs px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={exportExcelFiltered}
                  disabled={exportCount === 0}
                  className="text-xs px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-60 font-medium flex items-center gap-1.5"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 9h8M6 2v6M3.5 5.5L6 8l2.5-2.5"/>
                  </svg>
                  Descargar Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {selectedSynced && (
        <ProjectTrackerModal
          prioridad={selectedSynced}
          onClose={() => setSelected(null)}
          onUpdatePrioridad={onUpdatePrioridad}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, color, bg, dot }: {
  label: string; value: string; color: string; bg: string; dot?: string
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${bg}`}>
      {dot && <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`}/>}
      <div>
        <div className="text-xs text-gray-500 leading-tight">{label}</div>
        <div className={`text-lg font-bold leading-tight ${color}`}>{value}</div>
      </div>
    </div>
  )
}
