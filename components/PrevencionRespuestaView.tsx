'use client'

import { useEffect, useMemo, useState } from 'react'
import { REGIONS } from '@/lib/regions'
import { useCurrentUserEmail } from '@/lib/context/UserContext'
import {
  SECCIONES, BLOQUES, ITEMS, ID2ITEM,
  estadoDe, colorBloque, respuestaVacia,
  ESTADO_LABEL, ESTADO_PILL, CELDA_PILL,
  type Item, type Bloque, type Respuesta, type Estado,
} from '@/lib/prevencionRespuesta'
import { getAllPrevencionRespuesta, upsertPrevencionRespuesta } from '@/lib/db'

type Props = { canEditRegion?: (regionCod: string) => boolean }

// Respuestas indexadas: region_cod → item_id → Respuesta.
type Index = Record<string, Record<string, Respuesta>>

const ESTADOS: Estado[] = ['listo', 'parcial', 'nolisto']
const TIPO_LABEL: Record<Item['tipo'], string> = {
  verif: 'Verificación',
  flujo: 'Flujo',
  capt:  'Captura',
}

function normalizeChecks(raw: unknown, it: Item): boolean[] {
  const arr = Array.isArray(raw) ? raw : []
  return (it.checks ?? []).map((_, i) => Boolean(arr[i]))
}

