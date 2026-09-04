'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { complexityOk } from '@/lib/passwordRules'
import NewPasswordFields from '@/components/NewPasswordFields'

/** ID del factor TOTP verificado de la sesión actual (para pedir el código). */
async function factorTotpVerificado(): Promise<string | null> {
  const { data } = await getSupabase().auth.mfa.listFactors()
  return (data?.all ?? []).find(f => f.factor_type === 'totp' && f.status === 'verified')?.id ?? null
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // ── Segundo paso: código del autenticador ────────────────────────────────────
  // 'codigo' cuando la contraseña fue correcta pero falta el segundo factor —
  // sea por un login recién hecho o porque el proxy mandó acá una sesión a la
  // que le falta completarlo.
  const [paso, setPaso]             = useState<'clave' | 'codigo' | 'respaldo'>('clave')
  const [factorId, setFactorId]     = useState<string | null>(null)
  const [codigo, setCodigo]         = useState('')
  const [codigoLoading, setCodigoLoading] = useState(false)
  const [codigoError, setCodigoError]     = useState<string | null>(null)
  const [respaldo, setRespaldo]     = useState('')

  useEffect(() => {
    let cancelado = false
    getSupabase().auth.mfa.getAuthenticatorAssuranceLevel().then(async ({ data }) => {
      if (cancelado || !data) return
      if (data.currentLevel === 'aal1' && data.nextLevel === 'aal2') {
        const fid = await factorTotpVerificado()
        if (!cancelado && fid) { setFactorId(fid); setPaso('codigo') }
      }
    }).catch(() => { /* sin sesión: se queda en el paso de la clave */ })
    return () => { cancelado = true }
  }, [])

  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    const limpio = codigo.replace(/\D/g, '')
    if (limpio.length !== 6) { setCodigoError('Ingresa los 6 dígitos de tu app.'); return }
    setCodigoLoading(true)
    setCodigoError(null)
    const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code: limpio })
    if (error) {
      setCodigoError('Código incorrecto o vencido. Cambian cada 30 segundos: prueba con el siguiente.')
      setCodigoLoading(false)
      setCodigo('')
      return
    }
    router.push('/')
    router.refresh()
  }

  async function usarCodigoDeRespaldo(e: React.FormEvent) {
    e.preventDefault()
    if (!respaldo.trim()) return
    setCodigoLoading(true)
    setCodigoError(null)
    const res = await fetch('/api/account/mfa/recover', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ codigo: respaldo.trim() }),
    })
    setCodigoLoading(false)
    if (!res.ok) {
      const b = await res.json().catch(() => ({})) as { error?: string }
      setCodigoError(b.error ?? 'No se pudo validar el código de respaldo.')
      return
    }
    // El canje cierra todas las sesiones, incluida esta: hay que volver a
    // entrar, ahora solo con la clave.
    await getSupabase().auth.signOut().catch(() => {})
    setPaso('clave'); setPassword(''); setRespaldo(''); setFactorId(null)
    setError('Listo: tu verificación en dos pasos se desactivó. Entra con tu clave y vuelve a configurarla.')
  }

  function volverAlLogin() {
    getSupabase().auth.signOut().catch(() => {})
    setPaso('clave'); setCodigo(''); setRespaldo(''); setCodigoError(null)
    setFactorId(null); setPassword('')
  }

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
      return
    }

    // Clave correcta. Si la cuenta tiene un factor verificado, la sesión quedó
    // en aal1 y falta el código. Si no tiene, entra directo: el panel se encarga
    // de invitarla (o exigirle) configurar el 2FA según la política.
    //
    // Envuelto en try/catch a propósito: este es el camino de ingreso de todo el
    // ministerio. Si la consulta del nivel de garantía falla (red, servicio de
    // Auth con problemas), NO se puede dejar al usuario con el botón girando —
    // se sigue al panel. Nadie se cuela por esto: quien tenga un factor
    // pendiente lo ataja el gate de proxy.ts, que es el control duro.
    try {
      const { data: aal } = await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
        const fid = await factorTotpVerificado()
        if (fid) {
          setFactorId(fid)
          setPaso('codigo')
          setLoading(false)
          return
        }
      }
    } catch { /* se continúa al panel; el gate del proxy decide */ }

    router.push('/')
    router.refresh()
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

        {paso === 'clave' && (
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
        )}

        {/* Paso 2 — código del autenticador */}
        {paso === 'codigo' && (
        <form onSubmit={verificarCodigo} className="bg-white rounded-2xl shadow-sm border border-gray-200 px-8 py-8 space-y-5">
          <div>
            <label htmlFor="mfa-login-codigo" className="block text-sm font-medium text-gray-700 mb-1.5">
              Verificación en dos pasos
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Abre tu app autenticadora y escribe los 6 dígitos que muestra.
            </p>
            <input
              id="mfa-login-codigo"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-center text-lg tracking-[0.4em] font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </div>

          {codigoError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{codigoError}</p>}

          <button
            type="submit"
            disabled={codigoLoading || codigo.length !== 6}
            className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {codigoLoading ? 'Verificando...' : 'Verificar e ingresar'}
          </button>

          <button
            type="button"
            onClick={() => { setPaso('respaldo'); setCodigoError(null) }}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            No tengo mi teléfono a mano
          </button>
          <button type="button" onClick={volverAlLogin} className="w-full text-center text-xs text-slate-400 hover:text-slate-700 transition-colors">
            Volver
          </button>
        </form>
        )}

        {/* Paso 2b — código de respaldo */}
        {paso === 'respaldo' && (
        <form onSubmit={usarCodigoDeRespaldo} className="bg-white rounded-2xl shadow-sm border border-gray-200 px-8 py-8 space-y-5">
          <div>
            <label htmlFor="mfa-respaldo" className="block text-sm font-medium text-gray-700 mb-1.5">
              Código de respaldo
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Usa uno de los códigos que guardaste al configurar la verificación.
              Sirve una sola vez y desactivará el segundo factor: vas a tener que
              volver a configurarlo al entrar.
            </p>
            <input
              id="mfa-respaldo"
              type="text"
              autoFocus
              value={respaldo}
              onChange={e => setRespaldo(e.target.value.toUpperCase())}
              placeholder="XXXXXXXXXX"
              maxLength={20}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-center tracking-[0.2em] font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </div>

          {codigoError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{codigoError}</p>}

          <button
            type="submit"
            disabled={codigoLoading || !respaldo.trim()}
            className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {codigoLoading ? 'Validando...' : 'Usar código de respaldo'}
          </button>

          <button
            type="button"
            onClick={() => { setPaso('codigo'); setCodigoError(null) }}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            Volver al código de la app
          </button>
          <p className="text-center text-[11px] text-gray-400 leading-relaxed">
            ¿Tampoco tienes los códigos de respaldo? Pídele a un administrador
            del panel que reinicie tu verificación en dos pasos.
          </p>
        </form>
        )}

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
