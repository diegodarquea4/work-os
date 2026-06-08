'use client'

import { useMemo, useState } from 'react'
import { FAQ_CATALOG, faqsVisibles, type FaqEntry } from '@/lib/faq'

const CONTACTO = 'diego.darquea@interior.gob.cl'

type Props = {
  isAdmin:     boolean
  canEditAny:  boolean
}

/**
 * Listado de FAQ con búsqueda + acordeón agrupado por categoría.
 * Filtra por capabilities del usuario actual. Usado en AyudaModal y /ayuda.
 */
export default function FaqList({ isAdmin, canEditAny }: Props) {
  const [query, setQuery]       = useState('')
  const [openId, setOpenId]     = useState<string | null>(null)

  const visibles = useMemo(
    () => faqsVisibles(FAQ_CATALOG, { isAdmin, canEditAny }),
    [isAdmin, canEditAny]
  )

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return visibles
    return visibles.filter(f =>
      normalize(f.pregunta).includes(q)
      || normalize(f.respuesta).includes(q)
      || normalize(f.categoria).includes(q)
    )
  }, [visibles, query])

  const grouped = useMemo(() => groupByCategoria(filtered), [filtered])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-6">
        {/* Search */}
        <div className="sticky top-0 -mx-5 px-5 pb-3 pt-1 bg-gray-50 z-10 -mt-1">
          <div className="relative">
            <svg
              width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            >
              <circle cx="7" cy="7" r="5"/>
              <path d="M11 11l3 3"/>
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar en preguntas frecuentes…"
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent"
            />
          </div>
          <div className="text-xs text-gray-400 mt-2 px-1">
            {filtered.length} {filtered.length === 1 ? 'pregunta' : 'preguntas'}
            {query && ` para "${query}"`}
            {!query && ` · filtradas para tu rol`}
          </div>
        </div>

        {/* Empty state */}
        {grouped.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 mb-4">
              No encontramos preguntas para <strong>&ldquo;{query}&rdquo;</strong>.
            </p>
            <a
              href={`mailto:${CONTACTO}?subject=Consulta%20PSG%3A%20${encodeURIComponent(query)}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
            >
              Escribir a la división
            </a>
          </div>
        )}

        {/* Grouped accordion */}
        {grouped.map(([categoria, entries]) => (
          <section key={categoria} className="mt-6 first:mt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 px-1">
              {categoria}
            </h3>
            <div className="space-y-1.5">
              {entries.map(entry => (
                <FaqItem
                  key={entry.id}
                  entry={entry}
                  isOpen={openId === entry.id}
                  onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
                  catalog={visibles}
                  onNavigate={id => setOpenId(id)}
                />
              ))}
            </div>
          </section>
        ))}

        {/* Footer — contacto */}
        {grouped.length > 0 && (
          <div className="mt-10 mb-2 pt-6 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-500 mb-3">¿No encontraste tu duda?</p>
            <a
              href={`mailto:${CONTACTO}?subject=Consulta%20PSG`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 text-sm font-semibold rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 4h12v8H2z"/>
                <path d="M2 4l6 5 6-5"/>
              </svg>
              Escribir a la división
            </a>
            <p className="text-xs text-gray-400 mt-3 font-mono">{CONTACTO}</p>
          </div>
        )}
      </div>
    </div>
  )
}

type FaqItemProps = {
  entry:       FaqEntry
  isOpen:      boolean
  onToggle:    () => void
  catalog:     FaqEntry[]
  onNavigate:  (id: string) => void
}

function FaqItem({ entry, isOpen, onToggle, catalog, onNavigate }: FaqItemProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-medium text-slate-900 flex-1">{entry.pregunta}</span>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className={`text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M3 5l4 4 4-4"/>
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {entry.respuesta}
          </p>

          {entry.relacionadas && entry.relacionadas.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-500 mb-1.5">Relacionadas</div>
              <div className="flex flex-wrap gap-1.5">
                {entry.relacionadas.map(relId => {
                  const rel = catalog.find(c => c.id === relId)
                  if (!rel) return null
                  return (
                    <button
                      key={relId}
                      onClick={() => onNavigate(relId)}
                      className="text-xs text-blue-700 hover:text-blue-900 hover:underline text-left"
                    >
                      → {rel.pregunta}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function groupByCategoria(entries: FaqEntry[]): [string, FaqEntry[]][] {
  const order = [
    'Primeros pasos',
    'Carga semanal',
    'Permisos y roles',
    'Ejes',
    'Métricas y PREGO',
    'Atención y foco',
    'Minutas e indicadores',
    'Cuenta y acceso',
  ]
  const map = new Map<string, FaqEntry[]>()
  for (const e of entries) {
    if (!map.has(e.categoria)) map.set(e.categoria, [])
    map.get(e.categoria)!.push(e)
  }
  return order
    .filter(cat => map.has(cat))
    .map(cat => [cat, map.get(cat)!] as [string, FaqEntry[]])
    // Cualquier categoría futura que no esté en `order` va al final.
    .concat(
      Array.from(map.entries()).filter(([cat]) => !order.includes(cat))
    )
}
