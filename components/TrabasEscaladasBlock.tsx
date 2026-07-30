'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { Iniciativa } from '@/lib/projects'
import type { RegionEje, SesionCompromiso } from '@/lib/types'
import { FlagIcon } from './icons/FlagIcon'

/**
 * Bloque "Trabas escaladas desde comités" del pane Preparación (Gabinete).
 * Regla de subsidiariedad (spec gabinete §1): una traba que excede al comité
 * se marca como escalada en la sesión del comité y aparece automáticamente
 * acá — la bandeja de preparación del gabinete — hasta que se cumpla.
 *
 * Con 0 filas no renderiza nada (hasta que exista la acción "Escalar a
 * gabinete" en el SesionModal del comité, este bloque queda vacío).
 * La RLS de sesion_compromisos scopea por región; viewer ni monta el bloque
 * (el padre lo gatea por canEditOperational).
 */

type Props = {
  // null = "todas las regiones" (admin sin filtro) → no hay bandeja que armar.
  regionCod: string | null
  // Pool para resolver prioridad_id → iniciativa (id es único global).
  iniciativas: Iniciativa[]
  // Catálogo de ejes de la región activa — nombre del comité de origen.
  regionEjes: RegionEje[]
  onToggleFoco: (n: number, id: number, next: boolean) => void
  canEditFoco: boolean
}

export default function TrabasEscaladasBlock({ regionCod, iniciativas, regionEjes, onToggleFoco, canEditFoco }: Props) {
  // Resultado keyed por región: al cambiar de región (o pasar a 'todas') las
  // filas de la anterior no se muestran — se deriva, sin setState síncrono.
  const [result, setResult] = useState<{ region: string; rows: SesionCompromiso[] } | null>(null)

  useEffect(() => {
    if (!regionCod) return
    let cancelled = false
    getSupabase()
      .from('sesion_compromisos')
      .select('*')
      .eq('region_cod', regionCod)
      .eq('escalado_a_gabinete', true)
      .in('estado', ['pendiente', 'en_curso'])
      .order('escalado_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[TrabasEscaladas] query error:', error)
          return
        }
        setResult({ region: regionCod, rows: (data ?? []) as SesionCompromiso[] })
      })
    return () => { cancelled = true }
  }, [regionCod])

  const trabas = result && result.region === regionCod ? result.rows : []

  const porId = useMemo(() => new Map(iniciativas.map(p => [p.id, p])), [iniciativas])
  const comitePorEje = useMemo(
    () => new Map(regionEjes.map(e => [e.id, e.sesiones_nombre ?? `Eje ${e.numero}`])),
    [regionEjes],
  )

  if (trabas.length === 0) return null

  return (
    <div className="mb-5 bg-white rounded-xl border border-orange-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-orange-50/70 border-b border-orange-100 flex items-center gap-2">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-orange-600">
          <path d="M7 10V5M7 2.5v.5"/>
          <path d="M2 12L7 1l5 11H2z"/>
        </svg>
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-800">Trabas escaladas desde comités</h3>
        <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 rounded-full px-2 py-0.5">{trabas.length}</span>
      </div>
      <div>
        {trabas.map(t => {
          const iniciativa = t.prioridad_id != null ? porId.get(t.prioridad_id) ?? null : null
          const comite = t.eje_id != null ? comitePorEje.get(t.eje_id) ?? 'Comité' : 'Comité'
          const yaEnFoco = iniciativa?.en_foco === true
          return (
            <div key={t.id} className="px-4 py-3 border-b border-gray-50 last:border-b-0 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-snug">{t.descripcion}</p>
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 rounded px-1.5 py-px">⬆ {comite}</span>
                  <span>{t.responsable_institucion}{t.responsable_nombre ? ` · ${t.responsable_nombre}` : ''}</span>
                  {t.plazo && <span>· plazo {t.plazo}</span>}
                  {iniciativa && <span className="truncate">· {iniciativa.nombre}</span>}
                </p>
              </div>
              {iniciativa && canEditFoco && (
                <button
                  onClick={() => onToggleFoco(iniciativa.n, iniciativa.id, true)}
                  disabled={yaEnFoco}
                  className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                    yaEnFoco
                      ? 'border-amber-200 bg-amber-50 text-amber-600 cursor-default'
                      : 'border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50'
                  }`}
                  title={yaEnFoco ? 'La iniciativa vinculada ya está en foco' : 'Marcar en foco la iniciativa vinculada'}
                >
                  <FlagIcon filled={yaEnFoco} className="w-3 h-3" />
                  {yaEnFoco ? 'En foco' : 'Poner en foco'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
