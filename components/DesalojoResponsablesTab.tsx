'use client'

import { useEffect, useMemo, useState } from 'react'
import type {
  DesalojoCapa,
  DesalojoResponsable,
} from '@/lib/types'
import { TIPOLOGIA_CFG, getCapaColor, getRoles, type RolCfg } from '@/lib/desalojos'
import DesalojoCapaSelector from './DesalojoCapaSelector'
import DesalojoTipologiaChip from './DesalojoTipologiaChip'

/**
 * Tab Responsables: una ficha por rol vigente de la tipología de la capa.
 *
 * Cada rol acepta: nombre, institución, email, teléfono, notas.
 * Persistencia: JSONB en desalojo_capas.responsables, shallow merge en server
 * vía PATCH /api/desalojos/[n]/capas/[capa_id] con `{ responsables_patch }`.
 *
 * Si la capa no tiene tipología, se pide asignar primero. Si la tipología
 * cambió y hay roles huérfanos en el JSONB, se muestran en una sección
 * separada "Huérfanos del régimen anterior" con opción de eliminar.
 */

type Props = {
  capas:          DesalojoCapa[]
  selectedCapaId: number | null
  onSelectCapa:   (capaId: number) => void
  onPatchResponsable: (
    capaId: number,
    rolKey: string,
    value: DesalojoResponsable | null,
  ) => Promise<void>
}

