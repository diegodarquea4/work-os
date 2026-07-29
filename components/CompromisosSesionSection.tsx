'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { SesionCompromiso } from '@/lib/types'

/**
 * Sub-sección read-only "Compromisos de sesión" del tab Seguimiento de la
 * ficha de iniciativa (spec gabinete §7.5): los compromisos de gabinete o
 * comité vinculados a esta iniciativa (`sesion_compromisos.prioridad_id`,
 * la llave estable prioridades_territoriales.id — NUNCA n).
 *
 * Autocontenido a propósito (inserción mínima en SeguimientoTab, territorio
 * de otro dev). Sin gate de rol: para viewer la RLS de sesion_compromisos
 * devuelve 200 con [] (sin error) → el componente rinde null, igual que en
 * iniciativas sin compromisos.
 */

type Props = {
  // prioridades_territoriales.id (BIGINT estable) — NO el n de negocio.
  prioridadId: number
}

const ESTADO_CHIP = {
  pendiente: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-600' },
  en_curso:  { label: 'En curso',  cls: 'bg-blue-100 text-blue-700' },
  cumplido:  { label: 'Cumplido',  cls: 'bg-green-100 text-green-700' },
} as const

function fmtFecha(fecha: string | null): string | null {
  if (!fecha) return null
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CompromisosSesionSection({ prioridadId }: Props) {
  const [compromisos, setCompromisos] = useState<SesionCompromiso[]>([])
  const [nombresComite, setNombresComite] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    async function load() {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('sesion_compromisos')
        .select('*')
        .eq('prioridad_id', prioridadId)
        .order('created_at', { ascending: false })
      if (cancelled || error) return
      const rows = (data ?? []) as SesionCompromiso[]
      setCompromisos(rows)
      // Nombre del comité de origen — solo si hay filas de instancia eje.
      const ejeIds = Array.from(new Set(rows.map(c => c.eje_id).filter((x): x is number => x != null)))
      if (ejeIds.length) {
        const { data: ejes } = await sb
          .from('region_ejes').select('id, numero, sesiones_nombre').in('id', ejeIds)
        if (cancelled) return
        setNombresComite(new Map(
          ((ejes ?? []) as { id: number; numero: number; sesiones_nombre: string | null }[])
            .map(e => [e.id, e.sesiones_nombre ?? `Eje ${e.numero}`]),
        ))
      }
    }
    load()
    return () => { cancelled = true }
  }, [prioridadId])

  const origen = useMemo(() => (c: SesionCompromiso) =>
    c.instancia === 'gabinete' ? 'Gabinete Regional' : nombresComite.get(c.eje_id ?? -1) ?? 'Comité',
  [nombresComite])

  if (compromisos.length === 0) return null

  return (
    <div className="mb-5 bg-violet-50/40 border border-violet-100 rounded-xl overflow-hidden">
      <div className="px-4 py-2 border-b border-violet-100 flex items-center gap-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Compromisos de sesión</h4>
        <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 rounded-full px-1.5 py-px">{compromisos.length}</span>
        <span className="text-[10px] text-gray-400 ml-auto">se gestionan en su instancia (gabinete/comité)</span>
      </div>
      <div>
        {compromisos.map(c => {
          const chip = ESTADO_CHIP[c.estado]
          const plazo = fmtFecha(c.plazo)
          return (
            <div key={c.id} className="px-4 py-2.5 border-b border-violet-50 last:border-b-0">
              <div className="flex items-start gap-2">
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-px ${chip.cls}`}>{chip.label}</span>
                <p className="flex-1 text-xs text-gray-700 leading-snug">{c.descripcion}</p>
              </div>
              <p className="text-[11px] text-gray-400 mt-1 pl-1 flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-gray-500">{origen(c)}</span>
                {c.escalado_a_gabinete && (
                  <span className="text-[9px] font-bold px-1 py-px rounded bg-orange-100 text-orange-700" title="Escalada al Gabinete Regional">⬆ escalada</span>
                )}
                <span>· {c.responsable_institucion}{c.responsable_nombre ? ` · ${c.responsable_nombre}` : ''}</span>
                {plazo && <span>· plazo {plazo}</span>}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
