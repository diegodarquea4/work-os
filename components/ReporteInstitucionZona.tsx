'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import type { ColaPorClave } from '@/lib/colaPorClave'
import type { ComiteMetrica, SesionComiteValor, ComiteDesglose } from '@/lib/types'
import { deltaPulso, tieneValorComite } from '@/lib/sesiones/helpers'
import type { InstitucionComite } from '@/lib/hooks/useComiteMetricas'
import MetricaComiteEditModal from './MetricaComiteEditModal'
import MetricasComiteModal from './MetricasComiteModal'

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
 *
 * COMPONENTE CONTROLADO: `valores`, la institución activa y la cola de
 * guardados viven en el padre (SesionModal). Razón: en la consola a pantalla
 * completa esta zona se DESMONTA al pasar a otra zona del riel y se vuelve a
 * montar al volver. Si el estado fuera local, al remontar se partiría de los
 * valores viejos y, peor, con una cola nueva podrían viajar dos guardados de
 * la misma métrica en paralelo (lo que lib/colaPorClave.ts evita).
 */

type Props = {
  sesionId: number
  regionCod: string
  catalogo: ComiteMetrica[]
  valores: SesionComiteValor[]                                    // estado del padre
  onValoresChange: Dispatch<SetStateAction<SesionComiteValor[]>>  // setter del padre
  encolar: ColaPorClave<number>                                   // cola por métrica, creada en el padre
  valoresPrev: Map<number, SesionComiteValor>   // WoW: sesión cerrada anterior
  institucion: string                           // institución activa (la elige el riel de la consola)
  currentUserEmail: string
  onCatalogoChange: () => void                  // recarga el catálogo en el padre
  instituciones: InstitucionComite[]            // dinámicas por región (mig 078)
  onInstitucionesChange: () => void             // recarga la lista de instituciones
}

export default function ReporteInstitucionZona({
  sesionId, regionCod, catalogo, valores, onValoresChange, encolar, valoresPrev,
  institucion, currentUserEmail, onCatalogoChange,
  instituciones, onInstitucionesChange,
}: Props) {
  const [editModal, setEditModal] = useState<{ metrica: ComiteMetrica | null } | null>(null)
  const [metricasModal, setMetricasModal] = useState(false)

  // Institución seleccionada segura: si la elegida ya no está en la lista
  // (borrada), cae a la primera (las 4 base siempre están).
  const instSel = instituciones.some(i => i.key === institucion) ? institucion : (instituciones[0]?.key ?? 'carabineros')
  const instLabel = instituciones.find(i => i.key === instSel)?.label ?? instSel

  const filas = catalogo
    .filter(m => m.institucion === instSel && m.activo)
    .sort((a, b) => a.orden - b.orden || a.id - b.id)
  const ordenSugerido = Math.max(0, ...catalogo.filter(m => m.institucion === instSel).map(m => m.orden)) + 1

  function valorDe(metricaId: number): SesionComiteValor {
    return valores.find(v => v.metrica_id === metricaId)
      ?? { id: 0, sesion_id: sesionId, metrica_id: metricaId, valor_num: null, valor_texto: null, observaciones: null, desglose: [] }
  }

  // Actualiza SOLO el estado local (para inputs controlados / feedback WoW).
  function setLocal(next: SesionComiteValor) {
    onValoresChange(prev => {
      const idx = prev.findIndex(v => v.metrica_id === next.metrica_id)
      if (idx === -1) return [...prev, next]
      const out = [...prev]; out[idx] = next; return out
    })
  }

  // Persiste `next` (optimistic local + write). Guarda / borra según quede con
  // dato o vacía. Revert por alert (patrón dbWrite).
  async function commit(next: SesionComiteValor) {
    // Se mira ANTES del setLocal: dice si hay algo que borrar cuando la fila
    // queda vacía.
    const habiaFila = valores.some(v => v.metrica_id === next.metrica_id)
    setLocal(next)
    await encolar(next.metrica_id, () => guardar(next, habiaFila))
  }

  async function guardar(next: SesionComiteValor, habiaFila: boolean) {
    const payload = {
      valor_num: next.valor_num,
      valor_texto: next.valor_texto,
      observaciones: next.observaciones,
      desglose: next.desglose,
    }
    try {
      if (!tieneValorComite(next)) {
        if (!habiaFila) return
        await safeDelete(
          getSupabase().from('sesion_comite_valor').delete()
            .eq('sesion_id', sesionId).eq('metrica_id', next.metrica_id),
          `sesion_comite_valor delete metrica=${next.metrica_id}`,
        )
        onValoresChange(prev => prev.filter(v => v.metrica_id !== next.metrica_id))
        return
      }
      // UPSERT, no «insertar o actualizar según el id local». La llave real es
      // (sesion_id, metrica_id) y la conoce la base; el componente no. Antes se
      // decidía mirando `existente.id`, que vale 0 en la fila provisoria que
      // arma `valorDe()` mientras el primer guardado va en vuelo — así que un
      // segundo campo de la misma métrica volvía a INSERTAR y reventaba con
      // «duplicate key ... sesion_comite_valor_sesion_id_metrica_id_key».
      const rows = await safeWrite(
        getSupabase().from('sesion_comite_valor')
          .upsert(
            { sesion_id: sesionId, metrica_id: next.metrica_id, ...payload },
            { onConflict: 'sesion_id,metrica_id' },
          ),
        `sesion_comite_valor upsert metrica=${next.metrica_id}`,
      )
      const guardada = rows[0] as SesionComiteValor
      onValoresChange(prev => prev.map(v => v.metrica_id === next.metrica_id ? { ...next, id: guardada.id } : v))
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

  // La cabecera de la zona («3 · Reporte por institución») y la elección de
  // institución las pone la consola (ZonaCard + riel); acá solo va el cuerpo.
  return (
    <div>
      <div className="space-y-3">
        {filas.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">
            Sin métricas para {instLabel}. Agrega la primera con “+ métrica”.
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditModal({ metrica: null })}
            className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
          >
            + métrica de {instLabel}
          </button>
          <span className="text-gray-200">·</span>
          <button
            onClick={() => setMetricasModal(true)}
            className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
            title="Instituciones y métricas estándar (formato check)"
          >
            Métricas
          </button>
        </div>
      </div>

      {editModal && (
        <MetricaComiteEditModal
          open
          metrica={editModal.metrica}
          regionCod={regionCod}
          institucion={instSel}
          institucionLabel={instLabel}
          currentUserEmail={currentUserEmail}
          ordenSugerido={ordenSugerido}
          onClose={() => setEditModal(null)}
          onSaved={onCatalogoChange}
        />
      )}

      {metricasModal && (
        <MetricasComiteModal
          regionCod={regionCod}
          currentUserEmail={currentUserEmail}
          onClose={() => setMetricasModal(false)}
          onSaved={() => { onCatalogoChange(); onInstitucionesChange() }}
        />
      )}
    </div>
  )
}

// Reemplaza el elemento `i` de un array sin mutar (para el desglose controlado).
function replace(arr: ComiteDesglose[], i: number, next: ComiteDesglose): ComiteDesglose[] {
  const out = arr.slice(); out[i] = next; return out
}
