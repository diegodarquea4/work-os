'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import type { ComiteInstitucion, ComiteMetrica, SesionComiteValor, ComiteDesglose } from '@/lib/types'
import { COMITE_INSTITUCIONES, deltaPulso, tieneValorComite } from '@/lib/sesiones/helpers'
import MetricaComiteEditModal from './MetricaComiteEditModal'

/**
 * Zona "Reporte por institución" de la sesión de Comité Policial (mig 048).
 * Reemplaza la zona de indicadores suma/pulso: cada institución fija
 * (Carabineros/PDI/Armada/Gendarmería) reporta sus métricas del catálogo
 * (`comite_metrica`), con sub-valores libres (desglose) + observaciones y
 * seguimiento WoW (Δ vs la sesión cerrada anterior).
 *
 * Escalares (número / texto / observaciones): inputs no controlados
 * (defaultValue + onBlur, key estable) para no re-renderizar por tecla.
 * Desglose: controlado (lista dinámica). Cada handler se recrea por render con
 * el `valores` fresco del closure → sin ref ni staleness.
 */

type Props = {
  sesionId: number
  regionCod: string
  catalogo: ComiteMetrica[]
  valoresIniciales: SesionComiteValor[]
  valoresPrev: Map<number, SesionComiteValor>   // WoW: sesión cerrada anterior
  currentUserEmail: string
  onCatalogoChange: () => void                  // recarga el catálogo en el padre
}

