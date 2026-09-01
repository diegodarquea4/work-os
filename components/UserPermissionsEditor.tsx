'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { REGIONS } from '@/lib/regions'
import type { UserRole } from '@/lib/apiAuth'
import {
  SECTIONS, FUNCTIONS, ALL_CAPABILITY_KEYS, ROLE_PRESETS, defaultRegionScopeForCap, isGlobalCap,
} from '@/lib/permissions'
import { useDialogA11y } from '@/lib/hooks/useDialogA11y'
import { Alert } from '@/components/ui'

type CapState = { on: boolean; mode: 'all' | 'scoped'; cods: string[] }
type Caps = Record<string, CapState>

export type UserLite = {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  region_cods: string[]
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador', editor: 'Editor', regional: 'Regional', viewer: 'Solo lectura',
}

const SECCIONES_AREA = '__secciones__'

// El alcance de región por DEFECTO de cada cap depende del footprint del usuario:
// un usuario de región arranca scoped a su(s) región(es) para las caps operativas
// (y '*' para secciones/globales); un usuario con acceso a todas → '*'. Así, al
// prender un permiso nuevo, la región queda bien sin tener que ajustarla a mano
// (evita el over-grant a las 16 regiones). Ver defaultRegionScopeForCap.
function emptyCaps(regionCods: string[]): Caps {
  const s: Caps = {}
  for (const k of ALL_CAPABILITY_KEYS) {
    const def = defaultRegionScopeForCap(k, regionCods)
    s[k] = { on: false, mode: def.mode, cods: def.cods }
  }
  return s
}

function capsFromPreset(role: UserRole, regionCods: string[]): Caps {
  const s = emptyCaps(regionCods)
  for (const [key, policy] of ROLE_PRESETS[role] ?? []) {
    s[key] = policy === 'all'
      ? { on: true, mode: 'all', cods: [] }
      : { on: true, mode: 'scoped', cods: [...regionCods] }
  }
  return s
}

// Filas (clave, región) a guardar para una capacidad concedida, según el
// footprint del usuario. Fail-closed y sin re-guardar el over-grant '*':
//   - global (sec.* / preset regional 'all')      → '*'.
//   - usuario de UNA región                        → esa región (sin picker en la UI).
//   - usuario con TODAS las regiones (footprint 0) → honra el picker ('*' o selección).
//   - usuario multi-región                         → acotado a su footprint (sin '*').
function rowsForCap(k: string, s: CapState, footprint: string[]): { key: string; region: string }[] {
  if (isGlobalCap(k)) return [{ key: k, region: '*' }]
  if (footprint.length === 1) return [{ key: k, region: footprint[0] }]
  if (footprint.length === 0) {
    if (s.mode === 'all') return [{ key: k, region: '*' }]
    return s.cods.map(c => ({ key: k, region: c }))
  }
  const cods = s.mode === 'all' ? [...footprint] : s.cods.filter(c => footprint.includes(c))
  return cods.map(c => ({ key: k, region: c }))
}

/** Alcance regional de una capacidad OPERATIVA para usuarios multi-región o con
 *  acceso a todas. El menú se portalea a `document.body`: el modal tiene
 *  `transform` (scale) + `overflow-hidden`, que atraparían/cliparían un
 *  `position: fixed` renderizado dentro. `regions` es la lista elegible (el
 *  footprint del usuario, o las 16 si tiene todas); `allowWildcard` habilita la
 *  opción '*' (solo para usuarios con acceso a todas). */
