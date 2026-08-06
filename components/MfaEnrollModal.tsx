'use client'

/**
 * Overlay bloqueante de enrolamiento de verificación en dos pasos (TOTP).
 * Se muestra cuando la sesión no tiene un factor verificado y el 2FA es
 * obligatorio (decisión Diego 2026-08-06). Mismo patrón que el overlay de
 * cambio de clave forzado (CambiarClaveModal 'forzado'): no se puede cerrar;
 * al verificar, la sesión sube a aal2 y se recarga la página.
 *
 * Usa la MFA nativa de Supabase (@supabase/auth-js): enroll → challengeAndVerify.
 * Antes de enrolar limpia factores TOTP `unverified` viejos (intentos
 * abandonados dejan uno colgado y enroll fallaría por friendly_name repetido).
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

const FRIENDLY_NAME = 'Panel PSG'

export default function MfaEnrollModal() {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr]         = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode]     = useState('')
  const [preparing, setPreparing] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const preparar = useCallback(async () => {
    setPreparing(true)
    setError(null)
    const mfa = getSupabase().auth.mfa
    // Limpia factores TOTP a medio enrolar (unverified) de intentos previos.
    const { data: list } = await mfa.listFactors()
    const stale = (list?.all ?? []).filter(f => f.factor_type === 'totp' && f.status === 'unverified')
    for (const f of stale) await mfa.unenroll({ factorId: f.id })

    const { data, error: enrollErr } = await mfa.enroll({ factorType: 'totp', friendlyName: FRIENDLY_NAME })
    if (enrollErr || !data) {
      setError('No se pudo iniciar la configuración. Recarga la página e inténtalo de nuevo.')
      setPreparing(false)
      return
    }
    setFactorId(data.id)
    setQr(data.totp.qr_code)
    setSecret(data.totp.secret)
    setPreparing(false)
  }, [])

  useEffect(() => { preparar() }, [preparar])

  async function verificar(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    const limpio = code.replace(/\D/g, '')
    if (limpio.length !== 6) { setError('Ingresa el código de 6 dígitos de tu app.'); return }
    setVerifying(true)
    setError(null)
    const { error: verErr } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code: limpio })
    if (verErr) {
      setError('Código incorrecto o expirado. Revisa tu app e inténtalo de nuevo.')
      setVerifying(false)
      setCode('')
      return
    }
    // Sesión promovida a aal2. Recargar → /api/me y el gate ven la sesión ya
    // verificada y muestran el panel.
    window.location.reload()
  }

  async function copiarSecreto() {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* sin portapapeles: el usuario copia a mano */ }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <p className="text-base font-semibold text-gray-900">Configura la verificación en dos pasos</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Por seguridad, tu cuenta necesita un segundo factor para continuar.
          </p>
        </div>

        {preparing ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">Preparando el código…</div>
        ) : error && !qr ? (
          <div className="px-6 py-8 text-center space-y-4">
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg leading-relaxed">{error}</p>
            <button onClick={preparar} className="px-5 py-2 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800">
              Reintentar
            </button>
          </div>
        ) : (
          <form onSubmit={verificar} className="px-6 py-5 space-y-4">
            <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside leading-relaxed">
              <li>Instala una app autenticadora (Google Authenticator, Authy, 1Password).</li>
              <li>Escanea este código QR con la app.</li>
              <li>Ingresa el código de 6 dígitos que muestra.</li>
            </ol>

            {qr && (
              <div className="flex justify-center">
                {/* qr_code es un data-URI SVG que devuelve Supabase */}
                <img src={qr} alt="Código QR para la app autenticadora" className="w-44 h-44 rounded-lg border border-gray-200" />
              </div>
            )}

            {secret && (
              <div className="text-center">
                <p className="text-[11px] text-gray-400 mb-1">¿No puedes escanear? Ingresa esta clave en la app:</p>
                <button
                  type="button"
                  onClick={copiarSecreto}
                  className="font-mono text-xs tracking-wider text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-100"
                  title="Copiar"
                >
                  {secret} {copied ? '✓' : ''}
                </button>
              </div>
            )}

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-center text-lg tracking-[0.4em] font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-transparent"
            />

            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg leading-relaxed">{error}</p>}

            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="w-full py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? 'Verificando…' : 'Activar verificación en dos pasos'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