export default function ReporteInstitucionZona({
  sesionId, regionCod, catalogo, valoresIniciales, valoresPrev, currentUserEmail, onCatalogoChange,
}: Props) {
  const [valores, setValores] = useState<SesionComiteValor[]>(
    () => valoresIniciales.map(v => ({ ...v, desglose: Array.isArray(v.desglose) ? v.desglose : [] })),
  )
  const [inst, setInst] = useState<ComiteInstitucion>('carabineros')
  const [editModal, setEditModal] = useState<{ metrica: ComiteMetrica | null } | null>(null)

  const filas = catalogo
    .filter(m => m.institucion === inst && m.activo)
    .sort((a, b) => a.orden - b.orden || a.id - b.id)
  const ordenSugerido = Math.max(0, ...catalogo.filter(m => m.institucion === inst).map(m => m.orden)) + 1

  function valorDe(metricaId: number): SesionComiteValor {
    return valores.find(v => v.metrica_id === metricaId)
      ?? { id: 0, sesion_id: sesionId, metrica_id: metricaId, valor_num: null, valor_texto: null, observaciones: null, desglose: [] }
  }

  // Actualiza SOLO el estado local (para inputs controlados / feedback WoW).
  function setLocal(next: SesionComiteValor) {
    setValores(prev => {
      const idx = prev.findIndex(v => v.metrica_id === next.metrica_id)
      if (idx === -1) return [...prev, next]
      const out = [...prev]; out[idx] = next; return out
    })
  }

  // Persiste `next` (optimistic local + write). Inserta / actualiza / borra
  // según quede con dato o vacía. Revert por alert (patrón dbWrite).
  async function commit(next: SesionComiteValor) {
    const existente = valores.find(v => v.metrica_id === next.metrica_id) ?? null
    setLocal(next)
    const payload = {
      valor_num: next.valor_num,
      valor_texto: next.valor_texto,
      observaciones: next.observaciones,
      desglose: next.desglose,
    }
    try {
      if (!tieneValorComite(next)) {
        if (existente?.id) {
          await safeDelete(
            getSupabase().from('sesion_comite_valor').delete().eq('id', existente.id),
            `sesion_comite_valor delete id=${existente.id}`,
          )
          setValores(prev => prev.filter(v => v.metrica_id !== next.metrica_id))
        }
        return
      }
      if (existente?.id) {
        await safeWrite(
          getSupabase().from('sesion_comite_valor').update(payload).eq('id', existente.id),
          `sesion_comite_valor update id=${existente.id}`,
        )
      } else {
        const rows = await safeWrite(
          getSupabase().from('sesion_comite_valor').insert({ sesion_id: sesionId, metrica_id: next.metrica_id, ...payload }),
          `sesion_comite_valor insert metrica=${next.metrica_id}`,
        )
        const creada = rows[0] as SesionComiteValor
        setValores(prev => prev.map(v => v.metrica_id === next.metrica_id ? { ...next, id: creada.id } : v))
      }
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  function parseNum(raw: string): number | null {
    const t = raw.trim().replace(/\./g, '').replace(',', '.')
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300'

  return (
    <section className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-violet-50/70 border-b border-violet-100 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-violet-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">3</span>
        <h3 className="text-sm font-semibold text-gray-800">Reporte por institución</h3>
      </div>

      {/* Sub-tabs de institución (fijas) */}
      <div className="flex flex-wrap gap-1 px-3 pt-3">
        {COMITE_INSTITUCIONES.map(i => {
          const activa = inst === i.key
          const conDato = catalogo.some(m => m.institucion === i.key && m.activo && tieneValorComite(valores.find(v => v.metrica_id === m.id) ?? null))
          return (
            <button
              key={i.key}
              onClick={() => setInst(i.key)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                activa ? 'bg-violet-700 text-white'
                  : conDato ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {i.label}
            </button>
          )
        })}
      </div>

      <div className="p-3 space-y-3">
        {filas.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">
            Sin métricas para {COMITE_INSTITUCIONES.find(i => i.key === inst)?.label}. Agrega la primera con “+ métrica”.
          </p>
        )}

        {filas.map(m => {
          const v = valorDe(m.id)
          const prev = valoresPrev.get(m.id)
          const delta = m.tipo === 'numerico' && v.valor_num != null
            ? deltaPulso(prev?.valor_num ?? null, v.valor_num) : null
          return (
            <div key={m.id} className="px-3 py-2.5 bg-gray-50 rounded-lg">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-sm font-medium text-gray-800 leading-snug">
                  {m.nombre}
                  {m.unidad && <span className="text-xs text-gray-400 font-normal"> · {m.unidad}</span>}
                </p>
                <button
                  onClick={() => setEditModal({ metrica: m })}
                  className="text-gray-300 hover:text-violet-600 p-0.5 flex-shrink-0"
                  title="Editar / quitar este ítem del catálogo"
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>

              {m.tipo === 'numerico' ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    key={`num-${sesionId}-${m.id}`}
                    type="text" inputMode="decimal"
                    defaultValue={v.valor_num != null ? String(v.valor_num) : ''}
                    onBlur={e => commit({ ...valorDe(m.id), valor_num: parseNum(e.target.value) })}
                    placeholder="Valor de la semana"
                    className={`${inputCls} w-44`}
                  />
                  {(prev?.valor_num != null) && (
                    <span className="text-[11px] text-gray-400">
                      sem. anterior {prev.valor_num.toLocaleString('es-CL')}
                      {delta && (
                        <span className={delta.abs > 0 ? 'text-rose-600 ml-1' : delta.abs < 0 ? 'text-emerald-600 ml-1' : 'text-gray-400 ml-1'}>
                          {delta.abs > 0 ? '▲' : delta.abs < 0 ? '▼' : '='} {Math.abs(delta.abs).toLocaleString('es-CL')}
                          {delta.pct != null ? ` (${delta.pct > 0 ? '+' : ''}${delta.pct.toFixed(1)}%)` : ''}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              ) : (
                <textarea
                  key={`txt-${sesionId}-${m.id}`}
                  defaultValue={v.valor_texto ?? ''}
                  onBlur={e => commit({ ...valorDe(m.id), valor_texto: e.target.value.trim() || null })}
                  rows={3}
                  placeholder="Texto del reporte…"
                  className={`${inputCls} resize-y bg-white`}
                />
              )}

              {/* Desglose (sub-valores libres) — solo métricas numéricas */}
              {m.tipo === 'numerico' && (
                <div className="mt-2">
                  {v.desglose.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5 mb-1">
                      <input
                        type="text" value={d.etiqueta}
                        onChange={e => setLocal({ ...valorDe(m.id), desglose: replace(valorDe(m.id).desglose, i, { ...d, etiqueta: e.target.value }) })}
                        onBlur={() => commit(valorDe(m.id))}
                        placeholder="Etiqueta (ej. Valparaíso, 2026)"
                        className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
                      />
                      <input
                        type="text" value={d.valor}
                        onChange={e => setLocal({ ...valorDe(m.id), desglose: replace(valorDe(m.id).desglose, i, { ...d, valor: e.target.value }) })}
                        onBlur={() => commit(valorDe(m.id))}
                        placeholder="Valor (ej. 20%, 833)"
                        className="w-28 px-2 py-1 border border-slate-200 rounded text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
                      />
                      <button
                        onClick={() => commit({ ...valorDe(m.id), desglose: valorDe(m.id).desglose.filter((_, k) => k !== i) })}
                        className="text-gray-300 hover:text-red-500 p-0.5 flex-shrink-0" title="Quitar sub-valor"
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setLocal({ ...valorDe(m.id), desglose: [...valorDe(m.id).desglose, { etiqueta: '', valor: '' }] })}
                    className="text-[11px] text-violet-700 hover:text-violet-900 font-medium hover:underline"
                  >
                    + desglose (sub-valor)
                  </button>
                </div>
              )}

              {/* Observaciones (columna del acta: año a la fecha / contexto) */}
              <input
                key={`obs-${sesionId}-${m.id}`}
                type="text" defaultValue={v.observaciones ?? ''}
                onBlur={e => commit({ ...valorDe(m.id), observaciones: e.target.value.trim() || null })}
                placeholder="Observaciones (año a la fecha, contexto)…"
                className={`${inputCls} mt-2 text-xs py-1.5 bg-white`}
              />
            </div>
          )
        })}

        <button
          onClick={() => setEditModal({ metrica: null })}
          className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
        >
          + métrica de {COMITE_INSTITUCIONES.find(i => i.key === inst)?.label}
        </button>
      </div>

      {editModal && (
        <MetricaComiteEditModal
          open
          metrica={editModal.metrica}
          regionCod={regionCod}
          institucion={inst}
          currentUserEmail={currentUserEmail}
          ordenSugerido={ordenSugerido}
          onClose={() => setEditModal(null)}
          onSaved={onCatalogoChange}
        />
      )}
    </section>
  )
}

// Reemplaza el elemento `i` de un array sin mutar (para el desglose controlado).
function replace(arr: ComiteDesglose[], i: number, next: ComiteDesglose): ComiteDesglose[] {
  const out = arr.slice(); out[i] = next; return out
}
