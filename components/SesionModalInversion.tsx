'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import type { Region } from '@/lib/regions'
import { INE_CODE } from '@/lib/regions'
import type {
  EjeSesion, Oaeca, RegionMetaEmpleo, SeccionComiteEconomico, SesionAsistencia, SesionCompromiso,
  SesionMetaEmpleoValor, SesionNomina, SesionOficioTratado, SesionProyecto,
} from '@/lib/types'
import { Alert } from '@/components/ui'

/**
 * Formulario de sesión del Comité Económico — 5 zonas EN ESTE ORDEN (mismo
 * criterio que SesionModal.tsx: el orden es producto):
 *   1. Integrantes (nómina fija + invitados — igual que Asistencia)
 *   2. Mesa Empleo (desplegable) — Meta Empleo (indicador con objetivo +
 *      acumulado, mig 052) y Proyectos de Inversión Pública (módulo
 *      placeholder — la tabla se arma más adelante)
 *   3. Seguimiento de la Inversión (desplegable) — lo que ya existía:
 *      3a. Oficios anteriores (verificación)
 *      3b. Oficios tratados nuevos (alta directa: OAECA + fecha límite +
 *          proyecto — no hay import de Excel)
 *      3c. Proyectos tratados en profundidad (selección desde catálogo
 *          real, v2_proyectos_inversion — no texto libre)
 *   4. Compromisos anteriores (si hubieron) — de CUALQUIERA de las dos
 *      secciones o generales, fuera de ambas
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
  onClose: () => void
}

const NOMBRE_COMITE = 'Comité Económico'

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
// Zonas 3 y 4 tienen comboboxes con dropdown flotante — sin overflow-hidden
// para que el dropdown no quede recortado ni empujado sobre la zona
// siguiente; el header se redondea explícito ya que el padre ya no clippea.
const zoneClsFlow = 'border border-gray-200 rounded-xl'
const zoneHead = 'px-4 py-2.5 bg-violet-50/70 border-b border-violet-100 flex items-center gap-2'
const zoneHeadFlow = `${zoneHead} rounded-t-xl`
const zoneNum  = 'w-5 h-5 rounded-full bg-violet-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0'

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

function fmtFecha(fecha: string | null): string {
  if (!fecha) return '—'
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Comboboxes locales (precargados — sin ida y vuelta al servidor) ─────────

function ComboboxProyecto({
  proyectos, value, onSelect, placeholder, label,
}: {
  proyectos: V2Proyecto[]
  value: V2Proyecto | null
  onSelect: (p: V2Proyecto | null) => void
  placeholder: string
  label?: string
}) {
  const [query, setQuery] = useState(value?.nombre ?? '')
  const [open, setOpen]   = useState(false)

  useEffect(() => { setQuery(value?.nombre ?? '') }, [value])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? proyectos.filter(p => p.nombre.toLowerCase().includes(q)) : proyectos
    return base.slice(0, 30)
  }, [query, proyectos])

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
      {open && matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {matches.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(p); setQuery(p.nombre); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-violet-50 border-b border-gray-100 last:border-0"
            >
              <p className="text-sm text-gray-800 truncate">{p.nombre}</p>
              <p className="text-[11px] text-gray-400 truncate">{p.titular ?? '—'}{p.etapa ? ` · ${p.etapa}` : ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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

export default function SesionModalInversion({ region, borradorId, currentUserEmail, onClose }: Props) {
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
  const [proyectosRegion, setProyectosRegion] = useState<V2Proyecto[]>([])

  const [proyectosSesion, setProyectosSesion] = useState<SesionProyecto[]>([])
  const [proyectosInfo, setProyectosInfo]     = useState<Map<string, V2Proyecto>>(new Map())
  const [proyectoNotaDraft, setProyectoNotaDraft] = useState<Record<string, string>>({})
  const [proyectoNuevo, setProyectoNuevo]     = useState<V2Proyecto | null>(null)

  // Alta de oficio nuevo (Seguimiento de la Inversión)
  const [oficioOaeca, setOficioOaeca]         = useState<Oaeca | null>(null)
  const [oficioProyecto, setOficioProyecto]   = useState<V2Proyecto | null>(null)
  const [oficioFechaLimite, setOficioFechaLimite] = useState('')
  const [oficioSaving, setOficioSaving]       = useState(false)

  // Mesa Empleo: meta+acumulado de la región (mig 052) y valor digitado en
  // esta sesión (si ya se guardó un borrador con valor).
  const [metaEmpleoRegion, setMetaEmpleoRegion] = useState<RegionMetaEmpleo | null>(null)
  const [metaEmpleoSesion, setMetaEmpleoSesion] = useState<SesionMetaEmpleoValor | null>(null)
  const [metaEmpleoInput, setMetaEmpleoInput]   = useState('')
  const [metaEmpleoSaving, setMetaEmpleoSaving] = useState(false)

  // Colapso de las dos secciones nuevas — ambas arrancan abiertas.
  const [mesaEmpleoOpen, setMesaEmpleoOpen]     = useState(true)
  const [seguimientoOpen, setSeguimientoOpen]   = useState(true)

  // Invitado form
  const [invNombre, setInvNombre]           = useState('')
  const [invInstitucion, setInvInstitucion] = useState('')

  // Compromiso nuevo form
  const [cDescripcion, setCDescripcion]     = useState('')
  const [cInstitucion, setCInstitucion]     = useState('')
  const [cNombre, setCNombre]               = useState('')
  const [cPlazo, setCPlazo]                 = useState('')
  const [cSeccion, setCSeccion]             = useState<SeccionComiteEconomico | ''>('')
  const [cProyecto, setCProyecto]           = useState<V2Proyecto | null>(null)
  const [cSaving, setCSaving]               = useState(false)

  // Cierre
  const [cerrando, setCerrando]             = useState(false)
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
      oaecaRes, proyRegionRes, proyRes, metaRegionRes, metaSesionRes,
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
      sb.from('v2_proyectos_inversion')
        .select('id, nombre, titular, inversion, moneda, etapa')
        .eq('region_id', INE_CODE[region.cod])
        .order('nombre'),
      sb.from('sesion_proyectos').select('*').eq('sesion_id', s.id),
      sb.from('region_meta_empleo').select('*').eq('region_cod', region.cod).maybeSingle(),
      sb.from('sesion_meta_empleo_valor').select('*').eq('sesion_id', s.id).maybeSingle(),
    ])

    setNomina((nominaRes.data ?? []) as SesionNomina[])
    setAsistencia((asisRes.data ?? []) as SesionAsistencia[])
    setCompAnteriores((compRes.data ?? []) as SesionCompromiso[])
    setCompNuevos((nuevosRes.data ?? []) as SesionCompromiso[])
    setOficiosAnteriores((oficiosAntRes.data ?? []) as unknown as SesionOficioConNombres[])
    setOficiosTratadosSesion((oficiosTratRes.data ?? []) as unknown as SesionOficioConNombres[])
    setOaecaList((oaecaRes.data ?? []) as Oaeca[])
    setProyectosRegion((proyRegionRes.data ?? []) as V2Proyecto[])
    setMetaEmpleoRegion((metaRegionRes.data as RegionMetaEmpleo | null) ?? null)
    const metaSesion = (metaSesionRes.data as SesionMetaEmpleoValor | null) ?? null
    setMetaEmpleoSesion(metaSesion)
    setMetaEmpleoInput(metaSesion ? String(metaSesion.empleos_generados) : '')

    const proy = (proyRes.data ?? []) as SesionProyecto[]
    setProyectosSesion(proy)
    if (proy.length) {
      const { data: infoData } = await sb.from('v2_proyectos_inversion')
        .select('id, nombre, titular, inversion, moneda, etapa')
        .in('id', proy.map(p => p.proyecto_id))
      setProyectosInfo(new Map(((infoData ?? []) as V2Proyecto[]).map(p => [p.id, p])))
    }
  }, [region.cod])

  useEffect(() => { if (sesion) loadAll(sesion) }, [sesion, loadAll])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !cerrando) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, cerrando])

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

  // ── Zona 2: Mesa Empleo — Meta Empleo ─────────────────────────────────────

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

  // ── Zona 3a: verificación de oficios anteriores (Seguimiento de la Inversión) ──

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

  // ── Zona 3b: alta directa de oficios nuevos (Seguimiento de la Inversión) ──

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
    if (!sesion || !oficioOaeca || !oficioProyecto) return
    setOficioSaving(true)
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_oficios_tratados').insert({
          region_cod: region.cod,
          sesion_origen_id: sesion.id,
          oaeca_id: oficioOaeca.id,
          proyecto_id: oficioProyecto.id,
          fecha_limite: oficioFechaLimite || null,
        }),
        `sesion_oficios_tratados insert sesion=${sesion.id}`,
      )
      const nuevo: SesionOficioConNombres = {
        ...(rows[0] as SesionOficioTratado),
        oaeca: { nombre: oficioOaeca.nombre },
        proyecto: { nombre: oficioProyecto.nombre },
      }
      setOficiosTratadosSesion(prev => [...prev, nuevo])
      setOficioOaeca(null); setOficioProyecto(null); setOficioFechaLimite('')
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setOficioSaving(false)
    }
  }

  // ── Zona 3c: proyectos tratados en profundidad (Seguimiento de la Inversión) ──

  async function agregarProyecto(p: V2Proyecto) {
    if (!sesion) return
    if (proyectosSesion.some(sp => sp.proyecto_id === p.id)) return
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_proyectos').insert({ sesion_id: sesion.id, proyecto_id: p.id }),
        `sesion_proyectos insert ${p.id}`,
      )
      setProyectosSesion(prev => [...prev, rows[0] as SesionProyecto])
      setProyectosInfo(prev => new Map(prev).set(p.id, p))
      setProyectoNuevo(null)
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function commitNotaProyecto(sp: SesionProyecto) {
    const nota = (proyectoNotaDraft[sp.proyecto_id] ?? sp.nota ?? '').trim()
    if (nota === (sp.nota ?? '')) return
    try {
      await safeWrite(
        getSupabase().from('sesion_proyectos').update({ nota: nota || null }).eq('id', sp.id),
        `sesion_proyectos nota id=${sp.id}`,
      )
      setProyectosSesion(prev => prev.map(x => x.id === sp.id ? { ...x, nota: nota || null } : x))
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
          proyecto_id: cProyecto?.id ?? null,
        }),
        `sesion_compromisos insert sesion=${sesion.id}`,
      )
      setCompNuevos(prev => [...prev, rows[0] as SesionCompromiso])
      setCDescripcion(''); setCInstitucion(''); setCNombre(''); setCPlazo(''); setCSeccion(''); setCProyecto(null)
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

  // ── Derivados ─────────────────────────────────────────────────────────────

  const invitados = useMemo(() => asistencia.filter(a => a.nomina_id === null), [asistencia])
  const presentes = useMemo(() => asistencia.filter(a => a.presente).length, [asistencia])

  // ── Render ────────────────────────────────────────────────────────────────

  if (cierreResultado) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !cerrando && onClose()}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
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
                <div className={zoneHead}>
                  <span className={zoneNum}>1</span>
                  <h3 className="text-sm font-semibold text-gray-800">Integrantes</h3>
                  <span className="text-xs text-gray-400 ml-auto">{presentes} presente{presentes === 1 ? '' : 's'}</span>
                </div>
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
              </section>

              {/* ── Zona 2: Mesa Empleo (desplegable) ── */}
              <section className={zoneCls}>
                <button type="button" onClick={() => setMesaEmpleoOpen(o => !o)} className={`${zoneHead} w-full text-left`}>
                  <span className={zoneNum}>2</span>
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
                          Acumulado: <span className="font-semibold text-gray-800">{(metaEmpleoRegion?.valor_actual ?? 0).toLocaleString('es-CL')}</span>
                          {metaEmpleoRegion && metaEmpleoRegion.objetivo > 0 && (
                            <> de {metaEmpleoRegion.objetivo.toLocaleString('es-CL')} ({Math.round((metaEmpleoRegion.valor_actual / metaEmpleoRegion.objetivo) * 100)}%)</>
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
                      <label className="flex flex-col gap-0.5 max-w-xs">
                        <span className="text-[10px] text-gray-500 font-medium">Empleos generados esta sesión</span>
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

              {/* ── Zona 3: Seguimiento de la Inversión (desplegable) ── */}
              <section className={zoneCls}>
                <button type="button" onClick={() => setSeguimientoOpen(o => !o)} className={`${zoneHead} w-full text-left`}>
                  <span className={zoneNum}>3</span>
                  <h3 className="text-sm font-semibold text-gray-800">Seguimiento de la Inversión</h3>
                  <Chevron open={seguimientoOpen} />
                </button>
                {seguimientoOpen && (
                  <div className="p-3 space-y-4">
                    {/* Zona 3a: oficios anteriores */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Oficios anteriores</h4>
                        <span className="text-xs text-gray-400 ml-auto">{oficiosAnteriores.length}</span>
                      </div>
                      <div className="space-y-2">
                        {oficiosAnteriores.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-2">Sin oficios pendientes de sesiones anteriores.</p>
                        ) : oficiosAnteriores.map(o => (
                          <div key={o.id} className="px-3 py-2 bg-gray-50 rounded-lg space-y-1.5">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-700 leading-snug truncate">{o.proyecto?.nombre ?? 'Sin proyecto'}</p>
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
                        ))}
                      </div>
                    </div>

                    {/* Zona 3b: alta de oficios nuevos */}
                    <div className="pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Oficios tratados nuevos</h4>
                        <span className="text-xs text-gray-400 ml-auto">{oficiosTratadosSesion.length}</span>
                      </div>
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                          <ComboboxProyecto
                            proyectos={proyectosRegion}
                            value={oficioProyecto}
                            onSelect={setOficioProyecto}
                            placeholder="Proyecto que considera…"
                            label="Proyecto que considera"
                          />
                        </div>
                        <button
                          onClick={agregarOficioNuevo}
                          disabled={oficioSaving || !oficioOaeca || !oficioProyecto}
                          className="text-xs px-3.5 py-1.5 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800 disabled:opacity-40"
                        >
                          {oficioSaving ? 'Guardando…' : '+ Oficio pendiente'}
                        </button>

                        {oficiosTratadosSesion.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            {oficiosTratadosSesion.map(o => (
                              <div key={o.id} className="px-3 py-2 bg-gray-50 rounded-lg">
                                <p className="text-sm text-gray-700 truncate">{o.proyecto?.nombre ?? '—'}</p>
                                <p className="text-[11px] text-gray-400 truncate">
                                  {o.oaeca?.nombre ?? '—'}{o.fecha_limite ? ` · límite ${fmtFecha(o.fecha_limite)}` : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Zona 3c: proyectos tratados en profundidad */}
                    <div className="pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Proyectos tratados en profundidad</h4>
                        <span className="text-xs text-gray-400 ml-auto">{proyectosSesion.length}</span>
                      </div>
                      <div className="space-y-2">
                        <ComboboxProyecto
                          proyectos={proyectosRegion}
                          value={proyectoNuevo}
                          onSelect={p => { setProyectoNuevo(p); if (p) agregarProyecto(p) }}
                          placeholder="Buscar proyecto por nombre…"
                        />

                        {proyectosSesion.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-2">Sin proyectos tratados en esta sesión.</p>
                        ) : proyectosSesion.map(sp => {
                          const info = proyectosInfo.get(sp.proyecto_id)
                          return (
                            <div key={sp.id} className="px-3 py-2 bg-gray-50 rounded-lg space-y-1.5">
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-700 truncate">{info?.nombre ?? sp.proyecto_id}</p>
                                  <p className="text-[11px] text-gray-400 truncate">{info?.titular ?? '—'}{info?.etapa ? ` · ${info.etapa}` : ''}</p>
                                </div>
                                <button onClick={() => quitarProyecto(sp)} className="text-gray-300 hover:text-red-500 p-0.5 flex-shrink-0" title="Quitar proyecto">
                                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
                                  </svg>
                                </button>
                              </div>
                              <textarea
                                defaultValue={sp.nota ?? ''}
                                onChange={e => setProyectoNotaDraft(prev => ({ ...prev, [sp.proyecto_id]: e.target.value }))}
                                onBlur={() => commitNotaProyecto(sp)}
                                rows={2}
                                placeholder="Notas de la discusión en profundidad…"
                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-300 resize-y"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* ── Zona 4: compromisos anteriores (de cualquier sección, o generales) ── */}
              <section className={zoneCls}>
                <div className={zoneHead}>
                  <span className={zoneNum}>4</span>
                  <h3 className="text-sm font-semibold text-gray-800">Compromisos anteriores</h3>
                  <span className="text-xs text-gray-400 ml-auto">{compAnteriores.length}</span>
                </div>
                <div className="p-3 space-y-2">
                  {compAnteriores.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">Sin compromisos pendientes de sesiones anteriores.</p>
                  ) : compAnteriores.map(c => (
                    <div key={c.id} className="flex items-start gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        {c.seccion && <div className="mb-1"><SeccionTag seccion={c.seccion} /></div>}
                        <p className="text-sm text-gray-700 leading-snug">{c.descripcion}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.responsable_institucion}{c.responsable_nombre ? ` · ${c.responsable_nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                        </p>
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
                  ))}
                </div>
              </section>

              {/* ── Zona 5: compromisos nuevos ── */}
              <section className={zoneCls}>
                <div className={zoneHead}>
                  <span className={zoneNum}>5</span>
                  <h3 className="text-sm font-semibold text-gray-800">Compromisos nuevos</h3>
                  <span className="text-xs text-gray-400 ml-auto">{compNuevos.length}</span>
                </div>
                <div className="p-3 space-y-2">
                  {compNuevos.map(c => (
                    <div key={c.id} className="px-3 py-2 bg-gray-50 rounded-lg">
                      {c.seccion && <div className="mb-1"><SeccionTag seccion={c.seccion} /></div>}
                      <p className="text-sm text-gray-700 leading-snug">{c.descripcion}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.responsable_institucion}{c.responsable_nombre ? ` · ${c.responsable_nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                      </p>
                    </div>
                  ))}
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
                          <option value="mesa_empleo">Mesa Empleo</option>
                          <option value="seguimiento_inversion">Seguimiento de la Inversión</option>
                          <option value="general">General (fuera de ambas)</option>
                        </select>
                      </label>
                      <div className="flex-1 min-w-[170px]">
                        <ComboboxProyecto
                          proyectos={proyectosRegion}
                          value={cProyecto}
                          onSelect={setCProyecto}
                          placeholder="Proyecto asociado (opcional)…"
                          label="Proyecto asociado (opcional)"
                        />
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
        <footer className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400">
            El borrador se guarda automáticamente con cada cambio.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={cerrando}
              className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white disabled:opacity-50"
            >
              Guardar borrador
            </button>
            <button
              onClick={handleCerrar}
              disabled={cerrando || !sesion}
              className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50"
            >
              {cerrando ? 'Cerrando sesión…' : 'Cerrar sesión y generar acta'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
