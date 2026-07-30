'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type {
  EjeSesion, Metrica, RegionEje, SesionAsistencia, SesionApunte,
  SesionCompromiso, SesionIniciativa, SesionNomina, SesionValor,
} from '@/lib/types'
import {
  institucionesSugeridas, clasificarCompromisosGabinete, filasZona3Faltantes,
  type OrigenCompromisoGabinete,
} from '@/lib/sesiones/helpers'
import { SEMAFORO_CONFIG } from '@/lib/config'
import { useRegionConfig } from '@/lib/hooks/useRegionConfig'
import MetricaEditModal from './MetricaEditModal'

/**
 * Formulario de sesión — comités (mig 044) y Gabinete Regional (mig 046).
 * 5 zonas EN ESTE ORDEN (el orden es producto, no estética):
 *   1. Compromisos anteriores (verificación — lo primero que se ve).
 *      Gabinete: propios ∪ escalados desde comités ∪ mandatos a verificar.
 *   2. Asistencia (nómina fija + invitados)
 *   3. Comité: indicadores (métricas se_reporta_en_sesion precargadas).
 *      Gabinete: INICIATIVAS EN FOCO con acuerdo por iniciativa — el
 *      gabinete no digita métricas (spec gabinete §3).
 *   4. Apuntes por institución (tabs)
 *   5. Compromisos nuevos. Gabinete: además puede vincular a una iniciativa
 *      y dirigir a un comité (mandato: instancia='eje' + eje destino).
 *
 * El borrador se persiste EN CADA interacción (safeWrite onBlur/onClick) —
 * "Guardar borrador" solo cierra el modal. "Cerrar sesión" llama al
 * endpoint server-side que (en comité) aplica métricas y genera el acta.
 *
 * Un solo borrador por (región, instancia[, eje]): si viene borradorId se
 * reabre; si no, se crea (y ante carrera con el UNIQUE parcial, se
 * re-consulta).
 */

type PropsBase = {
  region: Region
  borradorId: number | null
  currentUserEmail: string
  onClose: () => void
}

// Discriminated union — refleja el CHECK de la mig 046: una sesión de
// gabinete NO tiene eje; una de comité lo exige.
type Props = PropsBase & (
  | { instancia: 'eje'; eje: RegionEje }
  | {
      instancia: 'gabinete'
      gabineteNombre: string
      // Cartera de la región ya cargada client-side — alimenta la zona 3
      // (precarga en foco + typeahead) y el vínculo de la zona 5. Sin
      // queries nuevas a prioridades.
      iniciativas: Iniciativa[]
      // Ejes con sesiones habilitadas — destino posible de un mandato y
      // nombre del comité de origen de los escalados.
      ejesComites: RegionEje[]
    }
)

// Identidad estable para la rama comité: un `[]` inline nuevo por render
// cambiaría las deps de loadAll y relanzaría el fetch en cada render.
const SIN_INICIATIVAS: Iniciativa[] = []
const SIN_EJES: RegionEje[] = []

