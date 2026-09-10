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
import ProyectoEconomicoFichaModal from './ProyectoEconomicoFichaModal'
import FilterPopover, { type FilterOption } from './FilterPopover'
import ActiveFiltersBar, { setChip } from './ActiveFiltersBar'
import {
  railParaSesion, resumenAsistencia, vecinos, etiquetaZona,
  type ZonaKey, type ZonaRef,
} from '@/lib/sesiones/consola'
import ConsolaSesionShell, { soltarFoco } from './sesiones/ConsolaSesionShell'
import ConsolaRail from './sesiones/ConsolaRail'
import ZonaCard from './sesiones/ZonaCard'
import FechaEditable from './sesiones/FechaEditable'
import CierreSesionComite from './sesiones/CierreSesionComite'

/**
 * CONSOLA DE SESIÓN del Comité Económico. El nombre del archivo es histórico:
 * hasta 2026-09-08 esto era un modal centrado; hoy ocupa toda la pantalla con
 * el mismo esqueleto que el Policial y el de Infraestructura
 * (`./sesiones/ConsolaSesionShell`): cabecera + riel izquierdo con las zonas
 * + panel principal que muestra SOLO la zona activa. El cambio es visual: lo
 * que se registra, las queries y el cierre son los mismos.
 *
 * Zonas EN ESTE ORDEN (el orden es producto, y es el que este comité ya tenía
 * en el modal — por eso abre por Integrantes y no por los compromisos, al
 * revés que los otros dos):
 *   1. Integrantes (nómina fija + invitados — igual que Asistencia)
 *   2. Compromisos anteriores (si hubieron) — de CUALQUIERA de las dos
 *      secciones o generales, fuera de ambas
 *   3. Seguimiento de la Inversión, con dos sub-zonas en el riel:
 *      3a. Proyectos tratados en profundidad (cartera del comité: privados
 *          + iniciativas públicas con el tag CER). La lista de arriba es la
 *          selección —los ya agendados quedan marcados, no escondidos— y
 *          cada proyecto de la agenda linkea a su ficha, con «Agregar
 *          avance» abriéndola derecho en el formulario. El avance se escribe
 *          SOLO allá: la sesión no guarda copia de nada.
 *      3b. Oficios — anteriores (verificación) y nuevos (alta directa:
 *          OAECA + fecha límite + proyecto; no hay import de Excel)
 *   4. Mesa Empleo — meta de empleo de la región y corte de subsidios
 *      (mig 052/055/056). Va antes de los compromisos para que lo que la mesa
 *      arroje se pueda dejar comprometido en la zona siguiente, que es el
 *      orden en que ocurre la reunión.
 *   5. Compromisos nuevos — `seccion` es obligatoria (mesa_empleo /
 *      seguimiento_inversion / general) y genera el tag al listar;
 *      el proyecto asociado es opcional en cualquier sección.
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
  /** Saltar a la cartera completa. Cierra la sesión: el borrador se guarda solo. */
  onVerProyectos?: () => void
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


const inputCls = 'px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300'

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

