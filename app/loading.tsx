// Fallback de Suspense para el arranque en frío. `app/page.tsx` es force-dynamic
// y hace `await getAllIniciativas()` en el servidor; sin este archivo, Next muestra
// pantalla en blanco hasta que la consulta resuelve. Reproducimos el marco de la
// app (mismo header oscuro y mismo contenedor raíz que WorkOSApp, sin layout-shift
// al hidratar) con un skeleton de contenido neutro. El `animate-pulse` se detiene
// bajo prefers-reduced-motion por la regla global de globals.css.

export default function Loading() {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header — idéntico al de WorkOSApp; logo y título son estáticos, así que
          se muestran ya formados. Nav y usuario van como placeholders. */}
      <header className="flex-shrink-0 h-20 bg-slate-900 flex items-center justify-between px-8 shadow-md">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ministerio.jpg" alt="Ministerio del Interior" className="h-14 w-auto rounded-lg shadow-sm" />
          <div className="flex flex-col">
            <span className="text-white font-bold text-fluid-base tracking-wide leading-tight">PSG</span>
            <span className="text-slate-400 text-fluid-sm leading-tight">Panel Seguimiento Gubernamental — Regiones</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-9 w-64 rounded-lg bg-slate-800 animate-pulse" />
          <div className="h-7 w-24 rounded bg-slate-800 animate-pulse" />
        </div>
      </header>

      {/* Contenido — skeleton neutro (tira de KPIs + filas tipo tabla). Sirve para
          cualquiera de las vistas restauradas desde localStorage; se muestra solo
          mientras el servidor resuelve la carga inicial. */}
      <main className="flex-1 overflow-hidden px-8 py-6" aria-busy="true" aria-label="Cargando el panel">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-white border border-gray-100 shadow-sm p-4">
              <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
              <div className="h-7 w-16 rounded bg-gray-200 animate-pulse mt-3" />
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-white border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <span className="h-4 w-4 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
              <span className="h-3.5 rounded bg-gray-200 animate-pulse" style={{ width: `${40 + ((i * 7) % 35)}%` }} />
              <span className="ml-auto h-3.5 w-16 rounded bg-gray-200 animate-pulse flex-shrink-0" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
