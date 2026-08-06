'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { complexityOk } from '@/lib/passwordRules'
import NewPasswordFields from '@/components/NewPasswordFields'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // ── Activar cuenta / crear clave con código ──────────────────────────────────
  const [showActivate, setShowActivate] = useState(false)
  const [actEmail, setActEmail]     = useState('')
  const [actCode, setActCode]       = useState('')
  const [actPw, setActPw]           = useState('')
  const [actConfirm, setActConfirm] = useState('')
  const [actLoading, setActLoading] = useState(false)
  const [actError, setActError]     = useState<string | null>(null)
  const [actDone, setActDone]       = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await getSupabase().auth.signInWithPassword({ email, password })

    if (error) {
      setError('Correo o contraseña incorrectos.')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  function closeActivate() {
    if (actLoading) return
    if (actDone && actEmail) setEmail(actEmail)  // prefill login con el correo activado
    setShowActivate(false)
    setActCode(''); setActPw(''); setActConfirm(''); setActError(null); setActDone(false)
  }

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault()
    setActError(null)
    if (!complexityOk(actPw)) { setActError('La clave nueva no cumple los requisitos.'); return }
    if (actPw !== actConfirm) { setActError('Las claves no coinciden.'); return }
    setActLoading(true)
    const res = await fetch('/api/account/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: actEmail, codigo: actCode, password: actPw }),
    })
    setActLoading(false)
    if (res.ok) {
      setActDone(true)
    } else {
      const b = await res.json().catch(() => ({})) as { error?: string }
      setActError(b.error ?? 'No se pudo activar la cuenta.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm px-4">
        <div className="mb-8 text-center">
          <img src="/logo-ministerio.jpg" alt="Ministerio del Interior" className="h-20 w-auto rounded-xl shadow-sm mx-auto mb-5" />
          <h1 className="text-xl font-bold text-gray-900">Panel Seguimiento Gubernamental</h1>
          <p className="text-sm text-gray-500 mt-1">Regiones · PSG</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 px-8 py-8 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="usuario@interior.gob.cl"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>

          <button
            type="button"
            onClick={() => { setActEmail(email); setShowActivate(true) }}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            ¿Tienes un código? Activa tu cuenta o crea tu clave
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Ministerio del Interior
        </p>
      </div>

      {/* ── Modal Activar cuenta / crear clave ─────────────────────────────────── */}
      {showActivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeActivate}>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-gray-900">Activar cuenta / crear clave</p>
                <p className="text-xs text-gray-500 mt-0.5">Con el código que te entregó un administrador.</p>
              </div>
              <button onClick={closeActivate} disabled={actLoading} className="text-gray-400 hover:text-gray-600 disabled:opacity-50" title="Cerrar">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l12 12M16 4L4 16"/></svg>
              </button>
            </div>

            {actDone ? (
              <div className="px-6 py-8 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-600"><path d="M4 11l5 5 9-11" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">Clave creada</h3>
                <p className="text-sm text-slate-600 leading-relaxed">Ahora inicia sesión con tu correo y tu nueva clave.</p>
                <button onClick={closeActivate} className="mt-6 px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700">Ir a iniciar sesión</button>
              </div>
            ) : (
              <form onSubmit={handleActivate} className="px-6 py-5 space-y-3">
                <input
                  type="email" value={actEmail} onChange={e => setActEmail(e.target.value)} required
                  autoComplete="email" placeholder="Correo electrónico"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <input
                  type="text" value={actCode} onChange={e => setActCode(e.target.value)} required
                  autoComplete="one-time-code" placeholder="Código de acceso"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <NewPasswordFields password={actPw} setPassword={setActPw} confirm={actConfirm} setConfirm={setActConfirm} disabled={actLoading} />

                {actError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg leading-relaxed">{actError}</p>}

                <button
                  type="submit"
                  disabled={actLoading}
                  className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50"
                >
                  {actLoading ? 'Activando...' : 'Crear clave y activar'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
