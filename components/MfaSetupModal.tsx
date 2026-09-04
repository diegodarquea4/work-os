'use client'

/**
 * Configuración de la verificación en dos pasos, guiada en 4 pasos.
 *
 * Reemplaza al MfaEnrollModal de agosto (commit 4d164e3), que era una sola
 * pantalla con el QR y un campo, obligatoria y sin salida si perdías el
 * teléfono. Los cambios:
 *   1. Pasos separados, para que se entienda qué hay que hacer antes de ver el QR.
 *   2. Instrucciones concretas de Microsoft Authenticator (es el que usa la
 *      gente del ministerio), con las alternativas nombradas.
 *   3. Termina entregando CÓDIGOS DE RESPALDO: sin eso, perder el teléfono
 *      significaba depender de que un administrador estuviera disponible.
 *   4. Se puede cerrar salvo que la política de adopción ya esté en 'block'.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { MfaRazon } from '@/lib/mfaPolicy'

/**
 * Lo que la app autenticadora muestra como título de la cuenta (debajo pone el
 * correo). Va explícito porque, sin `issuer`, Supabase usa el host desde el que
 * se enroló: en desarrollo la gente veía «localhost» y en producción vería
 * «work-os-theta.vercel.app» — ninguno de los dos le dice nada a quien abre la
 * app entre veinte cuentas del trabajo.
 *
 * OJO: solo aplica a enrolamientos NUEVOS. El nombre queda grabado en el QR, así
 * que quien ya haya configurado el 2FA seguirá viendo el nombre viejo hasta que
 * borre la cuenta de su app y la vuelva a agregar.
 */
const ISSUER = 'PSG · Ministerio del Interior'

const FRIENDLY_NAME_BASE = 'Panel PSG'

type Paso = 'instalar' | 'escanear' | 'respaldo'

