'use client'

/**
 * Aviso previo de la verificación en dos pasos: aparece los días anteriores a
 * la fecha en que pasa a ser obligatoria para el rol del usuario.
 *
 * No bloquea nada. Es la pieza que faltó en agosto: se pasó de "no existe" a
 * "no puedes entrar sin configurarlo" el mismo día. Acá el usuario ve el plazo,
 * lo configura cuando puede, y recién si deja vencer la fecha aparece el modal
 * bloqueante.
 */

export default function MfaBanner({ fechaLimite, onConfigurar, onPosponer }: {
  fechaLimite: string
  onConfigurar: () => void
  onPosponer: () => void
}) {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-3 flex-wrap">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
           className="text-amber-600 flex-shrink-0" aria-hidden="true">
        <path d="M10 2l8 15H2l8-15z" strokeLinejoin="round"/><path d="M10 8v4M10 14.5v.5" strokeLinecap="round"/>
      </svg>
      <p className="text-xs text-amber-900 flex-1 min-w-[16rem]">
        Desde el <strong>{fechaLimite}</strong> vas a necesitar verificación en dos pasos para entrar.
        Configúrala ahora: toma un minuto.
      </p>
      <button
        onClick={onConfigurar}
        className="text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 px-3 py-1.5 rounded-lg"
      >
        Configurar
      </button>
      <button
        onClick={onPosponer}
        className="text-xs text-amber-800 hover:text-amber-950 underline underline-offset-2"
      >
        Ahora no
      </button>
    </div>
  )
}
