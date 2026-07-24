'use client'

/**
 * Campos de "clave nueva + repetir" con checklist de requisitos en vivo. Controlado
 * por el padre (password/confirm). Compartido por: activar cuenta (login), overlay
 * de cambio obligatorio y cambio voluntario. La validación fuerte (HIBP) es
 * server-side; acá solo mostramos la complejidad para guiar al usuario.
 */

import { passwordChecks, PASSWORD_RULE_LABELS } from '@/lib/passwordRules'

const INPUT_CLS =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent disabled:opacity-50'

export default function NewPasswordFields({
  password, setPassword, confirm, setConfirm, disabled,
}: {
  password: string; setPassword: (s: string) => void
  confirm: string;  setConfirm: (s: string) => void
  disabled?: boolean
}) {
  const checks = passwordChecks(password)
  const noCoincide = confirm.length > 0 && confirm !== password

  return (
    <div className="space-y-2.5">
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        disabled={disabled}
        autoComplete="new-password"
        placeholder="Clave nueva"
        className={INPUT_CLS}
      />
      <ul className="grid grid-cols-1 gap-0.5">
        {PASSWORD_RULE_LABELS.map(r => {
          const ok = checks[r.key]
          return (
            <li key={r.key} className={`text-xs flex items-center gap-1.5 ${ok ? 'text-green-600' : 'text-gray-400'}`}>
              <span className="w-3 inline-block text-center">{ok ? '✓' : '○'}</span>
              {r.label}
            </li>
          )
        })}
      </ul>
      <input
        type="password"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        disabled={disabled}
        autoComplete="new-password"
        placeholder="Repetir clave nueva"
        className={INPUT_CLS}
      />
      {noCoincide && <p className="text-xs text-red-600">Las claves no coinciden.</p>}
    </div>
  )
}
