'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import { MESA_EMPLEO_HABILITADA } from '@/lib/sesiones/helpers'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type {
  ComiteEconomicoProyecto, EjeSesion, Oaeca, RegionMetaEmpleo, RegionSubsidioEmpleo, SeccionComiteEconomico,
  SesionAsistencia, SesionCompromiso, SesionMetaEmpleoValor, SesionNomina, SesionOficioTratado, SesionProyecto,
  SesionSubsidioEmpleoValor,
} from '@/lib/types'
import { Alert } from '@/components/ui'
import { useDialogA11y } from '@/lib/hooks/useDialogA11y'
import ProyectoEconomicoFichaModal from './ProyectoEconomicoFichaModal'
import FilterPopover, { type FilterOption } from './FilterPopover'
import ActiveFiltersBar, { setChip } from './ActiveFiltersBar'

/**
 * Formulario de sesión del Comité Económico — 5 zonas EN ESTE ORDEN (mismo
 * criterio que SesionModal.tsx: el orden es producto):
 *   1. Integrantes (nómina fija + invitados — igual que Asistencia)
 *   2. Compromisos anteriores (si hubieron) — de CUALQUIERA de las dos
 *      secciones o generales, fuera de ambas; sube justo bajo Integrantes
 *      (mismo criterio que Zona 1 de SesionModal.tsx: verificar primero)
 *   3. Mesa Empleo (desplegable) — Meta Empleo (indicador con objetivo +
 *      acumulado, mig 052) y Proyectos de Inversión Pública (módulo
 *      placeholder — la tabla se arma más adelante)
 *   4. Seguimiento de la Inversión (desplegable) — lo que ya existía:
 *      4a. Oficios anteriores (verificación)
 *      4b. Oficios tratados nuevos (alta directa: OAECA + fecha límite +
 *          proyecto — no hay import de Excel)
 *      4c. Proyectos tratados en profundidad (selección desde catálogo
 *          real, v2_proyectos_inversion — no texto libre)
 *   5. Compromisos nuevos — `seccion` es obligatoria (mesa_empleo /
 *      seguimiento_inversion / general) y genera el tag al listar;
 *      `proyecto_id` es opcional en cualquier sección.
 *
 * A diferencia de SesionModal, este comité NO tiene eje: las queries de
 * sesion_nomina/sesion_compromisos/eje_sesiones filtran por
 * `instancia='inversion'` en vez de `eje_id`, y no hay zona de indicadores
 * (metricas_eje) porque no hay eje al que alimentar.
 *
 * OAECA y proyectos (Seguimiento de la Inversión) se precargan UNA vez en
 * loadAll (nada de búsqueda contra el servidor por cada tecla) — oaeca es
 * una tabla chica global, proyectos se filtra por región. OAECA además
 * admite crear uno nuevo inline si no calza con el catálogo (autoincremental).
 */

type V2Proyecto = {
  id: string
  nombre: string
  titular: string | null
  inversion: number | null
  moneda: string | null
  etapa: string | null
}

type SesionOficioConNombres = SesionOficioTratado & {
  oaeca: { nombre: string } | null
  proyecto: { nombre: string } | null
}

type Props = {
  region: Region
  borradorId: number | null
  currentUserEmail: string
  // Cartera de la región (mismo dato que ComiteEconomicoProyectosPanel, sin
  // query nueva) — alimenta el picker "Público" de la zona 4c y el
  // onAbrirIniciativa que resuelve VistaRegional.
  iniciativas: Iniciativa[]
  onAbrirIniciativa: (p: Iniciativa) => void
  onClose: () => void
}

const NOMBRE_COMITE = 'Comité Económico'

// Público = iniciativas con esta etiqueta fija (mismo criterio que
// ComiteEconomicoProyectosPanel.tsx — no configurable por región).
const TAG_ECONOMICO = 'CER'