const ESTADO_COMPROMISO = {
  pendiente: { label: 'Pendiente', on: 'bg-gray-600 text-white',   off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
  en_curso:  { label: 'En curso',  on: 'bg-blue-600 text-white',   off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
  cumplido:  { label: 'Cumplido',  on: 'bg-green-600 text-white',  off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
} as const

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

function fmtFecha(fecha: string | null): string {
  if (!fecha) return '—'
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SesionModal(props: Props) {
  const { region, borradorId, currentUserEmail, onClose } = props
  const esGabinete    = props.instancia === 'gabinete'
  const eje           = props.instancia === 'eje' ? props.eje : null
  const gabIniciativas = props.instancia === 'gabinete' ? props.iniciativas : SIN_INICIATIVAS
  const ejesComites   = props.instancia === 'gabinete' ? props.ejesComites : SIN_EJES

  const [sesion, setSesion]     = useState<EjeSesion | null>(null)
  const [initError, setInitError] = useState<string | null>(null)

  // "Escalar a gabinete" (subsidiariedad, spec gabinete §7.3): solo en
  // sesiones de COMITÉ y solo si la región tiene el gabinete habilitado.
  // region_config es SELECT any-auth — la query es segura para todo rol.
  const { config: regionConfig } = useRegionConfig(region.cod)
  const puedeEscalar = !esGabinete && !!regionConfig?.gabinete_habilitado

  const [compAnteriores, setCompAnteriores] = useState<(SesionCompromiso & { origenTipo?: OrigenCompromisoGabinete })[]>([])
  const [nomina, setNomina]                 = useState<SesionNomina[]>([])
  const [asistencia, setAsistencia]         = useState<SesionAsistencia[]>([])
  const [metricasSesion, setMetricasSesion] = useState<Metrica[]>([])
  const [valores, setValores]               = useState<SesionValor[]>([])
  const [valoresPrev, setValoresPrev]       = useState<Map<number, number>>(new Map())
  const [apuntes, setApuntes]               = useState<SesionApunte[]>([])
  const [instituciones, setInstituciones]   = useState<string[]>([])
  const [compNuevos, setCompNuevos]         = useState<SesionCompromiso[]>([])
  // Zona 3 gabinete: agenda de iniciativas de la sesión + acuerdos en edición.
  const [sesIniciativas, setSesIniciativas] = useState<SesionIniciativa[]>([])
  const [draftAcuerdos, setDraftAcuerdos]   = useState<Record<number, string>>({})

  const [tabInstitucion, setTabInstitucion] = useState<string | null>(null)
  const [draftValores, setDraftValores]     = useState<Record<number, string>>({})
  const [draftApuntes, setDraftApuntes]     = useState<Record<string, string>>({})
  const [nuevaMetricaOpen, setNuevaMetricaOpen] = useState(false)

  // Invitado form
  const [invNombre, setInvNombre]           = useState('')
  const [invInstitucion, setInvInstitucion] = useState('')

  // Compromiso nuevo form
  const [cDescripcion, setCDescripcion]     = useState('')
  const [cInstitucion, setCInstitucion]     = useState('')
  const [cNombre, setCNombre]               = useState('')
  const [cPlazo, setCPlazo]                 = useState('')
  // Gabinete: vínculo opcional a iniciativa + comité destino (mandato).
  const [cVinculada, setCVinculada]         = useState<Iniciativa | null>(null)
  const [cDestinoEje, setCDestinoEje]       = useState<number | ''>('')
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
            instancia: esGabinete ? 'gabinete' : 'eje',
            eje_id: eje?.id ?? null,
            fecha: hoyISO(),
            created_by_email: currentUserEmail || null,
          })
          .select('*')
        if (error || !data?.length) {
          // Carrera con el UNIQUE parcial (otro usuario creó el borrador) o
          // RLS: re-consultar antes de rendirse.
          let retryQ = sb
            .from('eje_sesiones')
            .select('*')
            .eq('region_cod', region.cod)
            .eq('estado', 'borrador')
          retryQ = esGabinete ? retryQ.eq('instancia', 'gabinete') : retryQ.eq('eje_id', eje!.id)
          const { data: retry } = await retryQ.limit(1)
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
    // Filtro de instancia: comité = por eje_id (⇒ instancia='eje' por el
    // CHECK de la mig 046); gabinete = por instancia sin eje.
    const ABIERTO_O_CUMPLIDO_SIN_CIERRE =
      'estado.in.(pendiente,en_curso),and(estado.eq.cumplido,cerrado_en_sesion_id.is.null)'

    // Zona 1: compromisos de sesiones ANTERIORES aún por verificar —
    // abiertos, o cumplidos sin sesión de cierre (marcados en este borrador,
    // se pueden desmarcar). Los creados en ESTE borrador van a la zona 5.
    // Gabinete: propios + escalados desde comités + mandatos a verificar.
    const compPromise: PromiseLike<(SesionCompromiso & { origenTipo?: OrigenCompromisoGabinete })[]> = esGabinete
      ? (async () => {
          const [propiosRes, escaladosRes, gabSesRes] = await Promise.all([
            sb.from('sesion_compromisos').select('*')
              .eq('region_cod', region.cod).eq('instancia', 'gabinete')
              .neq('sesion_origen_id', s.id)
              .or(ABIERTO_O_CUMPLIDO_SIN_CIERRE).order('created_at'),
            sb.from('sesion_compromisos').select('*')
              .eq('region_cod', region.cod).eq('instancia', 'eje')
              .eq('escalado_a_gabinete', true)
              .neq('sesion_origen_id', s.id)
              .or(ABIERTO_O_CUMPLIDO_SIN_CIERRE).order('created_at'),
            sb.from('eje_sesiones').select('id')
              .eq('region_cod', region.cod).eq('instancia', 'gabinete'),
          ])
          // Mandatos: compromisos de comité cuyo ORIGEN es una sesión de
          // gabinete de la región (los de este borrador van a la zona 5).
          const gabIds = (gabSesRes.data ?? []).map(r => r.id).filter(id => id !== s.id)
          const mandatosRes = gabIds.length
            ? await sb.from('sesion_compromisos').select('*')
                .eq('region_cod', region.cod).eq('instancia', 'eje')
                .in('sesion_origen_id', gabIds)
                .or(ABIERTO_O_CUMPLIDO_SIN_CIERRE)
            : { data: [] as SesionCompromiso[] }
          return clasificarCompromisosGabinete(
            (propiosRes.data ?? []) as SesionCompromiso[],
            (escaladosRes.data ?? []) as SesionCompromiso[],
            (mandatosRes.data ?? []) as SesionCompromiso[],
          )
        })()
      : sb.from('sesion_compromisos').select('*')
          .eq('region_cod', region.cod).eq('eje_id', eje!.id)
          .neq('sesion_origen_id', s.id)
          .or(ABIERTO_O_CUMPLIDO_SIN_CIERRE)
          .order('created_at')
          .then(r => (r.data ?? []) as SesionCompromiso[])

    let nominaQ = sb.from('sesion_nomina').select('*')
      .eq('region_cod', region.cod).eq('activo', true)
    nominaQ = esGabinete ? nominaQ.eq('instancia', 'gabinete') : nominaQ.eq('eje_id', eje!.id)

    let sesIdsQ = sb.from('eje_sesiones').select('id').eq('region_cod', region.cod)
    sesIdsQ = esGabinete ? sesIdsQ.eq('instancia', 'gabinete') : sesIdsQ.eq('eje_id', eje!.id)

    const [comp, nominaRes, asisRes, apunRes, nuevosRes, sesIdsRes, iniRes] = await Promise.all([
      compPromise,
      nominaQ.order('institucion').order('calidad'),
      sb.from('sesion_asistencia').select('*').eq('sesion_id', s.id),
      sb.from('sesion_apuntes').select('*').eq('sesion_id', s.id),
      sb.from('sesion_compromisos').select('*').eq('sesion_origen_id', s.id).order('created_at'),
      sesIdsQ.limit(30),
      // Zona 3 gabinete: agenda guardada de la sesión.
      esGabinete
        ? sb.from('sesion_iniciativas').select('*').eq('sesion_id', s.id).order('created_at')
        : Promise.resolve({ data: [] as SesionIniciativa[] }),
    ])

    // Zona 3 comité: métricas + valores + referencia de la sesión anterior.
    // El gabinete NO digita métricas — estas queries no corren (RLS aparte,
    // no hay eje que filtrar).
    if (!esGabinete) {
      const [metRes, valRes, prevSesRes] = await Promise.all([
        sb.from('metricas_eje').select('*')
          .eq('region_cod', region.cod).eq('eje_id', eje!.id)
          .eq('se_reporta_en_sesion', true).order('created_at'),
        sb.from('sesion_valores').select('*').eq('sesion_id', s.id),
        sb.from('eje_sesiones').select('id')
          .eq('region_cod', region.cod).eq('eje_id', eje!.id).eq('estado', 'cerrada')
          .order('fecha', { ascending: false }).limit(1),
      ])
      setMetricasSesion((metRes.data ?? []) as Metrica[])
      const vals = (valRes.data ?? []) as SesionValor[]
      setValores(vals)
      setDraftValores(Object.fromEntries(vals.map(v => [v.metrica_id, String(v.valor)])))
      // Valores de la última sesión cerrada (referencia en zona 3)
      const prevId = prevSesRes.data?.[0]?.id
      if (prevId) {
        const { data: prevVals } = await sb.from('sesion_valores').select('*').eq('sesion_id', prevId)
        setValoresPrev(new Map(((prevVals ?? []) as SesionValor[]).map(v => [v.metrica_id, Number(v.valor)])))
      }
    }

    // Zona 3 gabinete: precarga WYSIWYG — las iniciativas en foco que faltan
    // en la agenda se insertan al abrir el borrador. La tabla ES la agenda:
    // el snapshot del cierre server-side es determinista sobre estas filas.
    if (esGabinete) {
      let filas = (iniRes.data ?? []) as SesionIniciativa[]
      if (s.estado === 'borrador') {
        const enFoco = gabIniciativas.filter(p => p.en_foco === true)
        const faltantes = filasZona3Faltantes(enFoco, filas)
        if (faltantes.length) {
          const { data: inserted, error: insErr } = await sb
            .from('sesion_iniciativas')
            .insert(faltantes.map(pid => ({ sesion_id: s.id, prioridad_id: pid })))
            .select('*')
          if (insErr) {
            // Carrera con otro usuario precargando (UNIQUE): re-leer la agenda.
            const { data: refetch } = await sb.from('sesion_iniciativas')
              .select('*').eq('sesion_id', s.id).order('created_at')
            filas = (refetch ?? []) as SesionIniciativa[]
          } else {
            filas = [...filas, ...((inserted ?? []) as SesionIniciativa[])]
          }
        }
      }
      setSesIniciativas(filas)
      setDraftAcuerdos(Object.fromEntries(filas.map(f => [f.id, f.acuerdo ?? ''])))
    }

    setCompAnteriores(comp)
    const nominaData = (nominaRes.data ?? []) as SesionNomina[]
    setNomina(nominaData)
    setAsistencia((asisRes.data ?? []) as SesionAsistencia[])
    setCompNuevos((nuevosRes.data ?? []) as SesionCompromiso[])

    const apun = (apunRes.data ?? []) as SesionApunte[]
    setApuntes(apun)
    setDraftApuntes(Object.fromEntries(apun.map(a => [a.institucion, a.texto])))

    // Tabs de apuntes: instituciones históricas de la instancia ∪ nómina
    const ids = (sesIdsRes.data ?? []).map(r => r.id)
    let historicas: string[] = []
    if (ids.length) {
      const { data: hist } = await sb.from('sesion_apuntes').select('institucion').in('sesion_id', ids)
      historicas = (hist ?? []).map(h => h.institucion)
    }
    const sugeridas = institucionesSugeridas(historicas, nominaData.map(n => n.institucion))
    setInstituciones(sugeridas)
    setTabInstitucion(prev => prev ?? sugeridas[0] ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region.cod, eje?.id, esGabinete, gabIniciativas])

  useEffect(() => { if (sesion) loadAll(sesion) }, [sesion, loadAll])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !cerrando) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, cerrando])

  // ── Zona 1: verificación de compromisos ───────────────────────────────────

  async function setEstadoCompromiso(c: SesionCompromiso, estado: SesionCompromiso['estado']) {
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

  // Escalar/des-escalar una traba al gabinete. No cambia la instancia: el
  // comité la sigue gestionando; el gabinete la ve ADEMÁS (bandeja de
  // Preparación + zona 1 de su sesión). Registra la sesión donde se marcó.
  async function toggleEscalado(c: SesionCompromiso, lista: 'anteriores' | 'nuevos') {
    if (!sesion) return
    const next = !c.escalado_a_gabinete
    if (next && !confirm('¿Escalar este compromiso al Gabinete Regional?\n\nAparecerá en su bandeja de preparación y en su próxima sesión. El comité lo sigue viendo y gestionando.')) return
    // Los dos states tienen genéricos distintos (anteriores lleva origenTipo)
    // — se aplica por rama en vez de unificar el setter.
    const aplicar = (v: boolean) => {
      if (lista === 'anteriores') {
        setCompAnteriores(prev => prev.map(x => x.id === c.id ? { ...x, escalado_a_gabinete: v } : x))
      } else {
        setCompNuevos(prev => prev.map(x => x.id === c.id ? { ...x, escalado_a_gabinete: v } : x))
      }
    }
    aplicar(next)
    try {
      await safeWrite(
        getSupabase().from('sesion_compromisos').update({
          escalado_a_gabinete: next,
          escalado_at: next ? new Date().toISOString() : null,
          escalado_en_sesion_id: next ? sesion.id : null,
        }).eq('id', c.id),
        `sesion_compromisos escalar id=${c.id}`,
      )
    } catch (err) {
      aplicar(c.escalado_a_gabinete)
      window.alert((err as Error).message)
    }
  }

  // ── Zona 2: asistencia ────────────────────────────────────────────────────

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
      if (sesion) await loadAll(sesion)   // resync ante error
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

  // ── Zona 3: indicadores ───────────────────────────────────────────────────

  async function commitValor(m: Metrica) {
    if (!sesion) return
    const raw = (draftValores[m.id] ?? '').trim()
    const existente = valores.find(v => v.metrica_id === m.id)
    try {
      if (raw === '') {
        if (existente) {
          await safeDelete(
            getSupabase().from('sesion_valores').delete().eq('id', existente.id),
            `sesion_valores delete id=${existente.id}`,
          )
          setValores(prev => prev.filter(v => v.id !== existente.id))
        }
        return
      }
      const num = parseFloat(raw.replace(',', '.'))
      if (isNaN(num)) {
        setDraftValores(prev => ({ ...prev, [m.id]: existente ? String(existente.valor) : '' }))
        return
      }
      if (existente) {
        if (Number(existente.valor) === num) return
        await safeWrite(
          getSupabase().from('sesion_valores').update({ valor: num }).eq('id', existente.id),
          `sesion_valores update id=${existente.id}`,
        )
        setValores(prev => prev.map(v => v.id === existente.id ? { ...v, valor: num } : v))
      } else {
        const rows = await safeWrite(
          getSupabase().from('sesion_valores').insert({
            sesion_id: sesion.id, metrica_id: m.id, valor: num,
          }),
          `sesion_valores insert metrica=${m.id}`,
        )
        setValores(prev => [...prev, rows[0] as SesionValor])
      }
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  // ── Zona 3 (gabinete): iniciativas en foco ────────────────────────────────

  async function commitAcuerdo(fila: SesionIniciativa) {
    const texto = (draftAcuerdos[fila.id] ?? '').trim()
    if ((fila.acuerdo ?? '') === texto) return
    try {
      await safeWrite(
        getSupabase().from('sesion_iniciativas').update({ acuerdo: texto || null }).eq('id', fila.id),
        `sesion_iniciativas acuerdo id=${fila.id}`,
      )
      setSesIniciativas(prev => prev.map(f => f.id === fila.id ? { ...f, acuerdo: texto || null } : f))
    } catch (err) {
      setDraftAcuerdos(prev => ({ ...prev, [fila.id]: fila.acuerdo ?? '' }))
      window.alert((err as Error).message)
    }
  }

  async function quitarIniciativa(fila: SesionIniciativa) {
    try {
      await safeDelete(
        getSupabase().from('sesion_iniciativas').delete().eq('id', fila.id),
        `sesion_iniciativas delete id=${fila.id}`,
      )
      setSesIniciativas(prev => prev.filter(f => f.id !== fila.id))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function agregarIniciativa(p: Iniciativa) {
    if (!sesion) return
    if (sesIniciativas.some(f => f.prioridad_id === p.id)) return
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_iniciativas').insert({
          sesion_id: sesion.id,
          prioridad_id: p.id,   // llave estable — NUNCA n
        }),
        `sesion_iniciativas insert prioridad=${p.id}`,
      )
      const fila = rows[0] as SesionIniciativa
      setSesIniciativas(prev => [...prev, fila])
      setDraftAcuerdos(prev => ({ ...prev, [fila.id]: '' }))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  // ── Zona 4: apuntes por institución ───────────────────────────────────────

  async function commitApunte(institucion: string) {
    if (!sesion) return
    const texto = draftApuntes[institucion] ?? ''
    const existente = apuntes.find(a => a.institucion === institucion)
    if (existente && existente.texto === texto) return
    if (!existente && !texto.trim()) return
    try {
      if (existente) {
        await safeWrite(
          getSupabase().from('sesion_apuntes').update({ texto }).eq('id', existente.id),
          `sesion_apuntes update id=${existente.id}`,
        )
        setApuntes(prev => prev.map(a => a.id === existente.id ? { ...a, texto } : a))
      } else {
        const rows = await safeWrite(
          getSupabase().from('sesion_apuntes').insert({
            sesion_id: sesion.id, institucion, texto,
          }),
          `sesion_apuntes insert ${institucion}`,
        )
        setApuntes(prev => [...prev, rows[0] as SesionApunte])
      }
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  function agregarInstitucion() {
    const nombre = window.prompt('Nombre de la institución (ej: Armada, SAG):')?.trim()
    if (!nombre) return
    if (instituciones.some(i => i.toLowerCase() === nombre.toLowerCase())) {
      setTabInstitucion(instituciones.find(i => i.toLowerCase() === nombre.toLowerCase())!)
      return
    }
    setInstituciones(prev => [...prev, nombre])
    setTabInstitucion(nombre)
  }

  async function eliminarInstitucion(inst: string) {
    const existente = apuntes.find(a => a.institucion === inst)
    const conTexto = (draftApuntes[inst] ?? '').trim().length > 0
    if ((existente || conTexto) &&
        !window.confirm(`¿Eliminar la institución "${inst}" y sus apuntes de esta sesión?`)) return
    // Optimistic: sacar el pill, su borrador y reubicar el tab activo.
    const restantes = instituciones.filter(i => i !== inst)
    setInstituciones(restantes)
    setDraftApuntes(prev => { const next = { ...prev }; delete next[inst]; return next })
    if (tabInstitucion === inst) setTabInstitucion(restantes[0] ?? null)
    if (!existente) return
    try {
      await safeDelete(
        getSupabase().from('sesion_apuntes').delete().eq('id', existente.id),
        `sesion_apuntes delete id=${existente.id}`,
      )
      setApuntes(prev => prev.filter(a => a.id !== existente.id))
    } catch (err) {
      // Revert: la fila sigue en la BD, restaurar pill + borrador.
      setInstituciones(prev => prev.includes(inst) ? prev : [...prev, inst])
      setDraftApuntes(prev => ({ ...prev, [inst]: existente.texto }))
      window.alert((err as Error).message)
    }
  }

  // ── Zona 5: compromisos nuevos ────────────────────────────────────────────

  async function agregarCompromiso(e: React.FormEvent) {
    e.preventDefault()
    if (!sesion || !cDescripcion.trim() || !cInstitucion.trim()) return
    setCSaving(true)
    try {
      // Mandato (spec gabinete §5.3): un compromiso del gabinete dirigido a
      // un comité se inserta con instancia='eje' + eje destino — aparece
      // gratis en la zona 1 de la próxima sesión de ese comité, y el
      // gabinete lo verifica por sesion_origen_id. Sin destino, queda en la
      // instancia de esta sesión.
      const destinoEjeId = esGabinete && cDestinoEje !== '' ? Number(cDestinoEje) : null
      const rows = await safeWrite(
        getSupabase().from('sesion_compromisos').insert({
          region_cod: region.cod,
          instancia: esGabinete ? (destinoEjeId ? 'eje' : 'gabinete') : 'eje',
          eje_id: esGabinete ? destinoEjeId : eje!.id,
          sesion_origen_id: sesion.id,
          descripcion: cDescripcion.trim(),
          responsable_institucion: cInstitucion.trim(),
          responsable_nombre: cNombre.trim() || null,
          plazo: cPlazo || null,
          prioridad_id: esGabinete ? (cVinculada?.id ?? null) : null,
        }),
        `sesion_compromisos insert sesion=${sesion.id}`,
      )
      setCompNuevos(prev => [...prev, rows[0] as SesionCompromiso])
      setCDescripcion(''); setCInstitucion(''); setCNombre(''); setCPlazo('')
      setCVinculada(null); setCDestinoEje('')
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
    const sinValores = !esGabinete && metricasSesion.length > 0 && valores.length === 0
    const msg = esGabinete
      ? '¿Cerrar la sesión de gabinete y generar el acta?\n\nLos acuerdos y compromisos quedarán sellados; la sesión no se podrá editar.'
      : sinValores
        ? 'No se digitó ningún indicador. ¿Cerrar la sesión igual y generar el acta?\n\nUna sesión cerrada no se puede editar.'
        : '¿Cerrar la sesión y generar el acta?\n\nLos indicadores digitados alimentarán las métricas del eje y la sesión quedará inmutable.'
    if (!confirm(msg)) return
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
  const presentes = useMemo(
    () => asistencia.filter(a => a.presente).length,
    [asistencia],
  )
  const nombreInstancia = esGabinete
    ? (props.instancia === 'gabinete' ? props.gabineteNombre : 'Gabinete Regional')
    : (eje!.sesiones_nombre ?? 'Comité')

  // Nombre del comité (para chips de escalado/mandato en zona 1 y 5).
  const comiteNombre = useCallback((ejeId: number | null): string => {
    if (ejeId == null) return 'Comité'
    const e = ejesComites.find(x => x.id === ejeId)
    return e?.sesiones_nombre ?? (e ? `Eje ${e.numero}` : 'Comité')
  }, [ejesComites])

  // Typeahead de iniciativas (zona 3 y vínculo de zona 5): candidatas por
  // texto, excluyendo las ya agendadas en zona 3.
  const buscarIniciativas = useCallback((q: string, excluirAgendadas: boolean): Iniciativa[] => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    const agendadas = excluirAgendadas ? new Set(sesIniciativas.map(f => f.prioridad_id)) : null
    return gabIniciativas
      .filter(p => !agendadas?.has(p.id))
      .filter(p => p.nombre.toLowerCase().includes(t) || (p.ministerio ?? '').toLowerCase().includes(t))
      .slice(0, 8)
  }, [gabIniciativas, sesIniciativas])

  const zoneCls  = 'border border-gray-200 rounded-xl overflow-hidden'
  const zoneHead = 'px-4 py-2.5 bg-violet-50/70 border-b border-violet-100 flex items-center gap-2'
  const zoneNum  = 'w-5 h-5 rounded-full bg-violet-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0'
  const inputCls = 'px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300'

  // ── Render ────────────────────────────────────────────────────────────────

  // Pantalla de éxito post-cierre
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
              {esGabinete
                ? cierreResultado.actaGenerada
                  ? 'Los acuerdos y compromisos quedaron sellados y el acta está disponible.'
                  : 'La sesión quedó cerrada con sus acuerdos, pero el acta no se pudo generar. Puedes reintentar ahora o después desde el historial.'
                : cierreResultado.actaGenerada
                  ? 'Los indicadores alimentaron las métricas del eje y el acta quedó disponible.'
                  : 'Los indicadores alimentaron las métricas del eje, pero el acta no se pudo generar. Puedes reintentar ahora o después desde el historial.'}
            </p>
            <div className="flex gap-2 pt-1">
              {cierreResultado.actaGenerada ? (
                <button onClick={handleDescargarActa} className="flex-1 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700">
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
            <p className="text-base font-semibold text-gray-900">{nombreInstancia} — {sesion?.estado === 'borrador' && borradorId ? 'Continuar sesión' : 'Nueva sesión'}</p>
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
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{initError}</p>
          ) : !sesion ? (
            <p className="text-center text-sm text-gray-400 py-10">Preparando la sesión…</p>
          ) : (
            <>
              {/* ── Zona 1: compromisos anteriores ── */}
              <section className={zoneCls}>
                <div className={zoneHead}>
                  <span className={zoneNum}>1</span>
                  <h3 className="text-sm font-semibold text-gray-800">Verificación de compromisos anteriores</h3>
                  <span className="text-xs text-gray-400 ml-auto">{compAnteriores.length}</span>
                </div>
                <div className="p-3 space-y-2">
                  {compAnteriores.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">Sin compromisos pendientes de sesiones anteriores.</p>
                  ) : compAnteriores.map(c => (
                    <div key={c.id} className="flex items-start gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 leading-snug">{c.descripcion}</p>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {esGabinete && c.origenTipo === 'escalado' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700" title="Traba escalada desde el comité — el comité la sigue viendo">
                              ⬆ {comiteNombre(c.eje_id)}
                            </span>
                          )}
                          {esGabinete && c.origenTipo === 'mandato' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700" title="Mandato del gabinete — se gestiona en el comité destino">
                              → {comiteNombre(c.eje_id)}
                            </span>
                          )}
                          <span>{c.responsable_institucion}{c.responsable_nombre ? ` · ${c.responsable_nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(Object.keys(ESTADO_COMPROMISO) as (keyof typeof ESTADO_COMPROMISO)[]).map(est => (
                          <button
                            key={est}
                            onClick={() => setEstadoCompromiso(c, est)}
                            className={`text-[10px] font-semibold px-2 py-1 rounded-full transition-colors ${
                              c.estado === est ? ESTADO_COMPROMISO[est].on : ESTADO_COMPROMISO[est].off
                            }`}
                          >
                            {ESTADO_COMPROMISO[est].label}
                          </button>
                        ))}
                        {puedeEscalar && (
                          <button
                            onClick={() => toggleEscalado(c, 'anteriores')}
                            className={`text-[10px] font-semibold px-2 py-1 rounded-full transition-colors ${
                              c.escalado_a_gabinete
                                ? 'bg-orange-600 text-white'
                                : 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200'
                            }`}
                            title={c.escalado_a_gabinete
                              ? 'Escalada al gabinete — click para revertir'
                              : 'Escalar al Gabinete Regional (la traba excede a este comité)'}
                          >
                            {c.escalado_a_gabinete ? '⬆ Escalada' : '⬆ Escalar'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Zona 2: asistencia ── */}
              <section className={zoneCls}>
                <div className={zoneHead}>
                  <span className={zoneNum}>2</span>
                  <h3 className="text-sm font-semibold text-gray-800">Asistencia</h3>
                  <span className="text-xs text-gray-400 ml-auto">{presentes} presente{presentes === 1 ? '' : 's'}</span>
                </div>
                <div className="p-3">
                  {nomina.length === 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                      {esGabinete
                        ? 'La nómina del gabinete está vacía — cárgala (seremis + equipo DPR) desde el botón "Nómina" del tab Gabinete Regional.'
                        : 'La nómina está vacía — agrégala desde el botón "Nómina" del panel de métricas.'}
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

              {/* ── Zona 3 (gabinete): iniciativas en foco ── */}
              {esGabinete && (
                <section className={zoneCls}>
                  <div className={zoneHead}>
                    <span className={zoneNum}>3</span>
                    <h3 className="text-sm font-semibold text-gray-800">Iniciativas en foco</h3>
                    <span className="text-xs text-gray-400 ml-auto">{sesIniciativas.length}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {sesIniciativas.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">
                        No hay iniciativas en foco — márcalas desde Gabinete → Preparación, o agrégalas acá.
                      </p>
                    )}
                    {sesIniciativas.map(fila => {
                      const p = gabIniciativas.find(x => x.id === fila.prioridad_id) ?? null
                      const sem = p ? (SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris) : null
                      return (
                        <div key={fila.id} className="px-3 py-2.5 bg-gray-50 rounded-lg">
                          <div className="flex items-start gap-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800 leading-snug flex items-center gap-2 flex-wrap">
                                {sem && <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sem.dot}`} title={sem.label} />}
                                <span>{p?.nombre ?? `Iniciativa #${fila.prioridad_id} (ya no está en la cartera)`}</span>
                              </p>
                              {p && (
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {p.pct_avance}% avance
                                  {p.fecha_proximo_hito ? ` · próximo hito ${fmtFecha(p.fecha_proximo_hito)}` : ''}
                                  {p.ministerio ? ` · ${p.ministerio}` : ''}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => quitarIniciativa(fila)}
                              className="text-gray-300 hover:text-red-500 p-0.5 flex-shrink-0"
                              title="Sacar de la agenda de esta sesión"
                            >
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </div>
                          <textarea
                            value={draftAcuerdos[fila.id] ?? ''}
                            onChange={e => setDraftAcuerdos(prev => ({ ...prev, [fila.id]: e.target.value }))}
                            onBlur={() => commitAcuerdo(fila)}
                            rows={2}
                            placeholder="Acuerdo del gabinete sobre esta iniciativa…"
                            className="mt-2 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-y bg-white"
                          />
                        </div>
                      )
                    })}
                    <IniciativaTypeahead
                      placeholder="+ Agregar iniciativa a la agenda (busca por nombre o ministerio)…"
                      buscar={q => buscarIniciativas(q, true)}
                      onPick={agregarIniciativa}
                    />
                  </div>
                </section>
              )}

              {/* ── Zona 3 (comité): indicadores ── */}
              {!esGabinete && (
              <section className={zoneCls}>
                <div className={zoneHead}>
                  <span className={zoneNum}>3</span>
                  <h3 className="text-sm font-semibold text-gray-800">Indicadores de la sesión</h3>
                  <button
                    onClick={() => setNuevaMetricaOpen(true)}
                    className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline ml-auto"
                  >
                    + Indicador no contemplado
                  </button>
                </div>
                <div className="p-3">
                  {metricasSesion.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">
                      Ninguna métrica del eje está marcada &quot;se reporta en sesión&quot; — usa &quot;+ Indicador no contemplado&quot;.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {metricasSesion.map(m => {
                        const prev = valoresPrev.get(m.id)
                        return (
                          <div key={m.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-700 truncate">
                                {m.titulo}
                                <span className={`ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded ${m.tipo === 'pulso' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                                  {m.tipo === 'pulso' ? 'PULSO' : 'SUMA'}
                                </span>
                              </p>
                              <p className="text-[11px] text-gray-400">
                                {prev != null ? `Sesión anterior: ${prev}${m.unidad ? ` ${m.unidad}` : ''}` : 'Primera medición'}
                                {m.tipo === 'suma' && ` · alimenta el acumulado (${m.valor_actual ?? 0}${m.unidad ? ` ${m.unidad}` : ''})`}
                              </p>
                            </div>
                            <input
                              type="number"
                              step="any"
                              value={draftValores[m.id] ?? ''}
                              onChange={e => setDraftValores(prevD => ({ ...prevD, [m.id]: e.target.value }))}
                              onBlur={() => commitValor(m)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              placeholder="—"
                              className={`${inputCls} w-24 text-right py-1.5`}
                            />
                            {m.unidad && <span className="text-xs text-gray-400 w-10 truncate">{m.unidad}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </section>
              )}

              {/* ── Zona 4: apuntes por institución ── */}
              <section className={zoneCls}>
                <div className={zoneHead}>
                  <span className={zoneNum}>4</span>
                  <h3 className="text-sm font-semibold text-gray-800">Apuntes por institución</h3>
                  <button onClick={agregarInstitucion} className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline ml-auto">
                    + Institución
                  </button>
                </div>
                <div className="p-3">
                  {instituciones.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">Agrega una institución para tomar apuntes.</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-1 flex-wrap mb-2">
                        {instituciones.map(inst => {
                          const conTexto = (draftApuntes[inst] ?? '').trim().length > 0
                          const activo = tabInstitucion === inst
                          return (
                            <span
                              key={inst}
                              className={`inline-flex items-center gap-1 text-xs pl-2.5 pr-1 py-1 rounded-full font-medium transition-colors ${
                                activo
                                  ? 'bg-violet-700 text-white'
                                  : conTexto
                                    ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              <button type="button" onClick={() => setTabInstitucion(inst)} className="focus:outline-none">
                                {inst}
                              </button>
                              <button
                                type="button"
                                onClick={() => eliminarInstitucion(inst)}
                                title={`Eliminar ${inst}`}
                                className={`rounded-full w-4 h-4 flex items-center justify-center transition-colors ${
                                  activo ? 'text-violet-200 hover:text-white hover:bg-violet-600' : 'opacity-60 hover:opacity-100 hover:bg-black/10'
                                }`}
                              >
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.6">
                                  <path d="M1 1l6 6M7 1L1 7" strokeLinecap="round"/>
                                </svg>
                              </button>
                            </span>
                          )
                        })}
                      </div>
                      {tabInstitucion && (
                        <textarea
                          key={tabInstitucion}
                          value={draftApuntes[tabInstitucion] ?? ''}
                          onChange={e => setDraftApuntes(prev => ({ ...prev, [tabInstitucion]: e.target.value }))}
                          onBlur={() => commitApunte(tabInstitucion)}
                          rows={4}
                          placeholder={`Temas planteados por ${tabInstitucion} en la sesión…`}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-y"
                        />
                      )}
                    </>
                  )}
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
                  {compNuevos.map(c => {
                    const vinculada = esGabinete && c.prioridad_id != null
                      ? gabIniciativas.find(p => p.id === c.prioridad_id) ?? null
                      : null
                    const esMandato = esGabinete && c.instancia === 'eje' && c.eje_id != null
                    return (
                      <div key={c.id} className="px-3 py-2 bg-gray-50 rounded-lg flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 leading-snug">{c.descripcion}</p>
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {esMandato && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700" title="Mandato: se gestiona en la próxima sesión de ese comité">
                                → {comiteNombre(c.eje_id)}
                              </span>
                            )}
                            <span>{c.responsable_institucion}{c.responsable_nombre ? ` · ${c.responsable_nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}</span>
                            {vinculada && <span className="truncate">· 🔗 {vinculada.nombre}</span>}
                          </p>
                        </div>
                        {puedeEscalar && (
                          <button
                            onClick={() => toggleEscalado(c, 'nuevos')}
                            className={`flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full transition-colors ${
                              c.escalado_a_gabinete
                                ? 'bg-orange-600 text-white'
                                : 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200'
                            }`}
                            title={c.escalado_a_gabinete
                              ? 'Escalada al gabinete — click para revertir'
                              : 'Escalar al Gabinete Regional'}
                          >
                            {c.escalado_a_gabinete ? '⬆ Escalada' : '⬆ Escalar'}
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
                      <button
                        type="submit"
                        disabled={cSaving || !cDescripcion.trim() || !cInstitucion.trim()}
                        className="text-xs px-3.5 py-1.5 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800 disabled:opacity-40"
                      >
                        {cSaving ? 'Guardando…' : '+ Compromiso'}
                      </button>
                    </div>
                    {esGabinete && (
                      <div className="flex gap-2 flex-wrap items-start">
                        <div className="flex-1 min-w-[220px]">
                          {cVinculada ? (
                            <div className="flex items-center gap-2 text-xs bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5">
                              <span className="text-violet-800 truncate flex-1">🔗 {cVinculada.nombre}</span>
                              <button type="button" onClick={() => setCVinculada(null)} className="text-violet-400 hover:text-violet-700" title="Quitar vínculo">✕</button>
                            </div>
                          ) : (
                            <IniciativaTypeahead
                              placeholder="Vincular a iniciativa (opcional)…"
                              buscar={q => buscarIniciativas(q, false)}
                              onPick={p => setCVinculada(p)}
                              compact
                            />
                          )}
                        </div>
                        <select
                          value={cDestinoEje}
                          onChange={e => setCDestinoEje(e.target.value === '' ? '' : Number(e.target.value))}
                          className={`${inputCls} w-56 text-xs py-1.5`}
                          title="Dirigir a un comité (mandato): aparecerá en la zona de compromisos de su próxima sesión"
                        >
                          <option value="">Se gestiona en el gabinete</option>
                          {ejesComites.map(e => (
                            <option key={e.id} value={e.id}>Mandato → {e.sesiones_nombre ?? `Eje ${e.numero}`}</option>
                          ))}
                        </select>
                      </div>
                    )}
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

      {/* "+ indicador no contemplado" → crea métrica del eje ya marcada
          para sesión. Al guardar recargamos las métricas de la zona 3.
          Solo comité — el gabinete no digita métricas. */}
      {nuevaMetricaOpen && eje && (
        <div onClick={e => e.stopPropagation()}>
          <MetricaEditModal
            open
            onClose={() => setNuevaMetricaOpen(false)}
            metrica={null}
            regionCod={region.cod}
            eje={eje}
            currentUserEmail={currentUserEmail}
            onSaved={() => { if (sesion) loadAll(sesion) }}
            sesionesOn
            defaultsSesion={{ se_reporta_en_sesion: true }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Typeahead mínimo client-side sobre la cartera ya cargada (sin queries).
 * Usado en la zona 3 (agregar a la agenda) y en la zona 5 (vincular
 * compromiso). Mínimo 2 caracteres; máximo 8 resultados.
 *
 * El desplegable de resultados se renderiza con createPortal a document.body y
 * position:fixed para escapar del modal — el contenedor del modal tiene
 * overflow-hidden y el fondo backdrop-blur crea un containing block, así que un
 * desplegable `absolute` quedaba recortado (sobre todo en la última sección).
 * Se ancla al input por getBoundingClientRect y se reposiciona en scroll/resize;
 * abre hacia arriba si no cabe hacia abajo.
 */
function IniciativaTypeahead({ placeholder, buscar, onPick, compact = false }: {
  placeholder: string
  buscar: (q: string) => Iniciativa[]
  onPick: (p: Iniciativa) => void
  compact?: boolean
}) {
  const [q, setQ] = useState('')
  const [visible, setVisible] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultados = useMemo(() => buscar(q), [q, buscar])
  const hayResultados = resultados.length > 0
  const abierto = visible && hayResultados && rect !== null

  const medir = useCallback(() => {
    const el = inputRef.current
    if (el) setRect(el.getBoundingClientRect())
  }, [])

  // Reposicionar mientras está abierto (el cuerpo del modal hace scroll). El
  // cuerpo del efecto solo registra listeners — el setState vive en el callback.
  useEffect(() => {
    if (!visible || !hayResultados) return
    window.addEventListener('scroll', medir, true)
    window.addEventListener('resize', medir)
    return () => {
      window.removeEventListener('scroll', medir, true)
      window.removeEventListener('resize', medir)
    }
  }, [visible, hayResultados, medir])

  let dropStyle: CSSProperties = {}
  if (abierto && rect) {
    const MAXH = 224 // max-h-56
    const GAP = 4
    const espacioAbajo = window.innerHeight - rect.bottom
    const arriba = espacioAbajo < MAXH + GAP && rect.top > espacioAbajo
    dropStyle = {
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(arriba
        ? { bottom: window.innerHeight - rect.top + GAP, maxHeight: Math.max(0, rect.top - GAP) }
        : { top: rect.bottom + GAP, maxHeight: Math.max(0, espacioAbajo - GAP) }),
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={e => { setQ(e.target.value); setVisible(true); medir() }}
        onFocus={() => { setVisible(true); medir() }}
        onBlur={() => setVisible(false)}
        placeholder={placeholder}
        className={`w-full px-3 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 ${
          compact ? 'py-1.5 text-xs' : 'py-2 text-sm'
        }`}
      />
      {abierto && typeof document !== 'undefined' && createPortal(
        <div
          style={dropStyle}
          // No robar el foco al clickear: evita que onBlur cierre el desplegable
          // antes de que corra el onClick del resultado.
          onMouseDown={e => e.preventDefault()}
          className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden overflow-y-auto"
        >
          {resultados.map(p => {
            const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onPick(p); setQ(''); setVisible(false) }}
                className="w-full px-3 py-2 text-left hover:bg-violet-50 flex items-center gap-2 border-b border-gray-50 last:border-b-0"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sem.dot}`} />
                <span className="flex-1 min-w-0">
                  <span className="text-xs text-gray-800 block truncate">{p.nombre}</span>
                  <span className="text-[10px] text-gray-400 block truncate">{p.ministerio ?? '—'} · {p.pct_avance}%</span>
                </span>
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
