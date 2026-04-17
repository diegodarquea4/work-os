import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Página no encontrada</h2>
        <p className="text-sm text-gray-500 mb-6">La dirección solicitada no existe.</p>
        <Link
          href="/"
          className="px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-700 transition-colors"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