const ESTADO_COMPROMISO = {
  pendiente: { label: 'Pendiente', on: 'bg-gray-600 text-white',   off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
  en_curso:  { label: 'En curso',  on: 'bg-blue-600 text-white',   off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
  cumplido:  { label: 'Cumplido',  on: 'bg-green-600 text-white',  off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
} as const

const ESTADO_OFICIO = {
  pendiente: { label: 'Pendiente', on: 'bg-gray-600 text-white',  off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
  resuelto:  { label: 'Resuelto',  on: 'bg-green-600 text-white', off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
} as const

const SECCION_LABEL: Record<SeccionComiteEconomico, string> = {
  mesa_empleo:            'Mesa Empleo',
  seguimiento_inversion:  'Seguimiento Inversión',
  general:                'General',
}
const SECCION_TAG_CLS: Record<SeccionComiteEconomico, string> = {
  mesa_empleo:            'bg-amber-50 text-amber-700 border-amber-200',
  seguimiento_inversion:  'bg-violet-50 text-violet-700 border-violet-200',
  general:                'bg-gray-100 text-gray-600 border-gray-200',
}

function SeccionTag({ seccion }: { seccion: SeccionComiteEconomico | null }) {
  if (!seccion) return null
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${SECCION_TAG_CLS[seccion]}`}>
      {SECCION_LABEL[seccion]}
    </span>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
      className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="M2.5 4.5L6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const inputCls = 'px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300'
const zoneCls  = 'border border-gray-200 rounded-xl overflow-hidden'
const zoneHead = 'px-4 py-2.5 bg-violet-50/70 border-b border-violet-100 flex items-center gap-2'
const zoneNum  = 'w-5 h-5 rounded-full bg-violet-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0'

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

function fmtFecha(fecha: string | null): string {
  if (!fecha) return '—'
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Comboboxes locales (precargados — sin ida y vuelta al servidor) ─────────

function ComboboxOaeca({
  oaecaList, value, onSelect, onCreate, placeholder, label,
}: {
  oaecaList: Oaeca[]
  value: Oaeca | null
  onSelect: (o: Oaeca | null) => void
  onCreate: (nombre: string) => Promise<Oaeca | null>
  placeholder: string
  label?: string
}) {
  const [query, setQuery]     = useState(value?.nombre ?? '')
  const [open, setOpen]       = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => { setQuery(value?.nombre ?? '') }, [value])

  const q = query.trim()
  const matches = useMemo(() => {
    if (!q) return oaecaList
    return oaecaList.filter(o => o.nombre.toLowerCase().includes(q.toLowerCase()))
  }, [q, oaecaList])
  const exactMatch = oaecaList.some(o => o.nombre.toLowerCase() === q.toLowerCase())

  async function crear() {
    setCreating(true)
    const created = await onCreate(q)
    setCreating(false)
    if (created) { onSelect(created); setQuery(created.nombre); setOpen(false) }
  }

  const input = (
    <input
      type="text"
      value={query}
      onChange={e => {
        setQuery(e.target.value)
        setOpen(true)
        if (value) onSelect(null)
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      placeholder={placeholder}
      className={`${inputCls} w-full`}
    />
  )

  return (
    <div className="relative">
      {label ? (
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500 font-medium">{label}</span>
          {input}
        </label>
      ) : input}
      {open && (matches.length > 0 || (q && !exactMatch)) && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {matches.map(o => (
            <button
              key={o.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(o); setQuery(o.nombre); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-violet-50 border-b border-gray-100 last:border-0"
            >
              {o.nombre}
            </button>
          ))}
          {q && !exactMatch && (
            <button
              type="button"
              disabled={creating}
              onMouseDown={e => e.preventDefault()}
              onClick={crear}
              className="w-full text-left px-3 py-2 text-sm text-violet-700 font-medium hover:bg-violet-50 disabled:opacity-50"
            >
              {creating ? 'Agregando…' : `+ Agregar "${q}" como nueva OAECA`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Picker genérico de la zona 4c — mismo patrón que ComboboxProyecto/Oaeca
// (precargado, sin ida y vuelta al servidor), reusado para privados
// (ComiteEconomicoProyecto) y públicos (Iniciativa): ambos ya traen
// `id`/`nombre`.
function ComboboxProyectoEconomico<T extends { id: number; nombre: string }>({
  items, onSelect, placeholder,
}: {
  items: T[]
  onSelect: (item: T) => void
  placeholder: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? items.filter(i => i.nombre.toLowerCase().includes(q)) : items
    return base.slice(0, 30)
  }, [query, items])

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={`${inputCls} w-full`}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {matches.map(item => (
            <button
              key={item.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(item); setQuery(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-violet-50 border-b border-gray-100 last:border-0 truncate"
            >
              {item.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// "+" para dejar un avance rápido en un proyecto/iniciativa de la cartera
// desde dentro de la sesión (proyectos tratados, oficios, compromisos) —
// mismo estilo liviano que agregar un avance en la ficha del proyecto.
function AgregarAvanceInline({ onSubmit }: { onSubmit: (texto: string) => Promise<void> }) {
  const [open, setOpen]     = useState(false)
  const [texto, setTexto]   = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-gray-300 hover:text-violet-600 p-0.5 flex-shrink-0"
        title="Agregar un avance a este proyecto"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 2v10M2 7h10" strokeLinecap="round"/>
        </svg>
      </button>
    )
  }
  return (
    <div className="mt-1.5 space-y-1.5">
      <textarea
        autoFocus
        value={texto}
        onChange={e => setTexto(e.target.value)}
        rows={2}
        placeholder="Avance para este proyecto…"
        className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-300 resize-y"
      />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => { setOpen(false); setTexto('') }} className="text-xs text-gray-400 hover:text-gray-600">
          Cancelar
        </button>
        <button
          type="button"
          onClick={async () => {
            setSaving(true)
            await onSubmit(texto.trim())
            setSaving(false); setOpen(false); setTexto('')
          }}
          disabled={saving || !texto.trim()}
          className="text-xs px-3 py-1 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800 disabled:opacity-40"
        >
          {saving ? 'Guardando…' : 'Guardar avance'}
        </button>
      </div>
    </div>
  )
}

export default function SesionModalInversion({ region, borradorId, currentUserEmail, iniciativas, onAbrirIniciativa, onClose }: Props) {
  const [sesion, setSesion]         = useState<EjeSesion | null>(null)
  const [initError, setInitError]   = useState<string | null>(null)

  const [nomina, setNomina]                 = useState<SesionNomina[]>([])
  const [asistencia, setAsistencia]         = useState<SesionAsistencia[]>([])
  const [compAnteriores, setCompAnteriores] = useState<SesionCompromiso[]>([])
  const [compNuevos, setCompNuevos]         = useState<SesionCompromiso[]>([])

  const [oficiosAnteriores, setOficiosAnteriores]         = useState<SesionOficioConNombres[]>([])
  const [oficiosTratadosSesion, setOficiosTratadosSesion] = useState<SesionOficioConNombres[]>([])
  const [oficioNotaDraft, setOficioNotaDraft]             = useState<Record<number, string>>({})

  const [oaecaList, setOaecaList]           = useState<Oaeca[]>([])

  const [proyectosSesion, setProyectosSesion] = useState<SesionProyecto[]>([])
  const [proyectosInfo, setProyectosInfo]     = useState<Map<string, V2Proyecto>>(new Map())
  // Zona 4c: cartera propia del comité (privados) — públicos se resuelven
  // desde la prop `iniciativas` (misma fuente que ComiteEconomicoProyectosPanel).
  const [proyectosPrivados, setProyectosPrivados] = useState<ComiteEconomicoProyecto[]>([])
  const [pickerVista, setPickerVista]         = useState<'privado' | 'publico'>('privado')
  const [fichaPrivadoId, setFichaPrivadoId]   = useState<number | null>(null)
  // Picker privado — mismos filtros que ComiteEconomicoProyectosPanel.tsx.
  // Priorizado arranca en {'Si'} para que el pool de "a tratar" abra ya
  // acotado a los priorizados; se puede limpiar como cualquier otro filtro.
  const [pkFPlazo, setPkFPlazo]           = useState<Set<string>>(new Set())
  const [pkFPriorizado, setPkFPriorizado] = useState<Set<string>>(new Set(['Si']))
  const [pkFSeremi, setPkFSeremi]         = useState<Set<string>>(new Set())
  const [pkFRiesgo, setPkFRiesgo]         = useState<Set<string>>(new Set())
  const [pkFEstado, setPkFEstado]         = useState<Set<string>>(new Set())
  // Oficios y Proyectos tratados, colapsables por separado dentro de zona 4.
  const [proyectosSeccionOpen, setProyectosSeccionOpen] = useState(true)
  const [oficiosSeccionOpen, setOficiosSeccionOpen]     = useState(true)

  // Alta de oficio nuevo (Seguimiento de la Inversión) — proyecto que
  // considera viene de la misma cartera (privado/público) que 4c, no del
  // catálogo SEIA legado (mig 089).
  const [oficioOaeca, setOficioOaeca]                 = useState<Oaeca | null>(null)
  const [oficioProyectoTipo, setOficioProyectoTipo]   = useState<'privado' | 'publico'>('privado')
  const [oficioProyectoPrivado, setOficioProyectoPrivado] = useState<ComiteEconomicoProyecto | null>(null)
  const [oficioProyectoPublico, setOficioProyectoPublico] = useState<Iniciativa | null>(null)
  const [oficioFechaLimite, setOficioFechaLimite] = useState('')
  const [oficioSaving, setOficioSaving]       = useState(false)

  // Mesa Empleo: meta+acumulado de la región (mig 052) y valor digitado en
  // esta sesión (si ya se guardó un borrador con valor).
  const [metaEmpleoRegion, setMetaEmpleoRegion] = useState<RegionMetaEmpleo | null>(null)
  const [metaEmpleoSesion, setMetaEmpleoSesion] = useState<SesionMetaEmpleoValor | null>(null)
  const [metaEmpleoInput, setMetaEmpleoInput]   = useState('')
  const [metaEmpleoSaving, setMetaEmpleoSaving] = useState(false)

  // Subsidios: cupo+acumulados de la región (mig 055) y deltas digitados en
  // esta sesión.
  const [subsidioRegion, setSubsidioRegion]     = useState<RegionSubsidioEmpleo | null>(null)
  const [subsidioSesion, setSubsidioSesion]     = useState<SesionSubsidioEmpleoValor | null>(null)
  const [subPostuladosInput, setSubPostuladosInput] = useState('')
  const [subEntregadosInput, setSubEntregadosInput] = useState('')
  const [subEmpresasInput, setSubEmpresasInput]     = useState('')
  const [subsidioSaving, setSubsidioSaving]     = useState(false)

  // Colapso de las dos secciones nuevas — ambas arrancan abiertas.
  const [mesaEmpleoOpen, setMesaEmpleoOpen]     = useState(true)
  const [seguimientoOpen, setSeguimientoOpen]   = useState(true)
  // Zona Integrantes colapsable — para ganar espacio en el acta en curso.
  const [integrantesOpen, setIntegrantesOpen]   = useState(true)

  // Invitado form
  const [invNombre, setInvNombre]           = useState('')
  const [invInstitucion, setInvInstitucion] = useState('')

  // Compromiso nuevo form
  const [cDescripcion, setCDescripcion]     = useState('')
  const [cInstitucion, setCInstitucion]     = useState('')
  const [cNombre, setCNombre]               = useState('')
  const [cPlazo, setCPlazo]                 = useState('')
  const [cSeccion, setCSeccion]             = useState<SeccionComiteEconomico | ''>('')
  // Proyecto asociado (opcional) — misma cartera que "proyectos a tratar en
  // profundidad" (privados/públicos), no el catálogo SEIA legado.
  const [cProyectoTipo, setCProyectoTipo]     = useState<'privado' | 'publico'>('privado')
  const [cProyectoPrivado, setCProyectoPrivado] = useState<ComiteEconomicoProyecto | null>(null)
  const [cProyectoPublico, setCProyectoPublico] = useState<Iniciativa | null>(null)
  const [cSaving, setCSaving]               = useState(false)

  // Cierre
  const [cerrando, setCerrando]             = useState(false)
  const [previewActa, setPreviewActa]       = useState(false)
  const [cierreResultado, setCierreResultado] = useState<{ actaGenerada: boolean; error?: string } | null>(null)

  // ── Init: reabrir o crear el borrador, luego cargar todo ──────────────────

  useEffect(() => {
    let cancelled = false
    async function init() {
      const sb = getSupabase()
      let s: EjeSesion | null = null
      if (borradorId) {
        const { data } = await sb.from('eje_sesiones').select('*').eq('id', borradorId).single()
        s = data as EjeSesion | null
      }
      if (!s) {
        const { data, error } = await sb
          .from('eje_sesiones')
          .insert({
            region_cod: region.cod,
            instancia: 'inversion',
            fecha: hoyISO(),
            created_by_email: currentUserEmail || null,
          })
          .select('*')
        if (error || !data?.length) {
          const { data: retry } = await sb
            .from('eje_sesiones')
            .select('*')
            .eq('region_cod', region.cod)
            .eq('instancia', 'inversion')
            .eq('estado', 'borrador')
            .limit(1)
          s = (retry?.[0] as EjeSesion | undefined) ?? null
          if (!s) {
            if (!cancelled) setInitError(error?.message ?? 'No se pudo crear el borrador de sesión.')
            return
          }
        } else {
          s = data[0] as EjeSesion
        }
      }
      if (cancelled) return
      setSesion(s)
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAll = useCallback(async (s: EjeSesion) => {
    const sb = getSupabase()
    const OFICIO_SELECT = '*, oaeca:oaeca(nombre), proyecto:v2_proyectos_inversion(nombre)'
    const [
      nominaRes, asisRes, compRes, nuevosRes, oficiosAntRes, oficiosTratRes,
      oaecaRes, proyPrivadosRes, proyRes, metaRegionRes, metaSesionRes,
      subRegionRes, subSesionRes,
    ] = await Promise.all([
      sb.from('sesion_nomina').select('*')
        .eq('region_cod', region.cod).eq('instancia', 'inversion').eq('activo', true)
        .order('institucion').order('calidad'),
      sb.from('sesion_asistencia').select('*').eq('sesion_id', s.id),
      // Compromisos de sesiones ANTERIORES aún por verificar (mismo criterio
      // que SesionModal.tsx zona 1: abiertos, o cumplidos sin sellar).
      sb.from('sesion_compromisos').select('*')
        .eq('region_cod', region.cod).eq('instancia', 'inversion')
        .neq('sesion_origen_id', s.id)
        .or('estado.in.(pendiente,en_curso),and(estado.eq.cumplido,cerrado_en_sesion_id.is.null)')
        .order('created_at'),
      sb.from('sesion_compromisos').select('*').eq('sesion_origen_id', s.id).order('created_at'),
      // Oficios tratados en sesiones ANTERIORES aún pendientes (o resueltos
      // sin sellar — mismo criterio que compromisos).
      sb.from('sesion_oficios_tratados').select(OFICIO_SELECT)
        .eq('region_cod', region.cod)
        .neq('sesion_origen_id', s.id)
        .or('estado.eq.pendiente,and(estado.eq.resuelto,resuelto_en_sesion_id.is.null)')
        .order('created_at'),
      sb.from('sesion_oficios_tratados').select(OFICIO_SELECT).eq('sesion_origen_id', s.id).order('created_at'),
      sb.from('oaeca').select('*').order('nombre'),
      sb.from('comite_economico_proyecto').select('*').eq('region_cod', region.cod).order('nombre'),
      sb.from('sesion_proyectos').select('*').eq('sesion_id', s.id),
      sb.from('region_meta_empleo').select('*').eq('region_cod', region.cod).maybeSingle(),
      sb.from('sesion_meta_empleo_valor').select('*').eq('sesion_id', s.id).maybeSingle(),
      sb.from('region_subsidio_empleo').select('*').eq('region_cod', region.cod).maybeSingle(),
      sb.from('sesion_subsidio_empleo_valor').select('*').eq('sesion_id', s.id).maybeSingle(),
    ])

    setNomina((nominaRes.data ?? []) as SesionNomina[])
    setAsistencia((asisRes.data ?? []) as SesionAsistencia[])
    setCompAnteriores((compRes.data ?? []) as SesionCompromiso[])
    setCompNuevos((nuevosRes.data ?? []) as SesionCompromiso[])
    setOficiosAnteriores((oficiosAntRes.data ?? []) as unknown as SesionOficioConNombres[])
    setOficiosTratadosSesion((oficiosTratRes.data ?? []) as unknown as SesionOficioConNombres[])
    setOaecaList((oaecaRes.data ?? []) as Oaeca[])
    setProyectosPrivados((proyPrivadosRes.data ?? []) as ComiteEconomicoProyecto[])
    setMetaEmpleoRegion((metaRegionRes.data as RegionMetaEmpleo | null) ?? null)
    const metaSesion = (metaSesionRes.data as SesionMetaEmpleoValor | null) ?? null
    setMetaEmpleoSesion(metaSesion)
    setMetaEmpleoInput(metaSesion ? String(metaSesion.empleos_generados) : '')
    setSubsidioRegion((subRegionRes.data as RegionSubsidioEmpleo | null) ?? null)
    const subSesion = (subSesionRes.data as SesionSubsidioEmpleoValor | null) ?? null
    setSubsidioSesion(subSesion)
    setSubPostuladosInput(subSesion ? String(subSesion.postulados) : '')
    setSubEntregadosInput(subSesion ? String(subSesion.entregados) : '')
    setSubEmpresasInput(subSesion ? String(subSesion.empresas_postulantes) : '')

    const proy = (proyRes.data ?? []) as SesionProyecto[]
    setProyectosSesion(proy)
    // Solo filas legadas (previas a mig 086) siguen apuntando a proyecto_id;
    // las nuevas usan proyecto_privado_id/prioridad_id (resueltas contra
    // proyectosPrivados/iniciativas, sin query aparte).
    const idsLegado = proy.map(p => p.proyecto_id).filter((id): id is string => id != null)
    if (idsLegado.length) {
      const { data: infoData } = await sb.from('v2_proyectos_inversion')
        .select('id, nombre, titular, inversion, moneda, etapa')
        .in('id', idsLegado)
      setProyectosInfo(new Map(((infoData ?? []) as V2Proyecto[]).map(p => [p.id, p])))
    }
  }, [region.cod])

  useEffect(() => { if (sesion) loadAll(sesion) }, [sesion, loadAll])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !cerrando) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, cerrando])

  // Foco inicial + restauración + focus-trap por Tab (a11y de diálogo, Fase 4a).
  const { panelRef, onKeyDown: onDialogKeyDown } = useDialogA11y<HTMLDivElement>()

  // ── Zona 1: integrantes (igual a Asistencia) ──────────────────────────────

  async function toggleAsistencia(miembro: SesionNomina) {
    if (!sesion) return
    const fila = asistencia.find(a => a.nomina_id === miembro.id)
    try {
      if (fila) {
        const nuevo = !fila.presente
        setAsistencia(prev => prev.map(a => a.id === fila.id ? { ...a, presente: nuevo } : a))
        await safeWrite(
          getSupabase().from('sesion_asistencia').update({ presente: nuevo }).eq('id', fila.id),
          `sesion_asistencia toggle id=${fila.id}`,
        )
      } else {
        const rows = await safeWrite(
          getSupabase().from('sesion_asistencia').insert({
            sesion_id: sesion.id, nomina_id: miembro.id, presente: true,
          }),
          `sesion_asistencia insert nomina=${miembro.id}`,
        )
        setAsistencia(prev => [...prev, rows[0] as SesionAsistencia])
      }
    } catch (err) {
      if (sesion) await loadAll(sesion)
      window.alert((err as Error).message)
    }
  }

  async function agregarInvitado(e: React.FormEvent) {
    e.preventDefault()
    if (!sesion || !invNombre.trim() || !invInstitucion.trim()) return
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_asistencia').insert({
          sesion_id: sesion.id,
          invitado_nombre: invNombre.trim(),
          invitado_institucion: invInstitucion.trim(),
          presente: true,
        }),
        `sesion_asistencia invitado`,
      )
      setAsistencia(prev => [...prev, rows[0] as SesionAsistencia])
      setInvNombre(''); setInvInstitucion('')
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function quitarInvitado(fila: SesionAsistencia) {
    try {
      await safeDelete(
        getSupabase().from('sesion_asistencia').delete().eq('id', fila.id),
        `sesion_asistencia delete id=${fila.id}`,
      )
      setAsistencia(prev => prev.filter(a => a.id !== fila.id))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  // ── Zona 3: Mesa Empleo — Meta Empleo ─────────────────────────────────────

  async function commitMetaEmpleo() {
    if (!sesion) return
    const num = Number(metaEmpleoInput)
    if (metaEmpleoInput.trim() === '' || Number.isNaN(num)) return
    if (metaEmpleoSesion && num === metaEmpleoSesion.empleos_generados) return
    setMetaEmpleoSaving(true)
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_meta_empleo_valor')
          .upsert({ sesion_id: sesion.id, empleos_generados: num }, { onConflict: 'sesion_id' }),
        `sesion_meta_empleo_valor upsert sesion=${sesion.id}`,
      )
      setMetaEmpleoSesion(rows[0] as SesionMetaEmpleoValor)
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setMetaEmpleoSaving(false)
    }
  }

  // ── Zona 3: Mesa Empleo — Subsidios ───────────────────────────────────────

  async function commitSubsidios() {
    if (!sesion) return
    const postulados = subPostuladosInput.trim() === '' ? 0 : Number(subPostuladosInput)
    const entregados = subEntregadosInput.trim() === '' ? 0 : Number(subEntregadosInput)
    const empresas   = subEmpresasInput.trim() === '' ? 0 : Number(subEmpresasInput)
    if ([postulados, entregados, empresas].some(Number.isNaN)) return
    if (subsidioSesion
      && postulados === subsidioSesion.postulados
      && entregados === subsidioSesion.entregados
      && empresas === subsidioSesion.empresas_postulantes) return
    setSubsidioSaving(true)
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_subsidio_empleo_valor')
          .upsert({
            sesion_id: sesion.id,
            postulados,
            entregados,
            empresas_postulantes: empresas,
          }, { onConflict: 'sesion_id' }),
        `sesion_subsidio_empleo_valor upsert sesion=${sesion.id}`,
      )
      setSubsidioSesion(rows[0] as SesionSubsidioEmpleoValor)
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSubsidioSaving(false)
    }
  }

  // ── Zona 4a: verificación de oficios anteriores (Seguimiento de la Inversión) ──

  async function setEstadoOficio(o: SesionOficioConNombres, estado: SesionOficioTratado['estado']) {
    if (o.estado === estado) return
    const prevEstado = o.estado
    setOficiosAnteriores(prev => prev.map(x => x.id === o.id ? { ...x, estado } : x))
    try {
      await safeWrite(
        getSupabase().from('sesion_oficios_tratados').update({
          estado,
          estado_updated_at: new Date().toISOString(),
          estado_updated_by_email: currentUserEmail || null,
        }).eq('id', o.id),
        `sesion_oficios_tratados estado id=${o.id}`,
      )
    } catch (err) {
      setOficiosAnteriores(prev => prev.map(x => x.id === o.id ? { ...x, estado: prevEstado } : x))
      window.alert((err as Error).message)
    }
  }

  async function commitNotaOficioAnterior(o: SesionOficioConNombres) {
    const nota = (oficioNotaDraft[o.id] ?? o.nota ?? '').trim()
    if (nota === (o.nota ?? '')) return
    try {
      await safeWrite(
        getSupabase().from('sesion_oficios_tratados').update({ nota: nota || null }).eq('id', o.id),
        `sesion_oficios_tratados nota id=${o.id}`,
      )
      setOficiosAnteriores(prev => prev.map(x => x.id === o.id ? { ...x, nota: nota || null } : x))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  // ── Zona 4b: alta directa de oficios nuevos (Seguimiento de la Inversión) ──

  async function crearOaeca(nombre: string): Promise<Oaeca | null> {
    try {
      const rows = await safeWrite(
        getSupabase().from('oaeca').insert({ nombre, created_by_email: currentUserEmail || null }),
        `oaeca insert ${nombre}`,
      )
      const creado = rows[0] as Oaeca
      setOaecaList(prev => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      return creado
    } catch (err) {
      window.alert((err as Error).message)
      return null
    }
  }

  async function agregarOficioNuevo() {
    if (!sesion || !oficioOaeca) return
    if (oficioProyectoTipo === 'privado' && !oficioProyectoPrivado) return
    if (oficioProyectoTipo === 'publico' && !oficioProyectoPublico) return
    setOficioSaving(true)
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_oficios_tratados').insert({
          region_cod: region.cod,
          sesion_origen_id: sesion.id,
          oaeca_id: oficioOaeca.id,
          proyecto_privado_id: oficioProyectoTipo === 'privado' ? oficioProyectoPrivado!.id : null,
          prioridad_id: oficioProyectoTipo === 'publico' ? oficioProyectoPublico!.id : null,
          fecha_limite: oficioFechaLimite || null,
        }),
        `sesion_oficios_tratados insert sesion=${sesion.id}`,
      )
      const nuevo: SesionOficioConNombres = {
        ...(rows[0] as SesionOficioTratado),
        oaeca: { nombre: oficioOaeca.nombre },
        proyecto: null,
      }
      setOficiosTratadosSesion(prev => [...prev, nuevo])
      setOficioOaeca(null); setOficioProyectoPrivado(null); setOficioProyectoPublico(null); setOficioFechaLimite('')
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setOficioSaving(false)
    }
  }

  // ── Zona 4c: proyectos tratados en profundidad (Seguimiento de la Inversión) ──

  async function agregarProyectoPrivado(p: ComiteEconomicoProyecto) {
    if (!sesion) return
    if (proyectosSesion.some(sp => sp.proyecto_privado_id === p.id)) return
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_proyectos').insert({ sesion_id: sesion.id, proyecto_privado_id: p.id }),
        `sesion_proyectos insert privado=${p.id}`,
      )
      setProyectosSesion(prev => [...prev, rows[0] as SesionProyecto])
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function agregarProyectoPublico(ini: Iniciativa) {
    if (!sesion) return
    if (proyectosSesion.some(sp => sp.prioridad_id === ini.id)) return
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_proyectos').insert({ sesion_id: sesion.id, prioridad_id: ini.id }),
        `sesion_proyectos insert prioridad=${ini.id}`,
      )
      setProyectosSesion(prev => [...prev, rows[0] as SesionProyecto])
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  // Abre la ficha completa de un item de la cartera (proyecto privado o
  // iniciativa pública) referenciado desde cualquier lado de la sesión —
  // proyectos tratados, oficios, compromisos: los tres comparten esta misma
  // forma (proyecto_privado_id / prioridad_id) desde mig 086/087/089.
  function abrirFichaCartera(row: { proyecto_privado_id?: number | null; prioridad_id?: number | null }) {
    if (row.proyecto_privado_id != null) { setFichaPrivadoId(row.proyecto_privado_id); return }
    if (row.prioridad_id != null) {
      const ini = iniciativas.find(i => i.id === row.prioridad_id)
      if (ini) onAbrirIniciativa(ini)
    }
    // proyecto_id legado (v2_proyectos_inversion): sin ficha en este flujo.
  }

  // Resuelve nombre + tag de cualquier referencia a la cartera (proyecto
  // tratado, oficio u compromiso) — misma forma en las tres tablas.
  function resolverCartera(row: { proyecto_privado_id?: number | null; prioridad_id?: number | null; proyecto_id?: string | null }, nombreLegado?: string | null) {
    if (row.proyecto_privado_id != null) {
      return { nombre: proyectosPrivados.find(p => p.id === row.proyecto_privado_id)?.nombre ?? `#${row.proyecto_privado_id}`, tag: 'Privado' as const, tieneFicha: true }
    }
    if (row.prioridad_id != null) {
      return { nombre: iniciativas.find(i => i.id === row.prioridad_id)?.nombre ?? `#${row.prioridad_id}`, tag: 'Público' as const, tieneFicha: true }
    }
    if (row.proyecto_id) {
      return { nombre: nombreLegado ?? row.proyecto_id, tag: 'SEIA' as const, tieneFicha: false }
    }
    return { nombre: '—', tag: null, tieneFicha: false }
  }

  // "+" en cualquier fila de la cartera (proyecto tratado, oficio, o
  // compromiso) — agrega un avance REAL al proyecto/iniciativa (no una nota
  // aislada de la sesión): comite_economico_proyecto_seguimiento si es
  // privado, seguimientos si es pública, para que quede en su propio
  // historial de avances.
  async function agregarAvanceCartera(row: { proyecto_privado_id?: number | null; prioridad_id?: number | null }, texto: string) {
    try {
      if (row.proyecto_privado_id != null) {
        await safeWrite(
          getSupabase().from('comite_economico_proyecto_seguimiento').insert({
            proyecto_id: row.proyecto_privado_id,
            descripcion: texto,
            autor: currentUserEmail || null,
          }),
          `comite_economico_proyecto_seguimiento insert (sesion) proyecto=${row.proyecto_privado_id}`,
        )
      } else if (row.prioridad_id != null) {
        await safeWrite(
          getSupabase().from('seguimientos').insert({
            prioridad_id: row.prioridad_id,
            tipo: 'avance',
            descripcion: texto,
            autor: currentUserEmail || null,
            asistentes: [],
          }),
          `seguimientos insert (sesion) prioridad=${row.prioridad_id}`,
        )
      }
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function quitarProyecto(sp: SesionProyecto) {
    try {
      await safeDelete(
        getSupabase().from('sesion_proyectos').delete().eq('id', sp.id),
        `sesion_proyectos delete id=${sp.id}`,
      )
      setProyectosSesion(prev => prev.filter(x => x.id !== sp.id))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  // ── Zona 5: compromisos nuevos ─────────────────────────────────────────────

  async function agregarCompromiso(e: React.FormEvent) {
    e.preventDefault()
    if (!sesion || !cDescripcion.trim() || !cInstitucion.trim() || !cSeccion) return
    setCSaving(true)
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_compromisos').insert({
          region_cod: region.cod,
          instancia: 'inversion',
          sesion_origen_id: sesion.id,
          descripcion: cDescripcion.trim(),
          responsable_institucion: cInstitucion.trim(),
          responsable_nombre: cNombre.trim() || null,
          plazo: cPlazo || null,
          seccion: cSeccion,
          proyecto_privado_id: cProyectoTipo === 'privado' ? (cProyectoPrivado?.id ?? null) : null,
          prioridad_id: cProyectoTipo === 'publico' ? (cProyectoPublico?.id ?? null) : null,
        }),
        `sesion_compromisos insert sesion=${sesion.id}`,
      )
      setCompNuevos(prev => [...prev, rows[0] as SesionCompromiso])
      setCDescripcion(''); setCInstitucion(''); setCNombre(''); setCPlazo(''); setCSeccion('')
      setCProyectoPrivado(null); setCProyectoPublico(null)
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setCSaving(false)
    }
  }

  // ── Metadatos de la sesión (fecha / lugar) ────────────────────────────────

  async function commitSesionField(patch: Partial<Pick<EjeSesion, 'fecha' | 'lugar'>>) {
    if (!sesion) return
    try {
      await safeWrite(
        getSupabase().from('eje_sesiones').update(patch).eq('id', sesion.id),
        `eje_sesiones meta id=${sesion.id}`,
      )
      setSesion(prev => prev ? { ...prev, ...patch } : prev)
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  // ── Cierre ────────────────────────────────────────────────────────────────

  async function handleCerrar() {
    if (!sesion) return
    if (!confirm('¿Cerrar la sesión y generar el acta?\n\nUna sesión cerrada no se puede editar.')) return
    setCerrando(true)
    try {
      const res = await fetch(`/api/sesiones/${sesion.id}/cerrar`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(body.error ?? `No se pudo cerrar la sesión (HTTP ${res.status})`)
        return
      }
      setCierreResultado({ actaGenerada: !!body.acta_generada, error: body.error })
    } catch {
      window.alert('Error de red cerrando la sesión. Reintenta — el borrador sigue guardado.')
    } finally {
      setCerrando(false)
    }
  }

  async function handleReintentarActa() {
    if (!sesion) return
    setCerrando(true)
    try {
      const res = await fetch(`/api/sesiones/${sesion.id}/acta`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.acta_generada) {
        setCierreResultado({ actaGenerada: true })
      } else {
        window.alert(body.error ?? 'No se pudo generar el acta. Puedes reintentar desde el historial.')
      }
    } finally {
      setCerrando(false)
    }
  }

  async function handleDescargarActa() {
    if (!sesion) return
    const res = await fetch(`/api/sesiones/${sesion.id}/acta`)
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.url) window.open(body.url, '_blank')
    else window.alert(body.error ?? 'No se pudo obtener el acta')
  }

  // Vista previa del acta con el estado actual (sin cerrar). PDF marcado "BORRADOR".
  async function handlePreviewActa() {
    if (!sesion || previewActa) return
    setPreviewActa(true)
    try {
      const res = await fetch(`/api/sesiones/${sesion.id}/acta/preview`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        window.alert(body.error ?? `No se pudo generar la vista previa (HTTP ${res.status})`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      window.alert('Error de red generando la vista previa del acta.')
    } finally {
      setPreviewActa(false)
    }
  }

  // ── Derivados ─────────────────────────────────────────────────────────────

  const invitados = useMemo(() => asistencia.filter(a => a.nomina_id === null), [asistencia])
  const presentes = useMemo(() => asistencia.filter(a => a.presente).length, [asistencia])
  const iniciativasCER = useMemo(
    () => iniciativas.filter(p => (p.tags ?? []).includes(TAG_ECONOMICO)),
    [iniciativas],
  )

  // Picker privado (zona 4c) — mismos filtros y mismo criterio de opciones
  // dinámicas que ComiteEconomicoProyectosPanel.tsx.
  const proyectosPrivadosDisponibles = useMemo(
    () => proyectosPrivados.filter(p => !proyectosSesion.some(sp => sp.proyecto_privado_id === p.id)),
    [proyectosPrivados, proyectosSesion],
  )
  const pkOpcionesSeremi = useMemo((): FilterOption[] => {
    const vistos = new Set<string>()
    for (const p of proyectosPrivadosDisponibles) if (p.seremi_lider) vistos.add(p.seremi_lider)
    return [...vistos].sort().map(v => ({ value: v, label: v }))
  }, [proyectosPrivadosDisponibles])
  const pkOpcionesEstado = useMemo((): FilterOption[] => {
    const vistos = new Set<string>()
    for (const p of proyectosPrivadosDisponibles) if (p.estado_actual) vistos.add(p.estado_actual)
    return [...vistos].sort().map(v => ({ value: v, label: v }))
  }, [proyectosPrivadosDisponibles])
  const proyectosPrivadosFiltrados = useMemo(() => {
    let list = proyectosPrivadosDisponibles
    if (pkFPlazo.size)      list = list.filter(p => p.plazo && pkFPlazo.has(p.plazo))
    if (pkFPriorizado.size) list = list.filter(p => pkFPriorizado.has(p.priorizado ? 'Si' : 'No'))
    if (pkFSeremi.size)     list = list.filter(p => p.seremi_lider && pkFSeremi.has(p.seremi_lider))
    if (pkFRiesgo.size)     list = list.filter(p => pkFRiesgo.has(p.riesgo ? 'Si' : 'No'))
    if (pkFEstado.size)     list = list.filter(p => p.estado_actual && pkFEstado.has(p.estado_actual))
    return list
  }, [proyectosPrivadosDisponibles, pkFPlazo, pkFPriorizado, pkFSeremi, pkFRiesgo, pkFEstado])
  const pkChips = [
    setChip('Plazo', pkFPlazo, () => setPkFPlazo(new Set())),
    setChip('Priorizado', pkFPriorizado, () => setPkFPriorizado(new Set())),
    setChip('SEREMI líder', pkFSeremi, () => setPkFSeremi(new Set())),
    setChip('Riesgo', pkFRiesgo, () => setPkFRiesgo(new Set())),
    setChip('Estado actual', pkFEstado, () => setPkFEstado(new Set())),
  ].filter((c): c is NonNullable<typeof c> => c !== null)
  function clearPkFiltros() {
    setPkFPlazo(new Set()); setPkFPriorizado(new Set()); setPkFSeremi(new Set())
    setPkFRiesgo(new Set()); setPkFEstado(new Set())
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (cierreResultado) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Resultado del cierre de sesión"
          onKeyDown={onDialogKeyDown}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className={`px-6 py-4 ${cierreResultado.actaGenerada ? 'bg-green-600' : 'bg-amber-500'}`}>
            <p className="text-white font-semibold text-sm">
              {cierreResultado.actaGenerada ? 'Sesión cerrada — acta generada' : 'Sesión cerrada — acta pendiente'}
            </p>
          </div>
          <div className="px-6 py-5 space-y-3">
            <p className="text-sm text-gray-700">
              {cierreResultado.actaGenerada
                ? 'El acta quedó disponible para descargar.'
                : 'La sesión se cerró, pero el acta no se pudo generar. Puedes reintentar ahora o después desde el historial.'}
            </p>
            <div className="flex gap-2 pt-1">
              {cierreResultado.actaGenerada ? (
                <button onClick={handleDescargarActa} className="flex-1 py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800">
                  Descargar acta
                </button>
              ) : (
                <button onClick={handleReintentarActa} disabled={cerrando} className="flex-1 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50">
                  {cerrando ? 'Generando…' : 'Reintentar acta'}
                </button>
              )}
              <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !cerrando && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Sesión — ${NOMBRE_COMITE}`}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        {/* Header */}
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3 bg-violet-50/40">
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-gray-900">{NOMBRE_COMITE} — {sesion?.estado === 'borrador' && borradorId ? 'Continuar sesión' : 'Nueva sesión'}</p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                Fecha
                <input
                  type="date"
                  value={sesion?.fecha ?? hoyISO()}
                  onChange={e => e.target.value && commitSesionField({ fecha: e.target.value })}
                  className="border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-violet-300"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 flex-1 min-w-[160px]">
                Lugar
                <input
                  type="text"
                  defaultValue={sesion?.lugar ?? ''}
                  onBlur={e => commitSesionField({ lugar: e.target.value.trim() || null })}
                  placeholder="Ej: Delegación Presidencial"
                  className="flex-1 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-300"
                />
              </label>
            </div>
          </div>
          <button onClick={onClose} disabled={cerrando} className="text-gray-400 hover:text-gray-600 mt-0.5 disabled:opacity-50" title="Cerrar (el borrador queda guardado)">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {initError ? (
            <Alert variant="error">{initError}</Alert>
          ) : !sesion ? (
            <p className="text-center text-sm text-gray-400 py-10">Preparando la sesión…</p>
          ) : (
            <>
              {/* ── Zona 1: integrantes ── */}
              <section className={zoneCls}>
                <button type="button" onClick={() => setIntegrantesOpen(o => !o)} className={`${zoneHead} w-full text-left`}>
                  <span className={zoneNum}>1</span>
                  <h3 className="text-sm font-semibold text-gray-800">Integrantes</h3>
                  <span className="text-xs text-gray-400 ml-auto mr-2">{presentes} presente{presentes === 1 ? '' : 's'}</span>
                  <Chevron open={integrantesOpen} />
                </button>
                {integrantesOpen && (
                <div className="p-3">
                  {nomina.length === 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                      La nómina de este comité está vacía.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {nomina.map(miembro => {
                      const fila = asistencia.find(a => a.nomina_id === miembro.id)
                      const presente = fila?.presente ?? false
                      return (
                        <label key={miembro.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={presente}
                            onChange={() => toggleAsistencia(miembro)}
                            className="rounded border-gray-300 text-violet-700 focus:ring-violet-400"
                          />
                          <span className="flex-1 min-w-0">
                            <span className="text-sm text-gray-700 block truncate">{miembro.nombre}</span>
                            <span className="text-[11px] text-gray-400 block truncate">{miembro.institucion}{miembro.cargo ? ` · ${miembro.cargo}` : ''}</span>
                          </span>
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${miembro.calidad === 'titular' ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'}`}>
                            {miembro.calidad === 'titular' ? 'T' : 'S'}
                          </span>
                        </label>
                      )
                    })}
                  </div>

                  {invitados.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {invitados.map(inv => (
                        <div key={inv.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-sky-50/70">
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-sky-200 text-sky-800 flex-shrink-0">INV</span>
                          <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                            {inv.invitado_nombre} <span className="text-xs text-gray-400">· {inv.invitado_institucion}</span>
                          </span>
                          <button onClick={() => quitarInvitado(inv)} className="text-gray-300 hover:text-red-500 p-0.5" title="Quitar invitado">
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={agregarInvitado} className="flex gap-2 mt-2.5">
                    <input type="text" value={invNombre} onChange={e => setInvNombre(e.target.value)} placeholder="Invitado: nombre" className={`${inputCls} flex-1 text-xs py-1.5`} />
                    <input type="text" value={invInstitucion} onChange={e => setInvInstitucion(e.target.value)} placeholder="Institución" className={`${inputCls} w-36 text-xs py-1.5`} />
                    <button
                      type="submit"
                      disabled={!invNombre.trim() || !invInstitucion.trim()}
                      className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 font-medium hover:bg-violet-50 disabled:opacity-40"
                    >
                      + Invitado
                    </button>
                  </form>
                </div>
                )}
              </section>

              {/* ── Zona 2: compromisos anteriores (de cualquier sección, o generales) ── */}
              <section className={zoneCls}>
                <div className={zoneHead}>
                  <span className={zoneNum}>2</span>
                  <h3 className="text-sm font-semibold text-gray-800">Compromisos anteriores</h3>
                  <span className="text-xs text-gray-400 ml-auto">{compAnteriores.length}</span>
                </div>
                <div className="p-3 space-y-2">
                  {compAnteriores.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-2">Sin compromisos pendientes de sesiones anteriores.</p>
                  ) : compAnteriores.map(c => {
                    const { nombre: nombreProy, tag: tagProy, tieneFicha } = resolverCartera(c)
                    return (
                    <div key={c.id} className="flex items-start gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        {c.seccion && <div className="mb-1"><SeccionTag seccion={c.seccion} /></div>}
                        <p className="text-sm text-gray-700 leading-snug">{c.descripcion}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.responsable_institucion}{c.responsable_nombre ? ` · ${c.responsable_nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                        </p>
                        {tieneFicha && (
                          <button
                            type="button"
                            onClick={() => abrirFichaCartera(c)}
                            className="mt-1 text-xs text-violet-700 hover:underline"
                            title="Ver ficha y avances previos"
                          >
                            {tagProy} · {nombreProy}
                          </button>
                        )}
                        {tieneFicha && <AgregarAvanceInline onSubmit={texto => agregarAvanceCartera(c, texto)} />}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(Object.keys(ESTADO_COMPROMISO) as (keyof typeof ESTADO_COMPROMISO)[]).map(est => (
                          <button
                            key={est}
                            onClick={async () => {
                              if (c.estado === est) return
                              try {
                                await safeWrite(
                                  getSupabase().from('sesion_compromisos').update({
                                    estado: est,
                                    estado_updated_at: new Date().toISOString(),
                                    estado_updated_by_email: currentUserEmail || null,
                                  }).eq('id', c.id),
                                  `sesion_compromisos estado id=${c.id}`,
                                )
                                setCompAnteriores(prev => prev.map(x => x.id === c.id ? { ...x, estado: est } : x))
                              } catch (err) {
                                window.alert((err as Error).message)
                              }
                            }}
                            className={`text-[10px] font-semibold px-2 py-1 rounded-full transition-colors ${
                              c.estado === est ? ESTADO_COMPROMISO[est].on : ESTADO_COMPROMISO[est].off
                            }`}
                          >
                            {ESTADO_COMPROMISO[est].label}
                          </button>
                        ))}
                      </div>
                    </div>
                    )
                  })}
                </div>
              </section>

              {/* ── Zona 3: Mesa Empleo (desplegable) — escondida hasta confirmar ── */}
              {MESA_EMPLEO_HABILITADA && (
              <section className={zoneCls}>
                <button type="button" onClick={() => setMesaEmpleoOpen(o => !o)} className={`${zoneHead} w-full text-left`}>
                  <span className={zoneNum}>3</span>
                  <h3 className="text-sm font-semibold text-gray-800">Mesa Empleo</h3>
                  <Chevron open={mesaEmpleoOpen} />
                </button>
                {mesaEmpleoOpen && (
                  <div className="p-3 space-y-4">
                    {/* Meta Empleo */}
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Meta Empleo</h4>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-xs text-gray-500">
                          Empleos generados: <span className="font-semibold text-gray-800">{(metaEmpleoRegion?.valor_actual ?? 0).toLocaleString('es-CL')}</span>
                          {metaEmpleoRegion && metaEmpleoRegion.objetivo > 0 && (
                            <> de {metaEmpleoRegion.objetivo.toLocaleString('es-CL')} — {Math.round((metaEmpleoRegion.valor_actual / metaEmpleoRegion.objetivo) * 100)}% de la meta</>
                          )}
                        </span>
                      </div>
                      {metaEmpleoRegion && metaEmpleoRegion.objetivo > 0 && (
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-2.5">
                          <div
                            className="h-full bg-violet-500 rounded-full"
                            style={{ width: `${Math.min(100, Math.round((metaEmpleoRegion.valor_actual / metaEmpleoRegion.objetivo) * 100))}%` }}
                          />
                        </div>
                      )}
                      {metaEmpleoRegion?.foco_productivo && (
                        <p className="inline-block text-[11px] text-violet-800 bg-violet-50 border border-violet-100 rounded-full px-3 py-1 mb-2.5 italic">
                          Foco productivo: {metaEmpleoRegion.foco_productivo}
                        </p>
                      )}
                      <label className="flex flex-col gap-0.5 max-w-xs">
                        <span className="text-[10px] text-gray-500 font-medium">Actualización de empleos generados</span>
                        <input
                          type="number"
                          value={metaEmpleoInput}
                          onChange={e => setMetaEmpleoInput(e.target.value)}
                          onBlur={commitMetaEmpleo}
                          placeholder="0"
                          className={`${inputCls} w-full`}
                        />
                      </label>
                      {metaEmpleoSaving && <p className="text-[10px] text-gray-400 mt-1">Guardando…</p>}
                    </div>

                    {/* Subsidios */}
                    <div className="pt-3 border-t border-gray-100">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Subsidios</h4>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-xs text-gray-500">
                          Postulados: <span className="font-semibold text-gray-800">{(subsidioRegion?.postulados ?? 0).toLocaleString('es-CL')}</span>
                          {subsidioRegion && subsidioRegion.cupos > 0 && (
                            <> de {subsidioRegion.cupos.toLocaleString('es-CL')} cupos — {Math.round((subsidioRegion.postulados / subsidioRegion.cupos) * 100)}%</>
                          )}
                        </span>
                      </div>
                      {subsidioRegion && subsidioRegion.cupos > 0 && (
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-2">
                          <div
                            className="h-full bg-amber-500 rounded-full"
                            style={{ width: `${Math.min(100, Math.round((subsidioRegion.postulados / subsidioRegion.cupos) * 100))}%` }}
                          />
                        </div>
                      )}
                      <div className="flex gap-4 text-xs text-gray-500 mb-3">
                        <span>Entregados: <span className="font-semibold text-gray-800">{(subsidioRegion?.entregados ?? 0).toLocaleString('es-CL')}</span></span>
                        <span>Empresas postulantes: <span className="font-semibold text-gray-800">{(subsidioRegion?.empresas_postulantes ?? 0).toLocaleString('es-CL')}</span></span>
                      </div>
                      <span className="text-[10px] text-gray-500 font-medium block mb-1">Actualización de esta sesión</span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-lg">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-gray-400">Postulados</span>
                          <input
                            type="number"
                            value={subPostuladosInput}
                            onChange={e => setSubPostuladosInput(e.target.value)}
                            onBlur={commitSubsidios}
                            placeholder="0"
                            className={`${inputCls} w-full`}
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-gray-400">Entregados</span>
                          <input
                            type="number"
                            value={subEntregadosInput}
                            onChange={e => setSubEntregadosInput(e.target.value)}
                            onBlur={commitSubsidios}
                            placeholder="0"
                            className={`${inputCls} w-full`}
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-gray-400">Empresas postulantes</span>
                          <input
                            type="number"
                            value={subEmpresasInput}
                            onChange={e => setSubEmpresasInput(e.target.value)}
                            onBlur={commitSubsidios}
                            placeholder="0"
                            className={`${inputCls} w-full`}
                          />
                        </label>
                      </div>
                      {subsidioSaving && <p className="text-[10px] text-gray-400 mt-1">Guardando…</p>}
                    </div>

                    {/* Proyectos de Inversión Pública — placeholder */}
                    <div className="pt-3 border-t border-gray-100">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Proyectos de Inversión Pública</h4>
                      <p className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-3 text-center">
                        Próximamente — revisión de los proyectos de inversión pública vigentes.
                      </p>
                    </div>
                  </div>
                )}
              </section>
              )}

              {/* ── Zona 4: Seguimiento de la Inversión (desplegable) — 3 si Mesa Empleo está escondida ── */}
              <section className={zoneCls}>
                <button type="button" onClick={() => setSeguimientoOpen(o => !o)} className={`${zoneHead} w-full text-left`}>
                  <span className={zoneNum}>{MESA_EMPLEO_HABILITADA ? 4 : 3}</span>
                  <h3 className="text-sm font-semibold text-gray-800">Seguimiento de la Inversión</h3>
                  <Chevron open={seguimientoOpen} />
                </button>
                {seguimientoOpen && (
                  <div className="p-3 space-y-4">
                    {/* Proyectos tratados en profundidad — antes que oficios (lo que se discute primero en la sesión) */}
                    <div>
                      <button type="button" onClick={() => setProyectosSeccionOpen(o => !o)} className="flex items-center gap-2 mb-2 w-full text-left">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Proyectos tratados en profundidad</h4>
                        <span className="text-xs text-gray-400 ml-auto mr-1">{proyectosSesion.length}</span>
                        <Chevron open={proyectosSeccionOpen} />
                      </button>
                      {proyectosSeccionOpen && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500 font-medium">Agregar:</span>
                          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setPickerVista('privado')}
                              className={`text-xs px-2.5 py-1 font-medium transition-colors ${pickerVista === 'privado' ? 'bg-violet-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                              Privado
                            </button>
                            <button
                              type="button"
                              onClick={() => setPickerVista('publico')}
                              className={`text-xs px-2.5 py-1 font-medium transition-colors border-l border-gray-200 ${pickerVista === 'publico' ? 'bg-violet-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                              Público
                            </button>
                          </div>
                        </div>
                        {pickerVista === 'privado' ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <FilterPopover label="Plazo" options={[{ value: 'CP', label: 'Corto plazo' }, { value: 'MP', label: 'Mediano plazo' }, { value: 'LP', label: 'Largo plazo' }]} selected={pkFPlazo} onChange={setPkFPlazo} />
                              <FilterPopover label="Priorizado" options={[{ value: 'Si', label: 'Sí' }, { value: 'No', label: 'No' }]} selected={pkFPriorizado} onChange={setPkFPriorizado} />
                              <FilterPopover label="SEREMI líder" options={pkOpcionesSeremi} selected={pkFSeremi} onChange={setPkFSeremi} />
                              <FilterPopover label="Riesgo" options={[{ value: 'Si', label: 'Sí' }, { value: 'No', label: 'No' }]} selected={pkFRiesgo} onChange={setPkFRiesgo} />
                              <FilterPopover label="Estado actual" options={pkOpcionesEstado} selected={pkFEstado} onChange={setPkFEstado} />
                            </div>
                            {pkChips.length > 0 && <ActiveFiltersBar chips={pkChips} clearFilters={clearPkFiltros} />}
                            {proyectosPrivadosFiltrados.length === 0 ? (
                              <p className="text-xs text-gray-500 text-center py-2">Ningún proyecto privado calza con los filtros.</p>
                            ) : (
                              <div className="space-y-1">
                                {proyectosPrivadosFiltrados.slice(0, 5).map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => agregarProyectoPrivado(p)}
                                    className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 border border-slate-200 rounded-lg hover:border-violet-300 hover:bg-violet-50/50"
                                  >
                                    <span className="flex-1 min-w-0 truncate text-sm text-slate-800">{p.nombre}</span>
                                    {p.plazo && <span className="text-[10px] text-gray-400 flex-shrink-0">{p.plazo}</span>}
                                    {p.seremi_lider && <span className="text-[10px] text-gray-400 truncate max-w-[120px] flex-shrink-0">{p.seremi_lider}</span>}
                                    <span className="text-violet-600 text-sm font-semibold flex-shrink-0">+</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {proyectosPrivadosFiltrados.length > 5 && (
                              <p className="text-[10px] text-gray-400">Mostrando 5 de {proyectosPrivadosFiltrados.length} — usa los filtros para acotar.</p>
                            )}
                          </div>
                        ) : (
                          <ComboboxProyectoEconomico
                            items={iniciativasCER.filter(i => !proyectosSesion.some(sp => sp.prioridad_id === i.id))}
                            onSelect={agregarProyectoPublico}
                            placeholder={`Buscar iniciativa pública (${TAG_ECONOMICO}) por nombre…`}
                          />
                        )}

                        {proyectosSesion.length === 0 ? (
                          <p className="text-xs text-gray-500 text-center py-2">Sin proyectos tratados en esta sesión.</p>
                        ) : proyectosSesion.map(sp => {
                          const { nombre, tag, tieneFicha } = resolverCartera(sp, proyectosInfo.get(sp.proyecto_id ?? '')?.nombre)
                          return (
                            <div key={sp.id} className="px-3 py-2 bg-gray-50 rounded-lg space-y-1.5">
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() => abrirFichaCartera(sp)}
                                  disabled={!tieneFicha}
                                  className="flex-1 min-w-0 text-left disabled:cursor-default"
                                  title={tieneFicha ? 'Ver ficha y avances previos' : undefined}
                                >
                                  {tag && (
                                    <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border mr-1.5 ${tag === 'Privado' ? 'bg-violet-50 text-violet-700 border-violet-200' : tag === 'Público' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                      {tag}
                                    </span>
                                  )}
                                  <span className={`text-sm truncate ${tieneFicha ? 'text-violet-800 hover:underline' : 'text-gray-700'}`}>{nombre}</span>
                                </button>
                                <button onClick={() => quitarProyecto(sp)} className="text-gray-300 hover:text-red-500 p-0.5 flex-shrink-0" title="Quitar proyecto">
                                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
                                  </svg>
                                </button>
                              </div>
                              {tieneFicha && <AgregarAvanceInline onSubmit={texto => agregarAvanceCartera(sp, texto)} />}
                            </div>
                          )
                        })}
                      </div>
                      )}
                    </div>

                    {/* Oficios — anteriores (verificación) + nuevos (alta), colapsable como un solo bloque */}
                    <div className="pt-3 border-t border-gray-100">
                      <button type="button" onClick={() => setOficiosSeccionOpen(o => !o)} className="flex items-center gap-2 mb-2 w-full text-left">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Oficios</h4>
                        <span className="text-xs text-gray-400 ml-auto mr-1">{oficiosAnteriores.length + oficiosTratadosSesion.length}</span>
                        <Chevron open={oficiosSeccionOpen} />
                      </button>
                      {oficiosSeccionOpen && (
                      <div className="space-y-4">
                        {/* Oficios anteriores */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <h5 className="text-[10px] font-semibold text-gray-500">Oficios anteriores</h5>
                            <span className="text-xs text-gray-400 ml-auto">{oficiosAnteriores.length}</span>
                          </div>
                          <div className="space-y-2">
                            {oficiosAnteriores.length === 0 ? (
                              <p className="text-xs text-gray-400 text-center py-2">Sin oficios pendientes de sesiones anteriores.</p>
                            ) : oficiosAnteriores.map(o => {
                              const { nombre, tag, tieneFicha } = resolverCartera(o, o.proyecto?.nombre)
                              return (
                              <div key={o.id} className="px-3 py-2 bg-gray-50 rounded-lg space-y-1.5">
                                <div className="flex items-start gap-3">
                                  <div className="flex-1 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => abrirFichaCartera(o)}
                                      disabled={!tieneFicha}
                                      className="text-left disabled:cursor-default"
                                      title={tieneFicha ? 'Ver ficha y avances previos' : undefined}
                                    >
                                      {tag && (
                                        <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border mr-1.5 ${tag === 'Privado' ? 'bg-violet-50 text-violet-700 border-violet-200' : tag === 'Público' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                          {tag}
                                        </span>
                                      )}
                                      <span className={`text-sm leading-snug truncate ${tieneFicha ? 'text-violet-800 hover:underline' : 'text-gray-700'}`}>{nombre}</span>
                                    </button>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {o.oaeca?.nombre ?? '—'}{o.fecha_limite ? ` · límite ${fmtFecha(o.fecha_limite)}` : ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {(Object.keys(ESTADO_OFICIO) as (keyof typeof ESTADO_OFICIO)[]).map(est => (
                                      <button
                                        key={est}
                                        onClick={() => setEstadoOficio(o, est)}
                                        className={`text-[10px] font-semibold px-2 py-1 rounded-full transition-colors ${
                                          o.estado === est ? ESTADO_OFICIO[est].on : ESTADO_OFICIO[est].off
                                        }`}
                                      >
                                        {ESTADO_OFICIO[est].label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <input
                                  type="text"
                                  defaultValue={o.nota ?? ''}
                                  onChange={e => setOficioNotaDraft(prev => ({ ...prev, [o.id]: e.target.value }))}
                                  onBlur={() => commitNotaOficioAnterior(o)}
                                  placeholder="Nota (ej: por qué sigue pendiente)…"
                                  className="w-full px-2.5 py-1 border border-slate-200 rounded text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
                                />
                                {tieneFicha && <AgregarAvanceInline onSubmit={texto => agregarAvanceCartera(o, texto)} />}
                              </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* Oficios tratados nuevos */}
                        <div className="pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-2 mb-2">
                            <h5 className="text-[10px] font-semibold text-gray-500">Oficios tratados nuevos</h5>
                            <span className="text-xs text-gray-400 ml-auto">{oficiosTratadosSesion.length}</span>
                          </div>
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <ComboboxOaeca
                                oaecaList={oaecaList}
                                value={oficioOaeca}
                                onSelect={setOficioOaeca}
                                onCreate={crearOaeca}
                                placeholder="OAECA…"
                                label="OAECA"
                              />
                              <label className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-gray-500 font-medium">Fecha de vencimiento</span>
                                <input
                                  type="date"
                                  value={oficioFechaLimite}
                                  onChange={e => setOficioFechaLimite(e.target.value)}
                                  className={`${inputCls} w-full`}
                                />
                              </label>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-500 font-medium">Proyecto que considera:</span>
                              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => setOficioProyectoTipo('privado')}
                                  className={`text-xs px-2.5 py-1 font-medium transition-colors ${oficioProyectoTipo === 'privado' ? 'bg-violet-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                  Privado
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOficioProyectoTipo('publico')}
                                  className={`text-xs px-2.5 py-1 font-medium transition-colors border-l border-gray-200 ${oficioProyectoTipo === 'publico' ? 'bg-violet-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                  Público
                                </button>
                              </div>
                            </div>
                            {oficioProyectoTipo === 'privado' ? (
                              oficioProyectoPrivado ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-800 border border-violet-200 rounded-lg px-2 py-1.5">
                                  <span className="truncate">{oficioProyectoPrivado.nombre}</span>
                                  <button type="button" onClick={() => setOficioProyectoPrivado(null)} className="text-violet-400 hover:text-violet-700 flex-shrink-0">✕</button>
                                </span>
                              ) : (
                                <ComboboxProyectoEconomico items={proyectosPrivados} onSelect={setOficioProyectoPrivado} placeholder="Buscar proyecto privado…" />
                              )
                            ) : (
                              oficioProyectoPublico ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-800 border border-sky-200 rounded-lg px-2 py-1.5">
                                  <span className="truncate">{oficioProyectoPublico.nombre}</span>
                                  <button type="button" onClick={() => setOficioProyectoPublico(null)} className="text-sky-400 hover:text-sky-700 flex-shrink-0">✕</button>
                                </span>
                              ) : (
                                <ComboboxProyectoEconomico items={iniciativasCER} onSelect={setOficioProyectoPublico} placeholder="Buscar iniciativa pública (CER)…" />
                              )
                            )}
                            <button
                              onClick={agregarOficioNuevo}
                              disabled={oficioSaving || !oficioOaeca || (oficioProyectoTipo === 'privado' ? !oficioProyectoPrivado : !oficioProyectoPublico)}
                              className="text-xs px-3.5 py-1.5 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800 disabled:opacity-40"
                            >
                              {oficioSaving ? 'Guardando…' : '+ Oficio pendiente'}
                            </button>

                            {oficiosTratadosSesion.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                {oficiosTratadosSesion.map(o => {
                                  const { nombre, tag, tieneFicha } = resolverCartera(o, o.proyecto?.nombre)
                                  return (
                                  <div key={o.id} className="px-3 py-2 bg-gray-50 rounded-lg space-y-1.5">
                                    <button
                                      type="button"
                                      onClick={() => abrirFichaCartera(o)}
                                      disabled={!tieneFicha}
                                      className="text-left disabled:cursor-default"
                                      title={tieneFicha ? 'Ver ficha y avances previos' : undefined}
                                    >
                                      {tag && (
                                        <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border mr-1.5 ${tag === 'Privado' ? 'bg-violet-50 text-violet-700 border-violet-200' : tag === 'Público' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                          {tag}
                                        </span>
                                      )}
                                      <span className={`text-sm truncate ${tieneFicha ? 'text-violet-800 hover:underline' : 'text-gray-700'}`}>{nombre}</span>
                                    </button>
                                    <p className="text-[11px] text-gray-400 truncate">
                                      {o.oaeca?.nombre ?? '—'}{o.fecha_limite ? ` · límite ${fmtFecha(o.fecha_limite)}` : ''}
                                    </p>
                                    {tieneFicha && <AgregarAvanceInline onSubmit={texto => agregarAvanceCartera(o, texto)} />}
                                  </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* ── Zona 5: compromisos nuevos — 4 si Mesa Empleo está escondida ── */}
              <section className={zoneCls}>
                <div className={zoneHead}>
                  <span className={zoneNum}>{MESA_EMPLEO_HABILITADA ? 5 : 4}</span>
                  <h3 className="text-sm font-semibold text-gray-800">Compromisos nuevos</h3>
                  <span className="text-xs text-gray-400 ml-auto">{compNuevos.length}</span>
                </div>
                <div className="p-3 space-y-2">
                  {compNuevos.map(c => {
                    const { nombre: nombreProy, tag: tagProy, tieneFicha } = resolverCartera(c)
                    return (
                    <div key={c.id} className="px-3 py-2 bg-gray-50 rounded-lg">
                      {c.seccion && <div className="mb-1"><SeccionTag seccion={c.seccion} /></div>}
                      <p className="text-sm text-gray-700 leading-snug">{c.descripcion}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.responsable_institucion}{c.responsable_nombre ? ` · ${c.responsable_nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                      </p>
                      {tieneFicha && (
                        <button
                          type="button"
                          onClick={() => abrirFichaCartera(c)}
                          className="mt-1 text-xs text-violet-700 hover:underline"
                          title="Ver ficha y avances previos"
                        >
                          {tagProy} · {nombreProy}
                        </button>
                      )}
                      {tieneFicha && <AgregarAvanceInline onSubmit={texto => agregarAvanceCartera(c, texto)} />}
                    </div>
                    )
                  })}
                  <form onSubmit={agregarCompromiso} className="space-y-2 pt-1">
                    <textarea
                      value={cDescripcion}
                      onChange={e => setCDescripcion(e.target.value)}
                      rows={2}
                      placeholder="Descripción del compromiso…"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                    />
                    <div className="flex gap-2 flex-wrap">
                      <input type="text" value={cInstitucion} onChange={e => setCInstitucion(e.target.value)} placeholder="Institución responsable *" className={`${inputCls} flex-1 min-w-[150px] text-xs py-1.5`} />
                      <input type="text" value={cNombre} onChange={e => setCNombre(e.target.value)} placeholder="Responsable (nombre)" className={`${inputCls} flex-1 min-w-[130px] text-xs py-1.5`} />
                      <input type="date" value={cPlazo} onChange={e => setCPlazo(e.target.value)} className={`${inputCls} w-36 text-xs py-1.5`} title="Plazo" />
                    </div>
                    <div className="flex gap-2 flex-wrap items-end">
                      <label className="flex flex-col gap-0.5 flex-1 min-w-[170px]">
                        <span className="text-[10px] text-gray-500 font-medium">Sección *</span>
                        <select
                          value={cSeccion}
                          onChange={e => setCSeccion(e.target.value as SeccionComiteEconomico | '')}
                          className={`${inputCls} w-full text-xs py-1.5`}
                        >
                          <option value="" disabled>Selecciona sección…</option>
                          {MESA_EMPLEO_HABILITADA && <option value="mesa_empleo">Mesa Empleo</option>}
                          <option value="seguimiento_inversion">Seguimiento de la Inversión</option>
                          <option value="general">General{MESA_EMPLEO_HABILITADA ? ' (fuera de ambas)' : ''}</option>
                        </select>
                      </label>
                      <div className="flex-1 min-w-[220px]">
                        <span className="text-[10px] text-gray-500 font-medium block mb-0.5">Proyecto asociado (opcional)</span>
                        <div className="flex items-center gap-1.5">
                          <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => setCProyectoTipo('privado')}
                              className={`text-[11px] px-2 py-1.5 font-medium transition-colors ${cProyectoTipo === 'privado' ? 'bg-violet-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                              Privado
                            </button>
                            <button
                              type="button"
                              onClick={() => setCProyectoTipo('publico')}
                              className={`text-[11px] px-2 py-1.5 font-medium transition-colors border-l border-gray-200 ${cProyectoTipo === 'publico' ? 'bg-violet-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                              Público
                            </button>
                          </div>
                          <div className="flex-1 min-w-0">
                            {cProyectoTipo === 'privado' ? (
                              cProyectoPrivado ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-800 border border-violet-200 rounded-lg px-2 py-1.5 max-w-full">
                                  <span className="truncate">{cProyectoPrivado.nombre}</span>
                                  <button type="button" onClick={() => setCProyectoPrivado(null)} className="text-violet-400 hover:text-violet-700 flex-shrink-0">✕</button>
                                </span>
                              ) : (
                                <ComboboxProyectoEconomico items={proyectosPrivados} onSelect={setCProyectoPrivado} placeholder="Buscar proyecto privado…" />
                              )
                            ) : (
                              cProyectoPublico ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-800 border border-sky-200 rounded-lg px-2 py-1.5 max-w-full">
                                  <span className="truncate">{cProyectoPublico.nombre}</span>
                                  <button type="button" onClick={() => setCProyectoPublico(null)} className="text-sky-400 hover:text-sky-700 flex-shrink-0">✕</button>
                                </span>
                              ) : (
                                <ComboboxProyectoEconomico items={iniciativasCER} onSelect={setCProyectoPublico} placeholder="Buscar iniciativa pública (CER)…" />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={cSaving || !cDescripcion.trim() || !cInstitucion.trim() || !cSeccion}
                        className="text-xs px-3.5 py-1.5 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800 disabled:opacity-40"
                      >
                        {cSaving ? 'Guardando…' : '+ Compromiso'}
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={cerrando}
            className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white disabled:opacity-50 whitespace-nowrap"
          >
            Guardar borrador
          </button>
          <button
            onClick={handlePreviewActa}
            disabled={cerrando || previewActa || !sesion}
            title="Ver el acta con el estado actual, antes de cerrar (borrador)"
            className="text-sm px-4 py-2 border border-violet-200 text-violet-700 font-medium rounded-lg hover:bg-violet-50 disabled:opacity-50 whitespace-nowrap"
          >
            {previewActa ? 'Generando…' : 'Previsualizar acta'}
          </button>
          <button
            onClick={handleCerrar}
            disabled={cerrando || !sesion}
            className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50 whitespace-nowrap"
          >
            {cerrando ? 'Cerrando sesión…' : 'Cerrar sesión y generar acta'}
          </button>
        </footer>
      </div>
    </div>
    {fichaPrivadoId != null && (
      <ProyectoEconomicoFichaModal
        proyectoId={fichaPrivadoId}
        puedeOperar={true}
        currentUserEmail={currentUserEmail}
        onClose={() => setFichaPrivadoId(null)}
      />
    )}
    </>
  )
}
