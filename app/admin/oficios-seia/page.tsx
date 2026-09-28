'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

/**
 * Importar los oficios pendientes del SEIA desde el Excel de seia-abierto.cl.
 *
 * Vive en /admin y no en el panel del Comité Económico por dos razones: la
 * importación es NACIONAL —escribe en las 16 regiones de una— y la hace
 * admin/editor, no quien conduce un comité. La segunda es práctica: el panel
 * del comité está cambiando en otra rama y esta pantalla no tiene por qué
 * esperarla.
 *
 * Es deliberadamente fea y directa: elegir archivo, subir, leer el resumen.
 * La pantalla que el comité va a usar —la lista de oficios en la sesión— es
 * otra cosa y se diseña con los números de acá a la vista.
 */

type Importacion = {
  id: number
  fecha_corte: string | null
  archivo_nombre: string | null
  filas_leidas: number
  filas_nuevas: number
  filas_actualizadas: number
  filas_resueltas: number
  filas_sin_region: number
  detalle: { descartadas?: { fila: number; motivo: string; proyecto: string | null }[]; sin_asignar?: number } | null
  importado_por_email: string | null
  created_at: string
}

/** A partir de cuántos días el dato se considera viejo. El comité sesiona cada
 *  15 días: si el archivo pasa de eso, ya no cubre la reunión que viene. */
const DIAS_PARA_ENVEJECER = 15

export default function OficiosSeiaPage() {
  const [historial, setHistorial] = useState<Importacion[]>([])
  const [cargando, setCargando]   = useState(true)
  const [subiendo, setSubiendo]   = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [ultimo, setUltimo]       = useState<Importacion | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data } = await getSupabase()
      .from('seia_oficios_import')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setHistorial((data ?? []) as Importacion[])
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function subir(archivo: File) {
    setSubiendo(true)
    setError(null)
    setUltimo(null)
    try {
      const body = new FormData()
      body.append('archivo', archivo)
      const res = await fetch('/api/oficios-seia/import', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'La importación falló')
      setUltimo(json as Importacion)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const reciente = historial[0] ?? null
  const dias = reciente?.fecha_corte
    ? Math.floor((Date.now() - Date.parse(`${reciente.fecha_corte}T12:00:00`)) / 86_400_000)
    : null
  const viejo = dias != null && dias > DIAS_PARA_ENVEJECER

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-xl font-bold text-slate-900">Oficios pendientes del SEIA</h1>
      <p className="text-sm text-gray-500 mt-1">
        Sube el Excel de <span className="font-medium">seia-abierto.cl → Proyectos en calificación → Detalle
        oficios pendientes → Descargar datos</span>. Reimportar el mismo archivo no duplica nada.
      </p>

      {/* La fecha que importa es la de CORTE del archivo, no la de la subida:
          un archivo bajado el lunes y subido el miércoles sigue siendo del
          lunes, y es lo que hay que mirar para saber si quedó viejo. */}
      {reciente && (
        <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
          viejo ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'
        }`}>
          <span className="font-semibold">
            Datos al {reciente.fecha_corte ?? '—'}
          </span>
          {dias != null && (
            <span> · hace {dias} día{dias === 1 ? '' : 's'}</span>
          )}
          {viejo && (
            <span className="block mt-1 font-medium">
              El archivo tiene más de {DIAS_PARA_ENVEJECER} días: ya no cubre la próxima sesión del comité.
            </span>
          )}
        </div>
      )}

      <div className="mt-5 rounded-xl border border-dashed border-gray-300 p-6 text-center">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          disabled={subiendo}
          onChange={e => { const f = e.target.files?.[0]; if (f) subir(f) }}
          className="block mx-auto text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-violet-700 file:text-white file:font-semibold file:cursor-pointer disabled:opacity-50"
        />
        {subiendo && <p className="text-sm text-violet-700 mt-3 font-medium">Importando…</p>}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {ultimo && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm font-semibold text-green-900">Importación lista</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3 text-center">
            <Dato n={ultimo.filas_leidas}       label="leídas" />
            <Dato n={ultimo.filas_nuevas}       label="nuevas" />
            <Dato n={ultimo.filas_actualizadas} label="enganchadas" />
            <Dato n={ultimo.filas_resueltas}    label="resueltas" />
            <Dato n={ultimo.filas_sin_region}   label="descartadas" alerta={ultimo.filas_sin_region > 0} />
          </div>
          {/* Lo descartado se muestra siempre: una fila que se pierde en
              silencio es un oficio que el comité no va a ver y nadie va a
              saber por qué. */}
          {!!ultimo.detalle?.descartadas?.length && (
            <details className="mt-3">
              <summary className="text-xs text-green-900 cursor-pointer font-medium">
                Ver las {ultimo.filas_sin_region} filas que no entraron
              </summary>
              <ul className="mt-2 space-y-0.5 max-h-56 overflow-y-auto">
                {ultimo.detalle.descartadas.map(d => (
                  <li key={d.fila} className="text-[11px] text-green-900/80">
                    <span className="tabular-nums">fila {d.fila}</span> · {d.proyecto ?? '—'} — {d.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <h2 className="text-sm font-bold text-slate-900 mt-8 mb-2">Importaciones anteriores</h2>
      {cargando ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : historial.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no se importó ningún archivo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[640px]">
            <thead className="text-gray-500">
              <tr className="[&_th]:text-left [&_th]:font-semibold [&_th]:py-1.5 [&_th]:pr-3 [&_th]:border-b [&_th]:border-gray-200">
                <th>Corte</th><th>Archivo</th><th>Leídas</th><th>Nuevas</th>
                <th>Enganchadas</th><th>Resueltas</th><th>Fuera</th><th>Quién</th>
              </tr>
            </thead>
            <tbody>
              {historial.map(h => (
                <tr key={h.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 tabular-nums">{h.fecha_corte ?? '—'}</td>
                  <td className="py-1.5 pr-3 max-w-[180px] truncate text-gray-600">{h.archivo_nombre ?? '—'}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{h.filas_leidas}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{h.filas_nuevas}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{h.filas_actualizadas}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{h.filas_resueltas}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{h.filas_sin_region}</td>
                  <td className="py-1.5 pr-3 text-gray-500 max-w-[160px] truncate">{h.importado_por_email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Dato({ n, label, alerta = false }: { n: number; label: string; alerta?: boolean }) {
  return (
    <div>
      <p className={`text-lg font-bold tabular-nums ${alerta ? 'text-amber-700' : 'text-green-900'}`}>{n}</p>
      <p className="text-[10px] uppercase tracking-wide text-green-900/60">{label}</p>
    </div>
  )
}
