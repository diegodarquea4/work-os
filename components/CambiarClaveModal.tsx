'use client'

/**
 * Modal de cambio de clave. Dos modos:
 *   - 'forzado': bloqueante (no se puede cerrar), usado por el overlay de cambio
 *     obligatorio (debe_cambiar_clave). Al terminar recarga la página → el flag
 *     queda en false y el panel se muestra.
 *   - 'voluntario': el usuario lo abre desde el menú; se puede cerrar.
 * En ambos se pide la CLAVE ACTUAL (sin ella, una sesión robada permitía tomar
 * la cuenta para siempre) y la nueva se valida en el servidor — complejidad,
 * HIBP y distinta de la actual — vía POST /api/account/change-password.
 *
 * En modo 'forzado' el usuario recuerda su clave: el flujo para quien la olvidó
 * es Recuperación, con código de un solo uso.
 */

import { useState } from 'react'
import { complexityOk } from '@/lib/passwordRules'
import NewPasswordFields from './NewPasswordFields'

export default function CambiarClaveModal({ mode, onClose }: {
  mode: 'forzado' | 'voluntario'
  onClose?: () => void
}) {
  const [actual, setActual]   = useState('')
  const [pw, setPw]           = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState(false)
  const forzado = mode === 'forzado'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!actual)           { setError('Ingresa tu clave actual.'); return }
    if (!complexityOk(pw)) { setError('La clave nueva no cumple los requisitos.'); return }
    if (pw !== confirm)    { setError('Las claves no coinciden.'); return }
    setLoading(true)
    const res = await fetch('/api/account/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claveActual: actual, password: pw }),
    })
    setLoading(false)
    if (res.ok) {
      if (forzado) window.location.reload()  // recarga → /api/me sin el flag → panel
      else setDone(true)
    } else {
      const b = await res.json().catch(() => ({})) as { error?: string }
      setError(b.error ?? 'No se pudo cambiar la clave.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={forzado ? undefined : onClose}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">
              {forzado ? 'Debes crear una clave nueva' : 'Cambiar contraseña'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {forzado
                ? 'Un administrador solicitó que actualices tu clave antes de continuar.'
                : 'Elige una clave nueva distinta de la actual.'}
            </p>
          </div>
          {!forzado && (
            <button onClick={onClose} disabled={loading} className="text-gray-400 hover:text-gray-600 disabled:opacity-50" title="Cerrar">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l12 12M16 4L4 16"/></svg>
            </button>
          )}
        </div>

        {done && !forzado ? (
          <div className="px-6 py-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-600"><path d="M4 11l5 5 9-11" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Clave actualizada</h3>
            <button onClick={onClose} className="mt-4 px-5 py-2 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800">Cerrar</button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-6 py-5 space-y-3">
            <div>
              <label htmlFor="clave-actual" className="block text-sm font-medium text-gray-700 mb-1.5">
                Clave actual
              </label>
              <input
                id="clave-actual"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={actual}
                onChange={e => setActual(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-transparent disabled:opacity-50"
              />
            </div>
            <NewPasswordFields password={pw} setPassword={setPw} confirm={confirm} setConfirm={setConfirm} disabled={loading} />
            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg leading-relaxed">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar clave nueva'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