function fmtTs(ts: number): string {
  try {
    return new Date(ts).toLocaleString('es-CL', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

export default function PrevencionRespuestaView({ canEditRegion }: Props) {
  const email = useCurrentUserEmail()
  const [data, setData]           = useState<Index>({})
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [vista, setVista]         = useState<'formulario' | 'consolidado'>('formulario')
  const [selectedCod, setSelectedCod] = useState<string>(REGIONS[0]?.cod ?? '')
  const [saving, setSaving]       = useState<string | null>(null)

  useEffect(() => {
    getAllPrevencionRespuesta()
      .then(rows => {
        const idx: Index = {}
        for (const row of rows) {
          const it = ID2ITEM[row.item_id]
          if (!it) continue // ítem ya no existe en el instrumento — se ignora
          ;(idx[row.region_cod] ??= {})[row.item_id] = {
            estado:      row.estado,
            manual:      !!row.manual,
            checks:      normalizeChecks(row.checks, it),
            comentarios: Array.isArray(row.comentarios) ? row.comentarios : [],
          }
        }
        setData(idx)
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const editable = canEditRegion ? canEditRegion(selectedCod) : true

  function getResp(cod: string, itemId: string): Respuesta {
    return data[cod]?.[itemId] ?? respuestaVacia(ID2ITEM[itemId])
  }

  // Guarda la fila COMPLETA del ítem con optimistic update + revert defensivo.
  async function persist(item: Item, next: Respuesta) {
    const cod = selectedCod
    const prev = data[cod]?.[item.id]
    setData(d => ({ ...d, [cod]: { ...(d[cod] ?? {}), [item.id]: next } }))
    setSaving(`${cod}:${item.id}`)
    try {
      await upsertPrevencionRespuesta(cod, item.id, {
        estado: next.estado, manual: next.manual, checks: next.checks, comentarios: next.comentarios,
      }, email || undefined)
    } catch (e) {
      setData(d => {
        const region = { ...(d[cod] ?? {}) }
        if (prev === undefined) delete region[item.id]
        else region[item.id] = prev
        return { ...d, [cod]: region }
      })
      window.alert(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(null)
    }
  }

  function handleToggleCheck(item: Item, i: number) {
    if (!editable) return
    const cur = getResp(selectedCod, item.id)
    const checks = (item.checks ?? []).map((_, k) => k === i ? !cur.checks[k] : !!cur.checks[k])
    persist(item, { ...cur, checks })
  }

  function handleSetOverride(item: Item, estado: Estado) {
    if (!editable) return
    const cur = getResp(selectedCod, item.id)
    const hasChecks = (item.checks?.length ?? 0) > 0
    // Re-click sobre el estado activo: en ítems con checks libera el override
    // (vuelve al semáforo derivado); en pasos de flujo lo limpia.
    const next: Respuesta = (cur.estado === estado && (hasChecks ? cur.manual : true))
      ? { ...cur, manual: false, estado: null }
      : { ...cur, manual: true, estado }
    persist(item, next)
  }

  function handleAddComentario(item: Item, texto: string) {
    if (!editable) return
    const t = texto.trim()
    if (!t) return
    const cur = getResp(selectedCod, item.id)
    const c = { ts: Date.now(), texto: t, autor: email || undefined }
    persist(item, { ...cur, comentarios: [...cur.comentarios, c] })
  }

  function handleDeleteComentario(item: Item, ts: number) {
    if (!editable) return
    const cur = getResp(selectedCod, item.id)
    persist(item, { ...cur, comentarios: cur.comentarios.filter(c => c.ts !== ts) })
  }

  const selectedRegion = REGIONS.find(r => r.cod === selectedCod)

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Sub-header: vista + selector de región */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-gray-100 bg-white flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <VistaButton active={vista === 'formulario'} onClick={() => setVista('formulario')}>Formulario por región</VistaButton>
          <VistaButton active={vista === 'consolidado'} onClick={() => setVista('consolidado')}>Consolidado nacional</VistaButton>
        </div>

        {vista === 'formulario' && (
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-gray-500">Región</label>
            <select
              value={selectedCod}
              onChange={e => setSelectedCod(e.target.value)}
              className="text-sm font-semibold text-slate-700 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {REGIONS.map(r => (
                <option key={r.cod} value={r.cod}>{r.nombre}</option>
              ))}
            </select>
            {!editable && (
              <span className="text-[11px] text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-md px-2 py-1">
                Solo lectura
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {loading && <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Cargando…</div>}
        {error && <div className="flex items-center justify-center h-48 text-red-500 text-sm">Error: {error}</div>}

        {!loading && !error && vista === 'formulario' && (
          <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
            <div className="text-sm text-gray-500">
              Auditoría de preparación <span className="font-semibold text-slate-700">{selectedRegion?.nombre}</span> · marca las casillas y el semáforo se calcula solo. Los comentarios quedan guardados para todo el equipo.
            </div>
            {SECCIONES.map(bloque => (
              <BloqueCard
                key={bloque.id}
                bloque={bloque}
                getResp={id => getResp(selectedCod, id)}
                saving={saving}
                savingKeyPrefix={`${selectedCod}:`}
                editable={editable}
                onToggleCheck={handleToggleCheck}
                onSetOverride={handleSetOverride}
                onAddComentario={handleAddComentario}
                onDeleteComentario={handleDeleteComentario}
              />
            ))}
          </div>
        )}

        {!loading && !error && vista === 'consolidado' && (
          <Consolidado
            data={data}
            onPickRegion={cod => { setSelectedCod(cod); setVista('formulario') }}
          />
        )}
      </div>
    </div>
  )
}

// ── Sub-header buttons ────────────────────────────────────────────────────────
function VistaButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
        active ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

// ── Bloque (eje) ──────────────────────────────────────────────────────────────
function BloqueCard({
  bloque, getResp, saving, savingKeyPrefix, editable,
  onToggleCheck, onSetOverride, onAddComentario, onDeleteComentario,
}: {
  bloque: Bloque
  getResp: (itemId: string) => Respuesta
  saving: string | null
  savingKeyPrefix: string
  editable: boolean
  onToggleCheck: (item: Item, i: number) => void
  onSetOverride: (item: Item, estado: Estado) => void
  onAddComentario: (item: Item, texto: string) => void
  onDeleteComentario: (item: Item, ts: number) => void
}) {
  return (
    <section className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-100" style={{ borderLeft: `4px solid ${bloque.color}` }}>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-slate-800">{bloque.t}</h3>
          {bloque.tent && (
            <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 ring-1 ring-purple-200 rounded px-1.5 py-0.5">
              por confirmar
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{bloque.q}</p>
      </header>
      <div className="divide-y divide-gray-100">
        {bloque.items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            resp={getResp(item.id)}
            saving={saving === `${savingKeyPrefix}${item.id}`}
            editable={editable}
            onToggleCheck={onToggleCheck}
            onSetOverride={onSetOverride}
            onAddComentario={onAddComentario}
            onDeleteComentario={onDeleteComentario}
          />
        ))}
      </div>
    </section>
  )
}

// ── Ítem (punto) ──────────────────────────────────────────────────────────────
function ItemRow({
  item, resp, saving, editable,
  onToggleCheck, onSetOverride, onAddComentario, onDeleteComentario,
}: {
  item: Item
  resp: Respuesta
  saving: boolean
  editable: boolean
  onToggleCheck: (item: Item, i: number) => void
  onSetOverride: (item: Item, estado: Estado) => void
  onAddComentario: (item: Item, texto: string) => void
  onDeleteComentario: (item: Item, ts: number) => void
}) {
  const [draft, setDraft] = useState('')
  const conSemaforo = item.sem !== false
  const eff = estadoDe(resp, item)

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 ring-1 ring-gray-200 rounded px-1.5 py-0.5">
              {TIPO_LABEL[item.tipo]}
            </span>
            <h4 className="text-sm font-semibold text-slate-800">{item.t}</h4>
          </div>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.como}</p>
        </div>
        {conSemaforo && (
          <span className={`flex-shrink-0 text-[11px] font-semibold rounded-md px-2 py-1 ${eff ? ESTADO_PILL[eff] : ESTADO_PILL.sin} ${saving ? 'opacity-50' : ''}`}>
            {eff ? ESTADO_LABEL[eff] : 'Sin evaluar'}
            {resp.manual && eff ? ' · manual' : ''}
          </span>
        )}
      </div>

      {/* Casillas */}
      {item.checks && item.checks.length > 0 && (
        <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
          {item.checks.map((label, i) => (
            <label key={i} className={`flex items-start gap-2 text-xs ${editable ? 'cursor-pointer' : 'cursor-default'}`}>
              <input
                type="checkbox"
                checked={!!resp.checks[i]}
                disabled={!editable || saving}
                onChange={() => onToggleCheck(item, i)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-slate-600 focus:ring-slate-300"
              />
              <span className="text-gray-600 leading-snug">{label}</span>
            </label>
          ))}
        </div>
      )}

      {/* Override / semáforo manual */}
      {conSemaforo && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="text-[11px] text-gray-400 mr-1">
            {item.checks && item.checks.length > 0 ? 'Ajustar a mano:' : 'Semáforo:'}
          </span>
          {ESTADOS.map(e => {
            const active = eff === e
            return (
              <button
                key={e}
                disabled={!editable || saving}
                onClick={() => onSetOverride(item, e)}
                className={`text-[11px] font-semibold rounded-md px-2 py-0.5 transition-all ring-1 ${
                  active ? ESTADO_PILL[e] : 'bg-white text-gray-400 ring-gray-200 hover:ring-gray-300'
                } ${!editable ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {ESTADO_LABEL[e]}
              </button>
            )
          })}
        </div>
      )}

      {/* Preguntas guía */}
      {item.prof.length > 0 && (
        <ul className="mt-2.5 space-y-0.5">
          {item.prof.map((p, i) => (
            <li key={i} className="text-[11px] text-gray-500 flex gap-1.5">
              <span className="text-gray-300">›</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Comentarios */}
      <div className="mt-3 border-t border-gray-50 pt-2.5">
        {resp.comentarios.length > 0 && (
          <ul className="space-y-1.5 mb-2">
            {resp.comentarios.map(c => (
              <li key={c.ts} className="flex items-start gap-2 text-xs bg-slate-50 rounded-md px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-gray-700 leading-snug whitespace-pre-wrap break-words">{c.texto}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {c.autor ? `${c.autor} · ` : ''}{fmtTs(c.ts)}
                  </p>
                </div>
                {editable && (
                  <button
                    onClick={() => onDeleteComentario(item, c.ts)}
                    className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                    title="Eliminar comentario"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && draft.trim()) { onAddComentario(item, draft); setDraft('') }
              }}
              placeholder="Agregar comentario…"
              className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <button
              onClick={() => { if (draft.trim()) { onAddComentario(item, draft); setDraft('') } }}
              disabled={!draft.trim() || saving}
              className="text-xs font-medium text-slate-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Agregar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Consolidado nacional ──────────────────────────────────────────────────────
function Consolidado({
  data, onPickRegion,
}: {
  data: Index
  onPickRegion: (cod: string) => void
}) {
  const filas = useMemo(() => REGIONS.map(region => {
    const resp = data[region.cod] ?? {}
    const celdas = BLOQUES.map(bloque => {
      const total  = bloque.items.length
      const nListo = bloque.items.filter(it => estadoDe(resp[it.id], it) === 'listo').length
      return { color: colorBloque(resp, bloque.items), nListo, total }
    })
    const listos = ITEMS.filter(it => estadoDe(resp[it.id], it) === 'listo').length
    return { region, celdas, listos }
  }), [data])

  return (
    <div className="px-4 py-6 flex justify-center">
      <div className="w-full max-w-3xl">
        <table className="w-full text-sm border-collapse bg-white rounded-xl shadow-sm ring-1 ring-gray-100 overflow-hidden">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Región</th>
              {BLOQUES.map(b => (
                <th key={b.id} className="px-2 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                    <span className="text-xs font-bold text-gray-600">{b.short}</span>
                  </div>
                  {b.tent && <div className="text-[9px] text-purple-500 mt-0.5">por confirmar</div>}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Listos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map(({ region, celdas, listos }) => (
              <tr
                key={region.cod}
                onClick={() => onPickRegion(region.cod)}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                title="Ver formulario de esta región"
              >
                <td className="px-4 py-2">
                  <div className="font-semibold text-gray-800 text-sm leading-tight">{region.nombre}</div>
                  <div className="text-gray-400 text-xs">{region.capital}</div>
                </td>
                {celdas.map((c, i) => (
                  <td key={i} className="px-2 py-2 text-center">
                    <span className={`inline-block text-[11px] font-semibold rounded-md px-2 py-1 ${CELDA_PILL[c.color]}`}>
                      {c.nListo}/{c.total}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-2 text-center">
                  <span className="text-sm font-bold text-slate-700">{listos}</span>
                  <span className="text-xs text-gray-400">/{ITEMS.length}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-gray-400 mt-2 text-center">
          Cada celda muestra los ítems «Listo» sobre el total del bloque; el color resume el estado. Clic en una fila para abrir su formulario.
        </p>
      </div>
    </div>
  )
}
