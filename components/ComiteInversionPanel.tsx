'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  useCanEditAny,
  useCanEditOperational,
  useCurrentUserEmail,
} from '@/lib/context/UserContext'
import type { Region } from '@/lib/regions'
import type { RegionMetaEmpleo, RegionSubsidioEmpleo } from '@/lib/types'
import { MESA_EMPLEO_HABILITADA } from '@/lib/sesiones/helpers'
import { getSupabase } from '@/lib/supabase'
import { useSesionesResumen } from '@/lib/hooks/useSesionesEje'
import SesionModalInversion from './SesionModalInversion'
import HistorialSesionesInversionModal from './HistorialSesionesInversionModal'
import NominaInversionModal from './NominaInversionModal'
import OaecaModal from './OaecaModal'

/**
 * Panel del tab "Comité Económico" en ComitesRegionalesSection.
 * A diferencia de MetricasEjeDrawer (Comité Policial), este comité no tiene
 * eje ni métricas — es solo el módulo Sesiones, siempre disponible (sin flag
 * de activación) porque el tab ya existe fijo para las 16 regiones.
 */

type Props = {
  region: Region
}

const NOMBRE_COMITE = 'Comité Económico'

export default function ComiteInversionPanel({ region }: Props) {
  const canEditAny         = useCanEditAny()
  const canEditOperational = useCanEditOperational()
  const userEmail          = useCurrentUserEmail()

  const [sesionOpen, setSesionOpen]       = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [nominaOpen, setNominaOpen]       = useState(false)
  const [oaecaOpen, setOaecaOpen]         = useState(false)

  const [syncing, setSyncing] = useState(false)
  const [progreso, setProgreso] = useState(0)          // 0-100 para la barra
  const [syncMsg, setSyncMsg] = useState<string | null>(null)  // solo avisos/errores
  const [ultimaAct, setUltimaAct] = useState<string | null>(null)
  const [metaEmpleo, setMetaEmpleo] = useState<RegionMetaEmpleo | null>(null)
  const [subsidio, setSubsidio] = useState<RegionSubsidioEmpleo | null>(null)

  const { resumen, refresh: refreshResumen } = useSesionesResumen(region.cod, { instancia: 'inversion' }, canEditOperational)

  const cargarMetaEmpleo = useCallback(async () => {
    const [{ data: meta }, { data: sub }] = await Promise.all([
      getSupabase().from('region_meta_empleo').select('*').eq('region_cod', region.cod).maybeSingle(),
      getSupabase().from('region_subsidio_empleo').select('*').eq('region_cod', region.cod).maybeSingle(),
    ])
    setMetaEmpleo((meta as RegionMetaEmpleo | null) ?? null)
    setSubsidio((sub as RegionSubsidioEmpleo | null) ?? null)
  }, [region.cod])

  useEffect(() => {
    if (canEditOperational && MESA_EMPLEO_HABILITADA) cargarMetaEmpleo()
  }, [canEditOperational, cargarMetaEmpleo])

  // Última actualización del catálogo SEIA = synced_at más reciente de sus
  // filas en v2_proyectos_inversion (lo que refresca el botón). Solo lo mira
  // quien puede actualizar (admin/editor); no toca la red para el resto.
  const cargarUltimaAct = useCallback(async () => {
    const { data } = await getSupabase()
      .from('v2_proyectos_inversion')
      .select('synced_at')
      .eq('sistema_origen', 'seia')
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setUltimaAct((data?.synced_at as string | undefined) ?? null)
  }, [])

  useEffect(() => {
    if (canEditAny) cargarUltimaAct()
  }, [canEditAny, cargarUltimaAct])

  function fmtFechaCorta(fecha: string): string {
    return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  }

  function fmtActualizacion(iso: string): string {
    return new Date(iso).toLocaleString('es-CL', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  async function handleActualizarSeia() {
    setSyncing(true)
    setSyncMsg(null)
    setProgreso(4)          // arranque visible mientras corre el primer tramo
    let totalUpserted = 0
    let totalErrores = 0
    try {
      // La v2 es reanudable: cada llamada procesa un tramo (≤240s) y devuelve
      // `partial:true` + next_cursor.region_idx (0..15) si quedó a medias (una
      // sola invocación no cabe en el techo de 300s de Vercel). Repetimos hasta
      // completar las 16 regiones; el region_idx alimenta la barra de progreso.
      // Tope de seguridad por si algo no converge.
      for (let parte = 1; parte <= 20; parte++) {
        const res = await fetch('/api/seia-sync/trigger', { method: 'POST' })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || body.ok === false) {
          setSyncMsg(body.error
            ?? (Array.isArray(body.errors) ? body.errors.join('; ') : `Error HTTP ${res.status}`))
          return
        }
        totalUpserted += body.upserted ?? 0
        totalErrores  += Array.isArray(body.errors) ? body.errors.length : 0
        if (body.partial) {
          const idx = body.next_cursor?.region_idx ?? 0
          setProgreso(Math.min(96, Math.max(4, Math.round((idx / 16) * 100))))
          continue
        }
        // Terminó el recorrido. La fecha (recién refrescada) reemplaza la barra;
        // solo dejamos un aviso si el API de SEIA dejó regiones con timeout.
        setProgreso(100)
        await cargarUltimaAct()
        setSyncMsg(totalErrores > 0
          ? `${totalErrores} región(es) tuvieron un timeout transitorio de SEIA; vuelve a apretar para completarlas.`
          : null)
        return
      }
      setSyncMsg(`Se actualizaron ${totalUpserted.toLocaleString('es-CL')} proyectos, pero quedó una parte pendiente. Vuelve a apretar para continuar.`)
    } catch {
      setSyncMsg('Error de red actualizando SEIA. Vuelve a intentar.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-start gap-2">
          {canEditOperational && (
            <button
              onClick={() => setSesionOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 transition-colors"
              title={resumen.borradorId ? 'Continuar el borrador de sesión' : `Nueva sesión de ${NOMBRE_COMITE}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="10" height="9" rx="1.5"/>
                <path d="M2 6h10M5 1.5V4M9 1.5V4"/>
              </svg>
              {resumen.borradorId ? 'Continuar sesión' : 'Nueva sesión'}
            </button>
          )}
          {canEditAny && (
            <button
              onClick={handleActualizarSeia}
              disabled={syncing}
              className="flex-shrink-0 text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 font-medium rounded-lg hover:border-gray-300 hover:text-gray-700 transition-colors disabled:opacity-50"
              title="Sincroniza el catálogo de proyectos desde SEIA (puede tardar unos minutos)"
            >
              {syncing ? 'Actualizando…' : 'Actualizar proyectos en SEIA'}
            </button>
          )}
        </div>

        {canEditAny && (
          <div className="px-4 pb-2">
            {syncing ? (
              // Barra de progreso: avanza por región (region_idx del cursor) y
              // pulsa mientras corre cada tramo.
              <div>
                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-700 animate-pulse"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Actualizando desde SEIA… no cierres esta pestaña ({progreso}%).</p>
              </div>
            ) : (
              // Al terminar, la fecha reemplaza la barra.
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <p className="text-[11px] text-gray-400">
                  {ultimaAct ? (
                    <>Última actualización de SEIA: <span className="text-gray-600 font-medium">{fmtActualizacion(ultimaAct)}</span></>
                  ) : (
                    'Sin registro de actualización de SEIA.'
                  )}
                </p>
                {syncMsg && <p className="text-[11px] text-amber-600">{syncMsg}</p>}
              </div>
            )}
          </div>
        )}

        {canEditOperational && (
          <div className="px-4 pb-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-violet-900 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
              <span className="font-semibold">{resumen.compromisosAbiertos}</span>
              <span>compromiso{resumen.compromisosAbiertos === 1 ? '' : 's'} abierto{resumen.compromisosAbiertos === 1 ? '' : 's'}</span>
              <span className="text-violet-300">·</span>
              <span>
                {resumen.ultimaSesionFecha
                  ? `última sesión ${fmtFechaCorta(resumen.ultimaSesionFecha)}`
                  : 'sin sesiones cerradas aún'}
              </span>
            </div>
            {MESA_EMPLEO_HABILITADA && metaEmpleo && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold">Meta Empleo</span>
                <span>{metaEmpleo.valor_actual.toLocaleString('es-CL')}{metaEmpleo.objetivo > 0 ? ` de ${metaEmpleo.objetivo.toLocaleString('es-CL')}` : ''}</span>
                {metaEmpleo.objetivo > 0 && (
                  <span className="text-amber-500">({Math.round((metaEmpleo.valor_actual / metaEmpleo.objetivo) * 100)}% de la meta)</span>
                )}
              </div>
            )}
            {MESA_EMPLEO_HABILITADA && subsidio && (
              <div className="flex items-center gap-1.5 text-[11px] text-sky-900 bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5 flex-wrap">
                <span className="font-semibold">Subsidios</span>
                <span>{subsidio.postulados.toLocaleString('es-CL')}{subsidio.cupos > 0 ? ` de ${subsidio.cupos.toLocaleString('es-CL')} cupos` : ''} postulados</span>
                <span className="text-sky-300">·</span>
                <span>{subsidio.entregados.toLocaleString('es-CL')} entregados</span>
                <span className="text-sky-300">·</span>
                <span>{subsidio.empresas_postulantes.toLocaleString('es-CL')} empresas</span>
              </div>
            )}
          </div>
        )}

        {!canEditOperational && (
          <div className="py-10 text-center text-sm text-gray-500 px-4">
            No tienes permiso para operar el módulo de sesiones de este comité.
          </div>
        )}

        {canEditOperational && (
          <div className="border-t border-violet-100 bg-violet-50/50 px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
              Sesiones de {NOMBRE_COMITE}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNominaOpen(true)}
                className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
                title="Nómina fija del comité (titulares y suplentes)"
              >
                Nómina
              </button>
              <span className="text-violet-200">|</span>
              <button
                onClick={() => setOaecaOpen(true)}
                className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
                title="Catálogo de OAECA (organismos que emiten oficios)"
              >
                OAECA
              </button>
              <span className="text-violet-200">|</span>
              <button
                onClick={() => setHistorialOpen(true)}
                className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
              >
                Ver historial →
              </button>
            </div>
          </div>
        )}
      </div>

      {sesionOpen && (
        <SesionModalInversion
          region={region}
          borradorId={resumen.borradorId}
          currentUserEmail={userEmail}
          onClose={() => {
            setSesionOpen(false)
            refreshResumen()
            if (MESA_EMPLEO_HABILITADA) cargarMetaEmpleo()
          }}
        />
      )}
      {historialOpen && (
        <HistorialSesionesInversionModal region={region} onClose={() => setHistorialOpen(false)} />
      )}
      {nominaOpen && (
        <NominaInversionModal region={region} onClose={() => setNominaOpen(false)} />
      )}
      {oaecaOpen && (
        <OaecaModal currentUserEmail={userEmail} onClose={() => setOaecaOpen(false)} />
      )}
    </>
  )
}