function RegionScope({ state, disabled, regions, allowWildcard, onChange }: {
  state: CapState
  disabled: boolean
  regions: { cod: string; nombre: string }[]
  allowWildcard: boolean
  onChange: (next: { mode: 'all' | 'scoped'; cods: string[] }) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState<{ top: number; left: number } | null>(null)
  const btnRef  = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen() {
    if (open) { setOpen(false); return }
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuH = 300
    const top = window.innerHeight - rect.bottom < menuH ? Math.max(8, rect.top - menuH - 4) : rect.bottom + 4
    setPos({ top, left: Math.max(8, rect.right - 208) })
    setOpen(true)
  }

  function toggleCod(cod: string) {
    const base = state.mode === 'scoped' ? state.cods : []
    const has = base.includes(cod)
    const cods = has ? base.filter(c => c !== cod) : [...base, cod]
    onChange({ mode: 'scoped', cods })
  }

  // "Todas" = wildcard '*' (acceso a todas) o todas sus regiones (multi-región).
  const allCods = regions.map(r => r.cod)
  const isAll = allowWildcard
    ? state.mode === 'all'
    : state.mode === 'scoped' && allCods.length > 0 && allCods.every(c => state.cods.includes(c))
  function selectAll() {
    onChange(allowWildcard ? { mode: 'all', cods: [] } : { mode: 'scoped', cods: [...allCods] })
    setOpen(false)
  }

  const label = isAll
    ? 'Todas'
    : state.cods.length === 0 ? 'Sin región'
    : state.cods.length === 1 ? (regions.find(r => r.cod === state.cods[0])?.nombre ?? state.cods[0])
    : `${state.cods.length} regiones`

  const menu = open && pos && typeof document !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-52 max-h-72 overflow-y-auto"
    >
      <button
        type="button"
        onClick={selectAll}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 ${isAll ? 'text-violet-700 font-medium' : 'text-gray-700'}`}
      >
        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isAll ? 'border-violet-600' : 'border-gray-300'}`}>
          {isAll && <span className="w-1.5 h-1.5 rounded-full bg-violet-600" />}
        </span>
        <span className="text-xs">{allowWildcard ? 'Todas las regiones' : 'Todas sus regiones'}</span>
      </button>
      <div className="my-1 border-t border-gray-100" />
      {regions.map(r => (
        <label key={r.cod} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
          <input
            type="checkbox"
            checked={state.mode === 'scoped' && state.cods.includes(r.cod)}
            onChange={() => toggleCod(r.cod)}
            className="rounded border-gray-300 text-violet-700 focus:ring-violet-400"
          />
          <span className="text-xs text-gray-700">{r.nombre}</span>
        </label>
      ))}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className={`flex items-center gap-1 text-[11px] border rounded px-2 py-1 min-w-[104px] justify-between transition-colors disabled:opacity-40 ${
          isAll
            ? 'border-gray-200 text-gray-500 hover:border-gray-300'
            : 'border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300'
        }`}
      >
        <span className="truncate">{label}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1.5 3L4 5.5L6.5 3"/></svg>
      </button>
      {menu}
    </>
  )
}

