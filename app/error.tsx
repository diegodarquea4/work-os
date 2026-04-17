'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md p-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Algo salió mal</h2>
        <p className="text-sm text-gray-500 mb-6">{error.message || 'Error inesperado en la aplicación'}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