export default function SesionModalInversion({ region, borradorId, currentUserEmail, iniciativas, onAbrirIniciativa, onVerProyectos, onClose }: Props) {
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
  // Buscador por nombre del picker privado. Busca sobre TODA la cartera, no
  // sobre lo que dejaron los filtros: si alguien escribe el nombre de un
  // proyecto, quiere ese proyecto aunque los filtros lo estén dejando fuera.
  const [pkQuery, setPkQuery]             = useState('')
  // Proyectos y Oficios ya no se colapsan: son dos sub-zonas del riel.

  // Alta de oficio nuevo (Seguimiento de la Inversión) — proyecto que
  // considera viene de la misma cartera (privado/público) que 4c, no del
  // catálogo SEIA legado (mig 097).
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

  // Consola: en qué zona está parado el usuario y si está en la sala o en la
  // pantalla de cierre. Arranca en Integrantes, que es la zona 1 de este comité.
  const [activa, setActiva] = useState<ZonaRef>({ zona: 'asistencia' })
  const [fase, setFase]     = useState<'sala' | 'cierre'>('sala')
  // Lo pone CierreSesionComite mientras hay un cierre en vuelo: bloquea Escape
  // y la ✕ para no desmontar la consola a medio camino.
  const [cerrando, setCerrando] = useState(false)

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
    // Solo filas legadas (previas a mig 094) siguen apuntando a proyecto_id;
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

  // Escape y el focus-trap de diálogo los pone ConsolaSesionShell (con Escape
  // ya diferenciado: en el cierre vuelve a la sala, en la sala cierra).

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

  // ── Zona 2: verificación de compromisos anteriores ────────────────────────
  // Vive acá (y no inline en el JSX) porque la pantalla de cierre ofrece los
  // mismos botones de estado: un solo camino de escritura para ambas.
  async function setEstadoCompromisoAnterior(c: SesionCompromiso, estado: SesionCompromiso['estado']) {
    if (c.estado === estado) return
    const prevEstado = c.estado
    setCompAnteriores(prev => prev.map(x => x.id === c.id ? { ...x, estado } : x))
    try {
      await safeWrite(
        getSupabase().from('sesion_compromisos').update({
          estado,
          estado_updated_at: new Date().toISOString(),
          estado_updated_by_email: currentUserEmail || null,
        }).eq('id', c.id),
        `sesion_compromisos estado id=${c.id}`,
      )
    } catch (err) {
      setCompAnteriores(prev => prev.map(x => x.id === c.id ? { ...x, estado: prevEstado } : x))
      window.alert((err as Error).message)
    }
  }

  // ── Mesa Empleo (dormida) — Meta Empleo ───────────────────────────────────

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
  // forma (proyecto_privado_id / prioridad_id) desde mig 094/095/097.
  function abrirFichaCartera(
    row: { proyecto_privado_id?: number | null; prioridad_id?: number | null },
  ) {
    if (row.proyecto_privado_id != null) {
      setFichaPrivadoId(row.proyecto_privado_id)
      return
    }
    if (row.prioridad_id != null) {
      // La ficha de una iniciativa abre en su pestaña Seguimiento, que es
      // donde está el alta de avance: no hace falta un deep-link aparte.
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
  // Cerrar / previsualizar / reintentar / descargar el acta viven en
  // ./sesiones/CierreSesionComite (la pantalla «Terminar sesión»), igual que
  // en el Policial: mismos endpoints, mismos textos.

  // ── Derivados ─────────────────────────────────────────────────────────────

  const invitados = useMemo(() => asistencia.filter(a => a.nomina_id === null), [asistencia])
  const presentes = useMemo(() => asistencia.filter(a => a.presente).length, [asistencia])
  const iniciativasCER = useMemo(
    () => iniciativas.filter(p => (p.tags ?? []).includes(TAG_ECONOMICO)),
    [iniciativas],
  )

  // ── Consola: riel, recorrido y navegación ─────────────────────────────────

  const asist = useMemo(() => resumenAsistencia(nomina, asistencia), [nomina, asistencia])

  const rail = useMemo(() => railParaSesion({
    instancia: 'economico',
    compAnteriores,
    asistencia: asist,
    compNuevos,
    proyectos: proyectosSesion.length,
    oficios: { anteriores: oficiosAnteriores, nuevos: oficiosTratadosSesion.length },
    mesaEmpleo: {
      metaDigitada:       metaEmpleoSesion != null,
      subsidiosDigitados: subsidioSesion != null,
    },
  }), [compAnteriores, asist, compNuevos, proyectosSesion.length, oficiosAnteriores,
       oficiosTratadosSesion.length, metaEmpleoSesion, subsidioSesion])

  // Cambiar de zona vacía primero un onBlur pendiente: hay campos que guardan
  // al salir (nota del oficio, lugar) y el enfocado se va a desmontar.
  const irA = useCallback((ref: ZonaRef) => { soltarFoco(); setActiva(ref) }, [])

  const { anterior, siguiente } = vecinos(rail, activa)
  const navAnterior  = anterior  ? { label: etiquetaZona(rail, anterior),  onClick: () => irA(anterior) }  : null
  const navSiguiente = siguiente ? { label: etiquetaZona(rail, siguiente), onClick: () => irA(siguiente) } : null

  const muestra = (z: ZonaKey) => activa.zona === z
  // Sub-zona de Seguimiento en pantalla. Si el riel no eligió una, Proyectos.
  const subSeguimiento = activa.zona === 'seguimiento' && activa.inst === 'oficios' ? 'oficios' : 'proyectos'

  const abrirCierre = useCallback(() => { soltarFoco(); setFase('cierre') }, [])
  const navTerminar = { label: 'Terminar sesión', onClick: abrirCierre }

  // Lo tratado, ya resuelto contra la cartera, para la pantalla de cierre:
  // quién referencia a qué lo sabe esta consola, no el cierre.
  const proyectosCierre = useMemo(
    () => proyectosSesion.map(sp => {
      const { nombre, tag } = resolverCartera(sp, proyectosInfo.get(sp.proyecto_id ?? '')?.nombre)
      return { id: sp.id, nombre, tag }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proyectosSesion, proyectosPrivados, iniciativas, proyectosInfo],
  )
  const oficiosCierre = useMemo(() => ({
    anteriores: oficiosAnteriores.map(o => ({
      id: o.id, nombre: resolverCartera(o, o.proyecto?.nombre).nombre, oaeca: o.oaeca?.nombre ?? null, estado: o.estado,
    })),
    nuevos: oficiosTratadosSesion.map(o => ({
      id: o.id, nombre: resolverCartera(o, o.proyecto?.nombre).nombre, oaeca: o.oaeca?.nombre ?? null,
    })),
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [oficiosAnteriores, oficiosTratadosSesion, proyectosPrivados, iniciativas])

  // Picker privado — mismos filtros y mismo criterio de opciones dinámicas que
  // ComiteEconomicoProyectosPanel.tsx. La lista NO esconde los ya agregados:
  // los marca. El picker es la selección de la agenda, no una bolsa de "los
  // que faltan", así que un proyecto ya elegido tiene que verse elegido.
  const proyectosPrivadosDisponibles = proyectosPrivados
  // Fila de sesion_proyectos de cada privado ya agendado, para marcarlo y para
  // poder sacarlo desde la misma lista.
  const spPorPrivado = useMemo(
    () => new Map(
      proyectosSesion
        .filter(sp => sp.proyecto_privado_id != null)
        .map(sp => [sp.proyecto_privado_id as number, sp]),
    ),
    [proyectosSesion],
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
  // Buscar por nombre CORTOCIRCUITA los filtros: quien escribe un nombre
  // quiere ese proyecto, no el que sobrevivió a los cinco popovers (y el
  // filtro Priorizado viene encendido por defecto, así que sin esto buscar un
  // proyecto no priorizado no devolvía nada y parecía que no existía).
  const pkBuscando = pkQuery.trim().length > 0
  const proyectosPrivadosFiltrados = useMemo(() => {
    const q = pkQuery.trim().toLowerCase()
    if (q) return proyectosPrivadosDisponibles.filter(p => p.nombre.toLowerCase().includes(q))
    let list = proyectosPrivadosDisponibles
    if (pkFPlazo.size)      list = list.filter(p => p.plazo && pkFPlazo.has(p.plazo))
    if (pkFPriorizado.size) list = list.filter(p => pkFPriorizado.has(p.priorizado ? 'Si' : 'No'))
    if (pkFSeremi.size)     list = list.filter(p => p.seremi_lider && pkFSeremi.has(p.seremi_lider))
    if (pkFRiesgo.size)     list = list.filter(p => pkFRiesgo.has(p.riesgo ? 'Si' : 'No'))
    if (pkFEstado.size)     list = list.filter(p => p.estado_actual && pkFEstado.has(p.estado_actual))
    return list
  }, [proyectosPrivadosDisponibles, pkQuery, pkFPlazo, pkFPriorizado, pkFSeremi, pkFRiesgo, pkFEstado])
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

  const headerContenido = (
    <>
      <span className="text-[14.5px] font-bold text-slate-900 inline-flex items-center gap-1.5 flex-wrap">
        {NOMBRE_COMITE}
        <span className="font-medium text-slate-400">·</span>
        <FechaEditable
          value={sesion?.fecha ?? hoyISO()}
          onCommit={iso => commitSesionField({ fecha: iso })}
          disabled={!sesion || sesion.estado !== 'borrador'}
        />
      </span>
      {sesion && (
        <input
          key={`lugar-${sesion.id}`}
          type="text"
          defaultValue={sesion.lugar ?? ''}
          onBlur={e => commitSesionField({ lugar: e.target.value.trim() || null })}
          placeholder="Lugar…"
          title="Lugar de la sesión"
          className="text-[13px] text-slate-600 bg-transparent border-b border-dashed border-slate-300 focus:border-violet-400 focus:outline-none px-1 py-0.5 w-52 placeholder:text-slate-300"
        />
      )}
      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
        En sesión
      </span>
      <span className="text-[12.5px] text-slate-500 tabular-nums" title="Integrantes presentes">
        Asistencia {asist.presentes}/{asist.total}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {onVerProyectos && (
          <button
            onClick={() => { soltarFoco(); onVerProyectos() }}
            disabled={cerrando}
            title="Ir a la cartera completa (el borrador queda guardado)"
            className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-40"
          >
            Ver todos los proyectos →
          </button>
        )}
        <button
          onClick={abrirCierre}
          disabled={!sesion || cerrando}
          className="text-[12.5px] font-bold px-3.5 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
        >
          Terminar sesión
        </button>
        <button
          onClick={onClose}
          disabled={cerrando}
          title="Salir (el borrador queda guardado)"
          className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
    </>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <ConsolaSesionShell
      ariaLabel={`Sesión — ${NOMBRE_COMITE}`}
      header={headerContenido}
      rail={<ConsolaRail items={rail} activo={activa} onSelect={irA} />}
      railMovil={<ConsolaRail items={rail} activo={activa} onSelect={irA} orientacion="horizontal" />}
      // Seguimiento es la zona con más contenido (picker + lista + oficios):
      // se le da el ancho grande, igual que el reporte del Policial.
      mainMaxWidth={activa.zona === 'seguimiento' ? 'max-w-6xl' : 'max-w-5xl'}
      onEscape={fase === 'cierre' ? () => setFase('sala') : onClose}
      escapeDeshabilitado={cerrando}
      overlay={fase === 'cierre' && sesion ? (
        <CierreSesionComite
          instancia="economico"
          sesion={sesion}
          nombreInstancia={NOMBRE_COMITE}
          compAnteriores={compAnteriores}
          onEstadoCompromiso={setEstadoCompromisoAnterior}
          compNuevos={compNuevos}
          nomina={nomina}
          asistencia={asistencia}
          proyectos={proyectosCierre}
          oficios={oficiosCierre}
          onVolver={() => setFase('sala')}
          onCerrada={onClose}
          onIrA={ref => { setFase('sala'); irA(ref) }}
          onCerrandoChange={setCerrando}
        />
      ) : null}
    >
          {initError ? (
            <Alert variant="error">{initError}</Alert>
          ) : !sesion ? (
            <p className="text-center text-sm text-gray-400 py-10">Preparando la sesión…</p>
          ) : (
            <div className="space-y-4">
              {/* ── Zona 1: integrantes ── */}
              {muestra('asistencia') && (
              <ZonaCard numero={1} titulo="Integrantes" badge={`${presentes} presente${presentes === 1 ? '' : 's'}`}
                descripcion="Quiénes asisten: la nómina fija del comité más los invitados de hoy."
                anterior={navAnterior} siguiente={navSiguiente}>
                <div>
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
              </ZonaCard>
              )}

              {/* ── Zona 2: compromisos anteriores (de cualquier sección, o generales) ── */}
              {muestra('anteriores') && (
              <ZonaCard numero={2} titulo="Compromisos anteriores" badge={compAnteriores.length}
                descripcion="Cómo quedaron los compromisos de las sesiones anteriores."
                anterior={navAnterior} siguiente={navSiguiente}>
                <div className="space-y-2">
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
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(Object.keys(ESTADO_COMPROMISO) as (keyof typeof ESTADO_COMPROMISO)[]).map(est => (
                          <button
                            key={est}
                            onClick={() => setEstadoCompromisoAnterior(c, est)}
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
              </ZonaCard>
              )}

              {/* ── Zona 4: Mesa Empleo ── */}
              {MESA_EMPLEO_HABILITADA && muestra('mesa_empleo') && (
              <ZonaCard numero={4} titulo="Mesa Empleo"
                badge={`${(metaEmpleoSesion != null ? 1 : 0) + (subsidioSesion != null ? 1 : 0)}/2`}
                descripcion="El avance de la meta de empleo de la región y el corte de subsidios. Lo que salga de acá se puede dejar comprometido en la zona siguiente."
                anterior={navAnterior} siguiente={navSiguiente}>
                  <div className="space-y-4">
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

                  </div>
              </ZonaCard>
              )}

              {/* ── Zona 3a: proyectos tratados en profundidad ── */}
              {muestra('seguimiento') && subSeguimiento === 'proyectos' && (
                  <ZonaCard numero={3} titulo="Seguimiento de la inversión · Proyectos"
                    badge={proyectosSesion.length}
                    descripcion="Los proyectos de la cartera que se discuten hoy. El avance queda en el historial del proyecto; click en su nombre abre la ficha completa."
                    anterior={navAnterior} siguiente={navSiguiente}>
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
                            <div className="relative">
                              <input
                                type="text"
                                value={pkQuery}
                                onChange={e => setPkQuery(e.target.value)}
                                placeholder="Buscar proyecto por nombre en toda la cartera…"
                                className={`${inputCls} w-full pr-8`}
                              />
                              {pkQuery && (
                                <button
                                  type="button"
                                  onClick={() => setPkQuery('')}
                                  title="Limpiar la búsqueda"
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600"
                                >
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                            {/* Mientras se busca, los filtros quedan fuera de juego: la
                                búsqueda corre sobre toda la cartera. */}
                            {!pkBuscando && (
                              <>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <FilterPopover label="Plazo" options={[{ value: 'CP', label: 'Corto plazo' }, { value: 'MP', label: 'Mediano plazo' }, { value: 'LP', label: 'Largo plazo' }]} selected={pkFPlazo} onChange={setPkFPlazo} />
                                  <FilterPopover label="Priorizado" options={[{ value: 'Si', label: 'Sí' }, { value: 'No', label: 'No' }]} selected={pkFPriorizado} onChange={setPkFPriorizado} />
                                  <FilterPopover label="SEREMI líder" options={pkOpcionesSeremi} selected={pkFSeremi} onChange={setPkFSeremi} />
                                  <FilterPopover label="Riesgo" options={[{ value: 'Si', label: 'Sí' }, { value: 'No', label: 'No' }]} selected={pkFRiesgo} onChange={setPkFRiesgo} />
                                  <FilterPopover label="Estado actual" options={pkOpcionesEstado} selected={pkFEstado} onChange={setPkFEstado} />
                                </div>
                                {pkChips.length > 0 && <ActiveFiltersBar chips={pkChips} clearFilters={clearPkFiltros} />}
                              </>
                            )}
                            {proyectosPrivadosFiltrados.length === 0 ? (
                              <p className="text-xs text-gray-500 text-center py-2">
                                {pkBuscando
                                  ? `Ningún proyecto de la cartera contiene «${pkQuery.trim()}».`
                                  : 'Ningún proyecto privado calza con los filtros.'}
                              </p>
                            ) : (
                              // Alto acotado con scroll propio: la lista completa queda
                              // alcanzable sin empujar la agenda fuera de la pantalla.
                              <div className="max-h-[210px] overflow-y-auto overscroll-contain space-y-1 pr-0.5">
                                {proyectosPrivadosFiltrados.map(p => {
                                  const sp = spPorPrivado.get(p.id)
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => sp ? quitarProyecto(sp) : agregarProyectoPrivado(p)}
                                      title={sp ? 'Ya está en la agenda — click para sacarlo' : 'Agregar a la agenda de hoy'}
                                      className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 border rounded-lg transition-colors ${
                                        sp
                                          ? 'border-violet-300 bg-violet-50 hover:bg-violet-100'
                                          : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/50'
                                      }`}
                                    >
                                      <span className={`flex-1 min-w-0 truncate text-sm ${sp ? 'text-violet-900 font-medium' : 'text-slate-800'}`}>{p.nombre}</span>
                                      {p.seremi_lider && <span className="text-[10px] text-gray-400 truncate max-w-[120px] flex-shrink-0">{p.seremi_lider}</span>}
                                      <span className={`text-sm font-semibold flex-shrink-0 ${sp ? 'text-violet-600' : 'text-violet-600'}`}>{sp ? '✓' : '+'}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <ComboboxProyectoEconomico
                            items={iniciativasCER.filter(i => !proyectosSesion.some(sp => sp.prioridad_id === i.id))}
                            onSelect={agregarProyectoPublico}
                            placeholder={`Buscar iniciativa pública (${TAG_ECONOMICO}) por nombre…`}
                          />
                        )}

                        {/* La agenda de hoy: solo el nombre (el tag Privado/Público
                            ya lo dice el toggle de arriba) y el avance rápido. */}
                        {proyectosSesion.length === 0 ? (
                          <p className="text-xs text-gray-500 text-center py-2">Sin proyectos tratados en esta sesión.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            {proyectosSesion.map(sp => {
                              const { nombre, tieneFicha } = resolverCartera(sp, proyectosInfo.get(sp.proyecto_id ?? '')?.nombre)
                              return (
                                <div key={sp.id} className="px-3 py-2 bg-gray-50 rounded-lg">
                                  <div className="flex items-start gap-3">
                                    <button
                                      type="button"
                                      onClick={() => abrirFichaCartera(sp)}
                                      disabled={!tieneFicha}
                                      className="flex-1 min-w-0 text-left disabled:cursor-default"
                                      title={tieneFicha ? 'Ver ficha y avances previos' : undefined}
                                    >
                                      <span className={`text-sm ${tieneFicha ? 'text-violet-800 hover:underline' : 'text-gray-700'}`}>{nombre}</span>
                                    </button>
                                    <button onClick={() => quitarProyecto(sp)} className="text-gray-300 hover:text-red-500 p-0.5 flex-shrink-0" title="Quitar proyecto">
                                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                                        <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
                                      </svg>
                                    </button>
                                  </div>
                                  {tieneFicha && (
                                    <button
                                      type="button"
                                      onClick={() => abrirFichaCartera(sp)}
                                      className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400 hover:text-violet-600"
                                      title="Abre la ficha del proyecto para agregar un avance"
                                    >
                                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
                                        <path d="M7 2v10M2 7h10" strokeLinecap="round"/>
                                      </svg>
                                      Agregar avance
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                  </ZonaCard>
              )}

              {/* ── Zona 3b: oficios — anteriores (verificación) + nuevos (alta) ── */}
              {muestra('seguimiento') && subSeguimiento === 'oficios' && (
                  <ZonaCard numero={3} titulo="Seguimiento de la inversión · Oficios"
                    badge={oficiosAnteriores.length + oficiosTratadosSesion.length}
                    descripcion="Los oficios pendientes de sesiones anteriores se verifican acá; abajo se levantan los nuevos."
                    anterior={navAnterior} siguiente={navSiguiente}>
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
                                  </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                  </ZonaCard>
              )}

              {/* ── Zona 5: compromisos nuevos ── */}
              {muestra('nuevos') && (
              <ZonaCard numero={5} titulo="Compromisos nuevos" badge={compNuevos.length}
                descripcion="Lo que queda comprometido hoy. Reaparece para verificarlo en la próxima sesión."
                anterior={navAnterior} siguiente={navTerminar} siguienteDestacado>
                <div className="space-y-2">
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
              </ZonaCard>
              )}
            </div>
          )}
    </ConsolaSesionShell>
    {fichaPrivadoId != null && (
      <ProyectoEconomicoFichaModal
        proyectoId={fichaPrivadoId}
        puedeOperar={true}
        currentUserEmail={currentUserEmail}
        sesionId={sesion?.id ?? null}
        onClose={() => setFichaPrivadoId(null)}
      />
    )}
    </>
  )
}