export default function UserPermissionsEditor({ user, onClose, onSaved }: {
  user: UserLite
  onClose: () => void
  onSaved?: () => void
}) {
  const { panelRef, onKeyDown } = useDialogA11y<HTMLDivElement>()
  const [entered, setEntered] = useState(false)
  const closingRef = useRef(false)
  useEffect(() => { const raf = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(raf) }, [])
  function requestClose() {
    if (closingRef.current) return
    closingRef.current = true
    setEntered(false)
    window.setTimeout(onClose, 150)
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      const t = e.target as HTMLElement
      const enCampo = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
      if (!enCampo) { e.preventDefault(); requestClose() }
      return
    }
    onKeyDown(e)
  }

  // Footprint del usuario: [] = acceso a todas; [X] = una región; [X,XIV] = varias.
  // Determina si aparece el manejo granular por región (solo multi o todas) y qué
  // regiones son elegibles en el picker.
  const footprint = user.region_cods
  const singleRegion = footprint.length === 1
  const allowWildcard = footprint.length === 0
  const pickerRegions = footprint.length > 0
    ? REGIONS.filter(r => footprint.includes(r.cod))
    : REGIONS

  const [caps, setCaps]       = useState<Caps>(() => emptyCaps(user.region_cods))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [area, setArea]       = useState<string>(SECCIONES_AREA)

  useEffect(() => {
    fetch(`/api/admin/users/${user.id}/capabilities`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.capabilities) {
          const cods = user.region_cods
          const byKey = new Map<string, string[]>()
          for (const c of data.capabilities) byKey.set(c.key, [...(byKey.get(c.key) ?? []), c.region])
          const next = emptyCaps(cods)
          for (const k of ALL_CAPABILITY_KEYS) {
            const regions = byKey.get(k)
            if (!regions?.length) continue
            if (regions.includes('*')) {
              // '*' cargado: global o usuario con acceso a todas lo conservan; un
              // usuario con footprint lo normaliza a sus regiones (no re-guardar el
              // over-grant a las 16 — espeja rowsForCap/mig 085).
              next[k] = isGlobalCap(k) || cods.length === 0
                ? { on: true, mode: 'all', cods: [] }
                : { on: true, mode: 'scoped', cods: [...cods] }
            } else {
              next[k] = { on: true, mode: 'scoped', cods: regions }
            }
          }
          setCaps(next)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user.id, user.region_cods])

  function toggle(key: string) {
    setCaps(prev => ({ ...prev, [key]: { ...prev[key], on: !prev[key].on } }))
  }
  function setScope(key: string, next: { mode: 'all' | 'scoped'; cods: string[] }) {
    setCaps(prev => ({ ...prev, [key]: { ...prev[key], on: true, ...next } }))
  }

  async function handleSave() {
    setSaving(true); setError(null)
    const rows: { key: string; region: string }[] = []
    for (const k of ALL_CAPABILITY_KEYS) {
      const s = caps[k]
      if (!s.on) continue
      rows.push(...rowsForCap(k, s, footprint))
    }
    const res = await fetch(`/api/admin/users/${user.id}/capabilities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capabilities: rows }),
    })
    if (res.ok) { onSaved?.(); requestClose() }
    else { const b = await res.json().catch(() => ({})); setError(b.error ?? 'Error al guardar') }
    setSaving(false)
  }

  const grantedCount = useMemo(() => ALL_CAPABILITY_KEYS.filter(k => caps[k]?.on).length, [caps])

  // Grupos de funciones (orden de aparición en el catálogo) → áreas navegables.
  const functionGroups = useMemo(() => {
    const m = new Map<string, typeof FUNCTIONS[number][]>()
    for (const f of FUNCTIONS) { if (!m.has(f.group)) m.set(f.group, []); m.get(f.group)!.push(f) }
    return Array.from(m.entries())
  }, [])

  // Navegación izquierda: "Secciones visibles" + una entrada por grupo, cada una
  // con su conteo concedidas/total.
  const areas = useMemo(() => {
    const secGranted = SECTIONS.filter(s => caps[s.key]?.on).length
    const list: { id: string; label: string; granted: number; total: number }[] =
      [{ id: SECCIONES_AREA, label: 'Secciones visibles', granted: secGranted, total: SECTIONS.length }]
    for (const [group, fns] of functionGroups) {
      list.push({ id: group, label: group, granted: fns.filter(f => caps[f.key]?.on).length, total: fns.length })
    }
    return list
  }, [caps, functionGroups])

  const currentFns = area === SECCIONES_AREA ? [] : (functionGroups.find(([g]) => g === area)?.[1] ?? [])

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" onClick={requestClose}>
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-150 ${entered ? 'opacity-100' : 'opacity-0'}`} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Permisos de ${user.full_name ?? user.email}`}
        onKeyDown={handleKeyDown}
        className={`relative bg-gray-50 rounded-2xl shadow-2xl w-full max-w-3xl h-[88vh] flex flex-col overflow-hidden transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex-shrink-0 px-6 pt-4 pb-3 bg-white border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-gray-900 truncate">Permisos · {user.full_name ?? user.email}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Tipo base actual: <span className="font-medium">{ROLE_LABELS[user.role]}</span>
              {' · '}{grantedCount} capacidad{grantedCount === 1 ? '' : 'es'} concedida{grantedCount === 1 ? '' : 's'}
            </p>
          </div>
          <button onClick={requestClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100" aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3l10 10M13 3L3 13" strokeLinecap="round"/></svg>
          </button>
        </header>

        {/* Barra: aplicar tipo base */}
        <div className="flex-shrink-0 flex items-center gap-2 flex-wrap bg-white border-b border-gray-200 px-6 py-2.5">
          <span className="text-xs text-gray-500">Rellenar desde un tipo base:</span>
          {(['admin', 'editor', 'regional', 'viewer'] as UserRole[]).map(r => (
            <button
              key={r}
              type="button"
              disabled={loading || saving}
              onClick={() => setCaps(capsFromPreset(r, user.region_cods))}
              className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors disabled:opacity-40"
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
          <span className="text-[11px] text-gray-400 ml-auto">Luego ajustá cada permiso a mano</span>
        </div>

        {/* Body: master-detail (áreas a la izquierda, funciones a la derecha) */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Cargando permisos…</div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* Nav de áreas */}
            <nav className="w-56 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto py-2">
              {areas.map(a => {
                const active = area === a.id
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setArea(a.id)}
                    className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                      active ? 'bg-violet-50 text-violet-800 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="truncate">{a.label}</span>
                    <span className={`text-[10px] tabular-nums flex-shrink-0 ${a.granted > 0 ? (active ? 'text-violet-700' : 'text-violet-600') : 'text-gray-300'}`}>
                      {a.granted}/{a.total}
                    </span>
                  </button>
                )
              })}
            </nav>

            {/* Detalle del área */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error && <Alert variant="error" className="mb-4" onClose={() => setError(null)}>{error}</Alert>}

              {area === SECCIONES_AREA ? (
                <div>
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-gray-900">Secciones visibles</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Qué pestañas del panel ve este usuario. Los datos dentro de cada sección se acotan con las funciones y su alcance por región.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {SECTIONS.map(s => (
                      <label key={s.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={caps[s.key]?.on ?? false} onChange={() => toggle(s.key)} disabled={saving}
                          className="rounded border-gray-300 text-violet-700 focus:ring-violet-400" />
                        <span className={`text-xs ${caps[s.key]?.on ? 'text-gray-800' : 'text-gray-500'}`}>{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-gray-900">{area}</h4>
                    <div className="flex gap-1.5">
                      <button type="button" disabled={saving}
                        onClick={() => setCaps(prev => { const n = { ...prev }; for (const f of currentFns) n[f.key] = { ...n[f.key], on: true }; return n })}
                        className="text-[11px] px-2 py-0.5 border border-gray-200 rounded text-gray-500 hover:text-violet-700 hover:border-violet-300 disabled:opacity-40">
                        Todo
                      </button>
                      <button type="button" disabled={saving}
                        onClick={() => setCaps(prev => { const n = { ...prev }; for (const f of currentFns) n[f.key] = { ...n[f.key], on: false }; return n })}
                        className="text-[11px] px-2 py-0.5 border border-gray-200 rounded text-gray-500 hover:text-gray-700 disabled:opacity-40">
                        Nada
                      </button>
                    </div>
                  </div>
                  {singleRegion && (
                    <p className="text-[11px] text-gray-400 mb-2">
                      El acceso queda acotado a la región asignada del usuario
                      {' ('}{REGIONS.find(r => r.cod === footprint[0])?.nombre ?? footprint[0]}{'). '}
                      Cada permiso es solo sí/no.
                    </p>
                  )}
                  <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50 overflow-hidden">
                    {currentFns.map(f => {
                      const st = caps[f.key] ?? { on: false, mode: 'all' as const, cods: [] }
                      // El picker de región solo aparece para capacidades OPERATIVAS
                      // de usuarios con más de una región (o todas). Una sola región
                      // o cap global → sí/no (la región ya está fijada por su acceso).
                      const showPicker = st.on && !isGlobalCap(f.key) && !singleRegion
                      return (
                        <div key={f.key} className="flex items-center gap-3 px-4 py-2.5">
                          <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                            <input type="checkbox" checked={st.on} onChange={() => toggle(f.key)} disabled={saving}
                              className="rounded border-gray-300 text-violet-700 focus:ring-violet-400" />
                            <span className={`text-xs ${st.on ? 'text-gray-800' : 'text-gray-400'}`}>{f.label}</span>
                          </label>
                          {showPicker && (
                            <RegionScope
                              state={st} disabled={saving}
                              regions={pickerRegions} allowWildcard={allowWildcard}
                              onChange={next => setScope(f.key, next)}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="flex-shrink-0 px-6 py-3 bg-white border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={requestClose} disabled={saving}
            className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || loading}
            className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar permisos'}
          </button>
        </footer>
      </div>
    </div>
  )
}