export default function MfaSetupModal({ bloqueante, razon = 'plazo', yaConfigurada = false, onClose, onListo }: {
  /** true → no se puede cerrar (la política ya lo exige para esta cuenta). */
  bloqueante: boolean
  /**
   * Por qué se está exigiendo. Solo cambia el texto: a una cuenta recién creada
   * se le da la bienvenida y se le explica el paso, en vez de anunciarle un
   * plazo que nunca vio pasar. Se ignora si `bloqueante` es false.
   */
  razon?: MfaRazon
  /**
   * true → la cuenta YA tiene un factor verificado. Se muestra la vista de
   * administración en vez de volver a enrolar: sin esto, abrir la pantalla
   * desde la tuerca creaba un SEGUNDO factor y dejaba la cuenta con dos
   * códigos válidos distintos.
   */
  yaConfigurada?: boolean
  onClose?: () => void
  onListo?: () => void
}) {
  const [paso, setPaso] = useState<Paso>('instalar')
  const [gestionando, setGestionando] = useState(yaConfigurada)

  // Enrolamiento
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr]             = useState<string | null>(null)
  const [secret, setSecret]     = useState<string | null>(null)
  const [preparando, setPreparando] = useState(false)
  const [codigo, setCodigo]     = useState('')
  const [verificando, setVerificando] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [copiado, setCopiado]   = useState(false)

  // Códigos de respaldo
  const [respaldo, setRespaldo] = useState<string[] | null>(null)
  const [errorRespaldo, setErrorRespaldo] = useState<string | null>(null)
  const [guardadosConfirmados, setGuardadosConfirmados] = useState(false)

  const preparar = useCallback(async () => {
    setPreparando(true)
    setError(null)
    const mfa = getSupabase().auth.mfa
    // Limpia factores a medio enrolar de intentos previos: si no, `enroll`
    // falla por nombre repetido y el usuario queda trabado sin entender.
    const { data: lista } = await mfa.listFactors()
    for (const f of (lista?.all ?? []).filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
      await mfa.unenroll({ factorId: f.id })
    }
    const { data, error: enrollErr } = await mfa.enroll({
      factorType: 'totp',
      issuer:       ISSUER,
      friendlyName: `${FRIENDLY_NAME_BASE} ${Date.now()}`,
    })
    if (enrollErr || !data) {
      setError('No se pudo iniciar la configuración. Recarga la página e inténtalo de nuevo.')
      setPreparando(false)
      return
    }
    setFactorId(data.id)
    setQr(data.totp.qr_code)
    setSecret(data.totp.secret)
    setPreparando(false)
  }, [])

  // El QR se pide al entrar al paso 2, no antes: si el usuario abandona en el
  // paso 1 no queda un factor sin verificar colgando.
  useEffect(() => { if (paso === 'escanear' && !factorId) preparar() }, [paso, factorId, preparar])

  async function verificar(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    const limpio = codigo.replace(/\D/g, '')
    if (limpio.length !== 6) { setError('Ingresa los 6 dígitos que muestra la app.'); return }
    setVerificando(true)
    setError(null)
    const { error: verErr } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code: limpio })
    if (verErr) {
      setError('Código incorrecto o vencido. Los códigos cambian cada 30 segundos: prueba con el siguiente.')
      setVerificando(false)
      setCodigo('')
      return
    }
    // Sesión ya en aal2 → recién ahora se pueden pedir los códigos de respaldo.
    setVerificando(false)
    setPaso('respaldo')
    pedirRespaldo()
  }

  async function pedirRespaldo() {
    setErrorRespaldo(null)
    const res = await fetch('/api/account/mfa/backup-codes', { method: 'POST' })
    if (!res.ok) {
      const b = await res.json().catch(() => ({})) as { error?: string }
      setErrorRespaldo(b.error ?? 'No se pudieron generar los códigos de respaldo.')
      return
    }
    const b = await res.json() as { codigos: string[] }
    setRespaldo(b.codigos)
  }

  function descargarRespaldo() {
    if (!respaldo) return
    const texto = [
      'Códigos de respaldo — Panel PSG',
      'Cada código sirve UNA vez, si no tienes tu teléfono a mano.',
      `Generados el ${new Date().toLocaleDateString('es-CL')}`,
      '',
      ...respaldo,
    ].join('\n')
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'codigos-respaldo-psg.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function copiarSecreto() {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch { /* sin portapapeles: se copia a mano */ }
  }

  function terminar() {
    if (onListo) onListo()
    else window.location.reload()
  }

  const puedeCerrar = !bloqueante && paso !== 'respaldo'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">

        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">
              {bloqueante && razon === 'cuenta-nueva'
                ? 'Un último paso para entrar'
                : 'Verificación en dos pasos'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {!bloqueante
                ? 'Un código que cambia cada 30 segundos, además de tu clave.'
                : razon === 'cuenta-nueva'
                  ? 'Las cuentas nuevas del panel se configuran así. Toma dos minutos.'
                  : 'Tu perfil ya requiere un segundo factor para entrar.'}
            </p>
          </div>
          {puedeCerrar && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Cerrar">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l12 12M16 4L4 16"/></svg>
            </button>
          )}
        </div>

        {/* Vista de administración: ya está configurada */}
        {gestionando && (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-600"><path d="M4 11l5 5 9-11" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <p className="text-sm font-semibold text-gray-900">Ya está activa en esta cuenta</p>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Cada vez que ingreses te vamos a pedir el código de tu app además de
              la clave.
            </p>
            <div className="rounded-xl border border-gray-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-800">Códigos de respaldo</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Si no encuentras los que guardaste, genera un juego nuevo: los
                anteriores dejan de servir.
              </p>
              <button
                onClick={() => { setGestionando(false); setPaso('respaldo'); pedirRespaldo() }}
                className="text-xs font-semibold text-violet-700 hover:text-violet-900"
              >
                Generar códigos nuevos
              </button>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              ¿Cambiaste de teléfono y ya no tienes la app? Pídele a un administrador
              del panel que reinicie tu verificación en dos pasos.
            </p>
            <button onClick={onClose} className="w-full py-2.5 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50">
              Cerrar
            </button>
          </div>
        )}

        {/* Progreso */}
        {!gestionando && (
        <div className="px-6 pt-4 flex items-center gap-1.5">
          {(['instalar', 'escanear', 'respaldo'] as Paso[]).map((p, i) => {
            const orden = ['instalar', 'escanear', 'respaldo']
            const activo = orden.indexOf(paso) >= i
            return <div key={p} className={`h-1 flex-1 rounded-full ${activo ? 'bg-violet-600' : 'bg-gray-200'}`} />
          })}
        </div>
        )}

        {/* Paso 1 — instalar */}
        {!gestionando && paso === 'instalar' && (
          <div className="px-6 py-5 space-y-4">
            {/* El "por qué", solo cuando no se puede saltar: si a alguien se le
                cierra el paso sin explicación, lo vive como un trámite. */}
            {bloqueante && (
              <p className="text-xs text-gray-700 leading-relaxed bg-violet-50 border border-violet-100 rounded-lg px-3 py-2.5">
                El panel tiene la cartera de las 16 regiones. Con esto activado, aunque
                alguien consiga tu clave no puede entrar sin tu teléfono.
              </p>
            )}
            <p className="text-sm font-semibold text-gray-900">1. Ten a mano una app autenticadora</p>
            <div className="rounded-xl border border-gray-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-800">Microsoft Authenticator</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Si ya la usas para tu correo institucional, sirve la misma: abre la app,
                toca <strong>+</strong> arriba a la derecha y elige <strong>Otra cuenta</strong>.
              </p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              También funcionan Google Authenticator, Authy o el gestor de contraseñas
              que ya uses. Cualquiera que genere códigos de 6 dígitos.
            </p>
            <button
              onClick={() => setPaso('escanear')}
              className="w-full py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800"
            >
              Ya la tengo, continuar
            </button>
          </div>
        )}

        {/* Paso 2 — escanear y confirmar */}
        {!gestionando && paso === 'escanear' && (
          <form onSubmit={verificar} className="px-6 py-5 space-y-4">
            <p className="text-sm font-semibold text-gray-900">2. Escanea el código</p>

            {preparando && <div className="py-10 text-center text-sm text-gray-500">Preparando el código…</div>}

            {!preparando && error && !qr && (
              <div className="py-6 text-center space-y-4">
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg leading-relaxed">{error}</p>
                <button type="button" onClick={preparar} className="px-5 py-2 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800">
                  Reintentar
                </button>
              </div>
            )}

            {qr && (
              <>
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="Código QR para la app autenticadora" className="w-44 h-44 rounded-lg border border-gray-200" />
                </div>
                {secret && (
                  <div className="text-center">
                    <p className="text-[11px] text-gray-400 mb-1">¿No puedes escanear? Escribe esta clave en la app:</p>
                    <button type="button" onClick={copiarSecreto}
                      className="font-mono text-xs tracking-wider text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-100">
                      {secret} {copiado ? '✓' : ''}
                    </button>
                  </div>
                )}
                <p className="text-center text-[11px] text-gray-400 leading-relaxed">
                  En tu app va a quedar como <span className="text-gray-600 font-medium">{ISSUER}</span>,
                  con tu correo debajo.
                </p>
                <div>
                  <label htmlFor="mfa-codigo" className="block text-xs text-gray-600 mb-1.5">
                    Escribe los 6 dígitos que aparecen en la app
                  </label>
                  <input
                    id="mfa-codigo"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={codigo}
                    onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-center text-lg tracking-[0.4em] font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-transparent"
                  />
                </div>
                {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg leading-relaxed">{error}</p>}
                <button type="submit" disabled={verificando || codigo.length !== 6}
                  className="w-full py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50 disabled:cursor-not-allowed">
                  {verificando ? 'Verificando…' : 'Confirmar'}
                </button>
              </>
            )}
          </form>
        )}

        {/* Paso 3 — códigos de respaldo */}
        {!gestionando && paso === 'respaldo' && (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-600"><path d="M4 11l5 5 9-11" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <p className="text-sm font-semibold text-gray-900">Listo. Guarda tus códigos de respaldo</p>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Si algún día no tienes tu teléfono a mano, cada uno de estos códigos
              te deja entrar <strong>una vez</strong>. Guárdalos en un lugar seguro:
              no vuelven a mostrarse.
            </p>

            {/* Salida de emergencia. Llegado acá el segundo factor YA quedó
                verificado: la cuenta está protegida y lo único que falta son los
                códigos, que se pueden generar después desde la tuerca. Sin este
                botón, alguien con la pantalla bloqueante y esta llamada fallando
                se quedaba encerrado con un solo botón de «Reintentar». */}
            {errorRespaldo && (
              <div className="space-y-2">
                <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg leading-relaxed">{errorRespaldo}</p>
                <div className="flex items-center gap-3">
                  <button onClick={pedirRespaldo} className="text-xs text-violet-700 hover:text-violet-900 font-medium">Reintentar</button>
                  <button onClick={terminar} className="text-xs text-gray-500 hover:text-gray-800">
                    Entrar sin ellos
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Tu verificación en dos pasos ya quedó activa. Los códigos de respaldo
                  los puedes generar más tarde desde la tuerca, en «Verificación en dos pasos».
                </p>
              </div>
            )}

            {!respaldo && !errorRespaldo && (
              <div className="py-6 text-center text-sm text-gray-500">Generando códigos…</div>
            )}

            {respaldo && (
              <>
                <ul className="grid grid-cols-2 gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                  {respaldo.map(c => (
                    <li key={c} className="font-mono text-xs tracking-wider text-gray-800 text-center py-1">{c}</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button onClick={descargarRespaldo}
                    className="flex-1 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50">
                    Descargar .txt
                  </button>
                  <button onClick={() => navigator.clipboard?.writeText(respaldo.join('\n'))}
                    className="flex-1 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50">
                    Copiar
                  </button>
                </div>
                <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={guardadosConfirmados}
                    onChange={e => setGuardadosConfirmados(e.target.checked)}
                    className="mt-0.5 accent-violet-700" />
                  Ya los guardé en un lugar seguro
                </label>
                <button onClick={terminar} disabled={!guardadosConfirmados}
                  className="w-full py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50 disabled:cursor-not-allowed">
                  Entrar al panel
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
