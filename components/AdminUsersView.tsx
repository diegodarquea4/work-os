'use client'

import { useState, useEffect, useRef } from 'react'
import { REGIONS } from '@/lib/regions'
import type { UserRole } from '@/lib/apiAuth'
import PlanesRegionalesPanel from './PlanesRegionalesPanel'

type UserRow = {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  region_cods: string[]
  created_at: string
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin:    'Administrador',
  editor:   'Editor',
  regional: 'Regional',
  viewer:   'Solo lectura',
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin:    'bg-red-100 text-red-700',
  editor:   'bg-blue-100 text-blue-700',
  regional: 'bg-teal-100 text-teal-700',
  viewer:   'bg-gray-100 text-gray-600',
}

/** Inline multi-region picker for regional users — uses fixed positioning to escape overflow:hidden */
function RegionPicker({
  value,
  disabled,
  onChange,
}: {
  value: string[]
  disabled: boolean
  onChange: (cods: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState<{ top: number; left: number } | null>(null)
  const btnRef          = useRef<HTMLButtonElement>(null)
  const menuRef         = useRef<HTMLDivElement>(null)

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
    const menuH = Math.min(REGIONS.length * 36, 256)
    const top = window.innerHeight - rect.bottom < menuH
      ? rect.top - menuH - 4
      : rect.bottom + 4
    setPos({ top, left: rect.left })
    setOpen(true)
  }

  function toggle(cod: string) {
    onChange(value.includes(cod) ? value.filter(c => c !== cod) : [...value, cod])
  }

  const label = value.length === 0
    ? '— Sin asignar —'
    : value.length === 1
      ? (REGIONS.find(r => r.cod === value[0])?.nombre ?? value[0])
      : `${value.length} regiones`

  return (
    <div>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 hover:border-gray-300 disabled:opacity-50 disabled:cursor-default min-w-[130px] justify-between"
      >
        <span>{label}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1.5 3L4 5.5L6.5 3"/>
        </svg>
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-52 max-h-64 overflow-y-auto"
        >
          {REGIONS.map(r => (
            <label key={r.cod} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={value.includes(r.cod)}
                onChange={() => toggle(r.cod)}
                className="rounded border-gray-300 text-slate-700 focus:ring-slate-400"
              />
              <span className="text-xs text-gray-700">{r.nombre}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminUsersView() {
  const [users, setUsers]     = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  // Invite modal
  const [showInvite, setShowInvite]     = useState(false)
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviteName, setInviteName]     = useState('')
  const [inviteRole, setInviteRole]     = useState<UserRole>('viewer')
  const [inviteRegions, setInviteRegions] = useState<string[]>([])
  const [inviting, setInviting]         = useState(false)
  const [inviteError, setInviteError]   = useState<string | null>(null)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  async function handleRoleChange(id: string, role: UserRole) {
    setSaving(id)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (res.ok) {
      setUsers(prev => prev.map(u =>
        u.id === id
          ? { ...u, role, region_cods: (role !== 'regional' && role !== 'viewer') ? [] : u.region_cods }
          : u
      ))
    } else { setError('Error al actualizar rol') }
    setSaving(null)
  }

  async function handleRegionsChange(id: string, region_cods: string[]) {
    setSaving(id)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region_cods }),
    })
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === id ? { ...u, region_cods } : u))
    } else { setError('Error al actualizar regiones') }
    setSaving(null)
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`¿Eliminar el acceso de ${email}?`)) return
    setSaving(id)
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== id))
    } else {
      const body = await res.json()
      setError(body.error ?? 'Error al eliminar usuario')
    }
    setSaving(null)
  }

  async function handleResetPassword(id: string, email: string) {
    if (!confirm(`Resetear la clave de ${email} a "DCI2026"?`)) return
    setSaving(id)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_password: true }),
    })
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Error al resetear contraseña')
    }
    setSaving(null)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteError(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        full_name: inviteName.trim() || undefined,
        role: inviteRole,
        region_cods: (inviteRole === 'regional' || inviteRole === 'viewer') ? inviteRegions : [],
      }),
    })
    if (res.ok) {
      setShowInvite(false)
      setInviteEmail(''); setInviteName(''); setInviteRole('viewer'); setInviteRegions([])
      await loadUsers()
    } else {
      const body = await res.json()
      setInviteError(body.error ?? 'Error al invitar usuario')
    }
    setInviting(false)
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-8 py-5 bg-white border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Gestión de Usuarios</h2>
          <p className="text-sm text-gray-500 mt-0.5">Administra accesos y roles del sistema</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M7 2v10M2 7h10"/>
          </svg>
          Agregar usuario
        </button>
      </div>

      {error && (
        <div className="mx-8 mt-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Cargando usuarios...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Regiones asignadas</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-900">{u.full_name ?? u.email}</div>
                      {u.full_name && <div className="text-xs text-gray-400">{u.email}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                        <select
                          value={u.role}
                          disabled={saving === u.id}
                          onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-50"
                        >
                          <option value="admin">Administrador</option>
                          <option value="editor">Editor</option>
                          <option value="regional">Regional</option>
                          <option value="viewer">Solo lectura</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {(u.role === 'regional' || u.role === 'viewer') ? (
                        <RegionPicker
                          value={u.region_cods}
                          disabled={saving === u.id}
                          onChange={cods => handleRegionsChange(u.id, cods)}
                        />
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleResetPassword(u.id, u.email)}
                          disabled={saving === u.id}
                          className="p-1.5 text-gray-300 hover:text-amber-500 transition-colors rounded hover:bg-amber-50 disabled:opacity-40"
                          title="Resetear clave a DCI2026"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <rect x="3" y="6" width="8" height="6" rx="1"/><path d="M5 6V4a2 2 0 0 1 4 0v2"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.email)}
                          disabled={saving === u.id}
                          className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded hover:bg-red-50 disabled:opacity-40"
                          title="Eliminar acceso"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M2 4h10M5 4V2h4v2M5.5 7v4M8.5 7v4M3 4l1 8h6l1-8"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PlanesRegionalesPanel />
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
              <span className="text-white font-semibold">Agregar usuario</span>
              <button onClick={() => setShowInvite(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleInvite} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico *</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  required
                  placeholder="usuario@interior.gob.cl"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  placeholder="Ana Torres"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
                <select
                  value={inviteRole}
                  onChange={e => { setInviteRole(e.target.value as UserRole); setInviteRegions([]) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="admin">Administrador — acceso total + gestión de usuarios</option>
                  <option value="editor">Editor — acceso total de edición</option>
                  <option value="regional">Regional — edita solo sus regiones asignadas</option>
                  <option value="viewer">Solo lectura — sin edición</option>
                </select>
              </div>
              {(inviteRole === 'regional' || inviteRole === 'viewer') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Regiones asignadas{' '}
                    {inviteRegions.length === 0
                      ? <span className="text-gray-400 font-normal text-xs">(vacío = ve todas las regiones)</span>
                      : <span className="text-teal-600 font-normal">({inviteRegions.length} seleccionadas)</span>
                    }
                  </label>
                  <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                    {REGIONS.map(r => (
                      <label key={r.cod} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                        <input
                          type="checkbox"
                          checked={inviteRegions.includes(r.cod)}
                          onChange={() => setInviteRegions(prev =>
                            prev.includes(r.cod) ? prev.filter(c => c !== r.cod) : [...prev, r.cod]
                          )}
                          className="rounded border-gray-300 text-slate-700 focus:ring-slate-400"
                        />
                        <span className="text-sm text-gray-700">{r.nombre}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-700">
                  El usuario quedará activo inmediatamente. <span className="font-semibold">Clave inicial: DCI2026</span>
                </p>
              </div>
              {inviteError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{inviteError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex-1 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {inviting ? 'Creando...' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