export default function DesalojoResponsablesTab({
  capas, selectedCapaId, onSelectCapa, onPatchResponsable,
}: Props) {
  const activas = capas.filter(c => c.activa)
  const capa    = activas.find(c => c.id === selectedCapaId) ?? activas[0] ?? null

  useEffect(() => {
    if (activas.length > 0 && !activas.find(c => c.id === selectedCapaId)) {
      onSelectCapa(activas[0].id)
    }
  }, [activas, selectedCapaId, onSelectCapa])

  if (activas.length === 0) {
    return (
      <div className="p-6 text-center bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-sm text-amber-800 font-semibold">Sin capas activas</p>
        <p className="text-xs text-amber-700 mt-1">Crea una capa desde la pestaña Contexto para definir responsables.</p>
      </div>
    )
  }
  if (!capa) return null

  return (
    <div className="space-y-4">
      <DesalojoCapaSelector capas={activas} selectedId={capa.id} onSelect={onSelectCapa} />
      <CapaResponsables key={capa.id} capa={capa} onPatchResponsable={onPatchResponsable} />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────

function CapaResponsables({
  capa, onPatchResponsable,
}: {
  capa: DesalojoCapa
  onPatchResponsable: (capaId: number, rolKey: string, value: DesalojoResponsable | null) => Promise<void>
}) {
  const roles = getRoles(capa.tipologia)
  const color = getCapaColor(capa.orden)
  const responsables = useMemo(() => capa.responsables ?? {}, [capa.responsables])

  const huerfanos = useMemo(() => {
    const rolesKeys = new Set(roles.map(r => r.key))
    return Object.entries(responsables)
      .filter(([k]) => !rolesKeys.has(k))
      .map(([k, v]) => ({ key: k, value: v }))
  }, [roles, responsables])

  if (!capa.tipologia) {
    return (
      <section className="border border-gray-200 rounded-xl bg-gray-50 px-4 py-6 text-center">
        <p className="text-sm text-gray-700 font-semibold">Sin tipología asignada</p>
        <p className="text-xs text-gray-500 mt-1 leading-snug">
          Asigna una tipología a la capa <span className="font-semibold">{capa.nombre}</span> desde la pestaña Avance
          para definir los responsables que corresponden.
        </p>
      </section>
    )
  }

  return (
    <>
      {/* Cabecera */}
      <section className="border border-gray-200 rounded-xl bg-white px-4 py-3">
        <div className="flex items-start gap-3 flex-wrap">
          <span className={`mt-1 inline-block w-3 h-3 rounded-full ${color.dotBg}`} title={`Color de capa: ${capa.nombre}`} />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900">{capa.nombre}</h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              {TIPOLOGIA_CFG[capa.tipologia].label} · {roles.length} rol{roles.length === 1 ? '' : 'es'} definido{roles.length === 1 ? '' : 's'} para esta tipología.
            </p>
          </div>
          <DesalojoTipologiaChip tipologia={capa.tipologia} size="sm" />
        </div>
      </section>

      {/* Roles vigentes */}
      <div className="space-y-3">
        {roles.map(rol => (
          <RolCard
            key={rol.key}
            rol={rol}
            value={responsables[rol.key] ?? null}
            onSave={(value) => onPatchResponsable(capa.id, rol.key, value)}
          />
        ))}
      </div>

      {/* Huérfanos */}
      {huerfanos.length > 0 && (
        <section className="border border-amber-200 rounded-xl bg-amber-50 px-4 py-3">
          <h4 className="text-xs font-bold text-amber-900 mb-1">Huérfanos del régimen anterior</h4>
          <p className="text-[11px] text-amber-800 mb-2 leading-snug">
            La tipología de la capa cambió y estos roles ya no aplican. Quedan registrados por trazabilidad;
            puedes eliminarlos cuando ya no los necesites.
          </p>
          <ul className="divide-y divide-amber-200">
            {huerfanos.map(({ key, value }) => (
              <li key={key} className="py-2 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">{value.nombre}</p>
                  <p className="text-[11px] text-gray-500 leading-tight">
                    rol: {key}
                    {value.institucion && <> · {value.institucion}</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onPatchResponsable(capa.id, key, null)}
                  className="text-[11px] text-amber-800 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-amber-100"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────

function RolCard({
  rol, value, onSave,
}: {
  rol:     RolCfg
  value:   DesalojoResponsable | null
  onSave:  (value: DesalojoResponsable | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DesalojoResponsable>(
    value ?? { nombre: '', institucion: null, email: null, telefono: null, notas: null },
  )
  const [busy, setBusy] = useState(false)

  // Reset draft si cambia el value externo (otra capa, optimistic update).
  useEffect(() => {
    setDraft(value ?? { nombre: '', institucion: null, email: null, telefono: null, notas: null })
  }, [value])

  function start() {
    setDraft(value ?? { nombre: '', institucion: null, email: null, telefono: null, notas: null })
    setEditing(true)
  }

  async function commit() {
    const nombre = draft.nombre.trim()
    if (!nombre) {
      window.alert('El nombre es requerido.')
      return
    }
    setBusy(true)
    try {
      await onSave({
        nombre,
        institucion: draft.institucion?.trim() || null,
        email:       draft.email?.trim()       || null,
        telefono:    draft.telefono?.trim()    || null,
        notas:       draft.notas?.trim()       || null,
      })
      setEditing(false)
    } finally { setBusy(false) }
  }

  async function clear() {
    if (!window.confirm(`¿Eliminar el responsable de "${rol.label}"?`)) return
    setBusy(true)
    try { await onSave(null) }
    finally { setBusy(false) }
  }

  const tieneValor = value !== null

  return (
    <section className="border border-gray-200 rounded-xl bg-white px-4 py-3">
      <header className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-900 leading-tight">
            {rol.label}
            {rol.required && <span className="text-rose-500 ml-1" title="Rol obligatorio">*</span>}
          </h4>
          {rol.descripcion && (
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{rol.descripcion}</p>
          )}
        </div>
        {!editing && tieneValor && (
          <button type="button" onClick={start}
            className="text-xs text-slate-600 hover:text-slate-900 font-medium flex-shrink-0">
            Editar
          </button>
        )}
        {!editing && !tieneValor && (
          <button type="button" onClick={start}
            className="text-xs px-2.5 py-1 rounded bg-slate-900 text-white hover:bg-slate-700 font-medium flex-shrink-0">
            + Asignar
          </button>
        )}
      </header>

      {editing ? (
        <div className="space-y-2">
          <Field label="Nombre" required>
            <input
              autoFocus
              value={draft.nombre}
              onChange={e => setDraft({ ...draft, nombre: e.target.value })}
              placeholder="Nombre completo"
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Field label="Institución">
              <input
                value={draft.institucion ?? ''}
                onChange={e => setDraft({ ...draft, institucion: e.target.value })}
                placeholder="Ej. SERVIU Antofagasta"
                className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={draft.email ?? ''}
                onChange={e => setDraft({ ...draft, email: e.target.value })}
                placeholder="nombre@institucion.cl"
                className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </Field>
            <Field label="Teléfono">
              <input
                value={draft.telefono ?? ''}
                onChange={e => setDraft({ ...draft, telefono: e.target.value })}
                placeholder="+56 9 ..."
                className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </Field>
          </div>
          <Field label="Notas">
            <textarea
              value={draft.notas ?? ''}
              onChange={e => setDraft({ ...draft, notas: e.target.value })}
              rows={2}
              placeholder="Notas internas (opcional)"
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </Field>
          <div className="flex gap-2 justify-end pt-1">
            {tieneValor && (
              <button type="button" onClick={clear} disabled={busy}
                className="text-xs px-3 py-1.5 rounded text-rose-600 hover:bg-rose-50 mr-auto">
                Eliminar
              </button>
            )}
            <button type="button" onClick={() => setEditing(false)} disabled={busy}
              className="text-xs px-3 py-1.5 rounded text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
            <button type="button" onClick={commit} disabled={busy || !draft.nombre.trim()}
              className="text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 font-semibold">
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : tieneValor && value ? (
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <ReadField label="Nombre"      value={value.nombre} />
          <ReadField label="Institución" value={value.institucion} />
          <ReadField label="Email"       value={value.email} mono />
          <ReadField label="Teléfono"    value={value.telefono} mono />
          {value.notas && (
            <div className="md:col-span-2 pt-1">
              <dt className="text-gray-500">Notas</dt>
              <dd className="text-gray-700 whitespace-pre-wrap leading-snug mt-0.5">{value.notas}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-xs text-gray-400 italic">Sin asignar.</p>
      )}
    </section>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-gray-600 block mb-0.5">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}

function ReadField({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="text-gray-500 w-24 flex-shrink-0">{label}</dt>
      <dd className={`text-gray-800 ${mono ? 'font-mono text-[11px]' : ''} min-w-0 truncate`}>
        {value || <span className="text-gray-400">—</span>}
      </dd>
    </div>
  )
}
